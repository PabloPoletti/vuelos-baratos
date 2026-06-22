/**
 * Google Flights client — implements the FlightsFrontendService RPC protocol.
 *
 * Protocol reference: reverse-engineered from the open-source libraries
 *   fli  (github.com/punitarani/fli,  MIT)
 *   trvl (github.com/MikkoParkkola/trvl, PolyForm Noncommercial)
 * This is an independent TypeScript implementation of the same public protocol.
 *
 * Key facts about the protocol:
 *  - POST to GetShoppingResults with a URL-encoded f.req field
 *  - f.req = encodeURIComponent(JSON.stringify([null, JSON.stringify(filters)]))
 *  - filters is a positional nested array (not protobuf on the wire)
 *  - Response starts with anti-XSSI prefix ")]}'\n" then a JSON array
 *  - Flight rows live at inner[2][0] and inner[3][0]
 */

import type { FlightLeg, FlightResult, SearchOptions } from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SHOPPING_URL =
  "https://www.google.com/_/FlightsFrontendUi/data/travel.frontend.flights.FlightsFrontendService/GetShoppingResults";

const BROWSER_HEADERS: Record<string, string> = {
  "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  accept: "*/*",
  "accept-language": "en-US,en;q=0.9",
  "sec-ch-ua": '"Chromium";v="131", "Not_A Brand";v="24", "Google Chrome";v="131"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"macOS"',
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-origin",
  origin: "https://www.google.com",
  referer: "https://www.google.com/travel/flights",
};

const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 1_000;
const MIN_REQUEST_INTERVAL_MS = 500;

// ---------------------------------------------------------------------------
// Rate limiting — simple token for module-level last-request tracking.
// In a Cloudflare Worker isolate this state persists across requests within
// the same instance, providing real (if soft) per-isolate rate limiting.
// ---------------------------------------------------------------------------

let _lastRequestAt = 0;

async function waitForRateLimit(): Promise<void> {
  const elapsed = Date.now() - _lastRequestAt;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    await sleep(MIN_REQUEST_INTERVAL_MS - elapsed);
  }
  _lastRequestAt = Date.now();
}

// ---------------------------------------------------------------------------
// Filter array builder
// ---------------------------------------------------------------------------

/**
 * Builds the outer positional filter array consumed by GetShoppingResults.
 *
 * Array layout (outer):
 *   [0]  []          — mode flag (flights)
 *   [1]  settings    — 29-element settings array (see below)
 *   [2]  1           — sort: BEST
 *   [3]  1           — return all results (vs ~30)
 *   [4]  0
 *   [5]  1
 *
 * Settings layout (outer[1]):
 *   [2]   trip type: 1=round-trip, 2=one-way
 *   [5]   cabin: 1=economy, 2=premium, 3=business, 4=first
 *   [6]   passengers: [adults, children, infants_lap, infants_seat]
 *   [13]  segments array
 *   [17]  1 (constant)
 *   [28]  0
 *
 * Segment layout (outer[1][13][i]):
 *   [0]  departure airports: [[[IATA, 0]]]
 *   [1]  arrival airports:   [[[IATA, 0]]]
 *   [2]  time restrictions: null
 *   [3]  max stops: 0=any
 *   [4]  airlines include: null
 *   [5]  airlines exclude: null
 *   [6]  date: "YYYY-MM-DD"
 *   [7]  max duration: null
 *   [8]  selected flight: null
 *   [9]  layover airports: null
 *  [10]  null
 *  [11]  min layover: null
 *  [12]  max layover: null
 *  [13]  emissions: null
 *  [14]  segment classifier: 3=outbound, 1=return
 */
function buildFilters(opts: SearchOptions): unknown[] {
  const adults = opts.adults ?? 1;
  const tripType = opts.tripType === "one_way" ? 2 : 1;

  const mkSegment = (
    from: string,
    to: string,
    date: string,
    classifier: 3 | 1,
  ): unknown[] => {
    const seg: unknown[] = new Array(15).fill(null);
    seg[0] = [[[from, 0]]];
    seg[1] = [[[to, 0]]];
    seg[3] = 0; // any stops
    seg[6] = date;
    seg[14] = classifier;
    return seg;
  };

  const segments: unknown[][] = [
    mkSegment(opts.origin, opts.destination, opts.date, 3),
  ];

  if (opts.tripType === "round_trip" && opts.returnDate) {
    segments.push(
      mkSegment(opts.destination, opts.origin, opts.returnDate, 1),
    );
  }

  const settings: unknown[] = new Array(29).fill(null);
  settings[2] = tripType;
  settings[5] = 1; // economy
  settings[6] = [adults, 0, 0, 0];
  settings[13] = segments;
  settings[17] = 1;
  settings[28] = 0;

  return [
    [], // [0] mode
    settings, // [1] settings
    1, // [2] sort BEST
    1, // [3] all results
    0, // [4]
    1, // [5]
  ];
}

/**
 * Encodes the filter array into the URL-encoded f.req string expected by Google.
 * Pipeline: filters → JSON.stringify → wrap in [null, "<json>"] → JSON.stringify → encodeURIComponent
 */
function encodeFilters(filters: unknown[]): string {
  const inner = JSON.stringify(filters);
  const wrapped = JSON.stringify([null, inner]);
  return encodeURIComponent(wrapped);
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

/**
 * Strips the anti-XSSI prefix ")]}'\n" and returns the first wrb.fr inner payload.
 * The outer envelope looks like: [["wrb.fr", null, "<inner JSON string>", ...], ...]
 */
function extractInnerPayload(rawText: string): unknown[] {
  const stripped = rawText.replace(/^\)\]\}'\s*/, "");
  let outer: unknown;
  try {
    outer = JSON.parse(stripped);
  } catch {
    throw new Error("Google Flights returned unparseable JSON");
  }
  if (!Array.isArray(outer)) {
    throw new Error("Unexpected Google Flights response shape (not array)");
  }
  for (const row of outer as unknown[]) {
    if (
      Array.isArray(row) &&
      row[0] === "wrb.fr" &&
      typeof row[2] === "string"
    ) {
      try {
        const inner = JSON.parse(row[2] as string) as unknown[];
        return inner;
      } catch {
        throw new Error("Could not parse wrb.fr inner JSON");
      }
    }
  }
  throw new Error("No wrb.fr chunk found in Google Flights response");
}

