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
const fixturePath = resolve(repoRoot, 'tools/fixtures/demo_case.json');
const indexPath = resolve(repoRoot, 'index.html');

const engineSrc = readFileSync(enginePath, 'utf8');
const engineHash = createHash('sha256').update(engineSrc).digest('hex');
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));

// Strip ES-module syntax so the engine runs inside a classic <script>.
// 1) `export const NA` / `export function foo` -> drop the leading `export `.
// 2) `export default {...};` -> drop the whole statement (not needed inline).
let inlineEngine = engineSrc
  .replace(/^export\s+default\s+[^;]*;\s*$/m, '')
  .replace(/^export\s+/gm, '');

// Expose computeFleet + NA on a namespace used by the page script.
inlineEngine += '\nwindow.HSEngine = { computeFleet: computeFleet, NA: NA };\n';

const engineBlock =
  `<!-- ENGINE:BEGIN  generated from src/engine.js by tools/build_index.js  DO NOT EDIT BY HAND -->\n` +
  `<!-- src/engine.js SHA-256: ${engineHash} -->\n` +
  `<script>\n${inlineEngine}</script>\n` +
  `<!-- ENGINE:END -->`;

const demoBlock =
  `<!-- DEMO:BEGIN  generated from tools/fixtures/demo_case.json by tools/build_index.js  DO NOT EDIT BY HAND -->\n` +
  `<script>\nwindow.HSDemoCase = ${JSON.stringify({ inputs: fixture.inputs, _meta: fixture._meta })};\n</script>\n` +
  `<!-- DEMO:END -->`;

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

writeFileSync(indexPath, html);
console.log(`index.html regenerated.`);
console.log(`  engine  : src/engine.js (${engineSrc.length} bytes, sha256 ${engineHash.slice(0, 16)}...)`);
console.log(`  demo    : tools/fixtures/demo_case.json inputs embedded`);
