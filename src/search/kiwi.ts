/**
 * Kiwi.com (Tequila) API client — public search endpoint.
 *
 * Uses Kiwi's Tequila API (tequila.kiwi.com/v2/search).
 * A free API key is available at https://tequila.kiwi.com after registering.
 * Store it as a Worker secret: `wrangler secret put KIWI_API_KEY`
 *
 * Kiwi is especially valuable for:
 *  - Self-transfer / virtual interlining itineraries not shown on Google
 *  - Low-cost carrier combinations
 *
 * Docs: https://tequila.kiwi.com/portal/docs/tequila-api/search_api
 */

import type { FlightLeg, FlightResult, SearchOptions } from "./types";

const TEQUILA_SEARCH_URL = "https://api.tequila.kiwi.com/v2/search";

// ---------------------------------------------------------------------------
// Kiwi response types (simplified)
// ---------------------------------------------------------------------------

interface KiwiRoute {
  airline: string;
  flight_no: number;
  flyFrom: string;
  flyTo: string;
  local_departure: string; // ISO 8601
  local_arrival: string;
  duration: { departure: number }; // seconds? Kiwi returns seconds per leg
}

interface KiwiFlight {
  price: number;
  airlines: string[];
  flyFrom: string;
  flyTo: string;
  local_departure: string;
  local_arrival: string;
  duration: { departure: number; return: number; total: number }; // seconds
  route: KiwiRoute[];
  deep_link: string;
}

interface KiwiResponse {
  data: KiwiFlight[];
  currency: string;
}

// ---------------------------------------------------------------------------
// Mapper
// ---------------------------------------------------------------------------

function kiwiRouteToLeg(route: KiwiRoute): FlightLeg {
  return {
    airline: route.airline,
    flightNumber: `${route.airline}${route.flight_no}`,
    departureAirport: route.flyFrom,
    arrivalAirport: route.flyTo,
    departureTime: route.local_departure,
    arrivalTime: route.local_arrival,
    // Kiwi gives leg duration as seconds in `duration.departure` (confusingly named)
    durationMinutes: Math.round((route.duration?.departure ?? 0) / 60),
  };
}

function kiwiFlightToResult(
  flight: KiwiFlight,
  currency: string,
): FlightResult {
  const legs = flight.route.map(kiwiRouteToLeg);
  return {
    price: flight.price,
    currency,
    airlines: flight.airlines,
    totalDurationMinutes: Math.round((flight.duration?.total ?? 0) / 60),
    stops: Math.max(flight.route.length - 1, 0),
    departureTime: flight.local_departure,
    arrivalTime: flight.local_arrival,
    legs,
    bookingUrl: flight.deep_link,
    source: "kiwi",
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function searchKiwi(
  opts: SearchOptions,
  apiKey: string,
): Promise<FlightResult[]> {
  const currency = (opts.currency ?? "USD").toUpperCase();

  const params = new URLSearchParams({
    fly_from: opts.origin,
    fly_to: opts.destination,
    date_from: formatKiwiDate(opts.date),
    date_to: formatKiwiDate(opts.date),
    adults: String(opts.adults ?? 1),
    curr: currency,
    sort: "price",
    asc: "1",
    limit: "50",
    partner: "picky",
    // self-transfer: include virtual interlining results
    vehicle_type: "aircraft",
  });

  if (opts.tripType === "round_trip" && opts.returnDate) {
    params.set("return_from", formatKiwiDate(opts.returnDate));
    params.set("return_to", formatKiwiDate(opts.returnDate));
    params.set("flight_type", "round");
  } else {
    params.set("flight_type", "oneway");
  }

  const url = `${TEQUILA_SEARCH_URL}?${params.toString()}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      apikey: apiKey,
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Kiwi API returned HTTP ${response.status}`);
  }

  const json = (await response.json()) as KiwiResponse;

  if (!Array.isArray(json.data)) {
    throw new Error("Unexpected Kiwi API response shape");
  }

  return json.data.map((f) => kiwiFlightToResult(f, json.currency ?? currency));
}

/** Converts YYYY-MM-DD to the DD/MM/YYYY format Tequila expects */
function formatKiwiDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}
