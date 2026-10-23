#!/usr/bin/env node
/*
 * tools/check_charging_data.mjs
 * =============================
 * Validation harness for the compact charging fixture (Node, NO third-party
 * deps, NO network). It:
 *   (a) re-derives the aggregates straight from the raw 6.3MB snapshot and
 *       asserts the checked-in tools/fixtures/charging_context.json matches
 *       (so the derivation is correct, not just well-formed);
 *   (b) asserts the compact asset is well-formed (expected keys, positive
 *       integer counts, AC+DC reconciles to total points, tariff min<=median
 *       <=max, region/operator aggregates internally consistent);
 *   (c) asserts the compact asset is SMALL (< 200KB) so the raw snapshot is
 *       NOT shipped; and
 *   (d) asserts the LTA DataMall / Singapore Open Data Licence + BoCharge
 *       attribution string is present.
 *
 * Run: node tools/check_charging_data.mjs
 */
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const snapshotPath = resolve(
  repoRoot,
  'vendor/sg-electric-chargers/public/data/sample-chargers.json',
);
const fixturePath = resolve(repoRoot, 'tools/fixtures/charging_context.json');

const checks = [];
function check(name, pass) { checks.push([name, !!pass]); }
function isPosInt(x) { return Number.isInteger(x) && x >= 0; }

// ---- Re-derive the aggregates from the raw snapshot (mirror of the builder) --
function regionForSector(sector) {
  const n = Number(sector);
  if (!Number.isFinite(n)) return 'Unknown';
  if ((n >= 1 && n <= 14) || (n >= 20 && n <= 23)) return 'Central';
  if ((n >= 15 && n <= 19) || (n >= 42 && n <= 52) || n === 81) return 'East';
  if ((n >= 53 && n <= 55) || n === 82) return 'North-East';
  if ((n >= 56 && n <= 59) || (n >= 72 && n <= 73) || (n >= 75 && n <= 80)) return 'North';
  if ((n >= 24 && n <= 41) || (n >= 60 && n <= 71)) return 'West';
  return 'Other';
}
function powerBand(kw) {
  if (!Number.isFinite(kw) || kw <= 0) return 'Unknown';
  if (kw <= 7.4) return '<=7.4 kW (slow AC)';
  if (kw <= 22) return '11-22 kW (AC)';
  if (kw <= 60) return '23-60 kW (DC)';
  if (kw < 120) return '61-119 kW (DC)';
  return '>=120 kW (rapid DC)';
}

const raw = JSON.parse(readFileSync(snapshotPath, 'utf8'));
const locations = Array.isArray(raw.evLocationsData) ? raw.evLocationsData : [];

let totalPoints = 0, acPoints = 0, dcPoints = 0;
const acPrices = [], dcPrices = [];
const bandCounts = Object.create(null);
const regionPoints = new Map();
const operatorPoints = new Map();

for (const loc of locations) {
  const region = regionForSector(String(loc.postalCode || '').slice(0, 2));
  regionPoints.set(region, regionPoints.get(region) || { points: 0, ac: 0, dc: 0 });
  const rAgg = regionPoints.get(region);
  for (const cp of (loc.chargingPoints || [])) {
    const operator = String(cp.operator || 'Unknown').trim() || 'Unknown';
    operatorPoints.set(operator, operatorPoints.get(operator) || { points: 0, ac: 0, dc: 0 });
    const oAgg = operatorPoints.get(operator);
    for (const pt of (cp.plugTypes || [])) {
      totalPoints++; rAgg.points++; oAgg.points++;
      const current = String(pt.current || '').toUpperCase();
      if (current === 'AC') { acPoints++; rAgg.ac++; oAgg.ac++; }
      else if (current === 'DC') { dcPoints++; rAgg.dc++; oAgg.dc++; }
      const band = powerBand(Number(pt.powerRating));
      bandCounts[band] = (bandCounts[band] || 0) + 1;
      if (String(pt.priceType) === 'kWh') {
        const price = Number(pt.price);
        if (Number.isFinite(price) && price > 0) {
          if (current === 'AC') acPrices.push(price);
          else if (current === 'DC') dcPrices.push(price);
        }
      }
    }
  }
}

// ---- Load the compact fixture ------------------------------------------------
const fixtureRaw = readFileSync(fixturePath, 'utf8');
const ctx = JSON.parse(fixtureRaw);

// (c) compact-size assertion: proves the 6.3MB snapshot is NOT inlined.
const fixtureBytes = statSync(fixturePath).size;
const rawBytes = statSync(snapshotPath).size;
check('compact fixture is small (< 200KB)', fixtureBytes < 200 * 1024);
check('compact fixture is far smaller than the raw snapshot', fixtureBytes < rawBytes / 20);
check('fixture carries NO raw per-location rows / addresses / lat-long',
  fixtureRaw.indexOf('evLocationsData') === -1 &&
  fixtureRaw.indexOf('latitude') === -1 && fixtureRaw.indexOf('longtitude') === -1 &&
  fixtureRaw.indexOf('address') === -1);

// (b) well-formed: expected keys present.
check('fixture has provenance/attribution/totals/powerBands/tariff/region/operator',
  !!ctx.provenance && typeof ctx.attribution === 'string' && !!ctx.totals &&
  Array.isArray(ctx.powerBands) && !!ctx.tariffPerKwh &&
  Array.isArray(ctx.byRegion) && Array.isArray(ctx.byOperator));

// (d) attribution present (LTA DataMall / Singapore Open Data Licence + BoCharge).
check('attribution credits LTA DataMall / Singapore Open Data Licence + BoCharge',
  /LTA DataMall/.test(ctx.attribution) && /Singapore Open Data Licence/.test(ctx.attribution) &&
  /BoCharge/.test(ctx.attribution));

