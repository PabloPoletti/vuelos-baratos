import { useId } from "react";

const FAVORITES = [
  // Argentina
  { iata: "EZE", name: "Buenos Aires Ezeiza (EZE)" },
  { iata: "AEP", name: "Buenos Aires Aeroparque (AEP)" },
  { iata: "COR", name: "Córdoba (COR)" },
  { iata: "MDZ", name: "Mendoza (MDZ)" },
  { iata: "SLA", name: "Salta (SLA)" },
  { iata: "ROS", name: "Rosario (ROS)" },
  { iata: "TUC", name: "Tucumán (TUC)" },
  { iata: "BRC", name: "Bariloche (BRC)" },
  { iata: "NQN", name: "Neuquén (NQN)" },
  { iata: "IGR", name: "Iguazú (IGR)" },
  // Chile
  { iata: "SCL", name: "Santiago (SCL)" },
  { iata: "ANF", name: "Antofagasta (ANF)" },
  { iata: "IQQ", name: "Iquique (IQQ)" },
  { iata: "CJC", name: "Calama (CJC)" },
  { iata: "CCP", name: "Concepción (CCP)" },
  { iata: "PMC", name: "Puerto Montt (PMC)" },
  { iata: "PUQ", name: "Punta Arenas (PUQ)" },
  // Popular destinations
  { iata: "GRU", name: "São Paulo Guarulhos (GRU)" },
  { iata: "SCL", name: "Santiago de Chile (SCL)" },
  { iata: "MIA", name: "Miami (MIA)" },
  { iata: "JFK", name: "Nueva York JFK (JFK)" },
  { iata: "MAD", name: "Madrid (MAD)" },
  { iata: "BCN", name: "Barcelona (BCN)" },
  { iata: "CDG", name: "París Charles de Gaulle (CDG)" },
  { iata: "LHR", name: "Londres Heathrow (LHR)" },
  { iata: "CUN", name: "Cancún (CUN)" },
  { iata: "PUJ", name: "Punta Cana (PUJ)" },
  { iata: "BOG", name: "Bogotá (BOG)" },
  { iata: "LIM", name: "Lima (LIM)" },
];

interface Props {
  label: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  id?: string;
}

export function AirportInput({
  label,
  value,
  onChange,
  placeholder = "Ej: EZE",
  id,
}: Props) {
  const generatedId = useId();
  const listId = `airports-${id ?? generatedId}`;

  return (
    <div className="form-group">
      <label className="form-label" htmlFor={listId + "-input"}>
        {label}
      </label>
      <input
        id={listId + "-input"}
        type="text"
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        placeholder={placeholder}
        maxLength={3}
        autoComplete="off"
      />
      <datalist id={listId}>
        {FAVORITES.map((a) => (
          <option key={a.iata + a.name} value={a.iata}>
            {a.name}
          </option>
        ))}
      </datalist>
    </div>
  );
}
