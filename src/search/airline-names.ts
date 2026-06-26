/**
 * IATA airline designator → display name (Spanish where natural).
 * Unknown codes are returned unchanged.
 */

const AIRLINE_NAMES: Record<string, string> = {
  // Argentina / LATAM
  AR: "Aerolíneas Argentinas",
  LA: "LATAM",
  LP: "LATAM Perú",
  XL: "LATAM Ecuador",
  JJ: "LATAM Brasil",
  "4M": "LATAM Argentina",
  AU: "Austral",
  FA: "Flybondi",
  FO: "Flybondi",
  WJ: "JetSmart Argentina",
  JA: "JetSmart",
  // Brasil
  G3: "Gol",
  AD: "Azul",
  // Chile
  H2: "Sky Airline",
  // Colombia / Avianca group
  AV: "Avianca",
  O6: "Avianca Brasil",
  TA: "TACA",
  // México / Central America
  AM: "Aeroméxico",
  Y4: "Volaris",
  VB: "Viva Aerobus",
  // USA
  AA: "American Airlines",
  UA: "United Airlines",
  DL: "Delta Air Lines",
  B6: "JetBlue",
  WN: "Southwest Airlines",
  AS: "Alaska Airlines",
  NK: "Spirit Airlines",
  F9: "Frontier Airlines",
  // Europa — Iberia group / low cost
  IB: "Iberia",
  I2: "Iberia Express",
  VY: "Vueling",
  UX: "Air Europa",
  LL: "Level",
  // UK
  BA: "British Airways",
  VS: "Virgin Atlantic",
  U2: "easyJet",
  BY: "TUI Airways",
  // Francia / Benelux
  AF: "Air France",
  KL: "KLM",
  HV: "Transavia",
  // Alemania / Austria / Suiza
  LH: "Lufthansa",
  LX: "Swiss",
  OS: "Austrian Airlines",
  SN: "Brussels Airlines",
  EW: "Eurowings",
  VL: "Lufthansa CityLine",
  // Italia
  AZ: "ITA Airways",
  FR: "Ryanair",
  // Otros Europa
  TP: "TAP Portugal",
  SK: "SAS",
  AY: "Finnair",
  LO: "LOT Polish Airlines",
  TK: "Turkish Airlines",
  EI: "Aer Lingus",
  DY: "Norwegian",
  // Medio Oriente
  EK: "Emirates",
  QR: "Qatar Airways",
  EY: "Etihad Airways",
  // Otros
  CM: "Copa Airlines",
  AC: "Air Canada",
  NH: "ANA",
  JL: "Japan Airlines",
  CA: "Air China",
  CX: "Cathay Pacific",
  SQ: "Singapore Airlines",
  QF: "Qantas",
};

export function airlineDisplayName(code: string): string {
  const c = code.trim().toUpperCase();
  if (!c) return code;
  return AIRLINE_NAMES[c] ?? code;
}

export function airlineDisplayNames(codes: string[]): string[] {
  return [...new Set(codes.map(airlineDisplayName).filter(Boolean))];
}
