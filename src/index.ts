/**
 * Cloudflare Worker — vuelos-baratos API
 *
 * Endpoints:
 *   GET /api/search?origin=X&destination=Y&date=YYYY-MM-DD
 *                  [&returnDate=YYYY-MM-DD] [&tripType=one_way|round_trip]
 *                  [&adults=1] [&currency=USD]
 *   GET /health
 *
 * Sources: Google Flights (FlightsFrontendService) + Skyscanner (Sky Scrapper / RapidAPI)
 * Both run in parallel via Promise.allSettled; a failure in one source never
 * aborts the other. Results are cached in KV:
 *   - Google Flights: 1 hour TTL
 *   - Skyscanner:     24 hours TTL  (conserve the 100 req/month free quota)
 */

import { searchGoogleFlights } from "./search/google-flights";
import { SkyscannerQuotaError, searchSkyscanner } from "./search/skyscanner";
import {
  TTL,
  cacheFlights,
  flightCacheKey,
  getCachedFlights,
} from "./search/cache";
import {
  MAX_DATE_SEARCHES,
  searchByDateRange,
} from "./search/search-dates";
import type {
  FlightResult,
  ResultSource,
  SearchError,
  SearchOptions,
  TripType,
} from "./search/types";

// ---------------------------------------------------------------------------
// Environment bindings
// ---------------------------------------------------------------------------

export interface Env {
  /** KV namespace — bind with `wrangler kv namespace create SEARCH_CACHE` */
  SEARCH_CACHE: KVNamespace;
  /** Secret — `wrangler secret put SKYSCANNER_API_KEY` */
  SKYSCANNER_API_KEY?: string;
  APP_ENV?: string;
}

// ---------------------------------------------------------------------------
// Validation helpers (shared across handlers)
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
// Per-source cached search
// ---------------------------------------------------------------------------

async function fetchGoogleFlights(
  opts: SearchOptions,
  kv: KVNamespace,
): Promise<FlightResult[]> {
  const key = flightCacheKey("gf", opts);
  const cached = await getCachedFlights(kv, key);
  if (cached) return cached;

  const results = await searchGoogleFlights(opts);
  await cacheFlights(kv, key, results, TTL.GOOGLE_FLIGHTS);
  return results;
}

async function fetchSkyscanner(
  opts: SearchOptions,
  apiKey: string,
  kv: KVNamespace,
): Promise<FlightResult[]> {
  const key = flightCacheKey("ss", opts);
  const cached = await getCachedFlights(kv, key);
  if (cached) return cached;

  const results = await searchSkyscanner(opts, apiKey, kv);
  await cacheFlights(kv, key, results, TTL.SKYSCANNER);
  return results;
}

// ---------------------------------------------------------------------------
// Response helper
// ---------------------------------------------------------------------------

function jsonResponse(
  data: unknown,
  status = 200,
  extra: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json;charset=UTF-8",
      "access-control-allow-origin": "*",
      ...extra,
    },
  });
}

// ---------------------------------------------------------------------------
// /api/search handler
// ---------------------------------------------------------------------------

async function handleSearch(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const url = new URL(request.url);
  const optsOrError = parseSearchOptions(url);

  if ("error" in optsOrError) {
    return jsonResponse({ error: optsOrError.error }, 400);
  }

  const opts = optsOrError;
  const results: FlightResult[] = [];
  const errors: SearchError[] = [];

  const skyscannerSearch =
    env.SKYSCANNER_API_KEY
      ? fetchSkyscanner(opts, env.SKYSCANNER_API_KEY, env.SEARCH_CACHE)
      : Promise.reject(
          new Error("SKYSCANNER_API_KEY secret not configured"),
        );

  const [googleOutcome, skyscannerOutcome] = await Promise.allSettled([
    fetchGoogleFlights(opts, env.SEARCH_CACHE),
    skyscannerSearch,
  ]);

  const collectOutcome = (
    outcome: PromiseSettledResult<FlightResult[]>,
    source: ResultSource,
  ) => {
    if (outcome.status === "fulfilled") {
      results.push(...outcome.value);
    } else {
      const err = outcome.reason;
      const message =
        err instanceof SkyscannerQuotaError
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err);
      errors.push({ source, message });
    }
  };

  collectOutcome(googleOutcome, "google_flights");
  collectOutcome(skyscannerOutcome, "skyscanner");

  results.sort((a, b) => a.price - b.price);

  return jsonResponse({ results, errors });
}

// ---------------------------------------------------------------------------
// /api/search-dates handler
// ---------------------------------------------------------------------------

async function handleSearchDates(
  request: Request,
  env: Env,
): Promise<Response> {
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const url = new URL(request.url);
  const get = (k: string) => url.searchParams.get(k)?.trim() ?? "";

  const origin = get("origin").toUpperCase();
  const destination = get("destination").toUpperCase();
  const startDate = get("startDate");
  const endDate = get("endDate");
  const rawStay = get("stayDuration");
  const adults = parseInt(get("adults") || "1", 10);
  const currency = (get("currency") || "USD").toUpperCase();

  if (!IATA_RE.test(origin))
    return jsonResponse(
      { error: "origin must be a 3-letter IATA airport code (e.g. MDZ)" },
      400,
    );
  if (!IATA_RE.test(destination))
    return jsonResponse(
      { error: "destination must be a 3-letter IATA airport code (e.g. MIA)" },
      400,
    );
  if (!DATE_RE.test(startDate))
    return jsonResponse({ error: "startDate must be YYYY-MM-DD" }, 400);
  if (!DATE_RE.test(endDate))
    return jsonResponse({ error: "endDate must be YYYY-MM-DD" }, 400);

  const stayDuration = parseInt(rawStay, 10);
  if (isNaN(stayDuration) || stayDuration < 1 || stayDuration > 90)
    return jsonResponse(
      { error: "stayDuration must be a whole number between 1 and 90" },
      400,
    );
  if (isNaN(adults) || adults < 1 || adults > 9)
    return jsonResponse({ error: "adults must be between 1 and 9" }, 400);

  const outcome = await searchByDateRange(
    { origin, destination, startDate, endDate, stayDuration, adults, currency },
    env.SEARCH_CACHE,
  );

  if ("error" in outcome) {
    return jsonResponse({ error: outcome.error }, outcome.status);
  }

  return jsonResponse(outcome);
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

    if (url.pathname === "/api/search-dates") {
      return handleSearchDates(request, env);
    }

    if (url.pathname === "/health") {
      return jsonResponse({ status: "ok", env: env.APP_ENV ?? "unknown" });
    }

    return jsonResponse(
      {
        error: "Not found",
        availableRoutes: [
          "GET /api/search?origin=EZE&destination=MAD&date=2026-09-01",
          "GET /api/search?origin=EZE&destination=MAD&date=2026-09-01&returnDate=2026-09-15&tripType=round_trip",
          `GET /api/search-dates?origin=MDZ&destination=MIA&startDate=2026-08-01&endDate=2026-08-21&stayDuration=14 (max ${MAX_DATE_SEARCHES} dates)`,
          "GET /health",
        ],
      },
      404,
    );
  },
} satisfies ExportedHandler<Env>;
