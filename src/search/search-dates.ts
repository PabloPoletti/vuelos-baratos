/**
 * Date-range flight search — powers the /api/search-dates endpoint.
 *
 * For each departure date in [startDate, endDate] it computes a returnDate
 * (departureDate + stayDuration days) and looks up the cheapest available
 * round-trip price via Google Flights.
 *
 * All calls share the same KV cache used by /api/search (TTL 1 hour),
 * so a date already fetched from /api/search will be served from cache here
 * and vice-versa — no redundant Google Flights requests.
 *
 * Safety limits:
 *  - max 35 departure dates per call (prevents accidental 90-request runs)
 *  - max 3 concurrent Google Flights requests at a time
 *
 * Deal detection:
 *  - isDeal = price <= median − (1.5 × stdDev)
 *  - Requires at least 5 valid results; otherwise isDeal is false for all
 *    and a note is included in the response.
 */

import { searchGoogleFlights, filterByDuration } from "./google-flights";
import { TTL, cacheFlights, flightCacheKey, getCachedFlights } from "./cache";
import type { FlightResult, SearchOptions } from "./types";

export const MAX_DATE_SEARCHES = 35;
const CONCURRENCY = 3;
const MIN_SAMPLE_FOR_DEAL = 5;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface DateRangeOptions {
  origin: string;
  destination: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  stayDuration: number; // days
  adults?: number;
  currency?: string;
}

export interface DateResult {
  departureDate: string;
  returnDate: string;
  price: number;
  currency: string;
  isDeal: boolean;
}

export interface DateStats {
  median: number;
  mean: number;
  stdDev: number;
  min: number;
  max: number;
}

export interface DateRangeResult {
  origin: string;
  destination: string;
  stayDuration: number;
  results: DateResult[];
  stats: DateStats | null;
  isDealNote?: string;
  errors: { date: string; message: string }[];
}

export interface DateRangeValidationError {
  error: string;
  status: 400;
}

export type DateRangeOutcome = DateRangeResult | DateRangeValidationError;

// ---------------------------------------------------------------------------
// Date utilities
// ---------------------------------------------------------------------------

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(start: string, end: string): number {
  const s = new Date(`${start}T00:00:00Z`).getTime();
  const e = new Date(`${end}T00:00:00Z`).getTime();
  return Math.round((e - s) / 86_400_000);
}

// ---------------------------------------------------------------------------
// Concurrency limiter
//
// Runs `tasks` with at most `limit` promises in flight simultaneously.
// Returns settled results in the same order as the input tasks.
// ---------------------------------------------------------------------------

