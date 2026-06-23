#!/usr/bin/env node
/**
 * Filters mwgg/Airports airports.json to entries with a non-empty IATA code.
 * Output: src/data/airports-iata.json (array, embedded in Worker bundle).
 *
 * Usage:
 *   node scripts/build-airports-data.js
 *   (expects scripts/airports-raw.json — download from mwgg/Airports)
 */

const { readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");

const root = join(__dirname, "..");
const rawPath = join(root, "scripts", "airports-raw.json");
const outPath = join(root, "src", "data", "airports-iata.json");

const raw = JSON.parse(readFileSync(rawPath, "utf8"));
const airports = [];

for (const entry of Object.values(raw)) {
  if (!entry || typeof entry !== "object") continue;
  const iata = String(entry.iata ?? "").trim().toUpperCase();
  if (!iata || iata.length !== 3) continue;

  airports.push({
    iata,
    name: String(entry.name ?? "").trim(),
    city: String(entry.city ?? "").trim(),
    country: String(entry.country ?? "").trim(),
  });
}

airports.sort((a, b) => a.city.localeCompare(b.city) || a.iata.localeCompare(b.iata));

writeFileSync(outPath, JSON.stringify(airports));

console.log(`Wrote ${airports.length} airports → ${outPath}`);
console.log(`Size: ${(readFileSync(outPath).length / 1024).toFixed(0)} KB`);
