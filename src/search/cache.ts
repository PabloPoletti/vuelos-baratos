/**
 * KV cache helpers for flight search results.
 *
 * Two separate TTLs:
 *  - Google Flights: 1 hour  (prices change often, but respecting rate limits)
 *  - Skyscanner:     24 hours (100 req/month free tier — conserve aggressively)
 *
 * Airport resolution (IATA → skyId/entityId) is cached for 7 days since
 * Skyscanner airport IDs change very rarely, and we don't want to spend
 * the scarce monthly quota on repeated airport lookups.
 */

import type { FlightResult, SearchOptions } from "./types";

export const TTL = {
  GOOGLE_FLIGHTS: 60 * 60,      // 1 hour in seconds
  SKYSCANNER: 60 * 60 * 24,     // 24 hours in seconds
  AIRPORT_IDS: 60 * 60 * 24 * 7, // 7 days in seconds
} as const;

// ---------------------------------------------------------------------------
// Cache key builders
// ---------------------------------------------------------------------------

export function flightCacheKey(
  prefix: "gf" | "ss",
  opts: SearchOptions,
): string {
  const leg = `${opts.origin}:${opts.destination}:${opts.date}`;
  const ret = opts.returnDate ?? "OW";
  return `${prefix}:v1:${leg}:${ret}`;
}

export function airportCacheKey(iata: string): string {
  return `ap:v1:${iata.toUpperCase()}`;
}

// ---------------------------------------------------------------------------
// Generic KV read / write
// ---------------------------------------------------------------------------

export async function getFromCache<T>(
  kv: KVNamespace,
  key: string,
): Promise<T | null> {
  try {
    const raw = await kv.get(key);
    if (raw === null) return null;
    return JSON.parse(raw) as T;
  } catch {
    // Corrupt cache entry — treat as miss
    return null;
  }
}

export async function setInCache<T>(
  kv: KVNamespace,
  key: string,
  value: T,
  ttlSeconds: number,
): Promise<void> {
  try {
    await kv.put(key, JSON.stringify(value), {
      expirationTtl: ttlSeconds,
    });
  } catch {
    // Cache write failures are non-fatal — log nothing, keep going
  }
}

// ---------------------------------------------------------------------------
// Typed helpers for flight results
// ---------------------------------------------------------------------------

export async function getCachedFlights(
  kv: KVNamespace,
  key: string,
): Promise<FlightResult[] | null> {
  return getFromCache<FlightResult[]>(kv, key);
}

export async function cacheFlights(
  kv: KVNamespace,
  key: string,
  results: FlightResult[],
  ttlSeconds: number,
): Promise<void> {
  if (results.length === 0) return; // don't cache empty results
  return setInCache(kv, key, results, ttlSeconds);
}
