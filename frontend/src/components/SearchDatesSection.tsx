import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { AirportInput } from "./AirportInput";
import { apiSearchDates } from "../api";
import type { DateRangeResponse, DateResult } from "../types";

const STAY_OPTIONS = [7, 10, 14, 17, 21];

interface ChartEntry {
  date: string;
  price: number;
  isDeal: boolean;
  raw: DateResult;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: { payload: ChartEntry }[];
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0]?.payload;
  if (!item) return null;
  return (
    <div
      style={{
        background: "white",
        border: "1px solid #e2e8f0",
        padding: "0.6rem 0.875rem",
        borderRadius: "6px",
        fontSize: "0.82rem",
        boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
      }}
    >
      <p style={{ fontWeight: 600 }}>Salida: {item.raw.departureDate}</p>
      <p style={{ color: "#64748b" }}>Regreso: {item.raw.returnDate}</p>
      <p style={{ fontWeight: 700, fontSize: "1rem", marginTop: "0.25rem" }}>
        ${item.price.toLocaleString("es-AR")} {item.raw.currency}
      </p>
      {item.isDeal && (
        <p style={{ color: "#16a34a", fontWeight: 700, marginTop: "0.2rem" }}>
          ¡Oferta!
        </p>
      )}
    </div>
  );
}

export function SearchDatesSection() {
  const [origin, setOrigin] = useState("EZE");
  const [destination, setDestination] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [stayDuration, setStayDuration] = useState(14);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<DateRangeResponse | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const canSearch =
    origin.length === 3 &&
    destination.length === 3 &&
    startDate.length > 0 &&
    endDate.length > 0;

  async function handleSearch() {
    if (!canSearch) return;
    setLoading(true);
    setFetchError(null);
    setResponse(null);
    try {
      const data = await apiSearchDates({
        origin,
        destination,
        startDate,
        endDate,
        stayDuration,
      });
      setResponse(data);
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }

  const validResults: DateResult[] = (response?.results ?? []).filter(
    (r): r is DateResult & { price: number } => r.price !== null,
  );

  const chartData: ChartEntry[] = validResults.map((r) => ({
    date: r.departureDate.slice(5), // MM-DD
    price: r.price as number,
    isDeal: r.isDeal,
    raw: r,
  }));

  const fmt = (n: number) => `$${Math.round(n).toLocaleString("es-AR")}`;

  return (
    <div>
      <div className="card">
        <div className="form-grid">
          <AirportInput label="Origen" value={origin} onChange={setOrigin} id="sd-orig" />
          <AirportInput
            label="Destino"
            value={destination}
            onChange={setDestination}
            id="sd-dest"
          />
          <div className="form-group">
            <label className="form-label">Fechas desde</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Fechas hasta</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Duración de estadía</label>
            <select
              value={stayDuration}
              onChange={(e) => setStayDuration(Number(e.target.value))}
            >
              {STAY_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n} noches
                </option>
              ))}
            </select>
          </div>
        </div>
        <button
          className="btn btn-primary"
          onClick={handleSearch}
          disabled={loading || !canSearch}
        >
          {loading ? "Buscando…" : "Buscar fechas"}
        </button>
      </div>

      {fetchError && (
        <div className="alert alert-error">Error: {fetchError}</div>
      )}

      {loading && (
        <div className="loading">Buscando combinaciones de fechas…</div>
      )}

      {response && !loading && (
        <>
          {(response.errors ?? []).length > 0 && (
            <div className="alert alert-warning">
              {response.errors.length} fecha
              {response.errors.length > 1 ? "s" : ""} sin resultado:{" "}
              {response.errors.slice(0, 2).join("; ")}
              {response.errors.length > 2
                ? ` y ${response.errors.length - 2} más`
                : ""}
            </div>
          )}

          {response.isDealNote && (
            <div className="alert alert-info">{response.isDealNote}</div>
          )}

          {/* Stats */}
          {response.stats && (
            <div className="card">
              <div className="stats-row">
                <div className="stat-item">
                  <div className="stat-value">{fmt(response.stats.min)}</div>
                  <div className="stat-label">Mínimo</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{fmt(response.stats.median)}</div>
                  <div className="stat-label">Mediana</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{fmt(response.stats.mean)}</div>
                  <div className="stat-label">Promedio</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{fmt(response.stats.max)}</div>
                  <div className="stat-label">Máximo</div>
                </div>
                <div className="stat-item">
                  <div
                    className="stat-value"
                    style={{ color: "var(--success)" }}
                  >
                    {validResults.filter((r) => r.isDeal).length}
                  </div>
                  <div className="stat-label">Ofertas</div>
                </div>
              </div>
            </div>
          )}

          {/* Bar chart */}
          {chartData.length > 0 && (
            <div className="card">
              <div className="chart-legend">
                <span>
                  <span
                    className="legend-dot"
                    style={{ background: "#16a34a" }}
                  />
                  Oferta
                </span>
                <span>
                  <span
                    className="legend-dot"
                    style={{ background: "#3b82f6" }}
                  />
                  Precio normal
                </span>
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={chartData}
                  margin={{ top: 5, right: 15, bottom: 5, left: 15 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: number) => `$${v}`}
                    width={70}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="price" radius={[3, 3, 0, 0]}>
                    {chartData.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={entry.isDeal ? "#16a34a" : "#3b82f6"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Detail table sorted by price */}
          {validResults.length > 0 && (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Salida</th>
                    <th>Regreso</th>
                    <th>Precio</th>
                    <th>Moneda</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {[...validResults]
                    .sort((a, b) => (a.price as number) - (b.price as number))
                    .map((r, i) => (
                      <tr
                        key={i}
                        style={{ background: r.isDeal ? "#f0fdf4" : undefined }}
                      >
                        <td>{r.departureDate}</td>
                        <td>{r.returnDate}</td>
                        <td className="td-price">
                          ${(r.price as number).toLocaleString("es-AR")}
                        </td>
                        <td className="td-muted">{r.currency}</td>
                        <td>
                          {r.isDeal && (
                            <span className="deal-badge">OFERTA</span>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          {validResults.length === 0 && (
            <div className="alert alert-info">
              No se encontraron precios para el rango solicitado.
            </div>
          )}
        </>
      )}
    </div>
  );
}
