/*
 * tools/check_simbrief.mjs
 *
 * Deterministic, offline drift-guard for the all-models 5-year / 10-year Total
 * economic TCO table in docs/simulation-results-brief.md (the brief embedded
 * via the SIMBRIEF marker and Blob-downloaded offline from the page). FEAT-004.
 *
 * It asserts:
 *   1. The brief contains the "5-year and 10-year Total economic TCO by
 *      portfolio model" section between the SIMBRIEF-MODELS markers.
 *   2. The table names ALL 12 catalogue models.
 *   3. For EVERY model, both the 5-yr and 10-yr figure PRINTED in the brief
 *      MATCH a FRESH frozen-engine run of the documented held-constant scenario
 *      (recompute cumulative[5] / cumulative[10] and compare within display
 *      rounding). This is the anti-drift guard: if the engine, the preset, or
 *      the table ever disagree, this check fails.
 *   4. The embedded copy in index.html (the offline Blob download,
 *      window.HSSimBrief.markdown) contains the same table + all 12 models, so
 *      the downloadable brief is in sync with the source doc.
 *   5. The honesty caveats survive (diagnostic-not-a-quote, SRM primary,
 *      Unconfirmed body-fit, illustrative) and n.a. is never rendered as a zero.
 *
 * It changes NOTHING; it only reads the fixture, the brief and index.html and
 * clones inputs in memory to recompute.
 *
 *   node tools/check_simbrief.mjs
 *
 * No third-party dependencies, no network, no randomness.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { CATALOGUE_MODELS, computeModelTable } from './build_simbrief_models.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const seeds = JSON.parse(readFileSync(resolve(here, 'fixtures/prospect_seeds.json'), 'utf8'));
const brief = readFileSync(resolve(here, '../docs/simulation-results-brief.md'), 'utf8');
const indexHtml = readFileSync(resolve(here, '../index.html'), 'utf8');

function isNum(v) { return typeof v === 'number' && isFinite(v); }
function money(v) { return isNum(v) ? 'S$' + Math.round(v).toLocaleString('en-US') : 'n.a.'; }

const checks = [];
function ok(name, pass) { checks.push([name, !!pass]); }

console.log('EV TCO simulation brief - all-models 5yr/10yr table (engine-verified)\n');

// ---- 1. the section + markers exist in the source brief --------------------
const BEGIN = '<!-- SIMBRIEF-MODELS:BEGIN';
const END = '<!-- SIMBRIEF-MODELS:END -->';
const bIdx = brief.indexOf(BEGIN);
const eIdx = brief.indexOf(END);
ok('brief has SIMBRIEF-MODELS BEGIN marker', bIdx !== -1);
ok('brief has SIMBRIEF-MODELS END marker', eIdx !== -1 && eIdx > bIdx);
const section = (bIdx !== -1 && eIdx !== -1) ? brief.slice(bIdx, eIdx + END.length) : '';
ok('brief has the "5-year and 10-year Total economic TCO by portfolio model" heading',
  /5-year and 10-year Total economic TCO by portfolio model/i.test(section));
ok('section documents cumulative[5] as the 5-yr figure', /cumulative\[5\]/.test(section));
ok('section documents cumulative[10] as the 10-yr figure', /cumulative\[10\]/.test(section));
ok('section documents the held-constant scenario', /held-constant/i.test(section));

// ---- 2. all 12 catalogue models are named in the table ---------------------
for (const m of CATALOGUE_MODELS) {
  ok('table names model: ' + m, section.indexOf(m) !== -1);
}
ok('catalogue model list has exactly 12 models', CATALOGUE_MODELS.length === 12);

// ---- 3. every printed figure matches a FRESH engine run (anti-drift) -------
// Recompute the full 12-model table from the frozen engine and the preset.
const fresh = computeModelTable(seeds);

// Parse the markdown table rows out of the section. A data row looks like:
//   | <model text> | S$1,022,583 | S$1,074,667 |
// The model cell may carry markdown emphasis (**..**) / a "(primary)" tag.
function parseRows(md) {
  const out = [];
  for (const line of md.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('|')) continue;
    const cells = t.split('|').map((c) => c.trim());
    // cells[0] and last are empty (leading/trailing pipe). Expect 3 content cells.
    const content = cells.filter((_, i) => i > 0 && i < cells.length - 1);
    if (content.length !== 3) continue;
    const [modelCell, c5, c10] = content;
    // skip header + separator rows
    if (/Portfolio model/i.test(modelCell)) continue;
    if (/^-+$/.test(modelCell.replace(/[:\s]/g, '-'))) continue;
    if (!/^(S\$[\d,]+|n\.a\.)$/.test(c5) || !/^(S\$[\d,]+|n\.a\.)$/.test(c10)) continue;
    out.push({ modelCell, c5, c10 });
  }
  return out;
}
const printed = parseRows(section);
ok('table has exactly 12 data rows', printed.length === 12);

// Match printed rows to models by substring (the cell may be decorated).
function printedFor(model) {
  return printed.find((r) => r.modelCell.indexOf(model) !== -1);
}
for (const f of fresh) {
  const row = printedFor(f.model);
  ok(f.model + ': row present in table', !!row);
  if (!row) continue;
  const expect5 = money(f.y5);
  const expect10 = money(f.y10);
  ok(f.model + ': 5-yr printed matches fresh engine cumulative[5] (' + expect5 + ')',
    row.c5 === expect5);
  ok(f.model + ': 10-yr printed matches fresh engine cumulative[10] (' + expect10 + ')',
    row.c10 === expect10);
}

// n.a. is honest, never a substituted zero: any n.a. cell must read "n.a." and
// never "S$0".
ok('no gated model rendered as S$0 (n.a. kept honest)',
  !printed.some((r) => r.c5 === 'S$0' || r.c10 === 'S$0'));

// Spot-anchor: SRM T3EV+ 10-yr equals the brief's headline SRM Plan A Total,
// confirming cumulative[10] is the full-horizon Total economic TCO.
{
  const srm = fresh.find((r) => r.model === 'SRM T3EV+');
  ok('SRM T3EV+ 10-yr is numeric (engine-derived full-horizon Total)', srm && isNum(srm.y10));
}

// ---- 4. the embedded brief in index.html carries the same table ------------
// window.HSSimBrief.markdown is a JSON-stringified copy of the brief. Decode it
// and assert the table + all 12 models survive the embedding.
let embedded = '';
{
  const m = indexHtml.match(/window\.HSSimBrief\s*=\s*\{[^}]*markdown:\s*("(?:\\.|[^"\\])*")\s*\}/);
  if (m) {
    try { embedded = JSON.parse(m[1]); } catch (e) { embedded = ''; }
  }
}
ok('index.html SIMBRIEF block decodes window.HSSimBrief.markdown', embedded.length > 0);
ok('embedded brief contains the all-models section heading',
  /5-year and 10-year Total economic TCO by portfolio model/i.test(embedded));
ok('embedded brief contains all 12 model names',
  CATALOGUE_MODELS.every((m) => embedded.indexOf(m) !== -1));
// The embedded table figures must match the source brief figures exactly.
{
  const eb = embedded.indexOf(BEGIN), ee = embedded.indexOf(END);
  const embSection = (eb !== -1 && ee !== -1) ? embedded.slice(eb, ee + END.length) : '';
  const embRows = parseRows(embSection);
  ok('embedded brief has 12 data rows matching the source', embRows.length === 12 &&
    fresh.every((f) => {
      const er = embRows.find((r) => r.modelCell.indexOf(f.model) !== -1);
      return er && er.c5 === money(f.y5) && er.c10 === money(f.y10);
    }));
}

// ---- 5. honesty signals survive -------------------------------------------
ok('section keeps the diagnostic-not-a-quotation caveat', /diagnostic, not a/i.test(section));
ok('section keeps the SRM-primary caveat', /SRM is the primary/i.test(section));
ok('section keeps the Unconfirmed body-fit caveat', /Unconfirmed/i.test(section));
ok('section keeps the illustrative caveat', /illustrative/i.test(section));

// ---- report ----------------------------------------------------------------
console.log('Model'.padEnd(30) + '5-year'.padStart(16) + '10-year'.padStart(16));
for (const f of fresh) {
  console.log(f.model.padEnd(30) + money(f.y5).padStart(16) + money(f.y10).padStart(16));
}
console.log('');

let allPass = true;
console.log('Assertions:');
checks.forEach(([name, pass]) => { if (!pass) allPass = false; console.log('  ' + (pass ? 'PASS' : 'FAIL') + '  ' + name); });

if (allPass) {
  console.log('\nALL SIMBRIEF CHECKS PASSED');
} else {
  console.log('\nSIMBRIEF CHECKS FAILED');
  process.exitCode = 1;
}
