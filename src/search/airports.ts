/**
 * Airport search — static IATA-filtered dataset from mwgg/Airports.
 * Regenerate with: node scripts/build-airports-data.js
 */

import airportsData from "../data/airports-iata.json";
import { localizeAirport, normalizeText, searchableTexts, getPriorityBonus } from "./airport-display";

export interface AirportRecord {
  iata: string;
  name: string;
  city: string;
  country: string;
}

const AIRPORTS = airportsData as AirportRecord[];

function scoreMatch(a: AirportRecord, q: string): number {
  const qn = normalizeText(q);
  const texts = searchableTexts(a);

  let best = 0;
  for (const text of texts) {
    if (text === qn) best = Math.max(best, 100);
    else if (text.startsWith(qn)) best = Math.max(best, 85);
    else if (text.includes(qn)) best = Math.max(best, 60);
  }

  // IATA prefix bonus
  if (a.iata.toLowerCase().startsWith(qn)) best = Math.max(best, 90);

  best += getPriorityBonus(a.iata, q);

  return best;
}

export function searchAirports(query: string, limit = 10): AirportRecord[] {
  const q = query.trim();
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

  return scored.slice(0, limit).map((s) => localizeAirport(s.airport));
}

export const AIRPORT_DATASET_SIZE = AIRPORTS.length;

export { lookupAirport, formatAirportPoint } from "./airport-display";
