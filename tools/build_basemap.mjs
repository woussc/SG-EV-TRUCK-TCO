#!/usr/bin/env node
/*
 * tools/build_basemap.mjs
 * =======================
 * Build-time simplifier for the bundled, fully-offline Singapore basemap.
 *
 * WHY THIS EXISTS
 * ---------------
 * The shipped page (index.html) must make ZERO runtime network calls: no map
 * tiles, no map API, no geocoder, no CDN. So the Singapore outline drawn behind
 * the charging-tab route simulator cannot be fetched at runtime - it has to be
 * a small, bundled asset. This script reads the high-detail source boundary
 * (assets/sg-adm0-source.geojson, geoBoundaries gbOpen SGP ADM0, MultiPolygon,
 * ~8070 vertices, ODbL, derived from data.gov.sg URA Master Plan 2014 subzone
 * -no-sea) and SIMPLIFIES it into a lightweight, recognisable outline that is
 * inlined into the page by tools/build_index.js (window.HSBasemap).
 *
 * METHOD (deterministic, Node stdlib only, no deps, no network)
 *   1. Parse the source MultiPolygon. Each polygon has one outer ring here.
 *   2. Drop tiny slivers: rings whose bounding-box diagonal is below a floor
 *      are removed (keeps the mainland + the major islands, drops specks).
 *   3. Simplify each kept ring with Douglas-Peucker in lon/lat degree space
 *      (a planar DP is adequate at Singapore's scale for a display outline).
 *   4. Round coordinates to 4 decimal places (~11 m) to shrink the JSON.
 *   5. Emit tools/fixtures/sg_basemap.json with schemaVersion, attribution,
 *      license, bounds, source, generatedAt and a flattened ring list
 *      polygons:[[ [lon,lat], ... ], ...] (sufficient for SVG path drawing).
 *
 * HONESTY: this is a COARSE DISPLAY outline for orientation only, not a
 * survey-grade boundary. The attribution (ODbL + data.gov.sg URA + geoBoundaries)
 * is carried into the asset and shown in the map UI.
 *
 * Re-run after changing the source or the simplification tolerance:
 *   node tools/build_basemap.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const srcPath = resolve(repoRoot, 'assets/sg-adm0-source.geojson');
const outPath = resolve(repoRoot, 'tools/fixtures/sg_basemap.json');

// Simplification tolerance in DEGREES (~0.0012 deg ~= 130 m). Chosen so the
// mainland reads clearly while the asset stays well under ~60KB inlined.
const DP_TOLERANCE_DEG = 0.0012;
// Drop a ring whose bounding-box diagonal (in degrees) is below this floor -
// removes tiny slivers/specks while keeping the mainland + major islands.
const MIN_RING_DIAG_DEG = 0.010; // ~1.1 km across
const COORD_DP = 4;

function round(v) { const f = Math.pow(10, COORD_DP); return Math.round(v * f) / f; }

// Perpendicular distance from point p to the segment a-b (planar, in degrees).
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

function ringDiag(ring) {
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const [x, y] of ring) {
    if (x < minx) minx = x; if (x > maxx) maxx = x;
    if (y < miny) miny = y; if (y > maxy) maxy = y;
  }
  return Math.sqrt((maxx - minx) ** 2 + (maxy - miny) ** 2);
}

const raw = JSON.parse(readFileSync(srcPath, 'utf8'));
const feat = raw.features && raw.features[0];
if (!feat || !feat.geometry || feat.geometry.type !== 'MultiPolygon') {
  throw new Error('Expected a MultiPolygon feature in the source geojson');
}

const srcPolys = feat.geometry.coordinates; // [[ring],[ring],...]
let srcVertexCount = 0;
let outVertexCount = 0;
const polygons = [];
let keptRings = 0, droppedRings = 0;

for (const poly of srcPolys) {
  // Each polygon: first ring is the outer ring (only outer rings present here).
  const outer = poly[0];
  srcVertexCount += poly.reduce((a, r) => a + r.length, 0);
  if (!Array.isArray(outer) || outer.length < 4) { droppedRings++; continue; }
  if (ringDiag(outer) < MIN_RING_DIAG_DEG) { droppedRings++; continue; }
  // DP-simplify, then round. Keep the ring closed (first === last point).
  let simplified = douglasPeucker(outer, DP_TOLERANCE_DEG).map(([x, y]) => [round(x), round(y)]);
  // Re-close if rounding/simplification dropped the closing coincidence.
  const f = simplified[0], l = simplified[simplified.length - 1];
  if (!f || !l || f[0] !== l[0] || f[1] !== l[1]) simplified.push([f[0], f[1]]);
  if (simplified.length < 4) { droppedRings++; continue; }
  polygons.push(simplified);
  outVertexCount += simplified.length;
  keptRings++;
}

// Compute bounds from the simplified polygons.
let latMin = Infinity, latMax = -Infinity, lonMin = Infinity, lonMax = -Infinity;
for (const ring of polygons) for (const [lon, lat] of ring) {
  if (lat < latMin) latMin = lat; if (lat > latMax) latMax = lat;
  if (lon < lonMin) lonMin = lon; if (lon > lonMax) lonMax = lon;
}

const doc = {
  schemaVersion: 1,
  attribution: 'Singapore boundary \u00A9 geoBoundaries (gbOpen SGP ADM0), ODbL 1.0; boundary source Urban Redevelopment Authority, derived from data.gov.sg Master Plan 2014 Subzone Boundary (No Sea). Simplified for offline display; coarse outline, not a survey boundary.',
  license: 'ODbL 1.0',
  source: {
    dataset: 'geoBoundaries gbOpen SGP ADM0',
    boundarySource: 'Urban Redevelopment Authority, derived from ADM 3',
    licenseSource: 'data.gov.sg master-plan-2014-subzone-boundary-no-sea',
    sourceFile: 'assets/sg-adm0-source.geojson',
  },
  bounds: {
    latMin: round(latMin), latMax: round(latMax),
    lonMin: round(lonMin), lonMax: round(lonMax),
  },
  generatedAt: '2026-10-24',
  polygons,
};

writeFileSync(outPath, JSON.stringify(doc));
const bytes = Buffer.byteLength(JSON.stringify(doc));
console.log('sg_basemap.json written to tools/fixtures/sg_basemap.json');
console.log(`  source polygons/rings : ${srcPolys.length}`);
console.log(`  kept rings            : ${keptRings} (dropped ${droppedRings} sliver/degenerate)`);
console.log(`  vertices  before/after: ${srcVertexCount} -> ${outVertexCount}`);
console.log(`  bytes (inlined JSON)  : ${bytes} (${(bytes / 1024).toFixed(2)} KB)`);
console.log(`  bounds lon/lat        : ${doc.bounds.lonMin}..${doc.bounds.lonMax} / ${doc.bounds.latMin}..${doc.bounds.latMax}`);
