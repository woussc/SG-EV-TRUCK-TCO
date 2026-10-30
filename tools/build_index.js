#!/usr/bin/env node
/*
 * tools/build_index.js
 * =====================
 * Build-free regenerator for the self-contained client tool index.html.
 *
 * Browsers block ES-module imports over file://, so index.html must open with
 * NO server and NO build step. To keep src/engine.js the single source of math
 * truth while still shipping a standalone file, this helper copies two blocks
 * into index.html between HTML comment markers:
 *
 *   <!-- ENGINE:BEGIN --> ... <!-- ENGINE:END -->   <- src/engine.js (export-stripped)
 *   <!-- DEMO:BEGIN --> ... <!-- DEMO:END -->       <- tools/fixtures/demo_case.json inputs
 *
 * The inlined engine is byte-for-byte the authoritative file with only the
 * ES-module `export` keywords removed (so it runs inside a plain <script>).
 * A SHA-256 of src/engine.js is written into the page so the inlined copy is
 * traceable to its source. Do NOT edit the engine logic inside index.html by
 * hand; edit src/engine.js and re-run:
 *
 *   node tools/build_index.js
 *
 * This script has NO third-party dependencies and makes NO network calls.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const enginePath = resolve(repoRoot, 'src/engine.js');
const portfolioPath = resolve(repoRoot, 'src/portfolio_fit.js');
const routingPath = resolve(repoRoot, 'src/routing_sim.js');
const financePath = resolve(repoRoot, 'src/finance.js');
const sgMapPath = resolve(repoRoot, 'src/sg_map.js');
const roadRouterPath = resolve(repoRoot, 'src/road_router.js');
const basemapPath = resolve(repoRoot, 'tools/fixtures/sg_basemap.json');
const roadsPath = resolve(repoRoot, 'tools/fixtures/sg_roads.json');
const fixturePath = resolve(repoRoot, 'tools/fixtures/demo_case.json');
const seedsPath = resolve(repoRoot, 'tools/fixtures/prospect_seeds.json');
const chargingPath = resolve(repoRoot, 'tools/fixtures/charging_context.json');
const chargingLocationsPath = resolve(repoRoot, 'tools/fixtures/charging_locations.json');
const simBriefPath = resolve(repoRoot, 'docs/simulation-results-brief.md');
const indexPath = resolve(repoRoot, 'index.html');

const engineSrc = readFileSync(enginePath, 'utf8');
const engineHash = createHash('sha256').update(engineSrc).digest('hex');
const portfolioSrc = readFileSync(portfolioPath, 'utf8');
const portfolioHash = createHash('sha256').update(portfolioSrc).digest('hex');
const routingSrc = readFileSync(routingPath, 'utf8');
const routingHash = createHash('sha256').update(routingSrc).digest('hex');
const financeSrc = readFileSync(financePath, 'utf8');
const financeHash = createHash('sha256').update(financeSrc).digest('hex');
const sgMapSrc = readFileSync(sgMapPath, 'utf8');
const sgMapHash = createHash('sha256').update(sgMapSrc).digest('hex');
const roadRouterSrc = readFileSync(roadRouterPath, 'utf8');
const roadRouterHash = createHash('sha256').update(roadRouterSrc).digest('hex');
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
const seeds = JSON.parse(readFileSync(seedsPath, 'utf8'));
// Compact charging aggregates derived at build time by tools/build_charging_data.mjs
// from the 6.3MB vendored LTA/BoCharge snapshot. ONLY this small derived asset is
// inlined into the page - the raw snapshot is never shipped. Re-generate it with
// `node tools/build_charging_data.mjs` before this build if the snapshot changed.
const chargingRaw = readFileSync(chargingPath, 'utf8');
const charging = JSON.parse(chargingRaw);
// Compact LOCATION-LEVEL charger subset (rounded coords + plug/operator/price
// summary) derived at build time by tools/build_charging_data.mjs. Consumed by
// the client-side routing simulator (src/routing_sim.js). Still NOT the raw
// 6.3MB snapshot - a small bundled subset, inlined so the page makes NO runtime
// network / map-API call. Re-generate with `node tools/build_charging_data.mjs`.
const chargingLocationsRaw = readFileSync(chargingLocationsPath, 'utf8');
const chargingLocations = JSON.parse(chargingLocationsRaw);

// Planner-authored decision brief on the simulation results
// (docs/simulation-results-brief.md). Read verbatim as a UTF-8 string and
// bundled into the page as window.HSSimBrief.markdown so the topbar Download
// button can produce a purely client-side Blob download under file:// with NO
// runtime network / fetch. The content is authored upstream and embedded
// byte-for-byte; do NOT rewrite it here. JSON.stringify below safely encodes
// backticks, quotes and newlines as a JS string literal.
const simBriefMarkdown = readFileSync(simBriefPath, 'utf8');

// Simplified, fully-offline Singapore basemap (tools/fixtures/sg_basemap.json),
// produced at build time by tools/build_basemap.mjs from the high-detail source
// boundary (assets/sg-adm0-source.geojson). A small bundled asset (well under
// ~60KB), inlined so the map makes NO runtime network / tile / map-API call.
// Re-generate with `node tools/build_basemap.mjs` if the source changes.
const basemapRaw = readFileSync(basemapPath, 'utf8');
const basemap = JSON.parse(basemapRaw);

// Simplified, fully-offline Singapore MAJOR-road graph (tools/fixtures/
// sg_roads.json), produced at build time by tools/build_roads.mjs from
// OpenStreetMap (ODbL 1.0) via the Overpass API. A compact bundled asset
// (~520KB inline), inlined so the on-road router makes NO runtime network /
// tile / Overpass / routing-API call. It is a delta-coded node table + edge
// polylines consumed by src/road_router.js (window.HSRoadRouter). Re-generate
// with `node tools/build_roads.mjs` if the source changes.
const roadsRaw = readFileSync(roadsPath, 'utf8');
const roads = JSON.parse(roadsRaw);

// Strip ES-module syntax so the engine runs inside a classic <script>.
// 1) `export const NA` / `export function foo` -> drop the leading `export `.
// 2) `export default {...};` -> drop the whole statement (not needed inline).
let inlineEngine = engineSrc
  .replace(/^export\s+default\s+[^;]*;\s*$/m, '')
  .replace(/^export\s+/gm, '');

// Expose computeFleet + NA + scoreProspect on a namespace used by the page script.
inlineEngine += '\nwindow.HSEngine = { computeFleet: computeFleet, NA: NA, scoreProspect: scoreProspect };\n';

// Strip ES-module syntax from the ADDITIVE portfolio fit-rules module the same
// way as the engine, and expose its API on a window namespace. This module is
// NEW computation layered on top of the frozen engine: it does NOT import or
// alter src/engine.js / computeFleet.
let inlinePortfolio = portfolioSrc
  .replace(/^export\s+default\s+\{[\s\S]*?\};\s*$/m, '')
  .replace(/^export\s+/gm, '');
inlinePortfolio += '\nwindow.HSPortfolioFit = { ' +
  'rankModels: rankModels, rankModelsForInputs: rankModelsForInputs, ' +
  'scoreModelFit: scoreModelFit, deriveDuty: deriveDuty, ' +
  'productAttributes: productAttributes, FIT_THRESHOLDS: FIT_THRESHOLDS, ' +
  'VERDICT_RANK: VERDICT_RANK, FIT_UNCONFIRMED: FIT_UNCONFIRMED, ' +
  // FEAT-002: the cost-effectiveness matcher (FEAT-001 additive layer) is now
  // consumed by the per-truck side-by-side comparison UI, so expose it too.
  'MATCH_DEFAULTS: MATCH_DEFAULTS, truckDutyFromRow: truckDutyFromRow, ' +
  'indicativeCost: indicativeCost, rankModelsByCost: rankModelsByCost, ' +
  'matchBestModel: matchBestModel, matchFleetToPortfolio: matchFleetToPortfolio };\n';

// Strip ES-module syntax from the ADDITIVE routing-sim module the same way and
// expose its API on a window namespace. Like the portfolio module, this is NEW
// computation layered on top of the frozen engine: it does NOT import or call
// the fleet-compute engine, makes NO network call, and reads only the bundled
// window.HSChargingLocations subset.
let inlineRouting = routingSrc
  .replace(/^export\s+default\s+\{[\s\S]*?\};\s*$/m, '')
  .replace(/^export\s+/gm, '');
inlineRouting += '\nwindow.HSRoutingSim = { ' +
  'haversineKm: haversineKm, nearestChargers: nearestChargers, ' +
  'chargeTimeHours: chargeTimeHours, headlinePlug: headlinePlug, ' +
  'validateLocationsDoc: validateLocationsDoc, ' +
  'EARTH_RADIUS_KM: EARTH_RADIUS_KM, SIM_DEFAULTS: SIM_DEFAULTS };\n';

// Strip ES-module syntax from the ADDITIVE, OPT-IN finance / amortisation
// module the same way and expose its API on a window namespace. This is an
// ILLUSTRATIVE financing layer: it does NOT import, call, or reference
// computeFleet / scoreProspect, it makes NO network call, and it changes NO
// economic number -- the economic TCO excludes loans/interest by design.
let inlineFinance = financeSrc
  .replace(/^export\s+default\s+\{[\s\S]*?\};\s*$/m, '')
  .replace(/^export\s+/gm, '');
inlineFinance += '\nwindow.HSFinance = { ' +
  'amortise: amortise, financedAmount: financedAmount, ' +
  'summarise: summarise, naResult: naResult };\n';

// Strip ES-module syntax from the ADDITIVE geographic/projection module the same
// way and expose its API on a window namespace. This is NEW computation layered
// on top of the frozen engine: it does NOT import or call computeFleet, makes NO
// network / map-tile / geocoder call, and reads only the bundled basemap
// (window.HSBasemap) and charger subset (window.HSChargingLocations). Its ONLY
// ES import is { haversineKm } from './routing_sim.js'; inline, that primitive
// is already on window.HSRoutingSim, so we drop the import line and alias it.
let inlineSgMap = sgMapSrc
  .replace(/^import\s+\{[^}]*\}\s+from\s+'\.\/routing_sim\.js';\s*$/m, 'var haversineKm = window.HSRoutingSim.haversineKm;')
  .replace(/^export\s+default\s+\{[\s\S]*?\};\s*$/m, '')
  .replace(/^export\s+/gm, '');
inlineSgMap += '\nwindow.HSSgMap = { ' +
  'SG_BBOX: SG_BBOX, SG_AREAS: SG_AREAS, project: project, unproject: unproject, ' +
  'routeDistanceKm: routeDistanceKm, distanceToRouteKm: distanceToRouteKm, ' +
  'reachableChargers: reachableChargers, depotFeasibility: depotFeasibility };\n';

// Strip ES-module syntax from the ADDITIVE on-road router module the same way
// and expose its API on a window namespace. Like sg_map.js, this is NEW
// computation layered on top of the frozen engine: it does NOT import or call
// computeFleet, makes NO network / map-tile / routing-API call, and reads only
// the bundled road graph (window.HSRoads). Its ONLY ES import is
// { haversineKm } from './routing_sim.js'; inline, that primitive is already on
// window.HSRoutingSim, so we drop the import line and alias it - exactly as the
// sg_map.js inlining does. This block MUST be emitted AFTER the ROUTING block
// (window.HSRoutingSim) so the alias target exists when it runs.
let inlineRoadRouter = roadRouterSrc
  .replace(/^import\s+\{[^}]*\}\s+from\s+'\.\/routing_sim\.js';\s*$/m, 'var haversineKm = window.HSRoutingSim.haversineKm;')
  .replace(/^export\s+default\s+\{[\s\S]*?\};\s*$/m, '')
  .replace(/^export\s+/gm, '');
inlineRoadRouter += '\nwindow.HSRoadRouter = { ' +
  'MAX_SNAP_KM: MAX_SNAP_KM, validateRoadsDoc: validateRoadsDoc, ' +
  'decodeGraph: decodeGraph, nearestNode: nearestNode, ' +
  'routeOnRoad: routeOnRoad, routeOnRoadSequence: routeOnRoadSequence };\n';

const engineBlock =
  `<!-- ENGINE:BEGIN  generated from src/engine.js by tools/build_index.js  DO NOT EDIT BY HAND -->\n` +
  `<!-- src/engine.js SHA-256: ${engineHash} -->\n` +
  `<script>\n${inlineEngine}</script>\n` +
  `<!-- ENGINE:END -->`;

const demoBlock =
  `<!-- DEMO:BEGIN  generated from tools/fixtures/demo_case.json by tools/build_index.js  DO NOT EDIT BY HAND -->\n` +
  `<script>\nwindow.HSDemoCase = ${JSON.stringify({ inputs: fixture.inputs, _meta: fixture._meta })};\n</script>\n` +
  `<!-- DEMO:END -->`;

const prospectsBlock =
  `<!-- PROSPECTS:BEGIN  generated from tools/fixtures/prospect_seeds.json by tools/build_index.js  DO NOT EDIT BY HAND -->\n` +
  `<script>\nwindow.HSProspectSeeds = ${JSON.stringify(seeds)};\n</script>\n` +
  `<!-- PROSPECTS:END -->`;

// DEFAULT LANDING = the BREAKEVEN (SRM) illustrative archetype. The page
// controller reads window.HSLandingCase.inputs via freshInputs() as the initial
// landing state, so the app opens on the marginal "is it worth it for us?" SRM
// scenario (TCO dashboard, routing sim active EV = SRM, and proposal all render
// from breakeven on first load). This is a deep copy of the breakeven seed's
// inputs, carrying the full product catalogue under inputs.products.rows. If
// the breakeven seed is ever missing, fail loudly at build time rather than
// silently ship the wrong landing case.
const landingCase = seeds.cases.find((c) => c.id === 'breakeven');
if (!landingCase) {
  throw new Error('prospect_seeds.json has no "breakeven" case to use as default landing');
}
const landingBlock =
  `<!-- LANDING:BEGIN  generated (breakeven case) from tools/fixtures/prospect_seeds.json by tools/build_index.js  DO NOT EDIT BY HAND -->\n` +
  `<script>\nwindow.HSLandingCase = ${JSON.stringify({ id: landingCase.id, name: landingCase.name, inputs: landingCase.inputs })};\n</script>\n` +
  `<!-- LANDING:END -->`;

const portfolioBlock =
  `<!-- PORTFOLIO:BEGIN  generated from src/portfolio_fit.js by tools/build_index.js  DO NOT EDIT BY HAND -->\n` +
  `<!-- src/portfolio_fit.js SHA-256: ${portfolioHash} -->\n` +
  `<script>\n${inlinePortfolio}</script>\n` +
  `<!-- PORTFOLIO:END -->`;

const routingBlock =
  `<!-- ROUTING:BEGIN  generated from src/routing_sim.js by tools/build_index.js  DO NOT EDIT BY HAND -->\n` +
  `<!-- src/routing_sim.js SHA-256: ${routingHash} -->\n` +
  `<script>\n${inlineRouting}</script>\n` +
  `<!-- ROUTING:END -->`;

const financeBlock =
  `<!-- FINANCE:BEGIN  generated from src/finance.js by tools/build_index.js  DO NOT EDIT BY HAND -->\n` +
  `<!-- src/finance.js SHA-256: ${financeHash} -->\n` +
  `<script>\n${inlineFinance}</script>\n` +
  `<!-- FINANCE:END -->`;

const chargingBlock =
  `<!-- CHARGING:BEGIN  generated from tools/fixtures/charging_context.json by tools/build_index.js  DO NOT EDIT BY HAND -->\n` +
  `<script>\nwindow.HSChargingContext = ${JSON.stringify(charging)};\n</script>\n` +
  `<!-- CHARGING:END -->`;

const chargingLocationsBlock =
  `<!-- CHARGING_LOCATIONS:BEGIN  generated from tools/fixtures/charging_locations.json by tools/build_index.js  DO NOT EDIT BY HAND -->\n` +
  `<script>\nwindow.HSChargingLocations = ${JSON.stringify(chargingLocations)};\n</script>\n` +
  `<!-- CHARGING_LOCATIONS:END -->`;

const simBriefBlock =
  `<!-- SIMBRIEF:BEGIN  generated from docs/simulation-results-brief.md by tools/build_index.js  DO NOT EDIT BY HAND -->\n` +
  `<script>\nwindow.HSSimBrief = { filename: 'ev-truck-tco-simulation-results.md', markdown: ${JSON.stringify(simBriefMarkdown)} };\n</script>\n` +
  `<!-- SIMBRIEF:END -->`;

const sgBasemapBlock =
  `<!-- SG_BASEMAP:BEGIN  generated from tools/fixtures/sg_basemap.json by tools/build_index.js  DO NOT EDIT BY HAND -->\n` +
  `<script>\nwindow.HSBasemap = ${JSON.stringify(basemap)};\n</script>\n` +
  `<!-- SG_BASEMAP:END -->`;

const sgMapBlock =
  `<!-- SGMAP:BEGIN  generated from src/sg_map.js by tools/build_index.js  DO NOT EDIT BY HAND -->\n` +
  `<!-- src/sg_map.js SHA-256: ${sgMapHash} -->\n` +
  `<script>\n${inlineSgMap}</script>\n` +
  `<!-- SGMAP:END -->`;

const sgRoadsBlock =
  `<!-- SG_ROADS:BEGIN  generated from tools/fixtures/sg_roads.json by tools/build_index.js  DO NOT EDIT BY HAND -->\n` +
  `<script>\nwindow.HSRoads = ${JSON.stringify(roads)};\n</script>\n` +
  `<!-- SG_ROADS:END -->`;

const roadRouterBlock =
  `<!-- ROADROUTER:BEGIN  generated from src/road_router.js by tools/build_index.js  DO NOT EDIT BY HAND -->\n` +
  `<!-- src/road_router.js SHA-256: ${roadRouterHash} -->\n` +
  `<script>\n${inlineRoadRouter}</script>\n` +
  `<!-- ROADROUTER:END -->`;

let html = readFileSync(indexPath, 'utf8');

function replaceBlock(src, beginRe, endRe, label, replacement) {
  const begin = src.search(beginRe);
  const end = src.search(endRe);
  if (begin === -1 || end === -1) {
    throw new Error(`Could not find ${label} markers in index.html`);
  }
  const endFull = end + src.slice(end).match(endRe)[0].length;
  return src.slice(0, begin) + replacement + src.slice(endFull);
}

html = replaceBlock(
  html,
  /<!-- ENGINE:BEGIN[\s\S]*?-->/,
  /<!-- ENGINE:END -->/,
  'ENGINE',
  engineBlock,
);
html = replaceBlock(
  html,
  /<!-- DEMO:BEGIN[\s\S]*?-->/,
  /<!-- DEMO:END -->/,
  'DEMO',
  demoBlock,
);
html = replaceBlock(
  html,
  /<!-- PROSPECTS:BEGIN[\s\S]*?-->/,
  /<!-- PROSPECTS:END -->/,
  'PROSPECTS',
  prospectsBlock,
);
html = replaceBlock(
  html,
  /<!-- LANDING:BEGIN[\s\S]*?-->/,
  /<!-- LANDING:END -->/,
  'LANDING',
  landingBlock,
);
html = replaceBlock(
  html,
  /<!-- PORTFOLIO:BEGIN[\s\S]*?-->/,
  /<!-- PORTFOLIO:END -->/,
  'PORTFOLIO',
  portfolioBlock,
);
html = replaceBlock(
  html,
  /<!-- CHARGING:BEGIN[\s\S]*?-->/,
  /<!-- CHARGING:END -->/,
  'CHARGING',
  chargingBlock,
);
html = replaceBlock(
  html,
  /<!-- ROUTING:BEGIN[\s\S]*?-->/,
  /<!-- ROUTING:END -->/,
  'ROUTING',
  routingBlock,
);
html = replaceBlock(
  html,
  /<!-- CHARGING_LOCATIONS:BEGIN[\s\S]*?-->/,
  /<!-- CHARGING_LOCATIONS:END -->/,
  'CHARGING_LOCATIONS',
  chargingLocationsBlock,
);
html = replaceBlock(
  html,
  /<!-- FINANCE:BEGIN[\s\S]*?-->/,
  /<!-- FINANCE:END -->/,
  'FINANCE',
  financeBlock,
);
html = replaceBlock(
  html,
  /<!-- SIMBRIEF:BEGIN[\s\S]*?-->/,
  /<!-- SIMBRIEF:END -->/,
  'SIMBRIEF',
  simBriefBlock,
);
html = replaceBlock(
  html,
  /<!-- SG_BASEMAP:BEGIN[\s\S]*?-->/,
  /<!-- SG_BASEMAP:END -->/,
  'SG_BASEMAP',
  sgBasemapBlock,
);
html = replaceBlock(
  html,
  /<!-- SGMAP:BEGIN[\s\S]*?-->/,
  /<!-- SGMAP:END -->/,
  'SGMAP',
  sgMapBlock,
);
html = replaceBlock(
  html,
  /<!-- SG_ROADS:BEGIN[\s\S]*?-->/,
  /<!-- SG_ROADS:END -->/,
  'SG_ROADS',
  sgRoadsBlock,
);
// ROADROUTER is placed AFTER ROUTING (window.HSRoutingSim) in the document so
// its aliased haversineKm target is defined when it runs (same ordering
// discipline as SGMAP relative to ROUTING).
html = replaceBlock(
  html,
  /<!-- ROADROUTER:BEGIN[\s\S]*?-->/,
  /<!-- ROADROUTER:END -->/,
  'ROADROUTER',
  roadRouterBlock,
);

writeFileSync(indexPath, html);
console.log(`index.html regenerated.`);
console.log(`  engine  : src/engine.js (${engineSrc.length} bytes, sha256 ${engineHash.slice(0, 16)}...)`);
console.log(`  portfolio: src/portfolio_fit.js (${portfolioSrc.length} bytes, sha256 ${portfolioHash.slice(0, 16)}...)`);
console.log(`  demo    : tools/fixtures/demo_case.json inputs embedded`);
console.log(`  prospects: tools/fixtures/prospect_seeds.json (${seeds.cases.length} seed cases) embedded`);
console.log(`  landing : default landing case = '${landingCase.id}' (${landingCase.name}) embedded as window.HSLandingCase`);
console.log(`  charging: tools/fixtures/charging_context.json (${(Buffer.byteLength(chargingRaw) / 1024).toFixed(2)} KB compact aggregates) embedded`);
console.log(`  routing : src/routing_sim.js (${routingSrc.length} bytes, sha256 ${routingHash.slice(0, 16)}...)`);
console.log(`  finance : src/finance.js (${financeSrc.length} bytes, sha256 ${financeHash.slice(0, 16)}...)`);
console.log(`  locations: tools/fixtures/charging_locations.json (${(Buffer.byteLength(chargingLocationsRaw) / 1024).toFixed(2)} KB location subset) embedded`);
console.log(`  simbrief: docs/simulation-results-brief.md (${Buffer.byteLength(simBriefMarkdown)} bytes markdown) embedded as window.HSSimBrief`);
console.log(`  basemap : tools/fixtures/sg_basemap.json (${(Buffer.byteLength(basemapRaw) / 1024).toFixed(2)} KB, ${basemap.polygons.length} polygons) embedded as window.HSBasemap`);
console.log(`  sg_map  : src/sg_map.js (${sgMapSrc.length} bytes, sha256 ${sgMapHash.slice(0, 16)}...)`);
console.log(`  roads   : tools/fixtures/sg_roads.json (${(Buffer.byteLength(roadsRaw) / 1024).toFixed(2)} KB, ${roads.dlon.length} nodes / ${roads.edges.length} edges) embedded as window.HSRoads`);
console.log(`  road_router: src/road_router.js (${roadRouterSrc.length} bytes, sha256 ${roadRouterHash.slice(0, 16)}...)`);