async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
): Promise<PromiseSettledResult<T>[]> {
  if (tasks.length === 0) return [];

  const results: PromiseSettledResult<T>[] = new Array(tasks.length);
  let next = 0;

  async function worker(): Promise<void> {
    while (next < tasks.length) {
      const i = next++;
      const fn = tasks[i];
      if (!fn) continue;
      try {
        results[i] = { status: "fulfilled", value: await fn() };
      } catch (e) {
        results[i] = { status: "rejected", reason: e };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, worker),
  );

  return results;
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

function calcMedian(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 === 0
    ? (((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2)
    : (sorted[mid] ?? 0);
}

function calcStats(prices: number[]): DateStats {
  const sorted = [...prices].sort((a, b) => a - b);
  const mean = prices.reduce((s, p) => s + p, 0) / prices.length;
  const variance =
    prices.reduce((s, p) => s + Math.pow(p - mean, 2), 0) / prices.length;
  const round2 = (n: number) => Math.round(n * 100) / 100;
  return {
    median: calcMedian(sorted),
    mean: round2(mean),
    stdDev: round2(Math.sqrt(variance)),
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Single-date lookup (cache → Google Flights → cache)
// ---------------------------------------------------------------------------

async function cheapestPriceForDate(
  departureDate: string,
  returnDate: string,
  opts: DateRangeOptions,
  kv: KVNamespace,
): Promise<number | null> {
  const searchOpts: SearchOptions = {
    origin: opts.origin,
    destination: opts.destination,
    date: departureDate,
    returnDate,
    tripType: "round_trip",
    adults: opts.adults ?? 1,
    currency: opts.currency ?? "USD",
  };

  const cacheKey = flightCacheKey("gf", searchOpts);

  let flights: FlightResult[] | null = await getCachedFlights(kv, cacheKey);

  if (!flights) {
    flights = await searchGoogleFlights(searchOpts);
    if (flights.length > 0) {
      // Cache the raw unfiltered set so threshold changes don't bust the cache.
      await cacheFlights(kv, cacheKey, flights, TTL.GOOGLE_FLIGHTS);
    }
  }

  if (flights.length === 0) return null;

  // Apply duration filter before picking the cheapest price so absurdly long
  // itineraries don't distort the deal-detection statistics.
  const { results: filtered } = filterByDuration(flights);
  const effectiveFlights = filtered.length > 0 ? filtered : flights;

  return Math.min(...effectiveFlights.map((f) => f.price));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function searchByDateRange(
  opts: DateRangeOptions,
  kv: KVNamespace,
): Promise<DateRangeOutcome> {
  const span = daysBetween(opts.startDate, opts.endDate);

  if (span < 0) {
    return {
      error: "endDate must be on or after startDate",
      status: 400,
    };
  }

  const totalSearches = span + 1; // inclusive both ends

  if (totalSearches > MAX_DATE_SEARCHES) {
    return {
      error:
        `Date range spans ${totalSearches} departure dates (max ${MAX_DATE_SEARCHES}). ` +
        `Reduce the range from ${opts.startDate} to ${opts.endDate} (currently ${span} days), ` +
        `or increase stayDuration to reduce the number of valid departure windows.`,
      status: 400,
    };
  }

  const currency = (opts.currency ?? "USD").toUpperCase();

  // Build (departureDate, returnDate) pairs
  const datePairs = Array.from({ length: totalSearches }, (_, i) => {
    const dep = addDays(opts.startDate, i);
    return { dep, ret: addDays(dep, opts.stayDuration) };
  });

  // Build task list — each task fetches cheapest price for one date pair
  const tasks = datePairs.map(
    ({ dep, ret }) =>
      () =>
        cheapestPriceForDate(dep, ret, opts, kv),
  );

  // Run with bounded concurrency
  const settled = await runWithConcurrency(tasks, CONCURRENCY);

  const errors: { date: string; message: string }[] = [];
  const rawResults: DateResult[] = [];

  for (let i = 0; i < datePairs.length; i++) {
    const pair = datePairs[i];
    const outcome = settled[i];
    if (!pair || !outcome) continue;

    if (outcome.status === "rejected") {
      errors.push({
        date: pair.dep,
        message:
          outcome.reason instanceof Error
            ? outcome.reason.message
            : String(outcome.reason),
      });
    } else if (outcome.value !== null) {
      rawResults.push({
        departureDate: pair.dep,
        returnDate: pair.ret,
        price: outcome.value,
        currency,
        isDeal: false, // set below after stats
      });
    }
    // null means no flights found for that date — silently skip
  }

  // Stats and deal detection
  const prices = rawResults.map((r) => r.price);
  let stats: DateStats | null = null;
  let isDealNote: string | undefined;

  if (prices.length > 0) {
    stats = calcStats(prices);
  }

  if (prices.length >= MIN_SAMPLE_FOR_DEAL && stats) {
    const threshold = stats.median - 1.5 * stats.stdDev;
    for (const r of rawResults) {
      r.isDeal = r.price <= threshold;
    }
  } else if (prices.length > 0 && prices.length < MIN_SAMPLE_FOR_DEAL) {
    isDealNote =
      `isDeal not calculated: only ${prices.length} result(s) found ` +
      `(minimum ${MIN_SAMPLE_FOR_DEAL} required for reliable deal detection).`;
  }

  return {
    origin: opts.origin,
    destination: opts.destination,
    stayDuration: opts.stayDuration,
    results: rawResults,
    stats,
    ...(isDealNote ? { isDealNote } : {}),
    errors,
  };
}
