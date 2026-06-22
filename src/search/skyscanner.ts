/**
 * Skyscanner client via Sky Scrapper on RapidAPI.
 * Docs: https://rapidapi.com/apiheya/api/sky-scrapper
 *
 * Two-step flow:
 *  1. Resolve IATA code → skyId + entityId via /searchAirport
 *  2. Search itineraries via /searchFlights
 *
 * skyId/entityId are Skyscanner-internal identifiers that differ from IATA
 * codes (e.g. "EZE" resolves to skyId "BUEN" for the Buenos Aires metro area).
 * They must always be resolved dynamically — never hardcoded.
 *
 * The free plan allows 100 req/month (including airport lookups). Airport IDs
 * are therefore cached for 7 days via KV to minimise quota consumption.
 *
 * 429 handling: when quota is exhausted Skyscanner returns HTTP 429.
 * We throw a descriptive QuotaExhaustedError that the caller surfaces in the
 * errors[] field without aborting the overall /api/search response.
 */

import {
  TTL,
  airportCacheKey,
  getFromCache,
  setInCache,
} from "./cache";
import type { FlightLeg, FlightResult, SearchOptions } from "./types";

const BASE = "https://sky-scrapper.p.rapidapi.com";
const HOST = "sky-scrapper.p.rapidapi.com";
const TIMEOUT_MS = 20_000;

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

export class SkyscannerQuotaError extends Error {
  constructor() {
    super(
      "Skyscanner (Sky Scrapper) monthly quota exhausted (HTTP 429). " +
        "Results from Google Flights are still available. " +
        "Quota resets at the start of next billing month.",
    );
    this.name = "SkyscannerQuotaError";
  }
}

// ---------------------------------------------------------------------------
// Internal types (Sky Scrapper response shapes)
// ---------------------------------------------------------------------------

interface AirportResult {
  skyId: string;
  entityId: string;
}

interface SkyLeg {
  origin: { id: string; name: string };
  destination: { id: string; name: string };
  durationInMinutes: number;
  stopCount: number;
  departure: string; // ISO 8601
  arrival: string;
  carriers: {
    marketing: Array<{ name: string; alternateId?: string }>;
  };
  segments?: Array<{
    origin: { flightPlaceId?: string; id?: string };
    destination: { flightPlaceId?: string; id?: string };
    departure: string;
    arrival: string;
    durationInMinutes: number;
    flightNumber?: string;
    marketingCarrier?: { name: string; alternateId?: string };
    operatingCarrier?: { name: string; alternateId?: string };
  }>;
}

interface SkyItinerary {
  id?: string;
  price: { raw: number; formatted: string };
  legs: SkyLeg[];
}

interface SkyFlightsResponse {
  status: boolean;
  data?: {
    itineraries?: SkyItinerary[];
  };
}

interface SkyAirportResponse {
  status: boolean;
  data?: Array<{
    skyId: string;
    entityId: string;
    presentation?: { title: string };
    navigation?: { entityType: string };
  }>;
}

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

async function skyGet<T>(
  path: string,
  params: Record<string, string>,
  apiKey: string,
): Promise<T> {
  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "X-RapidAPI-Key": apiKey,
        "X-RapidAPI-Host": HOST,
        accept: "application/json",
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 429) {
    throw new SkyscannerQuotaError();
  }

  if (!response.ok) {
    throw new Error(
      `Sky Scrapper API returned HTTP ${response.status} for ${path}`,
    );
  }

  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Airport resolution (with KV cache)
// ---------------------------------------------------------------------------

/**
 * Resolves an IATA code to Sky Scrapper's (skyId, entityId) pair.
 * Prefers the result whose navigation.entityType is "AIRPORT" and whose
 * skyId starts with the IATA prefix, falling back to data[0].
 * Results are cached in KV for 7 days.
 */
