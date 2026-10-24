#!/usr/bin/env node
/*
 * tools/check_sgmap.mjs
 * =====================
 * Validation harness for the geographic projection + route-feasibility module
 * (src/sg_map.js) and the bundled offline basemap (tools/fixtures/sg_basemap
 * .json). Node, NO third-party deps, NO network. It asserts the deterministic
 * behaviour on KNOWN inputs:
 *   (1) PROJECTION round-trip: project then unproject recovers a known coord
 *       within tolerance; a known city coord projects INSIDE the viewport and
 *       on the CORRECT side (e.g. Tuas left of Changi; north is up).
 *   (2) ROUTE DISTANCE: routeDistanceKm of a fixed 2-3 stop route equals a
 *       hand-computed haversine sum.
 *   (3) REACHABILITY: a charger on the route is classified reachable; one far
 *       away is out-of-range, for a crafted fixture.
 *   (4) DEPOT FEASIBILITY: the verdict flips correctly around the SRM usable-
 *       range boundary.
 *   (5) BASEMAP well-formedness: bounds within the SG bbox, polygons non-empty,
 *       attribution present.
 *   (6) NO engine / network coupling guard on the module source.
 *
 * Run: node tools/check_sgmap.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  SG_BBOX, SG_AREAS, project, unproject, routeDistanceKm,
  distanceToRouteKm, reachableChargers, depotFeasibility,
} from '../src/sg_map.js';
import { haversineKm } from '../src/routing_sim.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

const checks = [];
function check(name, pass) { checks.push([name, !!pass]); }
function approx(a, b, tol) { return typeof a === 'number' && isFinite(a) && Math.abs(a - b) < tol; }

const VP = { width: 640, height: 420, pad: 10, bbox: SG_BBOX };

// ---- (1) projection round-trip + correct side ------------------------------
const cbd = { lat: 1.2840, lon: 103.8510 };
const p = project(cbd.lat, cbd.lon, VP);
check('project returns finite x/y', p && isFinite(p.x) && isFinite(p.y));
check('CBD projects inside the viewport',
  p.x >= VP.pad && p.x <= VP.width - VP.pad && p.y >= VP.pad && p.y <= VP.height - VP.pad);
const back = unproject(p.x, p.y, VP);
check('project->unproject round-trips lat within tolerance', approx(back.lat, cbd.lat, 1e-6));
check('project->unproject round-trips lon within tolerance', approx(back.lon, cbd.lon, 1e-6));

// Correct side: Tuas (west, low lon) must project LEFT of Changi (east, high lon).
const tuas = project(1.3210, 103.6360, VP);
const changi = project(1.3570, 103.9880, VP);
check('west (Tuas) projects left of east (Changi)', tuas.x < changi.x);
// North is up: a higher-latitude point projects to a SMALLER y (nearer the top).
const north = project(1.4490, 103.8200, VP); // Sembawang
const south = project(1.2840, 103.8510, VP); // CBD
check('north projects above south (smaller y)', north.y < south.y);

// unproject clamps a far-outside click back into the bbox (never off-island).
const clamped = unproject(-1000, -1000, VP);
check('unproject clamps lon to bbox', clamped.lon >= SG_BBOX.lonMin && clamped.lon <= SG_BBOX.lonMax);
check('unproject clamps lat to bbox', clamped.lat >= SG_BBOX.latMin && clamped.lat <= SG_BBOX.latMax);

// non-finite input guards
check('project returns null on non-finite input', project(NaN, 103.8, VP) === null);
check('unproject returns null on non-finite input', unproject(NaN, 10, VP) === null);

// ---- (2) route distance == hand-computed haversine sum ---------------------
const stops = [
  { lat: 1.3210, lon: 103.6360 }, // Tuas
  { lat: 1.3330, lon: 103.7420 }, // Jurong
  { lat: 1.2840, lon: 103.8510 }, // CBD
];
const legA = haversineKm(stops[0].lat, stops[0].lon, stops[1].lat, stops[1].lon);
const legB = haversineKm(stops[1].lat, stops[1].lon, stops[2].lat, stops[2].lon);
const handSum = legA + legB;
check('routeDistanceKm equals the hand-computed haversine leg sum',
  approx(routeDistanceKm(stops), handSum, 1e-9));
check('routeDistanceKm of a single stop is 0', routeDistanceKm([stops[0]]) === 0);
check('routeDistanceKm of empty is null', routeDistanceKm([]) === null);
check('routeDistanceKm with a bad coord is null',
  routeDistanceKm([stops[0], { lat: NaN, lon: 103 }]) === null);

// ---- (3) reachable vs out-of-range classification --------------------------
// A charger right on the Jurong stop is reachable; one near Changi (far from
// this west-only route segment) is out of range for a tight corridor.
const route2 = [
  { lat: 1.3210, lon: 103.6360 }, // Tuas
  { lat: 1.3330, lon: 103.7420 }, // Jurong
];
const locs = [
  { lat: 1.3331, lon: 103.7421, operator: 'ON ROUTE', hasDc: true,
    plug: { dc: { powerKw: 120, maxPowerKw: 120, pricePerKwh: 0.73 } } },
  { lat: 1.3570, lon: 103.9880, operator: 'FAR CHANGI', hasDc: false,
    plug: { ac: { powerKw: 22, maxPowerKw: 22, pricePerKwh: 0.70 } } },
];
const rc = reachableChargers(route2, locs, { corridorKm: 2 });
check('on-route charger is classified reachable',
  rc.reachable.length === 1 && rc.reachable[0].operator === 'ON ROUTE');
check('far charger is classified out-of-range',
  rc.outOfRange.length === 1 && rc.outOfRange[0].operator === 'FAR CHANGI');
check('reachable record carries a routeDistanceKm', typeof rc.reachable[0].routeDistanceKm === 'number');
check('reachableCount reflects the full reachable set', rc.reachableCount === 1);
// dcOnly filters AC chargers out of the candidate set.
const rcDc = reachableChargers(route2, locs, { corridorKm: 50, dcOnly: true });
check('dcOnly keeps only DC chargers in the candidate set',
  rcDc.reachable.concat(rcDc.outOfRange).every((c) => c.hasDc === true));
// distanceToRouteKm of a point on a stop is ~0.
check('distanceToRouteKm of a point on a stop is ~0',
  approx(distanceToRouteKm({ lat: 1.3330, lon: 103.7420 }, route2), 0, 0.05));

// ---- (4) depot feasibility flips around the SRM range boundary -------------
// SRM T3EV+: battery 53.58 kWh, 0.1786 kWh/km, 10% reserve.
//   usable range = 53.58 * 0.90 / 0.1786 = 48.222 / 0.1786 = 269.998... km
const spec = { batteryKwh: 53.58, kwhPerKm: 0.1786, reserveFraction: 0.10 };
const rangeKm = (53.58 * 0.90) / 0.1786;
const justUnder = depotFeasibility(spec, rangeKm - 5);
const justOver = depotFeasibility(spec, rangeKm + 5);
check('depot feasible just inside the usable range', justUnder.feasible === true);
check('depot NOT feasible just beyond the usable range', justOver.feasible === false);
check('depot feasibility reports the usable range', approx(justUnder.rangeKm, rangeKm, 1e-6));
check('depot feasibility margin is range - route', approx(justUnder.marginKm, (rangeKm - (rangeKm - 5)), 1e-6));
// Honest degrade: missing spec -> feasible null (n.a.), never a fabricated zero/false.
check('missing battery -> feasible null (n.a.)',
  depotFeasibility({ kwhPerKm: 0.1786 }, 100).feasible === null);
check('missing route -> feasible null (n.a.)',
  depotFeasibility(spec, null).feasible === null);

// ---- SG_AREAS table sanity -------------------------------------------------
check('SG_AREAS has the expected named anchors (>=12)', Array.isArray(SG_AREAS) && SG_AREAS.length >= 12);
check('every SG area has a name + in-bbox coords',
  SG_AREAS.every((a) => a && typeof a.name === 'string' && a.name &&
    a.lat >= SG_BBOX.latMin && a.lat <= SG_BBOX.latMax &&
    a.lon >= SG_BBOX.lonMin && a.lon <= SG_BBOX.lonMax));
check('SG_AREAS includes Tuas / CBD / Changi anchors',
  ['Tuas', 'CBD', 'Changi'].every((k) => SG_AREAS.some((a) => a.name.indexOf(k) !== -1)));

// ---- (5) basemap well-formedness -------------------------------------------
const basemap = JSON.parse(readFileSync(resolve(repoRoot, 'tools/fixtures/sg_basemap.json'), 'utf8'));
check('basemap has a schemaVersion', typeof basemap.schemaVersion === 'number');
check('basemap carries attribution text', typeof basemap.attribution === 'string' && basemap.attribution.length > 0);
check('basemap attribution names ODbL + data.gov.sg + geoBoundaries',
  /ODbL/.test(basemap.attribution) && /data\.gov\.sg/.test(basemap.attribution) && /geoBoundaries/.test(basemap.attribution));
check('basemap carries a license field', basemap.license === 'ODbL 1.0');
check('basemap polygons array is non-empty', Array.isArray(basemap.polygons) && basemap.polygons.length > 0);
check('every basemap ring is a closed, non-trivial ring',
  basemap.polygons.every((r) => Array.isArray(r) && r.length >= 4 &&
    r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]));
// Bounds within the app SG bbox (a small epsilon for rounding).
const EPS = 0.02;
check('basemap bounds within the SG bbox',
  basemap.bounds.lonMin >= SG_BBOX.lonMin - EPS && basemap.bounds.lonMax <= SG_BBOX.lonMax + EPS &&
  basemap.bounds.latMin >= SG_BBOX.latMin - EPS && basemap.bounds.latMax <= SG_BBOX.latMax + EPS);
// Every vertex within bounds (the simplified outline stays inside its own bbox).
check('every basemap vertex is within the declared bounds',
  basemap.polygons.every((r) => r.every(([lon, lat]) =>
    lon >= basemap.bounds.lonMin - EPS && lon <= basemap.bounds.lonMax + EPS &&
    lat >= basemap.bounds.latMin - EPS && lat <= basemap.bounds.latMax + EPS)));
// Lightweight: the inlined JSON stays well under ~60KB.
const bytes = Buffer.byteLength(JSON.stringify(basemap));
check('basemap JSON is lightweight (<60KB inlined)', bytes < 60 * 1024);

// ---- (6) NO engine / network coupling guard on the module source -----------
const sgMapSrc = readFileSync(resolve(repoRoot, 'src/sg_map.js'), 'utf8');
check('sg_map.js does NOT reference computeFleet', sgMapSrc.indexOf('computeFleet') === -1);
check('sg_map.js does NOT import the engine module',
  !/\bimport\b[\s\S]*?from\s+['"][^'"]*engine(\.js)?['"]/.test(sgMapSrc));
check('sg_map.js makes NO network call (no fetch/XMLHttpRequest)',
  sgMapSrc.indexOf('fetch(') === -1 && sgMapSrc.indexOf('XMLHttpRequest') === -1);
check('sg_map.js reuses haversineKm from routing_sim.js (not duplicated)',
  /import\s+\{\s*haversineKm\s*\}\s+from\s+'\.\/routing_sim\.js'/.test(sgMapSrc) &&
  sgMapSrc.indexOf('function haversineKm') === -1);

let ok = true;
for (const [name, pass] of checks) {
  console.log((pass ? 'PASS  ' : 'FAIL  ') + name);
  if (!pass) ok = false;
}
console.log('\n' + (ok ? 'ALL SGMAP CHECKS PASSED' : 'SGMAP CHECKS FAILED'));
process.exit(ok ? 0 : 1);
