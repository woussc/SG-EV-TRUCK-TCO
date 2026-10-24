/*
 * On-road router module (Stage 3 / Charging map, FEAT-003)
 * ========================================================
 * Pure, deterministic, dependency-free ES module. No DOM, no network, no
 * third-party imports, no map tiles / map API / geocoder / LLM call, and NO
 * reference to the frozen TCO engine (src/engine.js) - it imports and changes
 * NO economic number. Runs identically in a browser and in Node:
 *   import { decodeGraph, nearestNode, routeOnRoad, routeOnRoadSequence }
 *     from './road_router.js';
 *
 * WHAT THIS IS (and is NOT) - read before trusting a number
 * ---------------------------------------------------------
 * This turns the bundled, offline Singapore MAJOR-road graph (window.HSRoads /
 * tools/fixtures/sg_roads.json, derived AT BUILD TIME from OpenStreetMap, ODbL
 * 1.0) into an APPROXIMATE on-road router: it snaps a depot / stop lat/lon to
 * the nearest graph node and runs a shortest-path search over the road arcs to
 * return a real polyline that FOLLOWS ROADS and an on-road distance in km.
 *
 * It is APPROXIMATE and explicitly NOT full turn-by-turn, Google-Maps routing:
 *   - the graph is a SIMPLIFIED BUNDLED subset of MAJOR roads only (expressways
 *     and arterials - no minor / residential / service streets), so a route
 *     snaps onto the nearest major corridor, not your exact driveway;
 *   - there is NO live traffic, NO turn restrictions, and NO one-way
 *     enforcement beyond whatever the graph topology happens to encode (arcs
 *     are treated as undirected);
 *   - node coordinates are quantised (rounded to 1e-5 deg) and the geometry is
 *     Douglas-Peucker simplified, so distances are approximate.
 * On-road distance is LONGER and MORE REALISTIC than the great-circle
 * "as-the-crow-flies" figure the rest of the map shows, but it is still an
 * approximation, not a surveyed driving distance. Honest degrade: every
 * function returns null (n.a.) when the graph is missing, a point cannot be
 * snapped within a sane radius, or no path exists - it NEVER fabricates a
 * straight line and presents it as a road route. The authoritative economics
 * remain in the frozen engine; this module is a coarse planning aid.
 *
 * It REUSES src/routing_sim.js for the haversine primitive (imported, never
 * duplicated) so there is one great-circle definition in the codebase - exactly
 * as src/sg_map.js does.
 *
 * UNITS
 *   distance   km            lat / lon   decimal degrees (WGS84-ish)
 */
import { haversineKm } from './routing_sim.js';

function isNum(v) { return typeof v === 'number' && isFinite(v); }

// Default snap radius (km). A point farther than this from any graph node is
// treated as off-network and nearestNode returns null (honest degrade).
export const MAX_SNAP_KM = 2;

// A WeakMap cache keyed by the raw doc object so repeated decodeGraph(doc)
// calls on the same bundled document reuse the decoded adjacency list instead
// of rebuilding it (the real graph has ~24k nodes / ~25k edges).
const _cache = typeof WeakMap === 'function' ? new WeakMap() : null;

/*
 * validateRoadsDoc(doc) -> { ok, reasons } well-formedness check.
 * --------------------------------------------------------------
 * A defensive shape check for the bundled window.HSRoads document, mirroring
 * validateLocationsDoc in routing_sim.js. It does NOT re-derive the data (that
 * is tools/build_roads.mjs / the harness's job); it only confirms the document
 * is usable so a malformed bundle degrades honestly instead of throwing.
 */
export function validateRoadsDoc(doc) {
  const reasons = [];
  if (!doc || typeof doc !== 'object') return { ok: false, reasons: ['document missing'] };
  if (!Array.isArray(doc.dlon) || !Array.isArray(doc.dlat)) reasons.push('delta-coded node arrays missing');
  if (Array.isArray(doc.dlon) && Array.isArray(doc.dlat) && doc.dlon.length !== doc.dlat.length) reasons.push('dlon/dlat length mismatch');
  if (!Array.isArray(doc.dlon) || doc.dlon.length === 0) reasons.push('node table empty');
  if (!Array.isArray(doc.edges) || doc.edges.length === 0) reasons.push('edges array empty / missing');
  if (!isNum(doc.q) || doc.q <= 0) reasons.push('quantisation factor q missing / invalid');
  if (typeof doc.attribution !== 'string' || !doc.attribution) reasons.push('attribution missing');
  return { ok: reasons.length === 0, reasons };
}

