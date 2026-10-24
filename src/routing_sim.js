/*
 * Public-charging routing simulator module (Stage 3 / Charging)
 * =============================================================
 * Pure, deterministic, dependency-free ES module. No DOM, no network, no
 * third-party imports, no LLM/API/map-tile calls. Runs identically in a browser
 * and in Node (import { haversineKm, nearestChargers, chargeTimeHours } from
 * './routing_sim.js').
 *
 * WHAT THIS IS (and is NOT) - read before trusting a number
 * ---------------------------------------------------------
 * This is an ADDITIVE, CLIENT-SIDE planning aid layered on top of the frozen
 * TCO engine (src/engine.js). It does NOT import, call, or alter the frozen
 * fleet-compute engine and it changes NO economic number. Its only job is to
 * answer, from a
 * build-time-bundled snapshot of Singapore's public chargers, a coarse
 * feasibility question for a fleet manager who is NOT installing a depot
 * charger: "around a representative stop, which public chargers are nearest,
 * what do they cost / how fast are they, and roughly how long would a top-up
 * take for this route?"
 *
 * It is a COARSE SCREEN, explicitly NOT:
 *   - a live-availability feed (the data is a dated snapshot);
 *   - a turn-by-turn / driving-distance router (distances here are great-circle
 *     "as the crow flies", computed from coordinates rounded to ~4 dp);
 *   - a charging scheduler (no queueing, no arrival times, no occupancy).
 * Every output the UI shows carries those caveats. The authoritative economics
 * still come only from the frozen engine.
 *
 * ARCHITECTURE NOTE (why there is no runtime live connection)
 * -----------------------------------------------------------
 * The tool is fully offline and shipped as static files on GitHub Pages, so a
 * TRUE runtime connection to BoCharge / LTA DataMall is impossible without
 * breaking that guarantee (the refresh needs an LTA_ACCOUNT_KEY and BoCharge's
 * Express server cannot run on Pages). Instead the charger data is COMPACTED AT
 * BUILD TIME (tools/build_charging_data.mjs -> tools/fixtures/charging_locations
 * .json) and this module reads that bundled subset deterministically in the
 * browser. The data is refreshed by re-running the build-time pipeline, never
 * by the page at runtime. See the builder header for the refresh/fork path.
 *
 * UNITS (documented on every formula below)
 *   distance   km
 *   power      kW
 *   energy     kWh
 *   time       hours
 *   lat / lon  decimal degrees (WGS84-ish, as published by LTA DataMall)
 */

// Mean Earth radius in km (the standard great-circle constant).
export const EARTH_RADIUS_KM = 6371;

// Documented default assumptions for the charge-time math. All overridable.
export const SIM_DEFAULTS = {
  // Usable-battery reserve kept in hand (fraction). A top-up refills from the
  // reserve floor, never from 0%, so the energy modelled is bounded by
  // (1 - reserveFraction) of the pack.
  RESERVE_FRACTION: 0.10,
  // Charging / conversion loss (fraction). Grid kWh exceed battery kWh by this
  // much, so the time-to-charge is scaled up by 1 / (1 - loss).
  CHARGE_LOSS_FRACTION: 0.10,
  // How many nearest chargers the UI lists by default.
  NEAREST_LIMIT: 6,
  // A sane radius cap (km) so a "nearest" list never silently returns a charger
  // on the far side of the island as if it were local. Null = no cap.
  MAX_RADIUS_KM: 25,
};

function isNum(v) { return typeof v === 'number' && isFinite(v); }
function toRad(deg) { return (deg * Math.PI) / 180; }

/*
 * haversineKm(lat1, lon1, lat2, lon2) -> great-circle distance in KILOMETRES.
 * -------------------------------------------------------------------------
 * The standard haversine formula on a sphere of radius EARTH_RADIUS_KM. This is
 * straight-line ("as the crow flies") distance, NOT driving distance; the UI
 * labels it so. Returns null if any coordinate is non-finite.
 */
