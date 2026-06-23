/**
 * Multi-city flight search — powers POST /api/multi-city.
 *
 * Two modes:
 *
 * "fixed"
 *   User supplies an ordered list of stops with explicit dates.
 *   Builds one one-way leg per segment and sums the prices.
 *   No route permutations.
 *
 * "optimize"
 *   User supplies a set of destinations + a date range + nightsPerStop.
 *   Generates every permutation of the destination order, computes
 *   leg dates by distributing nightsPerStop from startDate, and finds
 *   the cheapest route ordering.
 *
 *   Memoization layers to minimise Google Flights calls:
 *     1. In-request Map  — shared across all permutations in one request
 *     2. KV cache        — shared across requests (same 1-hour TTL as /api/search)
 *
 * Safety limits (both modes):
 *   MAX_DESTINATIONS = 6  (>6 → >720 permutations, not supported)
 *   MAX_UNIQUE_LEGS  = 40 (unique (from,to,date) tuples after memoisation)
 *
 * Note on the 40-leg limit in practice:
 *   - 2 destinations: ~8  unique legs → OK
 *   - 3 destinations: ~18 unique legs → OK
 *   - 4 destinations: ~44 unique legs → exceeds limit
 *   Users needing 4+ destinations should reduce nightsPerStop or use fixed mode.
 */

import { searchGoogleFlights, filterByDuration } from "./google-flights";
import { TTL, cacheFlights, flightCacheKey, getCachedFlights } from "./cache";
import type { FlightResult, SearchOptions } from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MAX_DESTINATIONS = 6;
export const MAX_UNIQUE_LEGS = 40;
const CONCURRENCY = 3;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface FixedStop {
  destination: string;
  date: string; // YYYY-MM-DD
}

export interface FixedModeOptions {
  origin: string;
  stops: FixedStop[]; // ordered: origin → stops[0] → stops[1] → … → origin
  returnDate: string; // YYYY-MM-DD — date of the final leg back to origin
  adults?: number;
  currency?: string;
}

export interface OptimizeModeOptions {
  origin: string;
  destinations: string[]; // unordered set, 2–MAX_DESTINATIONS entries
  startDate: string; // YYYY-MM-DD — first departure
  endDate: string; // YYYY-MM-DD — final return date
  nightsPerStop: number; // nights spent at each intermediate city
  adults?: number;
  currency?: string;
}

export interface LegResult {
  from: string;
  to: string;
  date: string;
  price: number | null;
  currency: string;
  error: string | null;
}

export interface FixedResult {
  mode: "fixed";
  origin: string;
  totalPrice: number | null; // null if any leg failed
  currency: string;
  legs: LegResult[];
}

export interface PermutationResult {
  order: string[];
  totalPrice: number;
  currency: string;
  legs: LegResult[];
}

export interface OptimizeResult {
  mode: "optimize";
  origin: string;
  destinations: string[];
  best: PermutationResult | null;
  alternatives: PermutationResult[];
  /** Leg keys (from→to [date]) that returned no flights — useful for debugging */
  failedLegs?: string[];
  stats: {
    permutationsEvaluated: number;
    uniqueLegsSearched: number;
    uniqueLegsCachedInKv: number;
  };
}

export interface MultiCityValidationError {
  error: string;
  status: 400;
}

export type FixedOutcome = FixedResult | MultiCityValidationError;
export type OptimizeOutcome = OptimizeResult | MultiCityValidationError;

// ---------------------------------------------------------------------------
// Date utility
// ---------------------------------------------------------------------------

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Permutation generator
// ---------------------------------------------------------------------------

function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [[...arr]];
  return arr.flatMap((item, i) =>
    permutations([...arr.slice(0, i), ...arr.slice(i + 1)]).map((rest) => [
      item,
      ...rest,
    ]),
  );
}

// ---------------------------------------------------------------------------
// Concurrency limiter (same pattern as search-dates.ts)
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
// Leg search — KV cache + in-request memo + Google Flights
// ---------------------------------------------------------------------------

function legMemoKey(from: string, to: string, date: string): string {
  return `${from}:${to}:${date}`;
}

/**
 * Returns the cheapest price for a one-way leg.
 * Checks memo first, then KV, then calls Google Flights.
 * Always writes the result back to both memo and KV.
 */
