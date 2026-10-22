#!/usr/bin/env node
/*
 * tools/run_engine.js
 * Loads the demo fixture, runs the pure src/engine.js engine, and prints the
 * computed Results + Review. No third-party dependencies.
 *
 *   node SG-EV-TRUCK-TCO/tools/run_engine.js
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { computeFleet, NA } from '../src/engine.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(here, 'fixtures/demo_case.json');
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));

const out = computeFleet(fixture.inputs);

function fmt(v) {
  if (v === NA || v == null) return 'n.a.';
  if (typeof v === 'number') {
    if (Number.isInteger(v)) return String(v);
    return v.toFixed(6);
  }
  return String(v);
}

function plansRow(label, metric) {
  const m = out.results[metric];
  return [
    label.padEnd(30),
    fmt(m.keep_ice).padStart(16),
    fmt(m.all_new_ice).padStart(16),
    fmt(m.plan_a).padStart(16),
    fmt(m.plan_b).padStart(16),
  ].join(' ');
}

console.log('RESULTS (plan code 0=Keep ICE, 1=All-new ICE, 2=Plan A, 3=Plan B)');
console.log(
  ''.padEnd(30), 'Keep ICE'.padStart(16), 'All-new ICE'.padStart(16),
  'Plan A'.padStart(16), 'Plan B'.padStart(16)
);
for (const [label, metric] of [
  ['Truck count', 'truckCount'],
  ['EVs at month 0', 'evMonth0'],
  ['EVs at year 10', 'evYear10'],
  ['Vehicle economic TCO', 'vehicleEconomicTco'],
  ['Net site ownership cost', 'netSiteCost'],
  ['Total economic TCO', 'totalEconomicTco'],
  ['Saving vs Keep ICE', 'savingVsKeep'],
  ['Saving percentage', 'savingPct'],
  ['15% fleet saving headroom', 'headroom15'],
  ['Cash less year-10 assets', 'cashLessTerminal'],
  ['Day-0 funding before loans', 'day0Funding'],
  ['Incremental day-0 funding', 'incrementalDay0'],
  ['Cost per productive km', 'costPerKm'],
  ['Site completeness / access', 'siteStatus'],
  ['Vehicle service / evidence', 'vehicleStatus'],
  ['Saving claim status', 'savingClaimStatus'],
]) {
  console.log(plansRow(label, metric));
}
console.log(
  'Max site TCO for 15% saving'.padEnd(30),
  ''.padStart(16), ''.padStart(16),
  fmt(out.results.maxSiteTco15.plan_a).padStart(16),
  fmt(out.results.maxSiteTco15.plan_b).padStart(16)
);

console.log('\nREVIEW RECONCILIATION');
for (const [key, label] of [
  ['dutyCoverage', 'Fixed ten-year duty coverage'],
  ['includedTrucks', 'Included source trucks'],
  ['keepBridge', 'Keep economic/cash bridge'],
  ['newBridge', 'New ICE economic/cash bridge'],
  ['planABridge', 'Plan A cash bridge incl. deposit'],
  ['planBBridge', 'Plan B cash bridge incl. deposit'],
  ['planAEvCount', 'Plan A EV count'],
  ['planBEvCount', 'Plan B EV count'],
  ['vehiclePathServiceFormulas', 'Vehicle path service formulas'],
]) {
  const r = out.review[key];
  console.log(
    label.padEnd(34),
    ('actual=' + fmt(r.actual)).padEnd(26),
    ('expected=' + fmt(r.expected)).padEnd(20),
    r.status
  );
}
