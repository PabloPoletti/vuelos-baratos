export type TripType = "one_way" | "round_trip";
export type ResultSource = "google_flights" | "skyscanner";

export interface FlightLeg {
  airline: string;
  flightNumber: string;
  departureAirport: string;
  arrivalAirport: string;
  departureTime: string;
  arrivalTime: string;
  durationMinutes: number;
}

export interface FlightResult {
  price: number;
  currency: string;
  airlines: string[];
  totalDurationMinutes: number;
  stops: number;
  departureTime: string;
  arrivalTime: string;
  legs: FlightLeg[];
  bookingUrl: string;
  source: ResultSource;
}

export interface SearchError {
  source: ResultSource;
  message: string;
}

export interface SearchResponse {
  results: FlightResult[];
  errors: SearchError[];
}

// ---- /api/search-dates ----

export interface DateResult {
  departureDate: string;
  returnDate: string;
  price: number | null;
  currency: string;
  isDeal: boolean;
}

export interface DateStats {
  median: number;
  mean: number;
  stdDev: number;
  min: number;
  max: number;
}

export interface DateRangeResponse {
  origin: string;
  destination: string;
  stayDuration: number;
  results: DateResult[];
  stats: DateStats | null;
  errors: string[];
  isDealNote?: string;
}

// ---- /api/multi-city ----

export interface LegStopDetail {
  iata: string;
  city: string;
  country: string;
}

export interface LegResult {
  from: string;
  to: string;
  date: string;
  price: number | null;
  currency: string;
  airlines: string[];
  stops: number | null;
  stopDetails: LegStopDetail[];
  route: string;
  error: string | null;
}

export interface PermutationResult {
  order: string[];
  totalPrice: number;
  currency: string;
  legs: LegResult[];
}

export interface FixedModeResult {
  mode: "fixed";
  origin: string;
  totalPrice: number | null;
  currency: string;
  legs: LegResult[];
}

export interface OptimizeModeResult {
  mode: "optimize";
  origin: string;
  destinations: string[];
  best: PermutationResult | null;
  alternatives: PermutationResult[];
  failedLegs?: string[];
  stats: {
    permutationsEvaluated: number;
    uniqueLegsSearched: number;
    uniqueLegsCachedInKv: number;
  };
}

export type MultiCityResult = FixedModeResult | OptimizeModeResult;
