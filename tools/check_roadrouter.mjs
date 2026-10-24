#!/usr/bin/env node
/*
 * tools/check_roadrouter.mjs
 * ==========================
 * Validation harness for the on-road router module (src/road_router.js) and the
 * bundled offline major-road graph (tools/fixtures/sg_roads.json). Node, NO
 * third-party deps, NO network. It asserts the deterministic behaviour on KNOWN
 * inputs:
 *   (1) decodeGraph on the REAL sg_roads.json returns ok=true with non-empty
 *       nodes + edges and a well-formed adjacency list.
 *   (2) a SMALL HAND-BUILT fixture graph with a KNOWN shortest path returns the
 *       EXACT expected node sequence and distance from routeOnRoad - so this
 *       check would FAIL if the shortest-path logic were wrong (it is the
 *       meaningful correctness assertion, not a static value).
 *   (3) nearestNode snaps a known coordinate to the expected node and returns
 *       null beyond maxSnapKm (honest degrade for off-network points).
 *   (4) on the REAL graph a Tuas -> Changi route returns a many-vertex polyline
 *       whose on-road distanceKm is GREATER than the great-circle haversine
 *       between the endpoints (it follows roads, not a straight line) and is
 *       within a plausible factor (~1.0x - 2.0x) of great-circle.
 *   (5) honest-degrade: an unsnappable far-offshore point returns null.
 *   (6) NO-engine / NO-network source guard (no computeFleet, no fetch /
 *       XMLHttpRequest, no engine import) and REUSE of haversineKm from
 *       routing_sim.js (not re-implemented) - grepped from the module source,
 *       exactly as check_sgmap.mjs does.
 *
 * Run: node tools/check_roadrouter.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  decodeGraph, nearestNode, routeOnRoad, routeOnRoadSequence, MAX_SNAP_KM,
} from '../src/road_router.js';
import { haversineKm } from '../src/routing_sim.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

const checks = [];
function check(name, pass) { checks.push([name, !!pass]); }
function approx(a, b, tol) { return typeof a === 'number' && isFinite(a) && Math.abs(a - b) < tol; }

// ---- (1) decodeGraph on the REAL bundled graph -----------------------------
const roadsDoc = JSON.parse(readFileSync(resolve(repoRoot, 'tools/fixtures/sg_roads.json'), 'utf8'));
const graph = decodeGraph(roadsDoc);
check('decodeGraph on real sg_roads.json returns ok=true', graph && graph.ok === true);
check('decoded graph has non-empty node table', graph.nodeCount > 0 && graph.lat.length === graph.nodeCount);
check('decoded graph has non-empty edges', graph.edgeCount > 0);
check('decoded graph adjacency list matches node count', Array.isArray(graph.adj) && graph.adj.length === graph.nodeCount);
check('decoded graph has at least one connected node', graph.adj.some((a) => a.length > 0));
// Decoded coords land inside the declared SG bounds.
check('decoded node 0 lies within declared bounds',
  graph.bounds &&
  graph.lat[0] >= graph.bounds.latMin - 1e-6 && graph.lat[0] <= graph.bounds.latMax + 1e-6 &&
  graph.lon[0] >= graph.bounds.lonMin - 1e-6 && graph.lon[0] <= graph.bounds.lonMax + 1e-6);
// decodeGraph caches: calling again returns the SAME decoded object.
check('decodeGraph caches the decoded graph (same object on re-call)', decodeGraph(roadsDoc) === graph);
// Malformed doc degrades honestly.
check('decodeGraph on a malformed doc returns ok=false', decodeGraph({ foo: 1 }).ok === false);

// ---- (2) KNOWN shortest path on a hand-built fixture graph -----------------
// A diamond with a deliberate detour. Five nodes, delta-coded like the real
// bundle (q = 100000). Coordinates are chosen so the shortest route from node 0
// to node 4 is the TOP path 0 -> 1 -> 4 (short), NOT the BOTTOM detour
// 0 -> 2 -> 3 -> 4 (long). If the search were wrong (e.g. BFS by hop-count, or
// a broken relaxation) it would pick the 3-hop bottom path or the wrong
// distance, so this assertion is a real correctness test.
//
// Absolute coords (deg):
//   n0 (1.30000, 103.70000)  start
//   n1 (1.30000, 103.71000)  top mid   (due east of n0, ~1.11 km)
//   n2 (1.28000, 103.70500)  bottom A  (south, detour)
//   n3 (1.28000, 103.71500)  bottom B
//   n4 (1.30000, 103.72000)  end       (due east of n1, ~1.11 km)
// Edges: top 0-1, 1-4 ; bottom 0-2, 2-3, 3-4.
const Q = 100000;
const absLon = [103.70000, 103.71000, 103.70500, 103.71500, 103.72000];
const absLat = [1.30000, 1.30000, 1.28000, 1.28000, 1.30000];
const dlon = [], dlat = [];
let pLon = 0, pLat = 0;
for (let i = 0; i < absLon.length; i++) {
  const iLon = Math.round(absLon[i] * Q);
  const iLat = Math.round(absLat[i] * Q);
  dlon.push(iLon - pLon); dlat.push(iLat - pLat);
  pLon = iLon; pLat = iLat;
}
const fixtureDoc = {
  schemaVersion: 1,
  q: Q,
  attribution: 'hand-built test fixture',
  license: 'test',
  bounds: { latMin: 1.27, latMax: 1.31, lonMin: 103.69, lonMax: 103.73 },
  dlon, dlat,
  edges: [[0, 1], [1, 4], [0, 2], [2, 3], [3, 4]],
};
const fx = decodeGraph(fixtureDoc);
check('fixture decodeGraph ok', fx.ok === true && fx.nodeCount === 5);
// Expected distances (haversine over the decoded coords).
const topKm = haversineKm(absLat[0], absLon[0], absLat[1], absLon[1]) +
              haversineKm(absLat[1], absLon[1], absLat[4], absLon[4]);
const bottomKm = haversineKm(absLat[0], absLon[0], absLat[2], absLon[2]) +
                 haversineKm(absLat[2], absLon[2], absLat[3], absLon[3]) +
                 haversineKm(absLat[3], absLon[3], absLat[4], absLon[4]);
check('fixture: the bottom detour really is longer than the top path', bottomKm > topKm);
// Route from the exact node-0 coord to the exact node-4 coord (snap radius tiny
// so only the intended nodes are candidates).
const fr = routeOnRoad(fx, { lat: absLat[0], lon: absLon[0] }, { lat: absLat[4], lon: absLon[4] }, { maxSnapKm: 0.01 });
check('fixture routeOnRoad returns a result', !!fr);
// polyline = [truePt0, n0, n1, n4, truePt4]; the snap stubs are zero-length
// here because the true point IS the node, so the interior node sequence is
// exactly [0, 1, 4].
const interior = fr ? fr.polyline.slice(1, fr.polyline.length - 1).map((p) =>
  // recover node index by matching decoded coords
  [0, 1, 2, 3, 4].find((i) => approx(p.lat, fx.lat[i], 1e-7) && approx(p.lon, fx.lon[i], 1e-7))) : [];
check('fixture: shortest path is the EXACT expected node sequence 0 -> 1 -> 4',
  JSON.stringify(interior) === JSON.stringify([0, 1, 4]));
check('fixture: on-road distanceKm equals the top-path length exactly',
  fr && approx(fr.distanceKm, topKm, 1e-9));
check('fixture: on-road distance is the SHORT path, not the long detour',
  fr && fr.distanceKm < bottomKm - 1e-6);
// routeOnRoadSequence chains legs and sums distance.
const seq = routeOnRoadSequence(fx,
  [{ lat: absLat[0], lon: absLon[0] }, { lat: absLat[4], lon: absLon[4] }], { maxSnapKm: 0.01 });
check('fixture routeOnRoadSequence sums leg distance', seq && approx(seq.distanceKm, topKm, 1e-9));
check('fixture routeOnRoadSequence reports no failed legs', seq && seq.anyFailed === false && seq.legs.length === 1);

// ---- (3) nearestNode snapping ----------------------------------------------
// A coord a hair off node 2 snaps to node 2; a coord far from every node
// returns null beyond maxSnapKm.
const near2 = nearestNode(fx, absLat[2] + 0.0001, absLon[2] + 0.0001, { maxSnapKm: 0.5 });
check('nearestNode snaps a near coord to the expected node (2)', near2 && near2.nodeIndex === 2);
check('nearestNode reports a small snapKm for a near coord', near2 && near2.snapKm < 0.5);
const farSnap = nearestNode(fx, 1.00000, 104.50000, { maxSnapKm: 2 });
check('nearestNode returns null when nearest node is beyond maxSnapKm', farSnap === null);
check('MAX_SNAP_KM default is a sane ~2 km', MAX_SNAP_KM > 0 && MAX_SNAP_KM <= 5);

// ---- (4) REAL route follows roads (on-road > great-circle) -----------------
const TUAS = { lat: 1.3210, lon: 103.6360 };
const CHANGI = { lat: 1.3570, lon: 103.9880 };
const real = routeOnRoad(graph, TUAS, CHANGI);
const crow = haversineKm(TUAS.lat, TUAS.lon, CHANGI.lat, CHANGI.lon);
check('real Tuas->Changi route returns a result', !!real);
check('real route polyline has MANY vertices (follows roads)', real && real.polyline.length > 20);
check('real on-road distance exceeds great-circle (not a straight line)', real && real.distanceKm > crow);
check('real on-road distance is within a plausible factor (<= 2.0x great-circle)',
  real && real.distanceKm <= crow * 2.0);
check('real on-road distance is at least as long as great-circle (>= 1.0x)',
  real && real.distanceKm >= crow);
check('real route snaps both endpoints within the default radius',
  real && real.snapFromKm <= MAX_SNAP_KM && real.snapToKm <= MAX_SNAP_KM);
// First/last polyline vertices are the true (un-snapped) endpoints.
check('real route polyline starts at the true Tuas point',
  real && approx(real.polyline[0].lat, TUAS.lat, 1e-9) && approx(real.polyline[0].lon, TUAS.lon, 1e-9));
check('real route polyline ends at the true Changi point',
  real && approx(real.polyline[real.polyline.length - 1].lat, CHANGI.lat, 1e-9) &&
  approx(real.polyline[real.polyline.length - 1].lon, CHANGI.lon, 1e-9));

// ---- (5) honest-degrade: unsnappable far-offshore point returns null -------
const OFFSHORE = { lat: 2.50000, lon: 105.50000 }; // far out in the South China Sea
check('unsnappable far-offshore endpoint -> routeOnRoad null', routeOnRoad(graph, TUAS, OFFSHORE) === null);
check('unsnappable far-offshore point -> nearestNode null', nearestNode(graph, OFFSHORE.lat, OFFSHORE.lon) === null);
// A sequence with an unroutable leg flags it null rather than fabricating a line.
const degradeSeq = routeOnRoadSequence(graph, [TUAS, OFFSHORE, CHANGI]);
check('sequence with an unroutable leg sets anyFailed=true', degradeSeq && degradeSeq.anyFailed === true);
check('sequence flags the failed leg as null (no fabricated straight line)',
  degradeSeq && degradeSeq.legs.some((l) => l === null));

// ---- (6) NO engine / network coupling guard + haversine reuse --------------
const src = readFileSync(resolve(repoRoot, 'src/road_router.js'), 'utf8');
check('road_router.js does NOT reference computeFleet', src.indexOf('computeFleet') === -1);
check('road_router.js does NOT import the engine module',
  !/\bimport\b[\s\S]*?from\s+['"][^'"]*engine(\.js)?['"]/.test(src));
check('road_router.js makes NO network call (no fetch/XMLHttpRequest)',
  src.indexOf('fetch(') === -1 && src.indexOf('XMLHttpRequest') === -1);
check('road_router.js reuses haversineKm from routing_sim.js (not duplicated)',
  /import\s+\{\s*haversineKm\s*\}\s+from\s+'\.\/routing_sim\.js'/.test(src) &&
  src.indexOf('function haversineKm') === -1);

let ok = true;
for (const [name, pass] of checks) {
  console.log((pass ? 'PASS  ' : 'FAIL  ') + name);
  if (!pass) ok = false;
}
// Surface the headline real-route numbers so the finding is visible in the log.
if (real) {
  console.log('\nreal Tuas->Changi: onRoadKm=' + real.distanceKm.toFixed(2) +
    '  greatCircleKm=' + crow.toFixed(2) +
    '  factor=' + (real.distanceKm / crow).toFixed(2) +
    '  polylineVertices=' + real.polyline.length);
}
console.log('\n' + (ok ? 'ALL ROADROUTER CHECKS PASSED' : 'ROADROUTER CHECKS FAILED'));
process.exit(ok ? 0 : 1);
