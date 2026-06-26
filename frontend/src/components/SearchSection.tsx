import { useState } from "react";
import { syncEndDateToStartMonth } from "../dateUtils";
import { AirportSearchInput } from "./AirportSearchInput";
import { apiSearch } from "../api";
import type { FlightResult, SearchError } from "../types";

type SortKey = "price" | "duration" | "stops";
type SortDir = "asc" | "desc";

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m > 0 ? ` ${m}m` : ""}`.trim();
}

function formatDT(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-AR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function SearchSection() {
  const [origin, setOrigin] = useState("EZE");
  const [destination, setDestination] = useState("");
  const [date, setDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [isRoundTrip, setIsRoundTrip] = useState(true);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<FlightResult[] | null>(null);
  const [apiErrors, setApiErrors] = useState<SearchError[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>("price");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const canSearch =
    origin.length === 3 && destination.length === 3 && date.length > 0;

  async function handleSearch() {
    if (!canSearch) return;
    setLoading(true);
    setFetchError(null);
    setResults(null);
    setApiErrors([]);
    try {
      const data = await apiSearch({
        origin,
        destination,
        date,
        tripType: isRoundTrip ? "round_trip" : "one_way",
        ...(isRoundTrip && returnDate ? { returnDate } : {}),
      });
      setResults(data.results ?? []);
      setApiErrors(data.errors ?? []);
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }

  function toggleSort(key: SortKey) {
    if (sortBy === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortDir("asc");
    }
  }

  function sortIndicator(key: SortKey) {
    if (sortBy !== key) return " ⇅";
    return sortDir === "asc" ? " ↑" : " ↓";
  }

  const sorted = results
    ? [...results].sort((a, b) => {
        const dir = sortDir === "asc" ? 1 : -1;
        if (sortBy === "price") return (a.price - b.price) * dir;
        if (sortBy === "duration")
          return (a.totalDurationMinutes - b.totalDurationMinutes) * dir;
        if (sortBy === "stops") return (a.stops - b.stops) * dir;
        return 0;
      })
    : [];

  return (
    <div>
      {/* Search form */}
      <div className="card">
        <div className="form-grid">
          <AirportSearchInput label="Origen" value={origin} onChange={setOrigin} id="orig" />
          <AirportSearchInput
            label="Destino"
            value={destination}
            onChange={setDestination}
            id="dest"
          />
          <div className="form-group">
            <label className="form-label">Fecha de ida</label>
            <input
              type="date"
              value={date}
              onChange={(e) => {
                const next = e.target.value;
                setDate(next);
                if (isRoundTrip) {
                  setReturnDate((prev) => syncEndDateToStartMonth(next, prev));
                }
              }}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Vuelta</label>
            <label className="trip-type-label" style={{ marginBottom: "0.3rem" }}>
              <input
                type="checkbox"
                checked={isRoundTrip}
                onChange={(e) => setIsRoundTrip(e.target.checked)}
              />
              Round trip
            </label>
            {isRoundTrip && (
              <input
                type="date"
                value={returnDate}
                onChange={(e) => setReturnDate(e.target.value)}
                placeholder="Fecha de vuelta"
              />
            )}
          </div>
        </div>
        <button
          className="btn btn-primary"
          onClick={handleSearch}
          disabled={loading || !canSearch}
        >
          {loading ? "Buscando…" : "Buscar vuelos"}
        </button>
      </div>

      {/* Network error */}
      {fetchError && (
        <div className="alert alert-error">
          Error de red: {fetchError}
        </div>
      )}

      {/* Partial API errors (non-blocking) */}
      {apiErrors.map((e, i) => (
        <div key={i} className="alert alert-warning">
          <strong>
            {e.source === "google_flights" ? "Google Flights" : "Skyscanner"}
          </strong>{" "}
          no disponible en esta búsqueda: {e.message}
        </div>
      ))}

      {loading && (
        <div className="loading">Buscando vuelos…</div>
      )}

      {/* Results table */}
      {sorted.length > 0 && (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th
                  className="sortable"
                  onClick={() => toggleSort("price")}
                >
                  Precio{sortIndicator("price")}
                </th>
                <th>Aerolíneas</th>
                <th
                  className="sortable"
                  onClick={() => toggleSort("duration")}
                >
                  Duración{sortIndicator("duration")}
                </th>
                <th
                  className="sortable"
                  onClick={() => toggleSort("stops")}
                >
                  Escalas{sortIndicator("stops")}
                </th>
                <th>Salida</th>
                <th>Llegada</th>
                <th>Fuente</th>
                <th>Booking</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr key={i}>
                  <td className="td-price">
                    ${r.price.toLocaleString("es-AR")}{" "}
                    <span className="td-muted">{r.currency}</span>
                  </td>
                  <td>{r.airlines.join(", ") || "—"}</td>
                  <td>{formatDuration(r.totalDurationMinutes)}</td>
                  <td>
                    {r.stops === 0
                      ? "Directo"
                      : `${r.stops} escala${r.stops > 1 ? "s" : ""}`}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {formatDT(r.departureTime)}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {formatDT(r.arrivalTime)}
                  </td>
                  <td>
                    <span
                      className={`source-badge ${
                        r.source === "google_flights"
                          ? "source-google"
                          : "source-skyscanner"
                      }`}
                    >
                      {r.source === "google_flights" ? "Google" : "Skyscanner"}
                    </span>
                  </td>
                  <td>
                    {r.bookingUrl ? (
                      <a
                        href={r.bookingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="booking-link"
                      >
                        Reservar →
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {results !== null && sorted.length === 0 && !loading && (
        <div className="alert alert-info">
          No se encontraron vuelos para esta búsqueda.
        </div>
      )}
    </div>
  );
}
