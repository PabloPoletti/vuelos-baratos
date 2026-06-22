export type TripType = "one_way" | "round_trip";

export interface SearchOptions {
  origin: string;
  destination: string;
  date: string; // YYYY-MM-DD
  returnDate?: string; // YYYY-MM-DD — required when tripType is "round_trip"
  tripType: TripType;
  adults?: number;
  currency?: string; // ISO 4217, e.g. "USD", "EUR", "ARS"
}

export interface FlightLeg {
  airline: string; // IATA carrier code
  flightNumber: string;
  departureAirport: string; // IATA airport code
  arrivalAirport: string;
  departureTime: string; // ISO 8601 datetime
  arrivalTime: string;
  durationMinutes: number;
}

export interface FlightResult {
  price: number;
  currency: string;
  airlines: string[]; // unique set of carrier codes, e.g. ["LA", "AA"]
  totalDurationMinutes: number;
  stops: number;
  departureTime: string; // ISO 8601 — first leg departure
  arrivalTime: string; // ISO 8601 — last leg arrival
  legs: FlightLeg[];
  bookingUrl: string;
  source: "google" | "kiwi";
}

export interface SearchResult {
  results: FlightResult[];
  errors: { source: "google" | "kiwi"; message: string }[];
}
