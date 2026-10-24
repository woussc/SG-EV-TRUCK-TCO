#!/usr/bin/env node
/*
 * tools/check_routing.mjs
 * =======================
 * Validation harness for the public-charging routing simulator module
 * (src/routing_sim.js). Node, NO third-party deps, NO network. It asserts the
 * deterministic math on KNOWN inputs:
 *   (1) haversineKm between two known Singapore coordinates matches an expected
 *       great-circle distance within tolerance;
 *   (2) nearestChargers returns a list sorted ascending by distance, respects
 *       the radius / dcOnly options, and carries the correct operational fields
 *       (operator, AC/DC, power, per-kWh price, distance);
 *   (3) chargeTimeHours on a known SRM battery / kWh-per-km / charger-kW input
 *       equals a hand-computed expected value, and flags cappedByBattery;
 *   (4) a GUARD that the module has NO engine coupling: it neither imports nor
 *       references the frozen fleet-compute engine.
 *
 * Run: node tools/check_routing.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  haversineKm, nearestChargers, chargeTimeHours, headlinePlug,
  validateLocationsDoc, EARTH_RADIUS_KM, SIM_DEFAULTS,
} from '../src/routing_sim.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

const checks = [];
function check(name, pass) { checks.push([name, !!pass]); }
function approx(a, b, tol) { return typeof a === 'number' && isFinite(a) && Math.abs(a - b) < tol; }

// ---- (1) haversine on known SG coordinates ---------------------------------
// Changi Airport (1.3644, 103.9915) -> Jurong East (1.3331, 103.7420).
// Hand/reference great-circle distance ~= 27.95 km.
const dChangiJurong = haversineKm(1.3644, 103.9915, 1.3331, 103.7420);
check('haversine Changi->Jurong East ~= 27.95 km', approx(dChangiJurong, 27.95, 0.2));
// A degenerate zero-distance case and a non-finite-input guard.
check('haversine of a point to itself is 0', approx(haversineKm(1.3, 103.8, 1.3, 103.8), 0, 1e-9));
check('haversine returns null on non-finite input', haversineKm(NaN, 103.8, 1.3, 103.8) === null);
// Sanity: a known ~1 degree-of-latitude span is ~111 km (EARTH_RADIUS constant).
check('one degree of latitude ~= 111 km', approx(haversineKm(1.0, 103.8, 2.0, 103.8), 111.19, 0.5));
check('EARTH_RADIUS_KM is the standard mean radius', EARTH_RADIUS_KM === 6371);

// ---- (2) nearestChargers: sorted ascending + correct operational fields ----
// A tiny deterministic fixture of chargers at increasing distance from origin.
const origin = { lat: 1.3000, lon: 103.8000 };
const fixture = [
  { lat: 1.3600, lon: 103.8600, region: 'Central', operator: 'OP FAR', hasDc: false,
    plug: { ac: { powerKw: 22, maxPowerKw: 22, pricePerKwh: 0.69 } } },
  { lat: 1.3050, lon: 103.8050, region: 'Central', operator: 'OP NEAR', hasDc: true,
    plug: { dc: { powerKw: 60, maxPowerKw: 120, pricePerKwh: 0.80 }, ac: { powerKw: 7.4, maxPowerKw: 7.4, pricePerKwh: 0.55 } } },
  { lat: 1.3200, lon: 103.8200, region: 'Central', operator: 'OP MID', hasDc: false,
    plug: { ac: { powerKw: 11, maxPowerKw: 11, pricePerKwh: 0.60 } } },
];
const near = nearestChargers(origin, fixture, { limit: 10 });
check('nearestChargers returns all in-radius fixture chargers', near.length === 3);
check('nearestChargers sorted ascending by distance',
  near.every((c, i) => i === 0 || near[i - 1].distanceKm <= c.distanceKm));
check('nearest charger is OP NEAR (closest)', near[0].operator === 'OP NEAR');
// Operational fields on the nearest (DC-preferred headline): current/power/price.
check('nearest carries DC headline current', near[0].current === 'DC');
check('nearest carries DC power kW (headline)', near[0].powerKw === 60);
check('nearest carries DC max power kW', near[0].maxPowerKw === 120);
check('nearest carries DC per-kWh price', near[0].pricePerKwh === 0.80);
check('nearest carries operator + region', near[0].operator === 'OP NEAR' && near[0].region === 'Central');
check('nearest carries a positive distanceKm', typeof near[0].distanceKm === 'number' && near[0].distanceKm > 0);
// The limit option truncates.
check('limit option truncates the list', nearestChargers(origin, fixture, { limit: 1 }).length === 1);
// dcOnly keeps only fast locations.
const dcOnly = nearestChargers(origin, fixture, { dcOnly: true });
check('dcOnly keeps only DC-bearing locations', dcOnly.length === 1 && dcOnly[0].operator === 'OP NEAR');
// maxRadiusKm drops far chargers.
const tight = nearestChargers(origin, fixture, { maxRadiusKm: 1 });
check('maxRadiusKm drops chargers beyond the radius', tight.length === 1 && tight[0].operator === 'OP NEAR');
// headlinePlug on an AC-only location returns AC.
check('headlinePlug returns AC for an AC-only location',
  headlinePlug(fixture[0]).current === 'AC' && headlinePlug(fixture[0]).powerKw === 22);

// ---- (3) chargeTimeHours on a known SRM input ------------------------------
// SRM T3EV / T3EV+ catalogue row: battery 53.58 kWh, 0.1786 kWh/km. Route 120
// km, reachable charger 55 kW DC. Defaults: 10% reserve, 10% charging loss.
//   energyNeeded = 120 * 0.1786            = 21.432 kWh
//   usable       = 53.58 * 0.90            = 48.222 kWh
//   deliver      = min(21.432, 48.222)     = 21.432 kWh
//   grid         = 21.432 / 0.90           = 23.81333... kWh
//   hours        = 23.81333... / 55        = 0.43296969... h  (~25.98 min)
const ct = chargeTimeHours({ batteryKwh: 53.58, kwhPerKm: 0.1786, distanceKm: 120, chargerKw: 55 });
check('chargeTimeHours returns an object', !!ct && typeof ct === 'object');
check('chargeTimeHours energyNeededKwh = 21.432', approx(ct.energyNeededKwh, 21.432, 1e-6));
check('chargeTimeHours usableKwh = 48.222', approx(ct.usableKwh, 48.222, 1e-6));
check('chargeTimeHours gridKwh = 23.8133 (loss grossed up)', approx(ct.gridKwh, 23.813333333, 1e-6));
check('chargeTimeHours hours = 0.432969... (hand-computed)', approx(ct.hours, 0.432969696969697, 1e-9));
check('chargeTimeHours not cappedByBattery for a short leg', ct.cappedByBattery === false);
// Default constants are the documented ones.
check('reserve default is 0.10', SIM_DEFAULTS.RESERVE_FRACTION === 0.10);
check('charge-loss default is 0.10', SIM_DEFAULTS.CHARGE_LOSS_FRACTION === 0.10);
// A long leg that exceeds one usable charge flags cappedByBattery (energy need
// capped at usable capacity, not fabricated beyond the pack).
const ctLong = chargeTimeHours({ batteryKwh: 53.58, kwhPerKm: 0.1786, distanceKm: 1000, chargerKw: 55 });
check('long leg is cappedByBattery', ctLong && ctLong.cappedByBattery === true);
check('long leg delivers only the usable capacity', approx(ctLong.deliverKwh, 48.222, 1e-6));
// Missing / non-positive inputs return null (never a fabricated zero).
check('missing battery -> null', chargeTimeHours({ kwhPerKm: 0.1786, distanceKm: 120, chargerKw: 55 }) === null);
check('zero charger kW -> null', chargeTimeHours({ batteryKwh: 53.58, kwhPerKm: 0.1786, distanceKm: 120, chargerKw: 0 }) === null);

// validateLocationsDoc well-formedness helper.
check('validateLocationsDoc flags a missing document', validateLocationsDoc(null).ok === false);
check('validateLocationsDoc accepts a well-formed subset',
  validateLocationsDoc({ attribution: 'x', bounds: { latMin: 1, latMax: 2, lonMin: 103, lonMax: 104 },
    locations: [{ lat: 1.3, lon: 103.8, plug: { dc: { powerKw: 60 } } }] }).ok === true);

// ---- (4) NO engine coupling guard ------------------------------------------
// The module source must NOT import or call the frozen fleet-compute engine.
const routingSrc = readFileSync(resolve(repoRoot, 'src/routing_sim.js'), 'utf8');
check('routing_sim.js does NOT reference computeFleet', routingSrc.indexOf('computeFleet') === -1);
check('routing_sim.js does NOT import the engine module',
  !/\bimport\b[\s\S]*?from\s+['"][^'"]*engine(\.js)?['"]/.test(routingSrc) &&
  !/\brequire\(\s*['"][^'"]*engine(\.js)?['"]\s*\)/.test(routingSrc));
// It must also not reach for the network / any runtime fetch.
check('routing_sim.js makes NO network call (no fetch/XMLHttpRequest/import())',
  routingSrc.indexOf('fetch(') === -1 && routingSrc.indexOf('XMLHttpRequest') === -1 &&
  !/\bimport\s*\(/.test(routingSrc));

let ok = true;
for (const [name, pass] of checks) {
  console.log((pass ? 'PASS  ' : 'FAIL  ') + name);
  if (!pass) ok = false;
}
console.log('\n' + (ok ? 'ALL ROUTING CHECKS PASSED' : 'ROUTING CHECKS FAILED'));
process.exit(ok ? 0 : 1);
