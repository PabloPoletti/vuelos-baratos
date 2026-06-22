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

> **¿Por qué no Kiwi Tequila?**  
> La API Tequila de Kiwi.com cerró el registro público a nuevos desarrolladores
> desde 2024 — solo acepta partnerships comerciales. Sky Scrapper cubre el
> mismo caso de uso (incluyendo virtual interlining) con un free tier accesible.

## Estructura

```
src/
  index.ts                  Worker entry point + router + /api/search handler
  search/
    types.ts                Tipos TypeScript compartidos
    google-flights.ts       Cliente Google Flights (protocolo batchexecute)
    skyscanner.ts           Cliente Skyscanner (Sky Scrapper / RapidAPI)
    cache.ts                Helpers de caché KV (TTLs, keys, read/write)
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

## Etapas futuras

- Fechas flexibles / grilla de precios
- Optimizador de rutas multidestino
- Frontend visual
- Detector de anomalías de precio
