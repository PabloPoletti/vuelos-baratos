import { useState } from "react";
import { AirportSearchInput } from "./AirportSearchInput";
import { apiMultiCity } from "../api";
import type {
  MultiCityResult,
  FixedModeResult,
  OptimizeModeResult,
  PermutationResult,
  LegResult,
} from "../types";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function formatStops(leg: LegResult): string {
  if (leg.stops === null) return "—";
  if (leg.stops === 0) return "Directo";
  if (leg.stopDetails?.length) {
    const places = leg.stopDetails.map((s) => `${s.iata} (${s.city})`).join(", ");
    return `${leg.stops} escala${leg.stops > 1 ? "s" : ""}: ${places}`;
  }
  return `${leg.stops} escala${leg.stops > 1 ? "s" : ""}`;
}

function LegTable({ legs }: { legs: LegResult[] }) {
  return (
    <table className="legs-table">
      <thead>
        <tr>
          <th>Desde</th>
          <th>Hacia</th>
          <th>Fecha</th>
          <th>Ruta</th>
          <th>Aerolínea</th>
          <th>Escalas</th>
          <th>Precio</th>
        </tr>
      </thead>
      <tbody>
        {legs.map((l, i) => (
          <tr key={i}>
            <td>{l.from}</td>
            <td>{l.to}</td>
            <td style={{ whiteSpace: "nowrap" }}>{l.date}</td>
            <td className="td-route">{l.route || `${l.from} → ${l.to}`}</td>
            <td>{l.airlines?.length ? l.airlines.join(", ") : "—"}</td>
            <td>{formatStops(l)}</td>
            <td className="td-price">
              {l.price !== null ? (
                <>
                  ${l.price.toLocaleString("es-AR")}{" "}
                  <span className="td-muted">{l.currency}</span>
                </>
              ) : (
                <span style={{ color: "var(--error)", fontSize: "0.8rem" }}>
                  {l.error ?? "Sin resultado"}
                </span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PermCard({
  perm,
  origin,
  variant,
}: {
  perm: PermutationResult;
  origin: string;
  variant: "best" | "alt";
}) {
  const [open, setOpen] = useState(variant === "best");
  const route = [origin, ...perm.order, origin].join(" → ");

  return (
    <div className={variant === "best" ? "best-result-card" : "alt-result-card"}>
      <div className="perm-header" onClick={() => setOpen((o) => !o)}>
        <div>
          {variant === "best" && (
            <span className="deal-badge" style={{ marginRight: "0.5rem" }}>
              MEJOR OPCIÓN
            </span>
          )}
          <span className="perm-route">{route}</span>
          <span className="perm-total">
            ${perm.totalPrice.toLocaleString("es-AR")} {perm.currency}
          </span>
        </div>
        <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
          {open ? "▲ ocultar" : "▼ ver tramos"}
        </span>
      </div>
      {open && <LegTable legs={perm.legs} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main section
// ---------------------------------------------------------------------------

interface FixedStop {
  destination: string;
  date: string;
}

export function MultiCitySection() {
  const [mode, setMode] = useState<"fixed" | "optimize">("fixed");

  // Fixed mode state
  const [fixedOrigin, setFixedOrigin] = useState("EZE");
  const [fixedStops, setFixedStops] = useState<FixedStop[]>([
    { destination: "", date: "" },
  ]);
  const [fixedReturnDate, setFixedReturnDate] = useState("");

  // Optimize mode state
  const [optOrigin, setOptOrigin] = useState("EZE");
  const [optDests, setOptDests] = useState<string[]>([]);
  const [optDestInput, setOptDestInput] = useState("");
  const [optStart, setOptStart] = useState("");
  const [optEnd, setOptEnd] = useState("");
  const [optNights, setOptNights] = useState(5);

  // Shared
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<MultiCityResult | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // ---- Fixed stop helpers ----
  function addStop() {
    setFixedStops((s) => [...s, { destination: "", date: "" }]);
  }

  function removeStop(i: number) {
    setFixedStops((s) => s.filter((_, idx) => idx !== i));
  }

  function updateStop(i: number, field: keyof FixedStop, val: string) {
    setFixedStops((s) =>
      s.map((stop, idx) =>
        idx === i ? { ...stop, [field]: field === "destination" ? val.toUpperCase() : val } : stop,
      ),
    );
  }

  // ---- Optimize dest helpers ----
  function addDestCode(code: string) {
    const iata = code.trim().toUpperCase();
    if (iata.length !== 3 || optDests.includes(iata) || optDests.length >= 6)
      return;
    setOptDests((d) => [...d, iata]);
    setOptDestInput("");
  }

  function removeDest(code: string) {
    setOptDests((d) => d.filter((x) => x !== code));
  }

  // ---- Validation ----
  const isFixedValid =
    fixedOrigin.length === 3 &&
    fixedStops.length > 0 &&
    fixedStops.every((s) => s.destination.length === 3 && s.date.length > 0) &&
    fixedReturnDate.length > 0;

  const isOptValid =
    optOrigin.length === 3 &&
    optDests.length >= 2 &&
    optStart.length > 0 &&
    optEnd.length > 0 &&
    optNights >= 1;

  // ---- Submit ----
  async function handleSearch() {
    setLoading(true);
    setFetchError(null);
    setResult(null);
    try {
      let body: unknown;
      if (mode === "fixed") {
        body = {
          mode: "fixed",
          origin: fixedOrigin,
          stops: fixedStops.map((s) => ({
            destination: s.destination,
            date: s.date,
          })),
          returnDate: fixedReturnDate,
          currency: "USD",
        };
      } else {
        body = {
          mode: "optimize",
          origin: optOrigin,
          destinations: optDests,
          startDate: optStart,
          endDate: optEnd,
          nightsPerStop: optNights,
          currency: "USD",
        };
      }
      const data = await apiMultiCity(body);
      setResult(data);
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }

  const canSearch = mode === "fixed" ? isFixedValid : isOptValid;

  // ---- Render ----
  return (
    <div>
      {/* Mode toggle */}
      <div className="mode-toggle">
        <button
          className={`mode-toggle-btn ${mode === "fixed" ? "active" : ""}`}
          onClick={() => {
            setMode("fixed");
            setResult(null);
          }}
        >
          Itinerario fijo
        </button>
        <button
          className={`mode-toggle-btn ${mode === "optimize" ? "active" : ""}`}
          onClick={() => {
            setMode("optimize");
            setResult(null);
          }}
        >
          Buscar mejor orden
        </button>
      </div>

      {/* ---- Fixed mode form ---- */}
      {mode === "fixed" && (
        <div className="card">
          <div style={{ marginBottom: "1rem" }}>
            <AirportSearchInput
              label="Origen / punto de partida"
              value={fixedOrigin}
              onChange={setFixedOrigin}
              id="fx-orig"
            />
          </div>

          <p className="section-title">Paradas (en orden)</p>

          {fixedStops.map((stop, i) => (
            <div className="stop-row" key={i}>
              <div style={{ flex: 1 }}>
                <AirportSearchInput
                  label={`Destino ${i + 1}`}
                  value={stop.destination}
                  onChange={(iata) => updateStop(i, "destination", iata)}
                  id={`fx-stop-${i}`}
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Fecha de llegada</label>
                <input
                  type="date"
                  value={stop.date}
                  onChange={(e) => updateStop(i, "date", e.target.value)}
                />
              </div>
              {fixedStops.length > 1 && (
                <button
                  className="btn btn-danger-soft"
                  style={{ padding: "0.45rem 0.7rem", alignSelf: "flex-end" }}
                  onClick={() => removeStop(i)}
                  title="Quitar parada"
                >
                  ✕
                </button>
              )}
            </div>
          ))}

          <div style={{ display: "flex", gap: "1rem", alignItems: "flex-end", marginTop: "0.5rem" }}>
            <button className="btn btn-ghost" onClick={addStop}>
              + Agregar parada
            </button>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Fecha de regreso a {fixedOrigin || "origen"}</label>
              <input
                type="date"
                value={fixedReturnDate}
                onChange={(e) => setFixedReturnDate(e.target.value)}
              />
            </div>
          </div>

          <div style={{ marginTop: "1.25rem" }}>
            <button
              className="btn btn-primary"
              onClick={handleSearch}
              disabled={loading || !canSearch}
            >
              {loading ? "Calculando…" : "Calcular itinerario"}
            </button>
          </div>
        </div>
      )}

      {/* ---- Optimize mode form ---- */}
      {mode === "optimize" && (
        <div className="card">
          <div className="form-grid">
            <AirportSearchInput
              label="Origen / base"
              value={optOrigin}
              onChange={setOptOrigin}
              id="opt-orig"
            />
            <div className="form-group">
              <label className="form-label">Inicio del viaje</label>
              <input
                type="date"
                value={optStart}
                onChange={(e) => setOptStart(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Fecha de regreso</label>
              <input
                type="date"
                value={optEnd}
                onChange={(e) => setOptEnd(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Noches por ciudad</label>
              <input
                type="number"
                min={1}
                max={30}
                value={optNights}
                onChange={(e) => setOptNights(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: "0.75rem" }}>
            <label className="form-label">
              Destinos — máx. 6 · buscá por ciudad o aeropuerto
            </label>
            <div className="dests-chips">
              {optDests.map((d) => (
                <span key={d} className="chip">
                  {d}
                  <button
                    className="chip-remove"
                    onClick={() => removeDest(d)}
                    title={`Quitar ${d}`}
                  >
                    ×
                  </button>
                </span>
              ))}
              {optDests.length === 0 && (
                <span style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>
                  Ningún destino agregado aún
                </span>
              )}
            </div>
            <AirportSearchInput
              label="Agregar destino"
              value={optDestInput}
              onChange={setOptDestInput}
              onSelect={(iata) => addDestCode(iata)}
              clearOnSelect
              placeholder="Ej: Cancún, Miami…"
              id="opt-dest-add"
              disabled={optDests.length >= 6}
            />
            {optDests.length >= 6 && (
              <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
                Máximo 6 destinos
              </span>
            )}
          </div>

          <button
            className="btn btn-primary"
            onClick={handleSearch}
            disabled={loading || !canSearch}
          >
            {loading ? "Calculando permutaciones…" : "Encontrar mejor ruta"}
          </button>
        </div>
      )}

      {/* Errors */}
      {fetchError && (
        <div className="alert alert-error">
          {fetchError}
        </div>
      )}

      {loading && (
        <div className="loading">Buscando precios para cada tramo…</div>
      )}

      {/* ---- Fixed results ---- */}
      {result && result.mode === "fixed" && !loading && (() => {
        const r = result as FixedModeResult;
        return (
          <div className="card">
            <p
              style={{
                fontSize: "0.8rem",
                color: "var(--text-muted)",
                marginBottom: "0.75rem",
              }}
            >
              Itinerario: {r.origin} →{" "}
              {r.legs.map((l) => l.to).join(" → ")}
            </p>

            {r.totalPrice !== null ? (
              <div style={{ marginBottom: "1rem" }}>
                <span className="perm-total" style={{ fontSize: "1.5rem" }}>
                  ${r.totalPrice.toLocaleString("es-AR")}
                </span>{" "}
                <span className="td-muted">{r.currency} total</span>
              </div>
            ) : (
              <div className="alert alert-warning" style={{ marginBottom: "1rem" }}>
                No se pudo calcular el total — algunos tramos no tienen precio
                disponible.
              </div>
            )}

            <LegTable legs={r.legs} />
          </div>
        );
      })()}

      {/* ---- Optimize results ---- */}
      {result && result.mode === "optimize" && !loading && (() => {
        const r = result as OptimizeModeResult;
        return (
          <div>
            <p className="perm-meta">
              {r.stats.permutationsEvaluated} permutaciones evaluadas ·{" "}
              {r.stats.uniqueLegsSearched} tramos únicos buscados
              {r.stats.uniqueLegsCachedInKv > 0 &&
                ` · ${r.stats.uniqueLegsCachedInKv} desde caché KV`}
            </p>

            {r.best === null ? (
              <div className="alert alert-warning">
                <p>
                  No se encontró ninguna ruta completa con precios disponibles
                  en todos sus tramos.
                </p>
                {r.failedLegs && r.failedLegs.length > 0 && (
                  <details style={{ marginTop: "0.5rem" }}>
                    <summary style={{ cursor: "pointer", fontWeight: 600 }}>
                      Ver tramos sin vuelos disponibles ({r.failedLegs.length})
                    </summary>
                    <ul
                      style={{
                        marginTop: "0.5rem",
                        paddingLeft: "1.5rem",
                        fontSize: "0.82rem",
                      }}
                    >
                      {r.failedLegs.map((l, i) => (
                        <li key={i}>{l}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            ) : (
              <>
                <PermCard perm={r.best} origin={r.origin} variant="best" />

                {r.alternatives.length > 0 && (
                  <>
                    <p
                      className="section-title"
                      style={{ marginTop: "1rem", marginBottom: "0.5rem" }}
                    >
                      Alternativas
                    </p>
                    {r.alternatives.map((alt, i) => (
                      <PermCard
                        key={i}
                        perm={alt}
                        origin={r.origin}
                        variant="alt"
                      />
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        );
      })()}
    </div>
  );
}
