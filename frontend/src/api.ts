import type {
  SearchResponse,
  DateRangeResponse,
  MultiCityResult,
  TripType,
} from "./types";

// Strip trailing slash so we can always write `${BASE}/api/...`
const BASE = ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "").replace(
  /\/$/,
  "",
);

async function handleResponse<T>(res: Response): Promise<T> {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = (json as { error?: string }).error ?? `HTTP ${res.status}`;
    throw new Error(err);
  }
  return json as T;
}

// ---------------------------------------------------------------------------
// GET /api/search
// ---------------------------------------------------------------------------

export interface SearchParams {
  origin: string;
  destination: string;
  date: string;
  returnDate?: string;
  tripType: TripType;
  adults?: number;
  currency?: string;
}

export async function apiSearch(params: SearchParams): Promise<SearchResponse> {
  const q = new URLSearchParams({
    origin: params.origin,
    destination: params.destination,
    date: params.date,
    tripType: params.tripType,
    ...(params.returnDate ? { returnDate: params.returnDate } : {}),
    ...(params.adults != null ? { adults: String(params.adults) } : {}),
    ...(params.currency ? { currency: params.currency } : {}),
  });
  const res = await fetch(`${BASE}/api/search?${q}`);
  return handleResponse<SearchResponse>(res);
}

// ---------------------------------------------------------------------------
// GET /api/search-dates
// ---------------------------------------------------------------------------

export interface SearchDatesParams {
  origin: string;
  destination: string;
  startDate: string;
  endDate: string;
  stayDuration: number;
  adults?: number;
}

export async function apiSearchDates(
  params: SearchDatesParams,
): Promise<DateRangeResponse> {
  const q = new URLSearchParams({
    origin: params.origin,
    destination: params.destination,
    startDate: params.startDate,
    endDate: params.endDate,
    stayDuration: String(params.stayDuration),
    tripType: "round_trip",
    ...(params.adults != null ? { adults: String(params.adults) } : {}),
  });
  const res = await fetch(`${BASE}/api/search-dates?${q}`);
  return handleResponse<DateRangeResponse>(res);
}

// ---------------------------------------------------------------------------
// POST /api/multi-city
// ---------------------------------------------------------------------------

export async function apiMultiCity(body: unknown): Promise<MultiCityResult> {
  const res = await fetch(`${BASE}/api/multi-city`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return handleResponse<MultiCityResult>(res);
}