export function haversineKm(lat1, lon1, lat2, lon2) {
  if (!isNum(lat1) || !isNum(lon1) || !isNum(lat2) || !isNum(lon2)) return null;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

/*
 * Pick the headline operational figures for ONE compact location record. A
 * fleet wants the fastest plug, so DC (if present) is the headline; otherwise
 * AC. Returns { current, powerKw, maxPowerKw, pricePerKwh } with nulls where a
 * figure is not published (never a fabricated number).
 */
export function headlinePlug(loc) {
  if (!loc || !loc.plug) return { current: null, powerKw: null, maxPowerKw: null, pricePerKwh: null };
  const p = loc.plug;
  const src = p.dc || p.ac || null;
  const current = p.dc ? 'DC' : (p.ac ? 'AC' : null);
  if (!src) return { current: null, powerKw: null, maxPowerKw: null, pricePerKwh: null };
  return {
    current,
    powerKw: isNum(src.powerKw) ? src.powerKw : null,
    maxPowerKw: isNum(src.maxPowerKw) ? src.maxPowerKw : null,
    pricePerKwh: isNum(src.pricePerKwh) ? src.pricePerKwh : null,
  };
}

/*
 * nearestChargers(origin, locations, opts) -> ranked list by great-circle km.
 * --------------------------------------------------------------------------
 * origin    = { lat, lon } representative stop (decimal degrees)
 * locations = array of compact location records (window.HSChargingLocations
 *             .locations shape)
 * opts.limit     = how many to return (default SIM_DEFAULTS.NEAREST_LIMIT)
 * opts.maxRadiusKm = drop chargers farther than this (default MAX_RADIUS_KM;
 *                    pass null to disable)
 * opts.dcOnly    = keep only DC (fast) locations when true
 *
 * Returns an array (ascending distance) of:
 *   { lat, lon, region, operator, current, powerKw, maxPowerKw, pricePerKwh,
 *     distanceKm }
 * Deterministic: ties on distance break by operator then lat then lon, so the
 * order is stable for a fixed dataset + origin.
 */
export function nearestChargers(origin, locations, opts) {
  opts = opts || {};
  const limit = isNum(opts.limit) ? opts.limit : SIM_DEFAULTS.NEAREST_LIMIT;
  const maxRadius = ('maxRadiusKm' in opts) ? opts.maxRadiusKm : SIM_DEFAULTS.MAX_RADIUS_KM;
  const dcOnly = !!opts.dcOnly;
  if (!origin || !isNum(origin.lat) || !isNum(origin.lon)) return [];
  if (!Array.isArray(locations)) return [];

  const scored = [];
  for (const loc of locations) {
    if (!loc || !isNum(loc.lat) || !isNum(loc.lon)) continue;
    if (dcOnly && !loc.hasDc) continue;
    const d = haversineKm(origin.lat, origin.lon, loc.lat, loc.lon);
    if (d == null) continue;
    if (isNum(maxRadius) && d > maxRadius) continue;
    const hp = headlinePlug(loc);
    scored.push({
      lat: loc.lat,
      lon: loc.lon,
      region: loc.region != null ? loc.region : null,
      operator: loc.operator != null ? loc.operator : 'Unknown',
      current: hp.current,
      powerKw: hp.powerKw,
      maxPowerKw: hp.maxPowerKw,
      pricePerKwh: hp.pricePerKwh,
      distanceKm: Math.round(d * 100) / 100,
    });
  }
  scored.sort((a, b) => {
    if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
    if (a.operator !== b.operator) return a.operator < b.operator ? -1 : 1;
    if (a.lat !== b.lat) return a.lat - b.lat;
    return a.lon - b.lon;
  });
  return (isNum(limit) && limit > 0) ? scored.slice(0, limit) : scored;
}

/*
 * chargeTimeHours(params) -> deterministic top-up time estimate in HOURS.
 * -----------------------------------------------------------------------
 * Ties the SRM (or any catalogue) EV model to the reachable charger. Inputs
 * (all SI-ish, documented units):
 *   batteryKwh         usable battery energy (kWh)                  [from prod.D]
 *   kwhPerKm           consumption (kWh/km)                         [from prod.E]
 *   distanceKm         route distance to refill for (km)            [duty]
 *   chargerKw          reachable charger power (kW)                 [nearest DC/AC]
 *   reserveFraction    battery reserve kept in hand (0..1)   [default RESERVE]
 *   chargeLossFraction grid-to-battery loss (0..1)           [default LOSS]
 *
 * METHOD (units shown):
 *   energyNeededKwh = distanceKm * kwhPerKm                    (kWh for the leg)
 *   usableKwh       = batteryKwh * (1 - reserveFraction)       (kWh deliverable
 *                     into the pack without dipping below the reserve floor)
 *   deliverKwh      = min(energyNeededKwh, usableKwh)          (you cannot put
 *                     more than the usable capacity back in one session)
 *   gridKwh         = deliverKwh / (1 - chargeLossFraction)    (grid energy,
 *                     grossed up for charging loss)
 *   hours           = gridKwh / chargerKw                      (time at that
 *                     charger's rated power)
 *
 * Returns { hours, energyNeededKwh, usableKwh, deliverKwh, gridKwh,
 *           cappedByBattery } or null when a required input is missing /
 * non-positive (never a fabricated zero). `cappedByBattery` is true when the
 * leg needs more energy than one usable charge can hold (a flag the UI shows:
 * the leg needs more than a single top-up).
 */
export function chargeTimeHours(params) {
  params = params || {};
  const batteryKwh = params.batteryKwh;
  const kwhPerKm = params.kwhPerKm;
  const distanceKm = params.distanceKm;
  const chargerKw = params.chargerKw;
  const reserveFraction = isNum(params.reserveFraction) ? params.reserveFraction : SIM_DEFAULTS.RESERVE_FRACTION;
  const chargeLossFraction = isNum(params.chargeLossFraction) ? params.chargeLossFraction : SIM_DEFAULTS.CHARGE_LOSS_FRACTION;

  if (!isNum(batteryKwh) || batteryKwh <= 0) return null;
  if (!isNum(kwhPerKm) || kwhPerKm <= 0) return null;
  if (!isNum(distanceKm) || distanceKm <= 0) return null;
  if (!isNum(chargerKw) || chargerKw <= 0) return null;
  if (!(reserveFraction >= 0 && reserveFraction < 1)) return null;
  if (!(chargeLossFraction >= 0 && chargeLossFraction < 1)) return null;

  const energyNeededKwh = distanceKm * kwhPerKm;
  const usableKwh = batteryKwh * (1 - reserveFraction);
  const deliverKwh = Math.min(energyNeededKwh, usableKwh);
  const gridKwh = deliverKwh / (1 - chargeLossFraction);
  const hours = gridKwh / chargerKw;
  return {
    hours,
    energyNeededKwh,
    usableKwh,
    deliverKwh,
    gridKwh,
    cappedByBattery: energyNeededKwh > usableKwh,
  };
}

/*
 * validateLocationsDoc(doc) -> { ok, reasons, count } well-formedness check.
 * --------------------------------------------------------------------------
 * A defensive shape check for the bundled window.HSChargingLocations document.
 * It does NOT re-derive the data (that is check_charging_data.mjs's job); it
 * only confirms the document the page received is usable by the simulator so a
 * malformed bundle degrades honestly instead of throwing. Returns ok=false with
 * reasons when the document is missing / empty / malformed.
 */
export function validateLocationsDoc(doc) {
  const reasons = [];
  if (!doc || typeof doc !== 'object') { return { ok: false, reasons: ['document missing'], count: 0 }; }
  if (!Array.isArray(doc.locations)) { return { ok: false, reasons: ['locations array missing'], count: 0 }; }
  if (doc.locations.length === 0) { reasons.push('locations array empty'); }
  if (typeof doc.attribution !== 'string' || !doc.attribution) { reasons.push('attribution missing'); }
  const b = doc.bounds || null;
  let badCoord = 0, badPlug = 0;
  for (const l of doc.locations) {
    if (!l || !isNum(l.lat) || !isNum(l.lon)) { badCoord++; continue; }
    if (b) {
      if (l.lat < b.latMin || l.lat > b.latMax || l.lon < b.lonMin || l.lon > b.lonMax) { badCoord++; continue; }
    }
    const hp = headlinePlug(l);
    if (!hp.current) { badPlug++; }
  }
  if (badCoord > 0) reasons.push(badCoord + ' location(s) with invalid / out-of-bounds coordinates');
  if (badPlug > 0) reasons.push(badPlug + ' location(s) with no usable plug summary');
  return { ok: reasons.length === 0, reasons, count: doc.locations.length };
}