/*
 * decodeGraph(doc) -> decoded, cached graph object or { ok:false, reasons }.
 * -------------------------------------------------------------------------
 * Undoes the delta-coding of the node table into absolute lon/lat arrays
 * (cumulative sum of dlon/dlat, divided by q), then builds an undirected
 * adjacency list node -> [{ to, km }] from the edge polylines. Each edge is an
 * ordered array of node indices; every consecutive pair is one road arc whose
 * length is the haversine over the decoded coords (lengths are deliberately NOT
 * stored in the bundle - the node table is the single geometry source of
 * truth). The decoded graph is cached on the doc so repeated calls are cheap.
 *
 * Returns, on success:
 *   { ok:true, lat:Float64Array, lon:Float64Array, adj:[[{to,km}...], ...],
 *     nodeCount, edgeCount, bounds }
 * and on a malformed doc: { ok:false, reasons:[...] }.
 */
export function decodeGraph(doc) {
  if (_cache && _cache.has(doc)) return _cache.get(doc);
  const v = validateRoadsDoc(doc);
  if (!v.ok) {
    const bad = { ok: false, reasons: v.reasons };
    if (_cache) _cache.set(doc, bad);
    return bad;
  }
  const q = doc.q;
  const n = doc.dlon.length;
  const lon = new Float64Array(n);
  const lat = new Float64Array(n);
  let accLon = 0, accLat = 0;
  for (let i = 0; i < n; i++) {
    accLon += doc.dlon[i];
    accLat += doc.dlat[i];
    lon[i] = accLon / q;
    lat[i] = accLat / q;
  }
  // Adjacency list: node -> [{ to, km }]. Undirected: store both directions.
  const adj = new Array(n);
  for (let i = 0; i < n; i++) adj[i] = [];
  let edgeCount = 0;
  for (const edge of doc.edges) {
    if (!Array.isArray(edge) || edge.length < 2) continue;
    for (let k = 1; k < edge.length; k++) {
      const a = edge[k - 1];
      const b = edge[k];
      if (!Number.isInteger(a) || !Number.isInteger(b)) continue;
      if (a < 0 || a >= n || b < 0 || b >= n || a === b) continue;
      const km = haversineKm(lat[a], lon[a], lat[b], lon[b]);
      if (km == null) continue;
      adj[a].push({ to: b, km });
      adj[b].push({ to: a, km });
      edgeCount++;
    }
  }
  const decoded = {
    ok: true,
    lat,
    lon,
    adj,
    nodeCount: n,
    edgeCount,
    bounds: doc.bounds || null,
  };
  if (_cache) _cache.set(doc, decoded);
  return decoded;
}

/*
 * nearestNode(graph, lat, lon, opts) -> { nodeIndex, snapKm, lat, lon } | null.
 * ----------------------------------------------------------------------------
 * Linear nearest-node search over the decoded node table (adequate for a ~24k
 * node island graph). Returns the nearest graph node and the snap distance, or
 * null when the nearest node is beyond opts.maxSnapKm (default MAX_SNAP_KM) so
 * an off-network point (e.g. far offshore) degrades honestly instead of
 * snapping to the far side of the island.
 */
export function nearestNode(graph, lat, lon, opts) {
  opts = opts || {};
  const maxSnapKm = isNum(opts.maxSnapKm) ? opts.maxSnapKm : MAX_SNAP_KM;
  if (!graph || !graph.ok || !isNum(lat) || !isNum(lon)) return null;
  const glat = graph.lat, glon = graph.lon, n = graph.nodeCount;
  let best = -1, bestKm = Infinity;
  for (let i = 0; i < n; i++) {
    const d = haversineKm(lat, lon, glat[i], glon[i]);
    if (d != null && d < bestKm) { bestKm = d; best = i; }
  }
  if (best < 0) return null;
  if (isNum(maxSnapKm) && bestKm > maxSnapKm) return null;
  return { nodeIndex: best, snapKm: bestKm, lat: glat[best], lon: glon[best] };
}

/*
 * A* shortest path over the adjacency list from node s to node t. Uses a
 * haversine lower-bound heuristic (admissible: great-circle can never exceed
 * the on-road distance) so the search is directed yet optimal. A simple binary
 * heap keeps it near-linear for the island graph. Returns { distanceKm, path }
 * (path is the node-index sequence) or null when t is unreachable from s.
 */
