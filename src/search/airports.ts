/**
 * Airport search — static IATA-filtered dataset from mwgg/Airports.
 * Regenerate with: node scripts/build-airports-data.js
 */

import airportsData from "../data/airports-iata.json";

export interface AirportRecord {
  iata: string;
  name: string;
  city: string;
  country: string;
}

const AIRPORTS = airportsData as AirportRecord[];

function scoreMatch(a: AirportRecord, q: string): number {
  const iata = a.iata.toLowerCase();
  const city = a.city.toLowerCase();
  const name = a.name.toLowerCase();

  if (iata === q) return 100;
  if (iata.startsWith(q)) return 90;
  if (city === q) return 85;
  if (city.startsWith(q)) return 80;
  if (name.startsWith(q)) return 70;
  if (city.includes(q)) return 60;
  if (name.includes(q)) return 50;
  if (iata.includes(q)) return 40;
  return 0;
}

export function searchAirports(query: string, limit = 10): AirportRecord[] {
  const q = query.trim().toLowerCase();
  if (q.length < 1) return [];

  const scored: { airport: AirportRecord; score: number }[] = [];

  for (const airport of AIRPORTS) {
    const score = scoreMatch(airport, q);
    if (score > 0) scored.push({ airport, score });
  }

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      a.airport.city.localeCompare(b.airport.city) ||
      a.airport.iata.localeCompare(b.airport.iata),
  );

  return scored.slice(0, limit).map((s) => s.airport);
}

export const AIRPORT_DATASET_SIZE = AIRPORTS.length;
