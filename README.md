# vuelos-baratos

Buscador de vuelos personal que combina resultados de **Google Flights** y
**Skyscanner** (vía Sky Scrapper / RapidAPI), corriendo 100 % gratis en
Cloudflare Workers + KV.

## Qué hace

- Consulta **Google Flights** vía el protocolo `FlightsFrontendService` (misma
  lógica que usa el navegador — sin API key, sin scraping de HTML). Cache 1h.
- Consulta **Skyscanner** vía [Sky Scrapper](https://rapidapi.com/apiheya/api/sky-scrapper)
  en RapidAPI (plan free = 100 req/mes). Cache 24h para conservar cuota.
- Resuelve dinámicamente los IDs internos de Skyscanner (`skyId`/`entityId`)
  para cada código IATA — nunca hardcodeados, cacheados 7 días en KV.
- Fusiona y ordena los resultados por precio en un único endpoint JSON.
- Si una fuente falla (cuota agotada, error de red, etc.), la otra sigue
  respondiendo. Los errores se reportan en `errors[]`, no rompen el endpoint.
- Escanea un rango de fechas con `/api/search-dates`: devuelve el precio
  mínimo por fecha de salida y detecta automáticamente las ofertas
  (precio ≤ mediana − 1.5 × desviación estándar).

> **¿Por qué no Kiwi Tequila?**  
> La API Tequila de Kiwi.com cerró el registro público a nuevos desarrolladores
> desde 2024 — solo acepta partnerships comerciales. Sky Scrapper cubre el
> mismo caso de uso (incluyendo virtual interlining) con un free tier accesible.

## Estructura

```
src/
  index.ts                  Worker entry point + router
  search/
    types.ts                Tipos TypeScript compartidos
    google-flights.ts       Cliente Google Flights (protocolo batchexecute)
    skyscanner.ts           Cliente Skyscanner (Sky Scrapper / RapidAPI)
    cache.ts                Helpers de caché KV (TTLs, keys, read/write)
    search-dates.ts         Motor de búsqueda por rango de fechas + detector de ofertas
    multi-city.ts           Motor de multidestino (modos fixed y optimize)
scripts/
  test-search-dates.js      Script de prueba manual para /api/search-dates
  test-multi-city.js        Script de prueba manual para /api/multi-city
wrangler.toml
```

## Setup inicial (una sola vez)

### 1. Instalar dependencias

```bash
npm install
```

### 2. Crear el namespace KV

```bash
wrangler kv namespace create SEARCH_CACHE
```

Copiá el `id` que imprime ese comando y pegalo en `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "SEARCH_CACHE"
id = "TU_NAMESPACE_ID_AQUI"
```

### 3. Configurar el secret de Skyscanner

1. Registrarse en [RapidAPI](https://rapidapi.com) (gratis)
2. Suscribirse al plan BASIC de [Sky Scrapper](https://rapidapi.com/apiheya/api/sky-scrapper) (gratis, 100 req/mes)
3. Copiar la `X-RapidAPI-Key`
4. Guardarla como secret de Wrangler:

```bash
wrangler secret put SKYSCANNER_API_KEY
# pega el valor cuando lo pide
```

Sin este secret el Worker sigue funcionando — Google Flights responde igual,
y Skyscanner aparece en `errors[]` con `"SKYSCANNER_API_KEY secret not configured"`.

## Correr localmente

```bash
npm run dev
# Worker disponible en http://localhost:8787
```

Para usar los secrets localmente, crear `.dev.vars` (ignorado por git):

```
SKYSCANNER_API_KEY=tu_rapidapi_key_aqui
```

## Deployar

```bash
npm run deploy
```

## Typecheck

```bash
npm run typecheck
```

## Uso del endpoint

```
GET /api/search?origin=EZE&destination=MAD&date=2026-09-01
GET /api/search?origin=EZE&destination=MAD&date=2026-09-01&returnDate=2026-09-15&tripType=round_trip&adults=2&currency=USD
```

### Parámetros

| Parámetro | Requerido | Descripción |
|---|---|---|
| `origin` | sí | IATA del aeropuerto de origen (e.g. `EZE`) |
| `destination` | sí | IATA del aeropuerto de destino (e.g. `MAD`) |
| `date` | sí | Fecha de ida en `YYYY-MM-DD` |
| `returnDate` | solo para round_trip | Fecha de vuelta en `YYYY-MM-DD` |
| `tripType` | no | `one_way` (default) o `round_trip` |
| `adults` | no | Número de adultos, 1-9 (default: 1) |
| `currency` | no | Código ISO de moneda (default: `USD`) |

### Respuesta

```jsonc
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
      "source": "google_flights"  // o "skyscanner"
    }
  ],
  "errors": []  // vacío si ambas fuentes respondieron bien
}
```

Si la cuota de Skyscanner se agota (HTTP 429):

```jsonc
{
  "results": [ /* resultados de Google Flights */ ],
  "errors": [
    {
      "source": "skyscanner",
      "message": "Skyscanner (Sky Scrapper) monthly quota exhausted (HTTP 429). ..."
    }
  ]
}
```

## Endpoint /api/search-dates

Busca el precio mínimo disponible para cada fecha de salida dentro de un rango,
usando **solo Google Flights** (Skyscanner se reserva para `/api/search`).
Comparte la misma caché KV, por lo que fechas ya consultadas desde `/api/search`
se sirven sin costo adicional.

### Parámetros

| Parámetro | Req. | Descripción |
|---|---|---|
| `origin` | sí | IATA origen (e.g. `MDZ`) |
| `destination` | sí | IATA destino (e.g. `MIA`) |
| `startDate` | sí | Primera fecha de salida `YYYY-MM-DD` |
| `endDate` | sí | Última fecha de salida `YYYY-MM-DD` |
| `stayDuration` | sí | Días de estadía (1–90). returnDate = departureDate + stayDuration |
| `adults` | no | Adultos 1–9 (default: 1) |
| `currency` | no | ISO 4217 (default: `USD`) |

Límites de seguridad:
- Máximo **35 fechas de salida** por llamada (si el rango es mayor, devuelve 400)
- Máximo **3 búsquedas simultáneas** a Google Flights

### Ejemplo

```
GET /api/search-dates?origin=MDZ&destination=MIA&startDate=2026-08-01&endDate=2026-08-21&stayDuration=14
```

### Respuesta

```jsonc
{
  "origin": "MDZ",
  "destination": "MIA",
  "stayDuration": 14,
  "results": [
    { "departureDate": "2026-08-03", "returnDate": "2026-08-17", "price": 820, "currency": "USD", "isDeal": true },
    { "departureDate": "2026-08-01", "returnDate": "2026-08-15", "price": 980, "currency": "USD", "isDeal": false },
    ...
  ],
  "stats": {
    "median": 1050,
    "mean":   1080.50,
    "stdDev": 120.30,
    "min":    820,
    "max":    1380
  },
  "errors": []
}
```

**Detector de ofertas:** `isDeal: true` cuando `price ≤ median − 1.5 × stdDev`.
Requiere al menos 5 resultados válidos; si hay menos, `isDeal` es `false` para
todos y se incluye `isDealNote` explicando por qué.

### Test manual

```bash
node scripts/test-search-dates.js
# contra local:
BASE_URL=http://localhost:8787 node scripts/test-search-dates.js
```

## Caché KV

| Fuente | TTL | Clave de caché |
|---|---|---|
| Google Flights | 1 hora | `gf:v1:{origin}:{dest}:{date}:{returnDate\|OW}` |
| Skyscanner (vuelos) | 24 horas | `ss:v1:{origin}:{dest}:{date}:{returnDate\|OW}` |
| Skyscanner (airport IDs) | 7 días | `ap:v1:{IATA}` |

## Variables y secrets en Cloudflare

| Nombre | Tipo | Cómo configurar |
|---|---|---|
| `SKYSCANNER_API_KEY` | Secret | `wrangler secret put SKYSCANNER_API_KEY` |
| `SEARCH_CACHE` | KV binding | `wrangler kv namespace create SEARCH_CACHE` + actualizar `wrangler.toml` |
| `APP_ENV` | Var (wrangler.toml) | Ya configurado como `production` |

## Endpoint POST /api/multi-city

Busca vuelos para itinerarios de múltiples destinos usando **solo Google Flights**.
Soporta dos modos: orden fijo o búsqueda del orden óptimo.

### Modo "fixed"

El usuario especifica el orden exacto de los destinos con fechas explícitas.
Busca cada tramo como vuelo one-way y suma los precios.

**Body:**
```json
{
  "mode": "fixed",
  "origin": "COR",
  "stops": [
    { "destination": "MIA", "date": "2026-08-01" },
    { "destination": "PUJ", "date": "2026-08-10" }
  ],
  "returnDate": "2026-08-20",
  "adults": 1,
  "currency": "USD"
}
```

Los tramos resultantes son: `COR→MIA` (01/08), `MIA→PUJ` (10/08), `PUJ→COR` (20/08).

**Respuesta:**
```jsonc
{
  "mode": "fixed",
  "origin": "COR",
  "totalPrice": 1420,       // null si algún tramo falló
  "currency": "USD",
  "legs": [
    { "from": "COR", "to": "MIA", "date": "2026-08-01", "price": 520, "currency": "USD", "error": null },
    { "from": "MIA", "to": "PUJ", "date": "2026-08-10", "price": 180, "currency": "USD", "error": null },
    { "from": "PUJ", "to": "COR", "date": "2026-08-20", "price": 720, "currency": "USD", "error": null }
  ]
}
```

### Modo "optimize"

El usuario especifica el conjunto de destinos (sin orden) y el sistema evalúa
**todas las permutaciones posibles** para encontrar el orden más barato.

- Máximo **6 destinos** (6! = 720 permutaciones)
- Máximo **40 tramos únicos** después de memoización (3 destinos → 18 tramos, 4 → 44)
- Las fechas intermedias se calculan como `startDate + i × nightsPerStop`
- El tramo de regreso usa siempre `endDate`
- Memoización en memoria + KV: tramos idénticos entre permutaciones no se buscan dos veces

**Body:**
```json
{
  "mode": "optimize",
  "origin": "COR",
  "destinations": ["MIA", "PUJ", "NYC"],
  "startDate": "2026-08-01",
  "endDate": "2026-08-20",
  "nightsPerStop": 3,
  "adults": 1,
  "currency": "USD"
}
```

**Respuesta:**
```jsonc
{
  "mode": "optimize",
  "origin": "COR",
  "destinations": ["MIA", "PUJ", "NYC"],
  "best": {
    "order": ["NYC", "MIA", "PUJ"],
    "totalPrice": 1180,
    "currency": "USD",
    "legs": [
      { "from": "COR", "to": "NYC", "date": "2026-08-01", "price": 410, "currency": "USD", "error": null },
      { "from": "NYC", "to": "MIA", "date": "2026-08-04", "price": 120, "currency": "USD", "error": null },
      { "from": "MIA", "to": "PUJ", "date": "2026-08-07", "price": 90,  "currency": "USD", "error": null },
      { "from": "PUJ", "to": "COR", "date": "2026-08-20", "price": 560, "currency": "USD", "error": null }
    ]
  },
  "alternatives": [ /* 3 siguientes mejores permutaciones */ ],
  "stats": {
    "permutationsEvaluated": 6,
    "uniqueLegsSearched": 18,
    "uniqueLegsCachedInKv": 0
  }
}
```

### Test manual

```bash
node scripts/test-multi-city.js
# contra local:
BASE_URL=http://localhost:8787 node scripts/test-multi-city.js
```

## Etapas futuras

- Optimizador de rutas multidestino
- Frontend visual