export async function resolveAirport(
  iata: string,
  apiKey: string,
  kv: KVNamespace | null,
): Promise<AirportResult> {
  const cacheKey = airportCacheKey(iata);

  if (kv) {
    const hit = await getFromCache<AirportResult>(kv, cacheKey);
    if (hit) return hit;
  }

  const body = await skyGet<SkyAirportResponse>(
    "/api/v1/flights/searchAirport",
    { query: iata, locale: "en-US" },
    apiKey,
  );

  if (!body.status || !Array.isArray(body.data) || body.data.length === 0) {
    throw new Error(`Could not resolve airport for IATA code "${iata}"`);
  }

  // Prefer an airport-level result whose skyId closely matches the IATA code.
  // Fall back to the first element if nothing matches.
  const preferred =
    body.data.find(
      (d) =>
        d.navigation?.entityType === "AIRPORT" &&
        (d.skyId.toUpperCase() === iata || d.skyId.startsWith(iata[0] ?? "")),
    ) ?? body.data[0];

  if (!preferred) {
    throw new Error(`Empty airport data for "${iata}"`);
  }

  const result: AirportResult = {
    skyId: preferred.skyId,
    entityId: preferred.entityId,
  };

  if (kv) {
    await setInCache(kv, cacheKey, result, TTL.AIRPORT_IDS);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Response mapper
// ---------------------------------------------------------------------------

function mapItinerary(it: SkyItinerary, currency: string): FlightResult | null {
  if (!it.price?.raw || !Array.isArray(it.legs) || it.legs.length === 0) {
    return null;
  }

  const legs: FlightLeg[] = it.legs.flatMap((leg): FlightLeg[] => {
    // When segments are available, map each segment as an individual leg
    if (Array.isArray(leg.segments) && leg.segments.length > 0) {
      return leg.segments.map((seg) => {
        const carrier =
          seg.marketingCarrier ?? seg.operatingCarrier;
        return {
          airline:
            carrier?.alternateId ?? carrier?.name ?? "",
          flightNumber: seg.flightNumber ?? "",
          departureAirport:
            seg.origin.flightPlaceId ?? seg.origin.id ?? "",
          arrivalAirport:
            seg.destination.flightPlaceId ?? seg.destination.id ?? "",
          departureTime: seg.departure,
          arrivalTime: seg.arrival,
          durationMinutes: seg.durationInMinutes,
        };
      });
    }
    // No segments — treat the whole leg as one hop
    const carrier = leg.carriers.marketing[0];
    return [
      {
        airline: carrier?.alternateId ?? carrier?.name ?? "",
        flightNumber: "",
        departureAirport: leg.origin.id,
        arrivalAirport: leg.destination.id,
        departureTime: leg.departure,
        arrivalTime: leg.arrival,
        durationMinutes: leg.durationInMinutes,
      },
    ];
  });

  if (legs.length === 0) return null;

  const firstLeg = legs[0];
  const lastLeg = legs[legs.length - 1];
  const airlines = [
    ...new Set(legs.map((l) => l.airline).filter(Boolean)),
  ];
  const totalDurationMinutes = it.legs.reduce(
    (sum, l) => sum + l.durationInMinutes,
    0,
  );
  const stops = it.legs.reduce((sum, l) => sum + l.stopCount, 0);

  // Build a Skyscanner search deep-link using the itinerary ID when available
  const bookingUrl = it.id
    ? `https://www.skyscanner.com/transport/flights/${firstLeg?.departureAirport ?? ""}/${lastLeg?.arrivalAirport ?? ""}/${firstLeg?.departureTime?.slice(0, 10).replace(/-/g, "") ?? ""}/?selectedoption=${encodeURIComponent(it.id)}`
    : `https://www.skyscanner.com/transport/flights/${firstLeg?.departureAirport ?? ""}/${lastLeg?.arrivalAirport ?? ""}/${firstLeg?.departureTime?.slice(0, 10).replace(/-/g, "") ?? ""}/`;

  return {
    price: it.price.raw,
    currency,
    airlines,
    totalDurationMinutes,
    stops,
    departureTime: firstLeg?.departureTime ?? "",
    arrivalTime: lastLeg?.arrivalTime ?? "",
    legs,
    bookingUrl,
    source: "skyscanner",
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function searchSkyscanner(
  opts: SearchOptions,
  apiKey: string,
  kv: KVNamespace | null = null,
): Promise<FlightResult[]> {
  const currency = (opts.currency ?? "USD").toUpperCase();

  // Resolve airports in parallel (each may be served from KV cache)
  const [origin, destination] = await Promise.all([
    resolveAirport(opts.origin, apiKey, kv),
    resolveAirport(opts.destination, apiKey, kv),
  ]);

  const params: Record<string, string> = {
    originSkyId: origin.skyId,
    destinationSkyId: destination.skyId,
    originEntityId: origin.entityId,
    destinationEntityId: destination.entityId,
    date: opts.date,
    adults: String(opts.adults ?? 1),
    currency,
    market: "en-US",
    countryCode: "US",
    cabinClass: "economy",
  };

  if (opts.tripType === "round_trip" && opts.returnDate) {
    params["returnDate"] = opts.returnDate;
    params["journeyType"] = "round_trip";
  } else {
    params["journeyType"] = "one_way";
  }

  const body = await skyGet<SkyFlightsResponse>(
    "/api/v1/flights/searchFlights",
    params,
    apiKey,
  );

  if (!body.status || !body.data?.itineraries) {
    return [];
  }

  return body.data.itineraries
    .map((it) => mapItinerary(it, currency))
    .filter((r): r is FlightResult => r !== null);
}
