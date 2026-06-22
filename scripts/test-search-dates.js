#!/usr/bin/env node
/**
 * Manual test script for the /api/search-dates endpoint.
 *
 * Usage (production):
 *   node scripts/test-search-dates.js
 *
 * Usage (local dev, with `npm run dev` running in another terminal):
 *   BASE_URL=http://localhost:8787 node scripts/test-search-dates.js
 *
 * Customise the query params at the top of the file.
 */

const BASE_URL =
  process.env.BASE_URL ?? "https://vuelos-baratos-api.lic-poletti.workers.dev";

const params = new URLSearchParams({
  origin: "MDZ",
  destination: "MIA",
  startDate: "2026-08-01",
  endDate: "2026-08-21",
  stayDuration: "14",
  currency: "USD",
});

const url = `${BASE_URL}/api/search-dates?${params}`;

console.log("=== vuelos-baratos / search-dates test ===");
console.log("URL:", url);
console.log("Fetching...\n");

fetch(url)
  .then(async (res) => {
    const body = await res.json();

    if (!res.ok || body.error) {
      console.error("ERROR", res.status, body.error ?? body);
      process.exit(1);
    }

    const { results = [], stats, isDealNote, errors = [] } = body;

    console.log(`Route:        ${body.origin} → ${body.destination}`);
    console.log(`Stay:         ${body.stayDuration} days`);
    console.log(`Results:      ${results.length}`);
    console.log(`Errors:       ${errors.length}`);

    if (stats) {
      console.log("\nStats:");
      console.log(`  min:    $${stats.min}`);
      console.log(`  median: $${stats.median}`);
      console.log(`  mean:   $${stats.mean}`);
      console.log(`  stdDev: $${stats.stdDev}`);
      console.log(`  max:    $${stats.max}`);
    }

    if (isDealNote) {
      console.log("\nNote:", isDealNote);
    }

    const deals = results.filter((r) => r.isDeal);
    console.log(`\nDeals found:  ${deals.length}`);

    // All results sorted by price
    console.log("\nAll results (sorted by price):");
    const sorted = [...results].sort((a, b) => a.price - b.price);
    for (const r of sorted) {
      const deal = r.isDeal ? "  🔥 DEAL" : "";
      console.log(
        `  ${r.departureDate} → ${r.returnDate}  $${r.price} ${r.currency}${deal}`,
      );
    }

    if (errors.length > 0) {
      console.log("\nSearch errors:");
      for (const e of errors) {
        console.log(`  ${e.date}: ${e.message}`);
      }
    }
  })
  .catch((err) => {
    console.error("Fetch failed:", err.message);
    process.exit(1);
  });
