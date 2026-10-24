/*
 * Geographic projection + route-feasibility module (Stage 3 / Charging map)
 * =========================================================================
 * Pure, deterministic, dependency-free ES module. No DOM, no network, no
 * third-party imports, no map tiles / map API / geocoder / LLM call. Runs
 * identically in a browser and in Node:
 *   import { project, unproject, SG_AREAS, routeDistanceKm,
 *            reachableChargers, depotFeasibility } from './sg_map.js';
 *
 * WHAT THIS IS (and is NOT) - read before trusting a number
 * ---------------------------------------------------------
 * This is the GEOGRAPHIC / INTERACTION layer behind the Charging-tab route
 * simulator. It lets the page draw a real (bundled, offline) Singapore outline,
 * plot the bundled public chargers by lat/lon, let the user drop a depot/start
 * and route stops, and answer two coarse feasibility questions for the ACTIVE
 * EV (the SRM model on the default landing):
 *   (A) DEPOT CHARGING - can the truck complete the planned route on one full
 *       depot charge (usable range vs route distance)?
 *   (B) PUBLIC CHARGING - which bundled public chargers are within reach of the
 *       route (near a stop or a straight-line leg)?
 *
 * HONESTY CAVEATS (true of every number this module produces):
 *   - Distances are GREAT-CIRCLE (straight-line, "as the crow flies") via
 *     haversine, NOT turn-by-turn driving distance. Real roads are longer.
 *   - The charger data is a DATED build-time SNAPSHOT, not live availability.
 *   - The named areas below are COARSE PLANNING ANCHORS (approximate town
 *     centroids), not exact depot addresses.
 *   - The projection is a simple equirectangular (plate carree) fit to the
 *     Singapore bbox - fine for a small-extent display map, not a survey CRS.
 * It is a COARSE PLANNING AID. The authoritative economics remain in the frozen
 * engine (src/engine.js); this module changes NO economic number.
 *
 * It REUSES src/routing_sim.js for the haversine primitive (imported, never
 * duplicated) so there is one great-circle definition in the codebase.
 *
 * UNITS
 *   distance   km            power   kW           energy   kWh
 *   lat / lon  decimal degrees (WGS84-ish)        x / y    pixels (SVG)
 */
import { haversineKm } from './routing_sim.js';

function isNum(v) { return typeof v === 'number' && isFinite(v); }

// Singapore bounding box the projection is fit to. Matches the bundled basemap
// (tools/fixtures/sg_basemap.json) and the charger dataset bounds. A projection
// viewport may override these via opts, but these are the sane defaults.
export const SG_BBOX = { latMin: 1.15, latMax: 1.50, lonMin: 103.55, lonMax: 104.10 };

/*
 * NAMED SG AREAS - a small table of real Singapore towns / planning areas with
 * APPROXIMATE centroid coordinates (decimal degrees). These are COARSE PLANNING
 * ANCHORS for picking a depot/start or a route stop WITHOUT any online geocoder
 * - they are not exact addresses. Ordered west-to-east-ish then by name so the
 * dropdown is stable and deterministic.
 */
export const SG_AREAS = [
  { name: 'Tuas (West industrial)', lat: 1.3210, lon: 103.6360 },
  { name: 'Jurong (West)', lat: 1.3330, lon: 103.7420 },
  { name: 'Clementi', lat: 1.3150, lon: 103.7650 },
  { name: 'Bukit Merah', lat: 1.2820, lon: 103.8230 },
  { name: 'CBD / Raffles Place', lat: 1.2840, lon: 103.8510 },
  { name: 'Toa Payoh', lat: 1.3340, lon: 103.8560 },
  { name: 'Ang Mo Kio', lat: 1.3700, lon: 103.8490 },
  { name: 'Serangoon', lat: 1.3500, lon: 103.8730 },
  { name: 'Woodlands (North)', lat: 1.4360, lon: 103.7860 },
  { name: 'Sembawang', lat: 1.4490, lon: 103.8200 },
  { name: 'Yishun', lat: 1.4290, lon: 103.8350 },
  { name: 'Punggol', lat: 1.4050, lon: 103.9020 },
  { name: 'Pasir Ris', lat: 1.3720, lon: 103.9490 },
  { name: 'Tampines', lat: 1.3540, lon: 103.9450 },
  { name: 'Bedok', lat: 1.3240, lon: 103.9300 },
  { name: 'Changi (Airport / East)', lat: 1.3570, lon: 103.9880 },
];

/*
 * normaliseViewport(viewport) -> { width, height, bbox } with defaults.
 * A viewport describes the SVG drawing surface and the geographic window it
 * maps to. `pad` (pixels) insets the drawing so markers near the edge are not
 * clipped. Missing fields fall back to a 640x420 surface over SG_BBOX.
 */
function normaliseViewport(viewport) {
  viewport = viewport || {};
  const width = isNum(viewport.width) ? viewport.width : 640;
  const height = isNum(viewport.height) ? viewport.height : 420;
  const pad = isNum(viewport.pad) ? viewport.pad : 0;
  const bbox = viewport.bbox || SG_BBOX;
  return { width, height, pad, bbox };
}

