#!/usr/bin/env node
/*
 * tools/build_roads.mjs
 * =====================
 * Build-time fetcher + simplifier for the bundled, fully-offline Singapore
 * MAJOR-road graph.
 *
 * WHY THIS EXISTS
 * ---------------
 * The shipped page (index.html) must make ZERO runtime network calls: no map
 * tiles, no routing API, no geocoder, no CDN. So the on-road route graph used
 * by the charging-tab route simulator (FEAT-003's client router) cannot be
 * fetched at runtime - it has to be a small, bundled asset. This script runs
 * ONCE AT BUILD TIME, queries OpenStreetMap via the Overpass API for
 * Singapore's major road network, simplifies + quantises + delta-codes the
 * geometry, and emits a compact tools/fixtures/sg_roads.json that is inlined
 * into the page by tools/build_index.js (window.HSRoads). This is the exact
 * same build-time-data pattern as tools/build_basemap.mjs.
 *
 * OVERPASS QUERY
 * --------------
 * Endpoint: https://overpass-api.de/api/interpreter
 *   highway in {motorway,trunk,primary,motorway_link,trunk_link,primary_link}
 *   over SG bbox (south,west,north,east) = (1.15,103.55,1.50,104.10)
 *   with `out geom;` (ways carry their inline geometry, so no separate node
 *   fetch is needed). Raw response is ~18.6 MB.
 *
 * Overpass REQUIRES a non-empty User-Agent header - a bare request returns
 * HTTP 406. The public endpoint intermittently returns HTTP 502 ("at
 * capacity") / 429 (rate limited); we retry up to 5 times with exponential
 * backoff. An OPTIONAL second query pulls {secondary,tertiary,*_link} and is
 * MERGED in only if the final asset stays under the ~700 KB inline budget;
 * otherwise we ship MAJOR roads only and record that choice in the asset's
 * `source` field.
 *
 * METHOD (deterministic after fetch, Node stdlib only, no deps)
 *   1. For each way geometry, Douglas-Peucker-simplify the polyline in lon/lat
 *      degree space (tolerance ~0.0003 deg ~= 33 m) to drop redundant vertices
 *      while keeping corridor shape.
 *   2. Quantise coords to 1e-5 deg (~1.1 m): integer lon/lat = round(x*100000).
 *   3. Dedup nodes by quantised coord into a node table. A node shared by >=2
 *      ways is a junction, so the graph is connected through shared indices
 *      (routable).
 *   4. Split each way into an edge that stores its ordered node-index polyline.
 *      Arc lengths are NOT stored (they would add ~145 KB); the client router
 *      derives each edge's length in km by haversine over the node coords -
 *      the node table is the single source of truth for geometry.
 *   5. Delta-code the node integer lon/lat arrays (store q=100000, dlon[],
 *      dlat[]) and store edges as arrays of node indices, to minimise bytes.
 *   6. Emit tools/fixtures/sg_roads.json (JSON.stringify, no pretty-print)
 *      with schemaVersion, attribution (OpenStreetMap contributors + ODbL),
 *      license, bounds, source, generatedAt and counts.
 *
 * HONESTY: OSM road data is licensed ODbL - the attribution names
 * 'OpenStreetMap contributors' and 'ODbL' and is carried into the asset and
 * shown in the map UI. This is a simplified MAJOR-road graph for offline
 * corridor routing, not a turn-by-turn navigation database.
 *
 * Re-run (needs network for the one build-time fetch):
 *   node tools/build_roads.mjs
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const outPath = resolve(repoRoot, 'tools/fixtures/sg_roads.json');

// ---- Config -------------------------------------------------------------
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
// Overpass refuses a bare request (HTTP 406); send a descriptive User-Agent.
const USER_AGENT = 'SG-EV-TRUCK-TCO build_roads.mjs (offline road-graph builder; +https://github.com/woussc/SG-EV-TRUCK-TCO)';
// SG bbox (south, west, north, east).
const BBOX = { south: 1.15, west: 103.55, north: 1.50, east: 104.10 };
// Major-road highway classes (always) and optional secondary/tertiary.
const MAJOR_CLASSES = ['motorway', 'trunk', 'primary', 'motorway_link', 'trunk_link', 'primary_link'];
const MINOR_CLASSES = ['secondary', 'tertiary', 'secondary_link', 'tertiary_link'];
// DP tolerance in DEGREES (~0.0004 deg ~= 44 m). Tuned to hit the size budget
// (comfortably under ~700 KB inline) while keeping corridor shape recognisable.
const DP_TOLERANCE_DEG = 0.0004;
// Quantisation: 1e-5 deg (~1.1 m).
const Q = 100000;
// Size budget / hard cap for the inlined JSON.
const SIZE_BUDGET_BYTES = 700 * 1024; // target comfortably under this
const SIZE_HARD_CAP_BYTES = 900 * 1024; // throw above this - never ship bloat
const MAX_RETRIES = 5;
const GENERATED_AT = '2026-10-24';

// ---- Overpass fetch with retry/backoff ----------------------------------
function buildQuery(classes) {
  const bb = `(${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east})`;
  const regex = classes.join('|');
  return `[out:json][timeout:180];\nway["highway"~"^(${regex})$"]${bb};\nout geom;`;
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function fetchOverpass(classes, label) {
  const body = 'data=' + encodeURIComponent(buildQuery(classes));
  let lastErr = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(OVERPASS_URL, {
        method: 'POST',
        headers: {
          'User-Agent': USER_AGENT,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body,
      });
      if (res.status === 502 || res.status === 429 || res.status === 504) {
        throw new Error(`Overpass HTTP ${res.status} (at capacity / rate limited)`);
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Overpass HTTP ${res.status}: ${text.slice(0, 200)}`);
      }
      const text = await res.text();
      const json = JSON.parse(text);
      console.log(`  [${label}] fetch ok on attempt ${attempt} (raw ${(Buffer.byteLength(text) / 1024 / 1024).toFixed(2)} MB)`);
      return { json, attempts: attempt, rawBytes: Buffer.byteLength(text) };
    } catch (err) {
      lastErr = err;
      const wait = Math.min(2000 * Math.pow(2, attempt - 1), 30000);
      console.warn(`  [${label}] attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}; backing off ${wait}ms`);
      if (attempt < MAX_RETRIES) await sleep(wait);
    }
  }
  throw new Error(`[${label}] Overpass fetch failed after ${MAX_RETRIES} attempts: ${lastErr && lastErr.message}`);
}

// ---- Geometry helpers ----------------------------------------------------
function perpDist(p, a, b) {
  const [px, py] = p, [ax, ay] = a, [bx, by] = b;
  const dx = bx - ax, dy = by - ay;
  if (dx === 0 && dy === 0) {
    const ex = px - ax, ey = py - ay;
    return Math.sqrt(ex * ex + ey * ey);
  }
  const t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
  const cx = ax + t * dx, cy = ay + t * dy;
  const ex = px - cx, ey = py - cy;
  return Math.sqrt(ex * ex + ey * ey);
}

// Classic iterative Douglas-Peucker on an open point list. Deterministic.
function douglasPeucker(points, tol) {
  if (points.length < 3) return points.slice();
  const keep = new Array(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let maxDist = -1, idx = -1;
    for (let i = first + 1; i < last; i++) {
      const d = perpDist(points[i], points[first], points[last]);
      if (d > maxDist) { maxDist = d; idx = i; }
    }
    if (maxDist > tol && idx !== -1) {
      keep[idx] = true;
      stack.push([first, idx]);
      stack.push([idx, last]);
    }
  }
  const out = [];
  for (let i = 0; i < points.length; i++) if (keep[i]) out.push(points[i]);
  return out;
}

// ---- Graph assembly ------------------------------------------------------
// Dedup nodes by quantised coord. Keys are "qlon,qlat"; value is node index.
// qlon/qlat arrays hold the integer (quantised) coords.
function makeGraphBuilder() {
  const nodeIndex = new Map();
  const qlon = [];
  const qlat = [];
  function nodeFor(lon, lat) {
    const ql = Math.round(lon * Q);
    const qa = Math.round(lat * Q);
    const key = ql + ',' + qa;
    let idx = nodeIndex.get(key);
    if (idx === undefined) {
      idx = qlon.length;
      nodeIndex.set(key, idx);
      qlon.push(ql);
      qlat.push(qa);
    }
    return idx;
  }
  return { nodeFor, qlon, qlat, nodeIndex };
}

function buildGraph(elementsList) {
  const gb = makeGraphBuilder();
  const edges = []; // each edge = array of node indices (polyline)
  let rawWays = 0;
  let rawVertices = 0;
  let keptVertices = 0; // after DP, before dedup
  const degree = new Map(); // nodeIdx -> count of edges touching it

  for (const elements of elementsList) {
    for (const el of elements) {
      if (el.type !== 'way' || !Array.isArray(el.geometry)) continue;
      const geom = el.geometry
        .filter((g) => g && typeof g.lon === 'number' && typeof g.lat === 'number')
        .map((g) => [g.lon, g.lat]);
      if (geom.length < 2) continue;
      rawWays++;
      rawVertices += geom.length;
      const simplified = douglasPeucker(geom, DP_TOLERANCE_DEG);
      keptVertices += simplified.length;
      // Build node indices (dedup) for the simplified polyline.
      const idxLine = [];
      let prev = -1;
      for (let i = 0; i < simplified.length; i++) {
        const [lon, lat] = simplified[i];
        const idx = gb.nodeFor(lon, lat);
        if (idx !== prev) { // skip zero-length repeats after quantisation
          idxLine.push(idx);
          prev = idx;
        }
      }
      if (idxLine.length < 2) continue; // collapsed to a point
      edges.push(idxLine);
      for (const nIdx of idxLine) degree.set(nIdx, (degree.get(nIdx) || 0) + 1);
    }
  }
  // Count junction nodes (touched by >=2 edges).
  let junctions = 0;
  for (const c of degree.values()) if (c >= 2) junctions++;
  return { gb, edges, rawWays, rawVertices, keptVertices, junctions };
}

function deltaCode(intArr) {
  const out = new Array(intArr.length);
  let prev = 0;
  for (let i = 0; i < intArr.length; i++) {
    out[i] = intArr[i] - prev;
    prev = intArr[i];
  }
  return out;
}

function assembleDoc(graph, includedClasses, secondaryIncluded, attempts) {
  const { gb, edges } = graph;
  const dlon = deltaCode(gb.qlon);
  const dlat = deltaCode(gb.qlat);
  // Bounds from quantised coords.
  let latMin = Infinity, latMax = -Infinity, lonMin = Infinity, lonMax = -Infinity;
  for (let i = 0; i < gb.qlon.length; i++) {
    const lon = gb.qlon[i] / Q, lat = gb.qlat[i] / Q;
    if (lat < latMin) latMin = lat; if (lat > latMax) latMax = lat;
    if (lon < lonMin) lonMin = lon; if (lon > lonMax) lonMax = lon;
  }
  const round5 = (v) => Math.round(v * Q) / Q;
  return {
    schemaVersion: 1,
    attribution: 'Road network \u00A9 OpenStreetMap contributors, ODbL 1.0 (openstreetmap.org/copyright). Fetched via Overpass API and simplified for offline corridor routing; a generalised major-road graph, not a turn-by-turn navigation database.',
    license: 'ODbL 1.0',
    source: {
      dataset: 'OpenStreetMap via Overpass API',
      endpoint: OVERPASS_URL,
      bbox: [BBOX.south, BBOX.west, BBOX.north, BBOX.east],
      highwayClasses: includedClasses,
      secondaryTertiaryIncluded: secondaryIncluded,
      method: 'Douglas-Peucker simplify (~0.0003 deg) + 1e-5 quantise + node dedup + delta-code',
      overpassAttempts: attempts,
    },
    bounds: {
      latMin: round5(latMin), latMax: round5(latMax),
      lonMin: round5(lonMin), lonMax: round5(lonMax),
    },
    generatedAt: GENERATED_AT,
    q: Q,
    dlon,
    dlat,
    edges,
    counts: { nodes: gb.qlon.length, edges: edges.length, junctions: graph.junctions },
  };
}

// ---- Main ----------------------------------------------------------------
async function main() {
  console.log('build_roads.mjs: fetching SG major-road network from Overpass...');
  const major = await fetchOverpass(MAJOR_CLASSES, 'major');
  const majorElements = (major.json && major.json.elements) || [];
  if (!Array.isArray(majorElements) || majorElements.length === 0) {
    throw new Error('Overpass returned no elements for the major-road query (empty/malformed response)');
  }

  // Build major-only graph first.
  let elementsList = [majorElements];
  let includedClasses = MAJOR_CLASSES.slice();
  let secondaryIncluded = false;
  let totalAttempts = major.attempts;

  let graph = buildGraph(elementsList);
  let doc = assembleDoc(graph, includedClasses, secondaryIncluded, totalAttempts);
  let json = JSON.stringify(doc);
  let bytes = Buffer.byteLength(json);
  console.log(`  major-only inlined size: ${(bytes / 1024).toFixed(2)} KB`);

  // OPTIONAL: try to merge secondary/tertiary IF there is budget headroom.
  // Only attempt if major-only leaves comfortable room (otherwise skip to
  // avoid the heavily rate-limited secondary endpoint for nothing).
  if (bytes < SIZE_BUDGET_BYTES * 0.55) {
    console.log('  budget headroom available; attempting optional secondary/tertiary merge...');
    try {
      const minor = await fetchOverpass(MINOR_CLASSES, 'minor');
      const minorElements = (minor.json && minor.json.elements) || [];
      totalAttempts += minor.attempts;
      if (minorElements.length) {
        const merged = buildGraph([majorElements, minorElements]);
        const mergedClasses = MAJOR_CLASSES.concat(MINOR_CLASSES);
        const mergedDoc = assembleDoc(merged, mergedClasses, true, totalAttempts);
        const mergedJson = JSON.stringify(mergedDoc);
        const mergedBytes = Buffer.byteLength(mergedJson);
        console.log(`  merged (with secondary/tertiary) inlined size: ${(mergedBytes / 1024).toFixed(2)} KB`);
        if (mergedBytes <= SIZE_BUDGET_BYTES) {
          graph = merged; doc = mergedDoc; json = mergedJson; bytes = mergedBytes;
          secondaryIncluded = true;
          includedClasses = mergedClasses;
          console.log('  keeping merged graph (within budget).');
        } else {
          console.log('  merged graph exceeds the ~700 KB budget; shipping MAJOR roads only.');
        }
      }
    } catch (err) {
      console.warn(`  secondary/tertiary fetch failed (${err.message}); shipping MAJOR roads only.`);
    }
  } else {
    console.log('  major-only leaves no comfortable headroom for secondary/tertiary; shipping MAJOR roads only (the secondary Overpass endpoint also rate-limits heavily).');
  }

  if (bytes > SIZE_HARD_CAP_BYTES) {
    throw new Error(`sg_roads.json is ${(bytes / 1024).toFixed(2)} KB, over the ${(SIZE_HARD_CAP_BYTES / 1024).toFixed(0)} KB hard cap - refusing to ship a bloated graph. Loosen DP tolerance or drop classes.`);
  }

  writeFileSync(outPath, json);
  console.log('sg_roads.json written to tools/fixtures/sg_roads.json');
  console.log(`  highway classes       : ${includedClasses.join(', ')}`);
  console.log(`  secondary/tertiary    : ${secondaryIncluded ? 'INCLUDED' : 'excluded (major-only)'}`);
  console.log(`  raw ways / vertices   : ${graph.rawWays} / ${graph.rawVertices}`);
  console.log(`  vertices before/after DP: ${graph.rawVertices} -> ${graph.keptVertices}`);
  console.log(`  kept nodes / edges    : ${doc.counts.nodes} / ${doc.counts.edges}`);
  console.log(`  junction nodes (>=2)  : ${doc.counts.junctions}`);
  console.log(`  bytes (inlined JSON)  : ${bytes} (${(bytes / 1024).toFixed(2)} KB)`);
  console.log(`  bounds lon/lat        : ${doc.bounds.lonMin}..${doc.bounds.lonMax} / ${doc.bounds.latMin}..${doc.bounds.latMax}`);
  console.log(`  overpass attempts     : ${totalAttempts}`);
}

main().catch((err) => {
  console.error('build_roads.mjs FAILED:', err.message);
  process.exit(1);
});
