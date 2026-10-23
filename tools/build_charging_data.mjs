#!/usr/bin/env node
/*
 * tools/build_charging_data.mjs
 * =============================
 * BUILD-TIME preprocessor (Node, NO third-party deps, NO network).
 *
 * Reads the vendored 6.3MB BoCharge / LTA DataMall snapshot
 *   vendor/sg-electric-chargers/public/data/sample-chargers.json
 * (2,687 Singapore EV charging locations) and emits a COMPACT, aggregates-only
 * fixture
 *   tools/fixtures/charging_context.json
 * (a few KB) that tools/build_index.js inlines into index.html as
 * window.HSChargingContext. The raw snapshot is NEVER shipped to the page: no
 * per-location rows, no addresses, no lat/long - only derived aggregates.
 *
 * Attribution (vendor/sg-electric-chargers/NOTICE.md): source charger data is
 * LTA DataMall's EV Charging Points Batch API, used under the Singapore Open
 * Data Licence and LTA's API Terms of Service, surfaced via the vendored
 * BoCharge project. Provider names are attribution, not endorsement.
 *
 * Output is deterministic (stable key ordering, sorted aggregates) so re-runs
 * are byte-reproducible. Run:
 *   node tools/build_charging_data.mjs
 */
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const snapshotPath = resolve(
  repoRoot,
  'vendor/sg-electric-chargers/public/data/sample-chargers.json',
);
const outPath = resolve(repoRoot, 'tools/fixtures/charging_context.json');

const ATTRIBUTION =
  'Charger data: LTA DataMall EV Charging Points Batch API, used under the ' +
  'Singapore Open Data Licence and LTA API Terms of Service; surfaced via the ' +
  'vendored BoCharge project. Provider names are attribution, not endorsement.';

// Coarse region label from the Singapore postal sector (first 2 digits of the
// 6-digit postal code). Sectors follow the official district grouping; the
// label is intentionally coarse (a planning region, not a precise district).
function regionForSector(sector) {
  const n = Number(sector);
  if (!Number.isFinite(n)) return 'Unknown';
  // Central (city + central districts 01-14, 20-23).
  if ((n >= 1 && n <= 14) || (n >= 20 && n <= 23)) return 'Central';
  // East (districts 15-19, 42-52, 81).
  if ((n >= 15 && n <= 19) || (n >= 42 && n <= 52) || n === 81) return 'East';
  // North-East (Serangoon, Hougang, Punggol: 53-55, 82).
  if ((n >= 53 && n <= 55) || n === 82) return 'North-East';
  // North (Yishun, Sembawang, Woodlands, Mandai: 56-59, 72-73, 75-80).
  if ((n >= 56 && n <= 59) || (n >= 72 && n <= 73) || (n >= 75 && n <= 80)) return 'North';
  // West (Bukit Batok, Jurong, Tuas, Clementi: 24-41, 60-71).
  if ((n >= 24 && n <= 41) || (n >= 60 && n <= 71)) return 'West';
  return 'Other';
}

// Power band for a kW rating. Bands separate slow AC from DC fast / rapid.
function powerBand(kw) {
  if (!Number.isFinite(kw) || kw <= 0) return 'Unknown';
  if (kw <= 7.4) return '<=7.4 kW (slow AC)';
  if (kw <= 22) return '11-22 kW (AC)';
  if (kw <= 60) return '23-60 kW (DC)';
  if (kw < 120) return '61-119 kW (DC)';
  return '>=120 kW (rapid DC)';
}
// Stable display order for the bands.
const POWER_BAND_ORDER = [
  '<=7.4 kW (slow AC)',
  '11-22 kW (AC)',
  '23-60 kW (DC)',
  '61-119 kW (DC)',
  '>=120 kW (rapid DC)',
  'Unknown',
];

function round2(x) {
  return Math.round(x * 100) / 100;
}
function round4(x) {
  return Math.round(x * 10000) / 10000;
}

// Tariff range (min / median / max) over a list of positive per-kWh prices.
function tariffRange(prices) {
  if (!prices.length) return { min: null, median: null, max: null, n: 0 };
  const s = prices.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  const median = s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  return {
    min: round4(s[0]),
    median: round4(median),
    max: round4(s[s.length - 1]),
    n: s.length,
  };
}