async function searchLegPrice(
  from: string,
  to: string,
  date: string,
  adults: number,
  currency: string,
  kv: KVNamespace,
  memo: Map<string, number | null>,
): Promise<number | null> {
  const memoKey = legMemoKey(from, to, date);

  // 1. In-request memo
  if (memo.has(memoKey)) {
    return memo.get(memoKey) ?? null;
  }

  const searchOpts: SearchOptions = {
    origin: from,
    destination: to,
    date,
    tripType: "one_way",
    adults,
    currency,
  };
  const kvKey = flightCacheKey("gf", searchOpts);

  // 2. KV cache
  let flights: FlightResult[] | null = await getCachedFlights(kv, kvKey);

  // 3. Google Flights — wrap in try/catch so the memo is always populated
  // even when Google returns an unexpected response for this specific route.
  if (!flights) {
    try {
      flights = await searchGoogleFlights(searchOpts);
      if (flights.length > 0) {
        // Cache raw results; filter is applied below when computing the price.
        await cacheFlights(kv, kvKey, flights, TTL.GOOGLE_FLIGHTS);
      }
    } catch {
      flights = []; // treat error as no-flights; memo will record null
    }
  }

  // Apply duration filter per-leg so implausibly long connecting options
  // don't inflate the cheapest price for this specific segment.
  const { results: filtered } = filterByDuration(flights);
  const effectiveFlights = filtered.length > 0 ? filtered : flights;

  const price =
    effectiveFlights.length > 0
      ? Math.min(...effectiveFlights.map((f) => f.price))
      : null;
  memo.set(memoKey, price);
  return price;
}

// ---------------------------------------------------------------------------
// MODE: fixed
// ---------------------------------------------------------------------------

export async function runFixedMode(
  opts: FixedModeOptions,
  kv: KVNamespace,
): Promise<FixedOutcome> {
  if (opts.stops.length === 0) {
    return { error: "stops must have at least one entry", status: 400 };
  }

  const currency = (opts.currency ?? "USD").toUpperCase();
  const adults = opts.adults ?? 1;

  // Build ordered leg sequence: origin→s0, s0→s1, …, sN→origin
  const legSpecs: { from: string; to: string; date: string }[] = [];
  let prev = opts.origin;
  for (const stop of opts.stops) {
    legSpecs.push({ from: prev, to: stop.destination, date: stop.date });
    prev = stop.destination;
  }
  legSpecs.push({ from: prev, to: opts.origin, date: opts.returnDate });

  const memo = new Map<string, number | null>();
  const tasks = legSpecs.map(
    ({ from, to, date }) =>
      () =>
        searchLegPrice(from, to, date, adults, currency, kv, memo),
  );

  const settled = await runWithConcurrency(tasks, CONCURRENCY);

  const legs: LegResult[] = legSpecs.map((spec, i) => {
    const outcome = settled[i];
    if (!outcome) return { ...spec, price: null, currency, error: "No result" };
    if (outcome.status === "rejected") {
      const msg =
        outcome.reason instanceof Error
          ? outcome.reason.message
          : String(outcome.reason);
      return { ...spec, price: null, currency, error: msg };
    }
    return {
      ...spec,
      price: outcome.value,
      currency,
      error: outcome.value === null ? "No flights found for this leg" : null,
    };
  });

  const allPrices = legs.map((l) => l.price);
  const totalPrice = allPrices.every((p) => p !== null)
    ? (allPrices as number[]).reduce((s, p) => s + p, 0)
    : null;

  return { mode: "fixed", origin: opts.origin, totalPrice, currency, legs };
}

// ---------------------------------------------------------------------------
// MODE: optimize
// ---------------------------------------------------------------------------

interface PermSpec {
  order: string[];
  legs: { from: string; to: string; date: string }[];
}

function buildPermSpecs(opts: OptimizeModeOptions): PermSpec[] {
  return permutations(opts.destinations).map((order) => {
    const legs: { from: string; to: string; date: string }[] = [];
    let prev = opts.origin;
    for (let i = 0; i < order.length; i++) {
      legs.push({
        from: prev,
        to: order[i] as string,
        date: addDays(opts.startDate, i * opts.nightsPerStop),
      });
      prev = order[i] as string;
    }
    // Final leg returns to origin on endDate
    legs.push({ from: prev, to: opts.origin, date: opts.endDate });
    return { order, legs };
  });
}

