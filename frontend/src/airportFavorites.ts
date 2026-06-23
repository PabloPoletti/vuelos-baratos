export interface AirportSuggestion {
  iata: string;
  name: string;
  city: string;
  country: string;
}

/** Quick picks for AR/CL + popular destinations (shown when field is empty). */
export const AIRPORT_FAVORITES: AirportSuggestion[] = [
  { iata: "EZE", city: "Buenos Aires", name: "Ministro Pistarini International Airport", country: "AR" },
  { iata: "AEP", city: "Buenos Aires", name: "Jorge Newbery Airfield", country: "AR" },
  { iata: "COR", city: "Córdoba", name: "Ingeniero Ambrosio Taravella Airport", country: "AR" },
  { iata: "MDZ", city: "Mendoza", name: "Governor Francisco Gabrielli International Airport", country: "AR" },
  { iata: "SLA", city: "Salta", name: "Martín Miguel de Güemes International Airport", country: "AR" },
  { iata: "ROS", city: "Rosario", name: "Islas Malvinas International Airport", country: "AR" },
  { iata: "TUC", city: "San Miguel de Tucumán", name: "Benjamín Matienzo International Airport", country: "AR" },
  { iata: "BRC", city: "San Carlos de Bariloche", name: "San Carlos de Bariloche Airport", country: "AR" },
  { iata: "NQN", city: "Neuquén", name: "Presidente Perón International Airport", country: "AR" },
  { iata: "IGR", city: "Puerto Iguazú", name: "Cataratas del Iguazú International Airport", country: "AR" },
  { iata: "SCL", city: "Santiago", name: "Arturo Merino Benítez International Airport", country: "CL" },
  { iata: "ANF", city: "Antofagasta", name: "Andrés Sabella Gálvez International Airport", country: "CL" },
  { iata: "IQQ", city: "Iquique", name: "Diego Aracena International Airport", country: "CL" },
  { iata: "CJC", city: "Calama", name: "El Loa Airport", country: "CL" },
  { iata: "CCP", city: "Concepción", name: "Carriel Sur International Airport", country: "CL" },
  { iata: "PMC", city: "Puerto Montt", name: "El Tepual Airport", country: "CL" },
  { iata: "PUQ", city: "Punta Arenas", name: "Presidente Carlos Ibáñez del Campo International Airport", country: "CL" },
  { iata: "MIA", city: "Miami", name: "Miami International Airport", country: "US" },
  { iata: "JFK", city: "New York", name: "John F Kennedy International Airport", country: "US" },
  { iata: "CUN", city: "Cancún", name: "Cancún International Airport", country: "MX" },
  { iata: "MAD", city: "Madrid", name: "Adolfo Suárez Madrid–Barajas Airport", country: "ES" },
  { iata: "GRU", city: "São Paulo", name: "Guarulhos International Airport", country: "BR" },
  { iata: "PUJ", city: "Punta Cana", name: "Punta Cana International Airport", country: "DO" },
  { iata: "BOG", city: "Bogotá", name: "El Dorado International Airport", country: "CO" },
  { iata: "LIM", city: "Lima", name: "Jorge Chávez International Airport", country: "PE" },
];

export function formatAirportLabel(a: AirportSuggestion): string {
  const city = a.city || a.iata;
  const detail = a.name ? `${a.name}, ${a.country}` : a.country;
  return `${city} (${a.iata}) - ${detail}`;
}
