import { useState } from "react";
import { SearchSection } from "./components/SearchSection";
import { SearchDatesSection } from "./components/SearchDatesSection";
import { MultiCitySection } from "./components/MultiCitySection";

type Tab = "search" | "dates" | "multi";

const TABS: { id: Tab; label: string }[] = [
  { id: "search", label: "Búsqueda puntual" },
  { id: "dates", label: "Fechas flexibles" },
  { id: "multi", label: "Multidestino" },
];

export function App() {
  const [tab, setTab] = useState<Tab>("search");

  return (
    <div className="app">
      <header className="app-header">
        <h1>✈ Vuelos Baratos</h1>
        <nav className="tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`tab ${tab === t.id ? "active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="content">
        {tab === "search" && <SearchSection />}
        {tab === "dates" && <SearchDatesSection />}
        {tab === "multi" && <MultiCitySection />}
      </main>
    </div>
  );
}