// ---------------------------------------------------------------------------
// Flight row decoder
// ---------------------------------------------------------------------------

function safeDateTime(
  dateParts: unknown,
  timeParts: unknown,
): string {
  if (!Array.isArray(dateParts) || !Array.isArray(timeParts)) return "";
  const [year, month, day] = dateParts as number[];
  const [hour, minute] = timeParts as number[];
  if (
    year == null ||
    month == null ||
    day == null ||
    hour == null ||
    minute == null
  )
    return "";
  // Construct ISO string in local Google Flights "wall clock" time (no tz conversion)
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00`;
}

function decodeLegs(rawLegs: unknown[]): FlightLeg[] {
  return rawLegs
    .map((raw): FlightLeg | null => {
      if (!Array.isArray(raw)) return null;
      const leg = raw as unknown[];
      const airlineInfo = leg[22];
      if (!Array.isArray(airlineInfo)) return null;
      return {
        airline: String(airlineInfo[0] ?? ""),
        flightNumber: String(airlineInfo[1] ?? ""),
        departureAirport: String(leg[3] ?? ""),
        arrivalAirport: String(leg[6] ?? ""),
        departureTime: safeDateTime(leg[20], leg[8]),
        arrivalTime: safeDateTime(leg[21], leg[10]),
        durationMinutes: typeof leg[11] === "number" ? (leg[11] as number) : 0,
      };
    })
    .filter((l): l is FlightLeg => l !== null);
}

function decodeFlightRow(row: unknown[]): FlightResult | null {
  try {
    const detail = row[0];
    const priceBlock = row[1];
    if (!Array.isArray(detail) || !Array.isArray(priceBlock)) return null;

    // price lives in priceBlock[0] as [..., price] — we take the last element
    const priceArr = priceBlock[0];
    if (!Array.isArray(priceArr) || priceArr.length === 0) return null;
    const price = priceArr[priceArr.length - 1];
    if (typeof price !== "number" || price <= 0) return null;

    const rawLegs = detail[2];
    if (!Array.isArray(rawLegs) || rawLegs.length === 0) return null;

    const legs = decodeLegs(rawLegs as unknown[]);
    if (legs.length === 0) return null;

    const totalDuration = typeof detail[9] === "number" ? (detail[9] as number) : 0;
    const stops = legs.length - 1;
    const airlines = [...new Set(legs.map((l) => l.airline).filter(Boolean))];

    const first = legs[0];
    const last = legs[legs.length - 1];

    // Build a generic Google Flights deep-link for the itinerary
    const bookingUrl =
      `https://www.google.com/travel/flights?q=Flights+to+${last?.arrivalAirport ?? ""}+from+${first?.departureAirport ?? ""}+on+${first?.departureTime?.slice(0, 10) ?? ""}`;

    return {
      price,
      currency: "USD", // currency token (priceBlock[1]) is a base64 protobuf; USD default
      airlines,
      totalDurationMinutes: totalDuration,
      stops,
      departureTime: first?.departureTime ?? "",
      arrivalTime: last?.arrivalTime ?? "",
      legs,
      bookingUrl,
      source: "google",
    };
  } catch {
    return null;
  }
}

function extractFlights(inner: unknown[]): FlightResult[] {
  const rows: FlightResult[] = [];
  for (const idx of [2, 3] as const) {
    const section = inner[idx];
    if (Array.isArray(section) && Array.isArray(section[0])) {
      for (const row of section[0] as unknown[][]) {
        const decoded = decodeFlightRow(row);
        if (decoded) rows.push(decoded);
      }
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

async function postWithRetry(url: string, body: string): Promise<string> {
  let lastError: Error = new Error("Unknown error");
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    await waitForRateLimit();
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: BROWSER_HEADERS,
        body,
      });
      if (!response.ok) {
        if (isRetryable(response.status) && attempt < MAX_RETRIES - 1) {
          await sleep(BASE_BACKOFF_MS * Math.pow(2, attempt));
          continue;
        }
        throw new Error(`HTTP ${response.status} from Google Flights`);
      }
      return await response.text();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_RETRIES - 1) {
        await sleep(BASE_BACKOFF_MS * Math.pow(2, attempt));
      }
    }
  }
  throw lastError;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function searchGoogleFlights(
  opts: SearchOptions,
): Promise<FlightResult[]> {
  const currency = (opts.currency ?? "USD").toUpperCase();
  const url = `${SHOPPING_URL}?curr=${currency}&hl=en&gl=US`;

  const filters = buildFilters(opts);
  const encoded = encodeFilters(filters);
  const body = `f.req=${encoded}`;

  const rawText = await postWithRetry(url, body);
  const inner = extractInnerPayload(rawText);
  const results = extractFlights(inner);

  // Stamp currency on results if we have it from the request
  return results.map((r) => ({ ...r, currency }));
}
