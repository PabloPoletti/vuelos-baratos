export interface AirportSuggestion {
  iata: string;
  name: string;
  city: string;
  country: string;
}

/** Favoritos AR/CL + destinos populares (textos en español). */
export const AIRPORT_FAVORITES: AirportSuggestion[] = [
  { iata: "EZE", city: "Buenos Aires", name: "Aeropuerto Internacional Ezeiza", country: "Argentina" },
  { iata: "AEP", city: "Buenos Aires", name: "Aeroparque Jorge Newbery", country: "Argentina" },
  { iata: "COR", city: "Córdoba", name: "Aeropuerto Internacional Córdoba", country: "Argentina" },
  { iata: "MDZ", city: "Mendoza", name: "Aeropuerto El Plumerillo", country: "Argentina" },
  { iata: "SLA", city: "Salta", name: "Aeropuerto Martín Miguel de Güemes", country: "Argentina" },
  { iata: "ROS", city: "Rosario", name: "Aeropuerto Islas Malvinas", country: "Argentina" },
  { iata: "TUC", city: "San Miguel de Tucumán", name: "Aeropuerto Benjamín Matienzo", country: "Argentina" },
  { iata: "BRC", city: "San Carlos de Bariloche", name: "Aeropuerto San Carlos de Bariloche", country: "Argentina" },
  { iata: "NQN", city: "Neuquén", name: "Aeropuerto Presidente Perón", country: "Argentina" },
  { iata: "IGR", city: "Puerto Iguazú", name: "Aeropuerto Cataratas del Iguazú", country: "Argentina" },
  { iata: "SCL", city: "Santiago", name: "Aeropuerto Arturo Merino Benítez", country: "Chile" },
  { iata: "ANF", city: "Antofagasta", name: "Aeropuerto Andrés Sabella", country: "Chile" },
  { iata: "IQQ", city: "Iquique", name: "Aeropuerto Diego Aracena", country: "Chile" },
  { iata: "CJC", city: "Calama", name: "Aeropuerto El Loa", country: "Chile" },
  { iata: "CCP", city: "Concepción", name: "Aeropuerto Carriel Sur", country: "Chile" },
  { iata: "PMC", city: "Puerto Montt", name: "Aeropuerto El Tepual", country: "Chile" },
  { iata: "PUQ", city: "Punta Arenas", name: "Aeropuerto Presidente Carlos Ibáñez", country: "Chile" },
  { iata: "MIA", city: "Miami", name: "Aeropuerto Internacional de Miami", country: "Estados Unidos" },
  { iata: "JFK", city: "Nueva York", name: "Aeropuerto Internacional JFK", country: "Estados Unidos" },
  { iata: "CUN", city: "Cancún", name: "Aeropuerto Internacional de Cancún", country: "México" },
  { iata: "MAD", city: "Madrid", name: "Aeropuerto Adolfo Suárez Madrid-Barajas", country: "España" },
  { iata: "LHR", city: "Londres", name: "Aeropuerto Heathrow", country: "Reino Unido" },
  { iata: "GRU", city: "São Paulo", name: "Aeropuerto de Guarulhos", country: "Brasil" },
  { iata: "PUJ", city: "Punta Cana", name: "Aeropuerto Internacional de Punta Cana", country: "República Dominicana" },
  { iata: "BOG", city: "Bogotá", name: "Aeropuerto El Dorado", country: "Colombia" },
  { iata: "LIM", city: "Lima", name: "Aeropuerto Jorge Chávez", country: "Perú" },
];

export function formatAirportLabel(a: AirportSuggestion): string {
  const city = a.city || a.iata;
  const detail = a.name ? `${a.name}, ${a.country}` : a.country;
  return `${city} (${a.iata}) — ${detail}`;
}