/*
 * project(lat, lon, viewport) -> { x, y } in SVG pixel space.
 * ----------------------------------------------------------
 * Equirectangular (plate carree) projection fit to the viewport bbox. Longitude
 * maps left->right, latitude maps bottom->top (north up, so screen y is
 * inverted). Returns null for non-finite input. NOT clamped to the viewport:
 * a coordinate outside the bbox projects to an x/y outside [pad, width-pad] so
 * callers can decide to clip or draw it. Pairs exactly with unproject().
 */
export function project(lat, lon, viewport) {
  if (!isNum(lat) || !isNum(lon)) return null;
  const { width, height, pad, bbox } = normaliseViewport(viewport);
  const lonSpan = (bbox.lonMax - bbox.lonMin) || 1e-6;
  const latSpan = (bbox.latMax - bbox.latMin) || 1e-6;
  const innerW = width - 2 * pad;
  const innerH = height - 2 * pad;
  const x = pad + ((lon - bbox.lonMin) / lonSpan) * innerW;
  const y = pad + ((bbox.latMax - lat) / latSpan) * innerH; // north up
  return { x, y };
}

/*
 * unproject(x, y, viewport) -> { lat, lon } in decimal degrees.
 * ------------------------------------------------------------
 * Inverse of project(). Used for click-to-drop-a-stop: the SVG click's pixel
 * coords become a lat/lon. The result is CLAMPED to the viewport bbox so a
 * click just outside the drawn surface still yields a sensible in-bounds point
 * (never a coordinate off the island). Returns null for non-finite input.
 */
export function unproject(x, y, viewport) {
  if (!isNum(x) || !isNum(y)) return null;
  const { width, height, pad, bbox } = normaliseViewport(viewport);
  const lonSpan = (bbox.lonMax - bbox.lonMin) || 1e-6;
  const latSpan = (bbox.latMax - bbox.latMin) || 1e-6;
  const innerW = (width - 2 * pad) || 1e-6;
  const innerH = (height - 2 * pad) || 1e-6;
  let lon = bbox.lonMin + ((x - pad) / innerW) * lonSpan;
  let lat = bbox.latMax - ((y - pad) / innerH) * latSpan;
  if (lon < bbox.lonMin) lon = bbox.lonMin; if (lon > bbox.lonMax) lon = bbox.lonMax;
  if (lat < bbox.latMin) lat = bbox.latMin; if (lat > bbox.latMax) lat = bbox.latMax;
  return { lat, lon };
}

/*
 * routeDistanceKm(stops) -> total great-circle route length in KILOMETRES.
 * ------------------------------------------------------------------------
 * Sums haversineKm over consecutive stop legs. `stops` is an ordered array of
 * { lat, lon } (the depot/start first, then each route stop). Reuses the
 * haversine primitive from src/routing_sim.js - it is NOT re-implemented here.
 * Returns 0 for a single stop and null when fewer than one valid stop or any
 * leg coordinate is non-finite. Straight-line, NOT driving distance.
 */
export function routeDistanceKm(stops) {
  if (!Array.isArray(stops) || stops.length === 0) return null;
  for (const s of stops) if (!s || !isNum(s.lat) || !isNum(s.lon)) return null;
  if (stops.length === 1) return 0;
  let total = 0;
  for (let i = 1; i < stops.length; i++) {
    const d = haversineKm(stops[i - 1].lat, stops[i - 1].lon, stops[i].lat, stops[i].lon);
    if (d == null) return null;
    total += d;
  }
  return total;
}

/*
 * distanceToRouteKm(point, stops) -> min great-circle distance (km) from a
 * point to the route: the smaller of the distance to the nearest STOP and the
 * nearest point along any straight-line LEG (great-circle corridor). Legs are
 * sampled at a coarse interval (adequate for Singapore's small extent) rather
 * than solved analytically, keeping the maths simple and deterministic.
 */
export function distanceToRouteKm(point, stops) {
  if (!point || !isNum(point.lat) || !isNum(point.lon)) return null;
  if (!Array.isArray(stops) || stops.length === 0) return null;
  let best = Infinity;
  // Distance to each stop.
  for (const s of stops) {
    if (!s || !isNum(s.lat) || !isNum(s.lon)) continue;
    const d = haversineKm(point.lat, point.lon, s.lat, s.lon);
    if (d != null && d < best) best = d;
  }
  // Distance to sampled points along each leg (corridor).
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1], b = stops[i];
    if (!a || !b || !isNum(a.lat) || !isNum(a.lon) || !isNum(b.lat) || !isNum(b.lon)) continue;
    const legKm = haversineKm(a.lat, a.lon, b.lat, b.lon) || 0;
    // ~0.5 km sampling, capped so very long legs stay cheap.
    const steps = Math.min(200, Math.max(1, Math.ceil(legKm / 0.5)));
    for (let k = 1; k < steps; k++) {
      const t = k / steps;
      const lat = a.lat + (b.lat - a.lat) * t;
      const lon = a.lon + (b.lon - a.lon) * t;
      const d = haversineKm(point.lat, point.lon, lat, lon);
      if (d != null && d < best) best = d;
    }
  }
  return isFinite(best) ? best : null;
}