export async function runOptimizeMode(
  opts: OptimizeModeOptions,
  kv: KVNamespace,
): Promise<OptimizeOutcome> {
  const n = opts.destinations.length;

  if (n < 2) {
    return {
      error: "destinations must have at least 2 entries for optimize mode",
      status: 400,
    };
  }
  if (n > MAX_DESTINATIONS) {
    return {
      error:
        `optimize mode supports at most ${MAX_DESTINATIONS} destinations (got ${n}). ` +
        `More than ${MAX_DESTINATIONS} would generate over 720 permutations.`,
      status: 400,
    };
  }

  const currency = (opts.currency ?? "USD").toUpperCase();
  const adults = opts.adults ?? 1;

  const permSpecs = buildPermSpecs(opts);

  // Collect every unique (from, to, date) tuple across all permutations
  const uniqueKeys = new Set<string>();
  for (const spec of permSpecs) {
    for (const leg of spec.legs) {
      uniqueKeys.add(legMemoKey(leg.from, leg.to, leg.date));
    }
  }

  if (uniqueKeys.size > MAX_UNIQUE_LEGS) {
    return {
      error:
        `This combination requires ${uniqueKeys.size} unique leg searches ` +
        `(max ${MAX_UNIQUE_LEGS} after memoisation). ` +
        `Currently ${n} destinations × ${opts.nightsPerStop} nights/stop. ` +
        `Try reducing the number of destinations (3 or fewer works well) ` +
        `or use mode "fixed" to specify the route order explicitly.`,
      status: 400,
    };
  }

  // Pre-check KV for all unique legs to count cache hits
  const memo = new Map<string, number | null>();
  let kvCacheHits = 0;

  for (const key of uniqueKeys) {
    const parts = key.split(":");
    const from = parts[0] ?? "";
    const to = parts[1] ?? "";
    const date = parts[2] ?? "";
    const kvKey = flightCacheKey("gf", {
      origin: from,
      destination: to,
      date,
      tripType: "one_way",
      adults,
      currency,
    });
    const cached = await getCachedFlights(kv, kvKey);
    if (cached !== null) {
      const price =
        cached.length > 0 ? Math.min(...cached.map((f) => f.price)) : null;
      memo.set(key, price);
      kvCacheHits++;
    }
  }

  // Search only the legs not yet in memo (KV misses)
  const uncachedKeys = [...uniqueKeys].filter((k) => !memo.has(k));
  const searchTasks = uncachedKeys.map(
    (key) => () => {
      const parts = key.split(":");
      const from = parts[0] ?? "";
      const to = parts[1] ?? "";
      const date = parts[2] ?? "";
      return searchLegPrice(from, to, date, adults, currency, kv, memo);
    },
  );

  await runWithConcurrency(searchTasks, CONCURRENCY);

  // Score every permutation — skip any where a leg has no price
  const scored: PermutationResult[] = [];

  for (const spec of permSpecs) {
    const legs: LegResult[] = spec.legs.map((leg) => {
      const key = legMemoKey(leg.from, leg.to, leg.date);
      const price = memo.get(key) ?? null;
      return {
        ...leg,
        price,
        currency,
        error: price === null ? "No flights found for this leg" : null,
      };
    });

    if (legs.some((l) => l.price === null)) continue; // incomplete route

    const totalPrice = (legs.map((l) => l.price) as number[]).reduce(
      (s, p) => s + p,
      0,
    );
    scored.push({ order: spec.order, totalPrice, currency, legs });
  }

  scored.sort((a, b) => a.totalPrice - b.totalPrice);

  // Collect legs that returned no flights — useful for diagnosing "best: null"
  const failedLegs: string[] = [];
  for (const [key, price] of memo) {
    if (price === null) {
      const parts = key.split(":");
      failedLegs.push(`${parts[0] ?? "?"}→${parts[1] ?? "?"} [${parts[2] ?? "?"}]`);
    }
  }

  return {
    mode: "optimize",
    origin: opts.origin,
    destinations: opts.destinations,
    best: scored[0] ?? null,
    alternatives: scored.slice(1, 4),
    ...(failedLegs.length > 0 ? { failedLegs } : {}),
    stats: {
      permutationsEvaluated: permSpecs.length,
      uniqueLegsSearched: uniqueKeys.size,
      uniqueLegsCachedInKv: kvCacheHits,
    },
  };
}
