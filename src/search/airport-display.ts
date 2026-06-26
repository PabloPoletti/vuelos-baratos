/**
 * Spanish display labels + IATA lookup for airports dataset.
 */

import airportsData from "../data/airports-iata.json";
import type { AirportRecord } from "./airports";

const COUNTRY_ES: Record<string, string> = {
  AR: "Argentina",
  CL: "Chile",
  UY: "Uruguay",
  PY: "Paraguay",
  BO: "Bolivia",
  PE: "Perú",
  EC: "Ecuador",
  CO: "Colombia",
  VE: "Venezuela",
  BR: "Brasil",
  MX: "México",
  US: "Estados Unidos",
  CA: "Canadá",
  ES: "España",
  PT: "Portugal",
  FR: "Francia",
  DE: "Alemania",
  IT: "Italia",
  GB: "Reino Unido",
  IE: "Irlanda",
  NL: "Países Bajos",
  BE: "Bélgica",
  CH: "Suiza",
  AT: "Austria",
  DO: "República Dominicana",
  CU: "Cuba",
  PA: "Panamá",
  CR: "Costa Rica",
  AU: "Australia",
  NZ: "Nueva Zelanda",
  JP: "Japón",
  CN: "China",
  KR: "Corea del Sur",
  TR: "Turquía",
  GR: "Grecia",
  IL: "Israel",
  AE: "Emiratos Árabes Unidos",
  QA: "Catar",
  MA: "Marruecos",
  EG: "Egipto",
  ZA: "Sudáfrica",
};

/** English city name → Spanish (dataset uses English). */
const CITY_ES: Record<string, string> = {
  London: "Londres",
  "New York": "Nueva York",
  Munich: "Múnich",
  Rome: "Roma",
  Milan: "Milán",
  Naples: "Nápoles",
  Venice: "Venecia",
  Florence: "Florencia",
  Cologne: "Colonia",
  Vienna: "Viena",
  Prague: "Praga",
  Warsaw: "Varsovia",
  Copenhagen: "Copenhague",
  Stockholm: "Estocolmo",
  Oslo: "Oslo",
  Helsinki: "Helsinki",
  Athens: "Atenas",
  Lisbon: "Lisboa",
  Moscow: "Moscú",
  Beijing: "Pekín",
  Shanghai: "Shanghái",
  "Hong Kong": "Hong Kong",
  Bangkok: "Bangkok",
  Singapore: "Singapur",
  "Mexico City": "Ciudad de México",
  Cancun: "Cancún",
  Havana: "La Habana",
  "São Paulo": "São Paulo",
  "Rio de Janeiro": "Río de Janeiro",
  Brussels: "Bruselas",
  Amsterdam: "Ámsterdam",
  Zurich: "Zúrich",
  Geneva: "Ginebra",
  Dublin: "Dublín",
  Edinburgh: "Edimburgo",
  Manchester: "Mánchester",
  Birmingham: "Birmingham",
  Barcelona: "Barcelona",
  Seville: "Sevilla",
  Valencia: "Valencia",
  Bilbao: "Bilbao",
  Bogota: "Bogotá",
  "Buenos Aires": "Buenos Aires",
  Cordoba: "Córdoba",
  Mendoza: "Mendoza",
  Santiago: "Santiago",
  Lima: "Lima",
  Quito: "Quito",
  Caracas: "Caracas",
  Montevideo: "Montevideo",
  Asuncion: "Asunción",
  "La Paz": "La Paz",
  "Santa Cruz": "Santa Cruz",
  Calama: "Calama",
  Antofagasta: "Antofagasta",
  Iquique: "Iquique",
  "Punta Cana": "Punta Cana",
  "Punta Arenas": "Punta Arenas",
  "Puerto Montt": "Puerto Montt",
  Concepcion: "Concepción",
  Miami: "Miami",
  Orlando: "Orlando",
  Atlanta: "Atlanta",
  Chicago: "Chicago",
  Dallas: "Dallas",
  Houston: "Houston",
  "Los Angeles": "Los Ángeles",
  "San Francisco": "San Francisco",
  Seattle: "Seattle",
  Boston: "Boston",
  Washington: "Washington",
  Toronto: "Toronto",
  Montreal: "Montreal",
  Vancouver: "Vancouver",
};

/** IATA → city override (dataset sometimes uses suburb name). */
const CITY_IATA_ES: Record<string, string> = {
  EZE: "Buenos Aires",
  AEP: "Buenos Aires",
};

/** Query (normalized) → preferred IATA codes for disambiguation. */
const PRIORITY_IATA: Record<string, string[]> = {
  "buenos aires": ["AEP", "EZE"],
  londres: ["LHR", "LGW", "STN", "LCY"],
  cancun: ["CUN"],
  madrid: ["MAD"],
  miami: ["MIA"],
  barcelona: ["BCN"],
  paris: ["CDG", "ORY"],
  "sao paulo": ["GRU"],
};