function main() {
  const raw = JSON.parse(readFileSync(snapshotPath, 'utf8'));
  const locations = Array.isArray(raw.evLocationsData) ? raw.evLocationsData : [];

  let totalPoints = 0;
  let acPoints = 0;
  let dcPoints = 0;

  const bandCounts = Object.create(null);
  for (const b of POWER_BAND_ORDER) bandCounts[b] = 0;

  const acPrices = [];
  const dcPrices = [];

  // region label -> { points, ac, dc, prices[] }
  const regionAgg = new Map();
  // operator name -> { points, ac, dc, prices[] }
  const operatorAgg = new Map();

  for (const loc of locations) {
    const sector = String(loc.postalCode || '').slice(0, 2);
    const region = regionForSector(sector);
    let rAgg = regionAgg.get(region);
    if (!rAgg) {
      rAgg = { points: 0, ac: 0, dc: 0, prices: [] };
      regionAgg.set(region, rAgg);
    }
    const points = Array.isArray(loc.chargingPoints) ? loc.chargingPoints : [];
    for (const cp of points) {
      const operator = String(cp.operator || 'Unknown').trim() || 'Unknown';
      let oAgg = operatorAgg.get(operator);
      if (!oAgg) {
        oAgg = { points: 0, ac: 0, dc: 0, prices: [] };
        operatorAgg.set(operator, oAgg);
      }
      const plugs = Array.isArray(cp.plugTypes) ? cp.plugTypes : [];
      for (const pt of plugs) {
        totalPoints++;
        rAgg.points++;
        oAgg.points++;
        const current = String(pt.current || '').toUpperCase();
        const isAc = current === 'AC';
        const isDc = current === 'DC';
        if (isAc) { acPoints++; rAgg.ac++; oAgg.ac++; }
        else if (isDc) { dcPoints++; rAgg.dc++; oAgg.dc++; }

        const kw = Number(pt.powerRating);
        bandCounts[powerBand(kw)]++;

        // Only per-kWh tariffs count; ignore blank, zero, per-hour and free.
        if (String(pt.priceType) === 'kWh') {
          const price = Number(pt.price);
          if (Number.isFinite(price) && price > 0) {
            if (isAc) acPrices.push(price);
            else if (isDc) dcPrices.push(price);
            rAgg.prices.push(price);
            oAgg.prices.push(price);
          }
        }
      }
    }
  }

  // Power-band histogram as an ordered array of {band, count} (drop empties).
  const powerBands = POWER_BAND_ORDER
    .filter((b) => bandCounts[b] > 0)
    .map((b) => ({ band: b, count: bandCounts[b] }));

  // Region aggregates, sorted by point count desc then name for stability.
  const byRegion = [...regionAgg.entries()]
    .map(([region, a]) => ({
      region,
      points: a.points,
      ac: a.ac,
      dc: a.dc,
      tariffPerKwh: tariffRange(a.prices),
    }))
    .sort((x, y) => (y.points - x.points) || (x.region < y.region ? -1 : 1));

  // Top operators by point count (keep a manageable, compact set).
  const TOP_OPERATORS = 12;
  const byOperator = [...operatorAgg.entries()]
    .map(([operator, a]) => ({
      operator,
      points: a.points,
      ac: a.ac,
      dc: a.dc,
      tariffPerKwh: tariffRange(a.prices),
    }))
    .sort((x, y) => (y.points - x.points) || (x.operator < y.operator ? -1 : 1))
    .slice(0, TOP_OPERATORS);

  const context = {
    schemaVersion: 1,
    provenance: {
      source: raw.source ?? null,
      sourceLabel: raw.sourceLabel ?? null,
      generatedAt: raw.generatedAt ?? null,
      lastUpdatedTime: raw.lastUpdatedTime ?? null,
      count: raw.count ?? locations.length,
    },
    attribution: ATTRIBUTION,
    totals: {
      locations: locations.length,
      chargingPoints: totalPoints,
      acPoints,
      dcPoints,
    },
    powerBands,
    tariffPerKwh: {
      ac: tariffRange(acPrices),
      dc: tariffRange(dcPrices),
    },
    byRegion,
    byOperator,
  };

  const json = JSON.stringify(context, null, 2) + '\n';
  writeFileSync(outPath, json);

  const bytes = statSync(outPath).size;
  const rawBytes = statSync(snapshotPath).size;
  console.log('charging_context.json written.');
  console.log(`  source snapshot : ${(rawBytes / 1048576).toFixed(2)} MB (${locations.length} locations)`);
  console.log(`  compact fixture : ${(bytes / 1024).toFixed(2)} KB (aggregates only)`);
  console.log(`  charging points : ${totalPoints} (AC ${acPoints} / DC ${dcPoints})`);
  console.log(`  regions         : ${byRegion.length}, top operators: ${byOperator.length}`);
}

main();