function aStar(graph, s, t) {
  if (s === t) return { distanceKm: 0, path: [s] };
  const adj = graph.adj, glat = graph.lat, glon = graph.lon, n = graph.nodeCount;
  const gScore = new Float64Array(n).fill(Infinity);
  const came = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  gScore[s] = 0;
  const h = (i) => haversineKm(glat[i], glon[i], glat[t], glon[t]) || 0;
  // Binary min-heap of { node, f }.
  const heap = [];
  function push(node, f) {
    heap.push({ node, f });
    let c = heap.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (heap[p].f <= heap[c].f) break;
      const tmp = heap[p]; heap[p] = heap[c]; heap[c] = tmp; c = p;
    }
  }
  function pop() {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length > 0) {
      heap[0] = last;
      let c = 0;
      for (;;) {
        const l = 2 * c + 1, r = 2 * c + 2;
        let m = c;
        if (l < heap.length && heap[l].f < heap[m].f) m = l;
        if (r < heap.length && heap[r].f < heap[m].f) m = r;
        if (m === c) break;
        const tmp = heap[m]; heap[m] = heap[c]; heap[c] = tmp; c = m;
      }
    }
    return top;
  }
  push(s, h(s));
  while (heap.length > 0) {
    const cur = pop().node;
    if (cur === t) {
      // Reconstruct path.
      const path = [];
      let x = t;
      while (x !== -1) { path.push(x); x = came[x]; }
      path.reverse();
      return { distanceKm: gScore[t], path };
    }
    if (closed[cur]) continue;
    closed[cur] = 1;
    const edges = adj[cur];
    for (let e = 0; e < edges.length; e++) {
      const nb = edges[e].to;
      if (closed[nb]) continue;
      const tentative = gScore[cur] + edges[e].km;
      if (tentative < gScore[nb]) {
        gScore[nb] = tentative;
        came[nb] = cur;
        push(nb, tentative + h(nb));
      }
    }
  }
  return null; // disconnected
}

/*
 * routeOnRoad(graph, from, to, opts) -> on-road route or null.
 * -----------------------------------------------------------
 * Snaps both endpoints to the nearest graph node (honest degrade: null if
 * either cannot snap within opts.maxSnapKm), runs the A* shortest-path search
 * over the road arcs, and returns:
 *   { distanceKm, polyline:[{lat,lon}...], snapFromKm, snapToKm }
 * where distanceKm is the summed on-road arc length and polyline is the real
 * ordered vertex list ALONG THE ROADS, including the short "snap stub" from the
 * true from/to point to its snapped node at each end so the drawn line reaches
 * the actual depot/stop. Returns null if either endpoint is unsnappable or the
 * snapped nodes are disconnected in the graph.
 */
export function routeOnRoad(graph, from, to, opts) {
  opts = opts || {};
  if (!graph || !graph.ok) return null;
  if (!from || !to || !isNum(from.lat) || !isNum(from.lon) || !isNum(to.lat) || !isNum(to.lon)) return null;
  const a = nearestNode(graph, from.lat, from.lon, opts);
  const b = nearestNode(graph, to.lat, to.lon, opts);
  if (!a || !b) return null;
  const res = aStar(graph, a.nodeIndex, b.nodeIndex);
  if (!res) return null;
  const glat = graph.lat, glon = graph.lon;
  // Build the polyline: true from-point, snapped path nodes, true to-point.
  const polyline = [];
  polyline.push({ lat: from.lat, lon: from.lon });
  for (const idx of res.path) polyline.push({ lat: glat[idx], lon: glon[idx] });
  polyline.push({ lat: to.lat, lon: to.lon });
  return {
    distanceKm: res.distanceKm,
    polyline,
    snapFromKm: a.snapKm,
    snapToKm: b.snapKm,
  };
}

/*
 * routeOnRoadSequence(graph, stops, opts) -> whole-route result.
 * -------------------------------------------------------------
 * Chains routeOnRoad over consecutive stops (depot/start first, then each
 * stop). Returns:
 *   { distanceKm, polyline, legs:[...], anyFailed }
 * distanceKm is the sum of the successful legs' on-road distances; polyline is
 * the concatenated vertex list for the whole route (the trailing vertex of one
 * leg equals the leading vertex of the next, so the join is not duplicated);
 * legs is one entry per consecutive pair - either the routeOnRoad result or
 * null where that leg could not be routed (honest degrade: a failed leg is
 * flagged null, NEVER a fabricated straight line); anyFailed is true if any leg
 * is null. Returns null only when fewer than two valid stops are supplied.
 */
export function routeOnRoadSequence(graph, stops, opts) {
  if (!graph || !graph.ok) return null;
  if (!Array.isArray(stops) || stops.length < 2) return null;
  for (const s of stops) if (!s || !isNum(s.lat) || !isNum(s.lon)) return null;
  const legs = [];
  const polyline = [];
  let distanceKm = 0;
  let anyFailed = false;
  for (let i = 1; i < stops.length; i++) {
    const leg = routeOnRoad(graph, stops[i - 1], stops[i], opts);
    legs.push(leg);
    if (!leg) { anyFailed = true; continue; }
    distanceKm += leg.distanceKm;
    // Concatenate, skipping a duplicated join vertex when continuous.
    for (let k = 0; k < leg.polyline.length; k++) {
      const v = leg.polyline[k];
      if (k === 0 && polyline.length > 0) {
        const last = polyline[polyline.length - 1];
        if (last.lat === v.lat && last.lon === v.lon) continue;
      }
      polyline.push({ lat: v.lat, lon: v.lon });
    }
  }
  return { distanceKm, polyline, legs, anyFailed };
}

export default {
  MAX_SNAP_KM,
  validateRoadsDoc,
  decodeGraph,
  nearestNode,
  routeOnRoad,
  routeOnRoadSequence,
};