/** Extra search terms (Spanish / local names) keyed by IATA. */
const SEARCH_ALIASES: Record<string, string[]> = {
  EZE: ["buenos aires", "ezeiza", "capital federal"],
  AEP: ["buenos aires", "aeroparque", "capital federal"],
  COR: ["córdoba", "cordoba"],
  MDZ: ["mendoza"],
  SLA: ["salta"],
  ROS: ["rosario"],
  TUC: ["tucumán", "tucuman", "san miguel de tucumán"],
  BRC: ["bariloche", "san carlos de bariloche"],
  NQN: ["neuquén", "neuquen"],
  IGR: ["iguazú", "iguazu", "puerto iguazú"],
  SCL: ["santiago", "santiago de chile"],
  ANF: ["antofagasta"],
  IQQ: ["iquique"],
  CJC: ["calama"],
  CCP: ["concepción", "concepcion"],
  PMC: ["puerto montt"],
  PUQ: ["punta arenas"],
  MIA: ["miami"],
  JFK: ["nueva york", "new york", "ny"],
  LGA: ["nueva york", "new york"],
  EWR: ["nueva york", "newark"],
  CUN: ["cancún", "cancun"],
  MAD: ["madrid"],
  BCN: ["barcelona"],
  LHR: ["londres", "london", "heathrow"],
  LGW: ["londres", "london", "gatwick"],
  STN: ["londres", "london"],
  CDG: ["parís", "paris"],
  ORY: ["parís", "paris"],
  FCO: ["roma", "rome"],
  GRU: ["são paulo", "sao paulo", "san pablo"],
  GIG: ["río de janeiro", "rio de janeiro"],
  PUJ: ["punta cana"],
  BOG: ["bogotá", "bogota"],
  LIM: ["lima"],
  MEX: ["ciudad de méxico", "cdmx", "méxico df"],
};

/** Spanish airport name overrides by IATA. */
const NAME_ES: Record<string, string> = {
  EZE: "Aeropuerto Internacional Ezeiza",
  AEP: "Aeroparque Jorge Newbery",
  COR: "Aeropuerto Internacional Córdoba",
  MDZ: "Aeropuerto El Plumerillo",
  MAD: "Aeropuerto Adolfo Suárez Madrid-Barajas",
  LHR: "Aeropuerto Heathrow",
  CUN: "Aeropuerto Internacional de Cancún",
  MIA: "Aeropuerto Internacional de Miami",
  JFK: "Aeropuerto Internacional JFK",
  BCN: "Aeropuerto de Barcelona-El Prat",
  CDG: "Aeropuerto Charles de Gaulle",
  GRU: "Aeropuerto de Guarulhos",
  PUJ: "Aeropuerto Internacional de Punta Cana",
  BOG: "Aeropuerto El Dorado",
  LIM: "Aeropuerto Jorge Chávez",
  SCL: "Aeropuerto Arturo Merino Benítez",
};

const IATA_INDEX = new Map<string, AirportRecord>();
for (const a of airportsData as AirportRecord[]) {
  IATA_INDEX.set(a.iata.toUpperCase(), a);
}

export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function cityInSpanish(city: string, iata?: string): string {
  if (iata && CITY_IATA_ES[iata.toUpperCase()]) {
    return CITY_IATA_ES[iata.toUpperCase()] as string;
  }
  return CITY_ES[city] ?? city;
}

export function countryInSpanish(code: string): string {
  return COUNTRY_ES[code.toUpperCase()] ?? code;
}

export function airportNameInSpanish(iata: string, fallback: string): string {
  return NAME_ES[iata.toUpperCase()] ?? fallback;
}

/** Returns airport info with Spanish city, name and country for display. */
export function localizeAirport(a: AirportRecord): AirportRecord {
  return {
    iata: a.iata,
    city: cityInSpanish(a.city, a.iata),
    name: airportNameInSpanish(a.iata, a.name),
    country: countryInSpanish(a.country),
  };
}

export function lookupAirport(iata: string): AirportRecord | null {
  const raw = IATA_INDEX.get(iata.toUpperCase());
  if (!raw) return null;
  return localizeAirport(raw);
}

export function formatAirportPoint(iata: string): string {
  const info = lookupAirport(iata);
  if (!info) return iata;
  return `${iata} (${info.city})`;
}

export function searchAliases(iata: string): string[] {
  return SEARCH_ALIASES[iata.toUpperCase()] ?? [];
}

/** Extra score when query matches a well-known city → preferred airports. */
export function getPriorityBonus(iata: string, query: string): number {
  const qn = normalizeText(query);
  const preferred = PRIORITY_IATA[qn];
  if (!preferred) return 0;
  const idx = preferred.indexOf(iata.toUpperCase());
  if (idx === -1) return 0;
  return 50 - idx * 5; // first preferred gets +50, second +45, etc.
}

/** All searchable text for an airport (normalized, lowercased). */
export function searchableTexts(a: AirportRecord): string[] {
  const localized = localizeAirport(a);
  const texts = [
    a.iata,
    a.city,
    a.name,
    a.country,
    localized.city,
    localized.name,
    localized.country,
    ...searchAliases(a.iata),
  ];
  return texts.map(normalizeText);
}
