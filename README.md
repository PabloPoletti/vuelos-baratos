# vuelos-baratos

Buscador de vuelos personal que combina resultados de **Google Flights** y **Kiwi.com**,
corriendo 100 % gratis en Cloudflare Workers.

## Qué hace

- Consulta Google Flights vía el protocolo `FlightsFrontendService` (misma lógica que usa el
  navegador — sin API key, sin scraping de HTML).
- Consulta Kiwi (Tequila API) para encontrar combinaciones self-transfer / virtual interlining
  que Google no muestra.
- Fusiona y ordena los resultados por precio en un único endpoint JSON.
- Si una fuente falla, la otra sigue respondiendo.

## Estructura

```
src/
  index.ts                 Worker entry point + router
  search/
    types.ts               Tipos TypeScript compartidos
    google-flights.ts      Cliente Google Flights (protocolo batchexecute)
    kiwi.ts                Cliente Kiwi (Tequila API v2)
wrangler.toml
```

## Correr localmente

```bash
npm install
npm run dev
# Worker disponible en http://localhost:8787
```

Ejemplo de búsqueda:

```
GET http://localhost:8787/api/search?origin=EZE&destination=MAD&date=2026-09-01
GET http://localhost:8787/api/search?origin=EZE&destination=MAD&date=2026-09-01&returnDate=2026-09-15&tripType=round_trip
```

### Variables de entorno en desarrollo

Crear el archivo `.dev.vars` (ignorado por git) con:

```
KIWI_API_KEY=tu_api_key_aqui
```

Si no tenés key de Kiwi, la búsqueda en Google Flights igual funciona.
Los errores de cada fuente se reportan en el campo `errors` de la respuesta.

## Deployar en Cloudflare

```bash
npm run deploy
```

Requiere estar autenticado con Wrangler (`wrangler login` o `CLOUDFLARE_API_TOKEN` en el entorno).

## Variables de entorno y secrets

| Variable | Tipo | Descripción |
|---|---|---|
| `KIWI_API_KEY` | Secret | API key de Kiwi Tequila (ver abajo) |
| `APP_ENV` | Var (wrangler.toml) | Identificador de entorno (`production`) |

### Configurar el secret de Kiwi

```bash
wrangler secret put KIWI_API_KEY
# te pide el valor por stdin
```

### Obtener una API key de Kiwi (gratis)

1. Registrarse en <https://tequila.kiwi.com>
2. Crear una aplicación en el portal
3. Copiar el API key y configurarlo con el comando de arriba

Sin este secret el Worker responde igual, pero los resultados de Kiwi no aparecen
(el campo `errors` indicará `"KIWI_API_KEY secret not configured"`).

## Respuesta del endpoint

```jsonc
// GET /api/search?origin=EZE&destination=MAD&date=2026-09-01
{
  "results": [
    {
      "price": 750,
      "currency": "USD",
      "airlines": ["IB"],
      "totalDurationMinutes": 840,
      "stops": 1,
      "departureTime": "2026-09-01T23:55:00",
      "arrivalTime": "2026-09-02T21:35:00",
      "legs": [ /* ... */ ],
      "bookingUrl": "https://www.google.com/travel/flights?q=...",
      "source": "google"
    },
    {
      /* resultado de Kiwi con deep_link directo al booking */
      "source": "kiwi"
    }
  ],
  "errors": []  // vacío si ambas fuentes respondieron bien
}
```

## Typecheck

```bash
npm run typecheck
```

## Etapas futuras (no implementadas todavía)

- Fechas flexibles / grilla de precios
- Optimizador de rutas multidestino
- Frontend visual
- Detector de anomalías de precio
- Caché en Cloudflare KV
