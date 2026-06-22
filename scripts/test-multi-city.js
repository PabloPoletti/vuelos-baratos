#!/usr/bin/env node
/**
 * Manual test script for POST /api/multi-city — tests both modes.
 *
 * Usage (production):
 *   node scripts/test-multi-city.js
 *
 * Usage (local dev, with `npm run dev` running):
 *   BASE_URL=http://localhost:8787 node scripts/test-multi-city.js
 */

const BASE_URL =
  process.env.BASE_URL ?? "https://vuelos-baratos-api.lic-poletti.workers.dev";

const URL = `${BASE_URL}/api/multi-city`;

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

async function post(body) {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  return { status: res.status, body: json };
}

function printLeg(leg) {
  const price = leg.price != null ? `$${leg.price}` : "N/A";
  const err = leg.error ? ` ⚠ ${leg.error}` : "";
  console.log(`    ${leg.from} → ${leg.to}  [${leg.date}]  ${price}${err}`);
}

function printPermutation(label, perm) {
  if (!perm) {
    console.log(`  ${label}: (none)`);
    return;
  }
  console.log(`  ${label}: [${perm.order.join(" → ")}] → origin`);
  console.log(`    Total: $${perm.totalPrice} ${perm.currency}`);
  for (const leg of perm.legs) printLeg(leg);
}

(async () => {
  // -------------------------------------------------------------------------
  // Test 1 — Mode "fixed": COR → MIA → PUJ → COR
  // -------------------------------------------------------------------------

  console.log("=== TEST 1: mode=fixed  (COR → MIA → PUJ → COR) ===\n");

  try {
    const { status, body } = await post({
      mode: "fixed",
      origin: "COR",
      stops: [
        { destination: "MIA", date: "2026-08-01" },
        { destination: "PUJ", date: "2026-08-10" },
      ],
      returnDate: "2026-08-20",
      currency: "USD",
    });
    console.log(`HTTP ${status}`);
    if (body.error) {
      console.error("ERROR:", body.error);
    } else {
      console.log(`Origin:      ${body.origin}`);
      console.log(
        `Total price: ${body.totalPrice != null ? "$" + body.totalPrice : "N/A (some legs failed)"} ${body.currency}`,
      );
      console.log("Legs:");
      for (const leg of body.legs) printLeg(leg);
    }
  } catch (err) {
    console.error("Fetch error:", err.message);
  }

  console.log();

  // -------------------------------------------------------------------------
  // Test 2 — Mode "optimize": EZE base, destinations = [MIA, MAD, GRU]
  // EZE (Buenos Aires Ezeiza) is a major hub well connected to all three.
  // Note: use specific IATA airport codes (JFK/GRU/MAD), NOT metro area codes
  // like NYC (which Google Flights doesn't resolve — use JFK/LGA/EWR instead).
  // -------------------------------------------------------------------------

  console.log("=== TEST 2: mode=optimize  (EZE base, [MIA, MAD, GRU]) ===\n");

  try {
    const { status, body } = await post({
      mode: "optimize",
      origin: "EZE",
      destinations: ["MIA", "MAD", "GRU"],
      startDate: "2026-08-01",
      endDate: "2026-08-25",
      nightsPerStop: 5,
      currency: "USD",
    });
    console.log(`HTTP ${status}`);
    if (body.error) {
      console.error("ERROR:", body.error);
    } else {
      console.log(`Origin:      ${body.origin}`);
      console.log(`Destinations: [${body.destinations.join(", ")}]`);
      console.log(
        `Stats:  permutations=${body.stats.permutationsEvaluated}` +
          `  uniqueLegs=${body.stats.uniqueLegsSearched}` +
          `  kvCached=${body.stats.uniqueLegsCachedInKv}`,
      );
      console.log();
      if (body.best === null) {
        console.log("  No complete route found (some legs have no available flights).");
        if (body.failedLegs?.length > 0) {
          console.log("  Legs with no flights:");
          for (const leg of body.failedLegs) console.log(`    ✗ ${leg}`);
        }
      } else {
        printPermutation("BEST", body.best);
        console.log();
        for (const [i, alt] of (body.alternatives ?? []).entries()) {
          printPermutation(`ALT ${i + 1}`, alt);
          console.log();
        }
      }
    }
  } catch (err) {
    console.error("Fetch error:", err.message);
  }

  // -------------------------------------------------------------------------
  // Test 3 — Validation: too many destinations
  // -------------------------------------------------------------------------

  console.log("=== TEST 3: validation — 7 destinations (should be 400) ===\n");

  try {
    const { status, body } = await post({
      mode: "optimize",
      origin: "COR",
      destinations: ["MIA", "PUJ", "NYC", "MAD", "GRU", "BOG", "SCL"],
      startDate: "2026-08-01",
      endDate: "2026-09-01",
      nightsPerStop: 4,
    });
    console.log(`HTTP ${status}  — ${body.error}`);
  } catch (err) {
    console.error("Fetch error:", err.message);
  }
})();