// Provenance passthrough matches the raw snapshot.
check('provenance passthrough matches raw snapshot',
  ctx.provenance.source === (raw.source ?? null) &&
  ctx.provenance.sourceLabel === (raw.sourceLabel ?? null) &&
  ctx.provenance.generatedAt === (raw.generatedAt ?? null) &&
  ctx.provenance.lastUpdatedTime === (raw.lastUpdatedTime ?? null));

// Counts are positive integers.
const t = ctx.totals;
check('totals are positive integers',
  isPosInt(t.locations) && isPosInt(t.chargingPoints) && isPosInt(t.acPoints) && isPosInt(t.dcPoints) &&
  t.chargingPoints > 0);

// (a) derivation correctness: totals reconcile with the re-derived values.
check('locations total matches re-derived', t.locations === locations.length);
check('charging-point total matches re-derived', t.chargingPoints === totalPoints);
check('AC point count matches re-derived', t.acPoints === acPoints);
check('DC point count matches re-derived', t.dcPoints === dcPoints);

// AC + DC reconciles to total within rounding (all points are AC or DC here,
// but allow a small slack for any un-typed current).
check('AC + DC reconciles to total charging points',
  Math.abs((t.acPoints + t.dcPoints) - t.chargingPoints) <= 0);

// Power-band histogram sums to the total points and matches the re-derived bands.
const bandSum = ctx.powerBands.reduce((s, b) => s + b.count, 0);
check('power-band counts are positive integers',
  ctx.powerBands.every((b) => typeof b.band === 'string' && isPosInt(b.count) && b.count > 0));
check('power-band histogram sums to total charging points', bandSum === t.chargingPoints);
check('power-band counts match re-derived',
  ctx.powerBands.every((b) => b.count === (bandCounts[b.band] || 0)));

// Tariff ranges: min <= median <= max, counts positive.
function tariffOk(tr) {
  if (!tr) return false;
  if (tr.n === 0) return tr.min === null && tr.median === null && tr.max === null;
  return typeof tr.min === 'number' && typeof tr.median === 'number' && typeof tr.max === 'number' &&
    tr.min <= tr.median && tr.median <= tr.max && isPosInt(tr.n) && tr.n > 0;
}
check('AC tariff range min<=median<=max', tariffOk(ctx.tariffPerKwh.ac));
check('DC tariff range min<=median<=max', tariffOk(ctx.tariffPerKwh.dc));
check('AC tariff sample count matches re-derived', ctx.tariffPerKwh.ac.n === acPrices.length);
check('DC tariff sample count matches re-derived', ctx.tariffPerKwh.dc.n === dcPrices.length);
// Min/max agree with the re-derived extremes (rounded to 4dp).
function r4(x) { return Math.round(x * 10000) / 10000; }
if (acPrices.length) {
  const s = acPrices.slice().sort((a, b) => a - b);
  check('AC tariff min/max match re-derived extremes',
    ctx.tariffPerKwh.ac.min === r4(s[0]) && ctx.tariffPerKwh.ac.max === r4(s[s.length - 1]));
}
if (dcPrices.length) {
  const s = dcPrices.slice().sort((a, b) => a - b);
  check('DC tariff min/max match re-derived extremes',
    ctx.tariffPerKwh.dc.min === r4(s[0]) && ctx.tariffPerKwh.dc.max === r4(s[s.length - 1]));
}

// Region aggregates: internally consistent + reconcile to totals.
check('every region aggregate is well-formed',
  ctx.byRegion.every((x) => typeof x.region === 'string' &&
    isPosInt(x.points) && isPosInt(x.ac) && isPosInt(x.dc) &&
    (x.ac + x.dc) === x.points && tariffOk(x.tariffPerKwh)));
const regionPointSum = ctx.byRegion.reduce((s, x) => s + x.points, 0);
check('region point counts sum to total charging points', regionPointSum === t.chargingPoints);
check('region aggregates match re-derived point counts',
  ctx.byRegion.every((x) => {
    const d = regionPoints.get(x.region);
    return d && d.points === x.points && d.ac === x.ac && d.dc === x.dc;
  }));
check('region list is sorted by point count (descending)',
  ctx.byRegion.every((x, i) => i === 0 || ctx.byRegion[i - 1].points >= x.points));

// Operator aggregates: internally consistent (top-N subset, so points sum <= total).
check('every operator aggregate is well-formed',
  ctx.byOperator.every((x) => typeof x.operator === 'string' &&
    isPosInt(x.points) && isPosInt(x.ac) && isPosInt(x.dc) &&
    (x.ac + x.dc) === x.points && tariffOk(x.tariffPerKwh)));
const operatorPointSum = ctx.byOperator.reduce((s, x) => s + x.points, 0);
check('operator point counts sum to <= total (top-N subset)',
  operatorPointSum > 0 && operatorPointSum <= t.chargingPoints);
check('operator aggregates match re-derived point counts',
  ctx.byOperator.every((x) => {
    const d = operatorPoints.get(x.operator);
    return d && d.points === x.points && d.ac === x.ac && d.dc === x.dc;
  }));
check('operator list is sorted by point count (descending)',
  ctx.byOperator.every((x, i) => i === 0 || ctx.byOperator[i - 1].points >= x.points));

let ok = true;
for (const [name, pass] of checks) {
  console.log((pass ? 'PASS  ' : 'FAIL  ') + name);
  if (!pass) ok = false;
}
console.log(`\ncompact fixture: ${(fixtureBytes / 1024).toFixed(2)} KB from a ${(rawBytes / 1048576).toFixed(2)} MB snapshot`);
console.log(ok ? 'ALL CHARGING-DATA CHECKS PASSED' : 'CHARGING-DATA CHECKS FAILED');
process.exit(ok ? 0 : 1);
