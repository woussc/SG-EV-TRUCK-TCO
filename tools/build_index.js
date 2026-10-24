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
const fixturePath = resolve(repoRoot, 'tools/fixtures/demo_case.json');
const seedsPath = resolve(repoRoot, 'tools/fixtures/prospect_seeds.json');
const chargingPath = resolve(repoRoot, 'tools/fixtures/charging_context.json');
const chargingLocationsPath = resolve(repoRoot, 'tools/fixtures/charging_locations.json');
const indexPath = resolve(repoRoot, 'index.html');

const engineSrc = readFileSync(enginePath, 'utf8');
const engineHash = createHash('sha256').update(engineSrc).digest('hex');
const portfolioSrc = readFileSync(portfolioPath, 'utf8');
const portfolioHash = createHash('sha256').update(portfolioSrc).digest('hex');
const routingSrc = readFileSync(routingPath, 'utf8');
const routingHash = createHash('sha256').update(routingSrc).digest('hex');
const financeSrc = readFileSync(financePath, 'utf8');
const financeHash = createHash('sha256').update(financeSrc).digest('hex');
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

writeFileSync(indexPath, html);
console.log(`index.html regenerated.`);
console.log(`  engine  : src/engine.js (${engineSrc.length} bytes, sha256 ${engineHash.slice(0, 16)}...)`);
console.log(`  portfolio: src/portfolio_fit.js (${portfolioSrc.length} bytes, sha256 ${portfolioHash.slice(0, 16)}...)`);
console.log(`  demo    : tools/fixtures/demo_case.json inputs embedded`);
console.log(`  prospects: tools/fixtures/prospect_seeds.json (${seeds.cases.length} seed cases) embedded`);
console.log(`  charging: tools/fixtures/charging_context.json (${(Buffer.byteLength(chargingRaw) / 1024).toFixed(2)} KB compact aggregates) embedded`);
console.log(`  routing : src/routing_sim.js (${routingSrc.length} bytes, sha256 ${routingHash.slice(0, 16)}...)`);
console.log(`  finance : src/finance.js (${financeSrc.length} bytes, sha256 ${financeHash.slice(0, 16)}...)`);
console.log(`  locations: tools/fixtures/charging_locations.json (${(Buffer.byteLength(chargingLocationsRaw) / 1024).toFixed(2)} KB location subset) embedded`);