/*
 * reachableChargers(stops, locations, opts) -> { reachable, outOfRange }.
 * ----------------------------------------------------------------------
 * Classifies each bundled charger as REACHABLE (within opts.corridorKm of the
 * route - a stop or a straight-line leg) vs OUT-OF-RANGE. Each returned record
 * carries routeDistanceKm (how far the charger is from the route) and is sorted
 * ascending by it, so the UI can highlight the closest reachable chargers.
 *   stops      ordered [{lat,lon}, ...] (depot/start + route stops)
 *   locations  array of compact charger records (window.HSChargingLocations
 *              .locations shape: { lat, lon, operator, region, hasDc, plug })
 *   opts.corridorKm  reach radius around the route (default 3 km)
 *   opts.dcOnly      keep only DC (fast) chargers when true
 *   opts.limit       cap on the reachable list length (default none)
 * Deterministic: ties on distance break by operator then lat then lon.
 */
export function reachableChargers(stops, locations, opts) {
  opts = opts || {};
  const corridorKm = isNum(opts.corridorKm) ? opts.corridorKm : 3;
  const dcOnly = !!opts.dcOnly;
  const reachable = [], outOfRange = [];
  if (!Array.isArray(stops) || stops.length === 0) return { reachable, outOfRange };
  if (!Array.isArray(locations)) return { reachable, outOfRange };
  for (const loc of locations) {
    if (!loc || !isNum(loc.lat) || !isNum(loc.lon)) continue;
    if (dcOnly && !loc.hasDc) continue;
    const d = distanceToRouteKm({ lat: loc.lat, lon: loc.lon }, stops);
    if (d == null) continue;
    const rec = {
      lat: loc.lat, lon: loc.lon,
      region: loc.region != null ? loc.region : null,
      operator: loc.operator != null ? loc.operator : 'Unknown',
      hasDc: !!loc.hasDc,
      plug: loc.plug || null,
      routeDistanceKm: Math.round(d * 100) / 100,
    };
    if (d <= corridorKm) reachable.push(rec); else outOfRange.push(rec);
  }
  function cmp(a, b) {
    if (a.routeDistanceKm !== b.routeDistanceKm) return a.routeDistanceKm - b.routeDistanceKm;
    if (a.operator !== b.operator) return a.operator < b.operator ? -1 : 1;
    if (a.lat !== b.lat) return a.lat - b.lat;
    return a.lon - b.lon;
  }
  reachable.sort(cmp);
  outOfRange.sort(cmp);
  const limited = (isNum(opts.limit) && opts.limit > 0) ? reachable.slice(0, opts.limit) : reachable;
  return { reachable: limited, outOfRange, reachableCount: reachable.length };
}

/*
 * depotFeasibility(spec, routeKm) -> can the EV complete the route on ONE full
 * depot charge? Pure range-vs-distance check for DEPOT charging (no mid-route
 * top-up). Honest degrade: returns feasible=null (n.a.) when a required input
 * is missing / non-positive, never a fabricated zero.
 *   spec.batteryKwh        usable pack energy (kWh)           [SRM prod.D]
 *   spec.kwhPerKm          consumption (kWh/km)               [SRM prod.E]
 *   spec.reserveFraction   battery reserve kept in hand (0..1, default 0.10)
 *   routeKm                planned route distance (km)
 * Returns { feasible, usableKwh, rangeKm, routeKm, marginKm, reserveFraction }.
 *   rangeKm  = batteryKwh*(1-reserve) / kwhPerKm   (usable one-charge range)
 *   feasible = rangeKm >= routeKm
 */
export function depotFeasibility(spec, routeKm) {
  spec = spec || {};
  const batteryKwh = spec.batteryKwh;
  const kwhPerKm = spec.kwhPerKm;
  const reserveFraction = isNum(spec.reserveFraction) ? spec.reserveFraction : 0.10;
  const na = {
    feasible: null, usableKwh: null, rangeKm: null,
    routeKm: isNum(routeKm) ? routeKm : null, marginKm: null,
    reserveFraction,
  };
  if (!isNum(batteryKwh) || batteryKwh <= 0) return na;
  if (!isNum(kwhPerKm) || kwhPerKm <= 0) return na;
  if (!isNum(routeKm) || routeKm < 0) return na;
  if (!(reserveFraction >= 0 && reserveFraction < 1)) return na;
  const usableKwh = batteryKwh * (1 - reserveFraction);
  const rangeKm = usableKwh / kwhPerKm;
  return {
    feasible: rangeKm >= routeKm,
    usableKwh,
    rangeKm,
    routeKm,
    marginKm: rangeKm - routeKm,
    reserveFraction,
  };
}

export default {
  SG_BBOX, SG_AREAS, project, unproject, routeDistanceKm,
  distanceToRouteKm, reachableChargers, depotFeasibility,
};
