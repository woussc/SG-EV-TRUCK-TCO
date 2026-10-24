#!/usr/bin/env node
/*
 * tools/build_charging_data.mjs
 * =============================
 * BUILD-TIME preprocessor (Node, NO third-party deps, NO network).
 *
 * Reads the vendored 6.3MB BoCharge / LTA DataMall snapshot
 *   vendor/sg-electric-chargers/public/data/sample-chargers.json
 * (2,687 Singapore EV charging locations) and emits TWO compact fixtures that
 * tools/build_index.js inlines into index.html:
 *
 *   (1) tools/fixtures/charging_context.json  (a few KB, aggregates only)
 *       -> window.HSChargingContext. No per-location rows, no addresses, no
 *       lat/long: purely derived national aggregates.
 *
 *   (2) tools/fixtures/charging_locations.json (a location-level subset, well
 *       under ~300KB; NOT the raw 6.3MB) -> window.HSChargingLocations. Used by
 *       the client-side routing simulator (src/routing_sim.js). Each kept
 *       location carries ONLY trimmed fields: rounded lat/long (4 dp), a coarse
 *       region label, operator, and a compact plug summary (AC/DC presence,
 *       representative + max power kW, per-kWh price where published). No
 *       address, no full charging-point detail. The subset keeps ALL DC-bearing
 *       (fast) locations plus a deterministic capped sample of AC-only
 *       locations, so the file stays small while covering the fast chargers a
 *       fleet planner cares about.
 *
 * BUILD-TIME REFRESH / FORK PATH (there is NO runtime live connection; the tool
 * is fully offline and served as static files on GitHub Pages). To refresh the
 * bundled charger data you re-run the BUILD-TIME pipeline:
 *   1. Obtain an LTA DataMall LTA_ACCOUNT_KEY and run the vendored refresh
 *        cd vendor/sg-electric-chargers && LTA_ACCOUNT_KEY=... npm run data:refresh
 *      (this is node scripts/refresh-sample-data.mjs; it rewrites
 *      public/data/sample-chargers.json). Forking BoCharge and pointing it at a
 *      fresh snapshot is the alternative when no key is available.
 *   2. Re-run THIS compactor (node tools/build_charging_data.mjs) to regenerate
 *      both fixtures, then node tools/build_index.js to re-inline them.
 * The page itself never calls the network / an API / a map tile.
 *
 * Attribution (vendor/sg-electric-chargers/NOTICE.md): source charger data is
 * LTA DataMall's EV Charging Points Batch API, used under the Singapore Open
 * Data Licence and LTA's API Terms of Service, surfaced via the vendored
 * BoCharge project. Provider names are attribution, not endorsement.
 *
 * Output is deterministic (stable key ordering, sorted aggregates / locations)
 * so re-runs are byte-reproducible. Run:
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
const locationsOutPath = resolve(repoRoot, 'tools/fixtures/charging_locations.json');

// Singapore geographic bounds (lat / long) used to drop any stray out-of-bounds
// coordinate from the location subset. Generous bounds around the mainland +
// islands; the raw snapshot sits well inside these.
const SG_BOUNDS = { latMin: 1.15, latMax: 1.50, lonMin: 103.55, lonMax: 104.10 };

// Hard cap on the number of locations shipped in the compact subset. ALL
// DC-bearing (fast) locations are kept; the remaining budget is filled with a
// deterministic, evenly-strided sample of AC-only locations. Sized so the file
// stays well under the ~300KB target (and nowhere near the raw 6.3MB).
const MAX_LOCATIONS = 1200;

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

  // Location-level compact records for the routing-sim subset (built alongside
  // the aggregates in the SAME pass, so there is only one read of the snapshot).
  const compactLocations = [];

  for (const loc of locations) {
    const sector = String(loc.postalCode || '').slice(0, 2);
    const region = regionForSector(sector);
    let rAgg = regionAgg.get(region);
    if (!rAgg) {
      rAgg = { points: 0, ac: 0, dc: 0, prices: [] };
      regionAgg.set(region, rAgg);
    }
    const points = Array.isArray(loc.chargingPoints) ? loc.chargingPoints : [];

    // --- per-location compact summary for the routing simulator -------------
    // We summarise the whole location (which may host several charging points /
    // plug types) into a tiny record: the dominant operator, AC/DC presence,
    // representative + max power kW for each current type, and the published
    // per-kWh tariff range. No address / no raw plug detail is carried.
    const lat = Number(loc.latitude);
    const lon = Number(loc.longtitude); // NOTE: raw key is misspelled 'longtitude'
    const locOperators = new Map(); // operator -> point count (for dominant op)
    let locAc = false, locDc = false;
    const acPowers = [], dcPowers = [];
    const locAcPrices = [], locDcPrices = [];

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

        // Per-location rollups (for the routing-sim compact record).
        locOperators.set(operator, (locOperators.get(operator) || 0) + 1);
        if (isAc) { locAc = true; if (Number.isFinite(kw) && kw > 0) acPowers.push(kw); }
        else if (isDc) { locDc = true; if (Number.isFinite(kw) && kw > 0) dcPowers.push(kw); }

        // Only per-kWh tariffs count; ignore blank, zero, per-hour and free.
        if (String(pt.priceType) === 'kWh') {
          const price = Number(pt.price);
          if (Number.isFinite(price) && price > 0) {
            if (isAc) acPrices.push(price);
            else if (isDc) dcPrices.push(price);
            rAgg.prices.push(price);
            oAgg.prices.push(price);
            if (isAc) locAcPrices.push(price);
            else if (isDc) locDcPrices.push(price);
          }
        }
      }
    }

    // Build the compact location record (only when coordinates are finite and
    // inside Singapore bounds, and at least one AC/DC point was seen).
    if (Number.isFinite(lat) && Number.isFinite(lon) &&
        lat >= SG_BOUNDS.latMin && lat <= SG_BOUNDS.latMax &&
        lon >= SG_BOUNDS.lonMin && lon <= SG_BOUNDS.lonMax &&
        (locAc || locDc)) {
      // Dominant operator = the operator contributing the most points at this
      // location (ties broken by name for determinism).
      let domOp = 'Unknown', domN = -1;
      [...locOperators.entries()]
        .sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : 1))
        .forEach(([op, n]) => { if (n > domN) { domN = n; domOp = op; } });

      // Representative power = median of the seen powers for that current type;
      // max power = the fastest plug of that type. DC is preferred as the
      // headline power for a fast location (a fleet wants the fastest plug).
      function medianOf(arr) {
        if (!arr.length) return null;
        const s = arr.slice().sort((a, b) => a - b);
        const mid = Math.floor(s.length / 2);
        return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
      }
      const plug = {};
      if (locDc) {
        plug.dc = {
          powerKw: round2(medianOf(dcPowers) || 0) || null,
          maxPowerKw: dcPowers.length ? round2(Math.max(...dcPowers)) : null,
          pricePerKwh: locDcPrices.length ? round4(medianOf(locDcPrices)) : null,
        };
      }
      if (locAc) {
        plug.ac = {
          powerKw: round2(medianOf(acPowers) || 0) || null,
          maxPowerKw: acPowers.length ? round2(Math.max(...acPowers)) : null,
          pricePerKwh: locAcPrices.length ? round4(medianOf(locAcPrices)) : null,
        };
      }
      compactLocations.push({
        lat: round4(lat),
        lon: round4(lon),
        region,
        operator: domOp,
        hasDc: locDc,
        plug,
      });
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

  // ---- Location-level compact subset (routing simulator) --------------------
  // Deterministic selection: keep EVERY DC-bearing (fast) location, then fill
  // the remaining budget with an evenly-strided sample of the AC-only
  // locations. Both groups are stably sorted first (by lat, lon, operator) so
  // re-runs are byte-reproducible.
  function stableLocSort(a, b) {
    return (a.lat - b.lat) || (a.lon - b.lon) ||
      (a.operator < b.operator ? -1 : (a.operator > b.operator ? 1 : 0));
  }
  const dcLocs = compactLocations.filter((l) => l.hasDc).sort(stableLocSort);
  const acLocs = compactLocations.filter((l) => !l.hasDc).sort(stableLocSort);

  const keep = dcLocs.slice(); // always keep all fast locations
  const acBudget = Math.max(0, MAX_LOCATIONS - keep.length);
  if (acBudget > 0 && acLocs.length > 0) {
    if (acLocs.length <= acBudget) {
      for (const l of acLocs) keep.push(l);
    } else {
      // Even stride over the sorted AC list so the sample is geographically
      // spread, not clustered. Deterministic integer stride.
      const stride = acLocs.length / acBudget;
      for (let i = 0; i < acBudget; i++) {
        keep.push(acLocs[Math.floor(i * stride)]);
      }
    }
  }
  // Final deterministic ordering of the shipped subset.
  keep.sort(stableLocSort);

  let keptAcPoints = 0, keptDcPoints = 0;
  for (const l of keep) { if (l.plug.ac) keptAcPoints++; if (l.plug.dc) keptDcPoints++; }

  const locationsDoc = {
    schemaVersion: 1,
    provenance: {
      source: raw.source ?? null,
      sourceLabel: raw.sourceLabel ?? null,
      generatedAt: raw.generatedAt ?? null,
      lastUpdatedTime: raw.lastUpdatedTime ?? null,
      count: raw.count ?? locations.length,
    },
    attribution: ATTRIBUTION,
    bounds: SG_BOUNDS,
    // Honest framing carried with the data itself (the UI also shows it).
    caveat:
      'Coarse planning/feasibility aid, NOT live availability. Dated snapshot ' +
      '(see provenance.lastUpdatedTime). Coordinates rounded to ~4 decimal ' +
      'places; distances computed from them are approximate great-circle, not ' +
      'driving distance, and this is not a turn-by-turn router.',
    totals: {
      sourceLocations: locations.length,
      keptLocations: keep.length,
      keptDcLocations: dcLocs.length,
      keptAcLocations: keep.length - dcLocs.length,
      keptAcSummaries: keptAcPoints,
      keptDcSummaries: keptDcPoints,
    },
    locations: keep,
  };

  const json = JSON.stringify(context, null, 2) + '\n';
  writeFileSync(outPath, json);
  const locJson = JSON.stringify(locationsDoc, null, 0) + '\n';
  writeFileSync(locationsOutPath, locJson);

  const bytes = statSync(outPath).size;
  const locBytes = statSync(locationsOutPath).size;
  const rawBytes = statSync(snapshotPath).size;
  console.log('charging_context.json written.');
  console.log(`  source snapshot : ${(rawBytes / 1048576).toFixed(2)} MB (${locations.length} locations)`);
  console.log(`  compact fixture : ${(bytes / 1024).toFixed(2)} KB (aggregates only)`);
  console.log(`  charging points : ${totalPoints} (AC ${acPoints} / DC ${dcPoints})`);
  console.log(`  regions         : ${byRegion.length}, top operators: ${byOperator.length}`);
  console.log('charging_locations.json written.');
  console.log(`  location subset : ${(locBytes / 1024).toFixed(2)} KB (${keep.length} locations: all ${dcLocs.length} DC + ${keep.length - dcLocs.length} AC sample)`);
}

main();
