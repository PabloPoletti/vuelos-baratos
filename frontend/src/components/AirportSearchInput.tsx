import { useEffect, useId, useRef, useState } from "react";
import { apiAirports } from "../api";
import type { AirportSuggestion } from "../api";
import {
  AIRPORT_FAVORITES,
  formatAirportLabel,
} from "../airportFavorites";

interface Props {
  label: string;
  value: string;
  onChange: (iata: string) => void;
  /** Called when user picks from dropdown; use to auto-add chips etc. */
  onSelect?: (iata: string, airport: AirportSuggestion) => void;
  placeholder?: string;
  id?: string;
  /** Clear the visible text after a dropdown selection. */
  clearOnSelect?: boolean;
  disabled?: boolean;
}

export function AirportSearchInput({
  label,
  value,
  onChange,
  onSelect,
  placeholder = "Ciudad, aeropuerto o IATA",
  id,
  clearOnSelect = false,
  disabled = false,
}: Props) {
  const generatedId = useId();
  const inputId = `airport-${id ?? generatedId}`;
  const wrapRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<AirportSuggestion[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (/^[A-Z]{3}$/.test(value)) {
      const fav = AIRPORT_FAVORITES.find((a) => a.iata === value);
      setText(fav ? formatAirportLabel(fav) : value);
    } else {
      setText(value);
    }
  }, [value]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function pick(airport: AirportSuggestion) {
    onChange(airport.iata);
    onSelect?.(airport.iata, airport);
    if (clearOnSelect) {
      setText("");
    } else {
      setText(formatAirportLabel(airport));
    }
    setOpen(false);
    setSuggestions([]);
  }

  function scheduleSearch(q: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (q.trim().length < 2) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await apiAirports(q.trim());
        setSuggestions(results);
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setText(v);
    setOpen(true);

    const maybeIata = v.trim().toUpperCase();
    if (/^[A-Z]{0,3}$/.test(maybeIata)) {
      onChange(maybeIata);
    }

    scheduleSearch(v);
  }

  function handleFocus() {
    setOpen(true);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      const q = text.trim().toUpperCase();
      if (/^[A-Z]{3}$/.test(q)) {
        onChange(q);
        if (onSelect) {
          onSelect(q, { iata: q, name: "", city: "", country: "" });
          if (clearOnSelect) setText("");
        }
        setOpen(false);
        return;
      }
      const first = suggestions[0];
      if (first) pick(first);
    }
    if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const trimmed = text.trim();
  const showDropdown = open && !disabled;
  const showFavorites = showDropdown && trimmed.length < 2;
  const showSearch = showDropdown && trimmed.length >= 2;

  return (
    <div className="form-group airport-search" ref={wrapRef}>
      <label className="form-label" htmlFor={inputId}>
        {label}
      </label>
      <input
        id={inputId}
        type="text"
        value={text}
        onChange={handleInputChange}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        disabled={disabled}
      />

      {showDropdown && (showFavorites || showSearch) && (
        <ul className="airport-dropdown" role="listbox">
          {showFavorites && (
            <>
              <li className="airport-dropdown-heading">Favoritos</li>
              {AIRPORT_FAVORITES.map((a) => (
                <li key={a.iata}>
                  <button
                    type="button"
                    className="airport-option"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(a)}
                  >
                    {formatAirportLabel(a)}
                  </button>
                </li>
              ))}
            </>
          )}

          {showSearch && loading && (
            <li className="airport-dropdown-status">Buscando…</li>
          )}

          {showSearch && !loading && suggestions.length === 0 && (
            <li className="airport-dropdown-status">Sin resultados</li>
          )}

          {showSearch &&
            !loading &&
            suggestions.map((a) => (
              <li key={a.iata + a.name}>
                <button
                  type="button"
                  className="airport-option"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(a)}
                >
                  {formatAirportLabel(a)}
                </button>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
