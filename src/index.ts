/**
 * Cloudflare Worker — vuelos-baratos API
 *
 * Endpoints:
 *   GET /api/search?origin=X&destination=Y&date=YYYY-MM-DD
 *                  [&returnDate=YYYY-MM-DD] [&tripType=one_way|round_trip]
 *                  [&adults=1] [&currency=USD]
 *
 * Returns combined results from Google Flights + Kiwi, sorted by price.
 * If one source fails, the other's results are returned anyway.
 */

import { searchGoogleFlights } from "./search/google-flights";
import { searchKiwi } from "./search/kiwi";
import type { FlightResult, SearchOptions, TripType } from "./search/types";

// ---------------------------------------------------------------------------
// Environment bindings (declared in wrangler.toml + wrangler secret put)
// ---------------------------------------------------------------------------

export interface Env {
  /** Secret: set via `wrangler secret put KIWI_API_KEY` */
  KIWI_API_KEY?: string;
  APP_ENV?: string;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const IATA_RE = /^[A-Z]{3}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseSearchOptions(url: URL): SearchOptions | { error: string } {
  const get = (key: string) => url.searchParams.get(key)?.trim() ?? "";

  const origin = get("origin").toUpperCase();
  const destination = get("destination").toUpperCase();
  const date = get("date");
  const returnDate = get("returnDate") || undefined;
  const rawTripType = get("tripType") || "one_way";
  const adults = parseInt(get("adults") || "1", 10);
  const currency = get("currency") || "USD";

  if (!IATA_RE.test(origin))
    return { error: "origin must be a 3-letter IATA airport code (e.g. EZE)" };
  if (!IATA_RE.test(destination))
    return {
      error: "destination must be a 3-letter IATA airport code (e.g. MAD)",
    };
  if (!DATE_RE.test(date))
    return { error: "date must be in YYYY-MM-DD format" };
  if (rawTripType !== "one_way" && rawTripType !== "round_trip")
    return { error: "tripType must be one_way or round_trip" };
  if (rawTripType === "round_trip" && !returnDate)
    return { error: "returnDate is required for round_trip" };
  if (returnDate && !DATE_RE.test(returnDate))
    return { error: "returnDate must be in YYYY-MM-DD format" };
  if (isNaN(adults) || adults < 1 || adults > 9)
    return { error: "adults must be a number between 1 and 9" };

  return {
    origin,
    destination,
    date,
    returnDate,
    tripType: rawTripType as TripType,
    adults,
    currency: currency.toUpperCase(),
  };
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

function json(
  data: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json;charset=UTF-8",
      "access-control-allow-origin": "*",
      ...extraHeaders,
    },
  });
}

// ---------------------------------------------------------------------------
// /api/search handler
// ---------------------------------------------------------------------------

async function handleSearch(
  request: Request,
  env: Env,
): Promise<Response> {
  if (request.method !== "GET") {
    return json({ error: "Method not allowed" }, 405);
  }

  const url = new URL(request.url);
  const optsOrError = parseSearchOptions(url);

  if ("error" in optsOrError) {
    return json({ error: optsOrError.error }, 400);
  }

  const opts = optsOrError;
  const results: FlightResult[] = [];
  const errors: { source: "google" | "kiwi"; message: string }[] = [];

  // Run Google Flights and Kiwi in parallel; each failure is isolated
  const [googleOutcome, kiwiOutcome] = await Promise.allSettled([
    searchGoogleFlights(opts),
    env.KIWI_API_KEY
      ? searchKiwi(opts, env.KIWI_API_KEY)
      : Promise.reject(new Error("KIWI_API_KEY secret not configured")),
  ]);

  if (googleOutcome.status === "fulfilled") {
    results.push(...googleOutcome.value);
  } else {
    const msg =
      googleOutcome.reason instanceof Error
        ? googleOutcome.reason.message
        : String(googleOutcome.reason);
    errors.push({ source: "google", message: msg });
  }

  if (kiwiOutcome.status === "fulfilled") {
    results.push(...kiwiOutcome.value);
  } else {
    const msg =
      kiwiOutcome.reason instanceof Error
        ? kiwiOutcome.reason.message
        : String(kiwiOutcome.reason);
    errors.push({ source: "kiwi", message: msg });
  }

  // Sort combined results by price ascending
  results.sort((a, b) => a.price - b.price);

  return json({ results, errors });
}

// ---------------------------------------------------------------------------
// Worker entry point
// ---------------------------------------------------------------------------

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/search") {
      return handleSearch(request, env);
    }

    if (url.pathname === "/health") {
      return json({ status: "ok", env: env.APP_ENV ?? "unknown" });
    }

    return json(
      {
        error: "Not found",
        availableRoutes: [
          "GET /api/search?origin=EZE&destination=MAD&date=2026-09-01",
          "GET /health",
        ],
      },
      404,
    );
  },
} satisfies ExportedHandler<Env>;
