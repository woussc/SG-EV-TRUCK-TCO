/*
 * tools/check_presets.mjs
 *
 * Deterministic, offline verification of the four illustrative presets
 * (best / mid / bad / blank) that replaced the Yong Wen / Venus reconstructions
 * in tools/fixtures/prospect_seeds.json. It runs the FROZEN engine
 * (src/engine.js -> computeFleet + scoreProspect) on each preset and asserts the
 * intended outcome:
 *
 *   best  -> gate passes, numeric Total economic TCO, strong positive saving.
 *   mid   -> gate passes, numeric Total, a MARGINAL positive saving (> 0).
 *   bad   -> EV does NOT beat Keep ICE: saving <= 0 OR gatePass === false,
 *            scored honestly (no crash).
 *   blank -> honest empty: Total economic TCO n.a., no crash.
 *
 *   Ordering: best.saving > mid.saving > bad.saving.
 *
 * It changes NOTHING; it only reads the fixture and clones inputs in memory.
 *
 *   node tools/check_presets.mjs
 *
 * No third-party dependencies, no network, no randomness.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { computeFleet, scoreProspect, NA } from '../src/engine.js';

const here = dirname(fileURLToPath(import.meta.url));
const seeds = JSON.parse(readFileSync(resolve(here, 'fixtures/prospect_seeds.json'), 'utf8'));

function isNum(v) { return typeof v === 'number' && isFinite(v); }
function money(v) { return isNum(v) ? 'S$' + Math.round(v).toLocaleString('en-US') : 'n.a.'; }
function pct(v) { return isNum(v) ? (v * 100).toFixed(2) + '%' : 'n.a.'; }

function byId(id) {
  const c = seeds.cases.find((x) => x.id === id);
  if (!c) throw new Error('missing preset: ' + id);
  return c;
}

function score(id) {
  const c = byId(id);
  // A crash here is a test failure, surfaced by the try/catch below.
  const s = scoreProspect(computeFleet(c.inputs));
  return s;
}

const checks = [];
function ok(name, pass) { checks.push([name, !!pass]); }

console.log('EV TCO illustrative presets (engine-verified)\n');

// ---- score each preset, catching crashes (blank must NOT crash) -----------
const scores = {};
let blankCrashed = false;
for (const id of ['best', 'mid', 'bad', 'blank']) {
  try {
    scores[id] = score(id);
  } catch (e) {
    if (id === 'blank') { blankCrashed = true; }
    console.error('CRASH scoring ' + id + ': ' + e.message);
    scores[id] = null;
  }
}

function line(id) {
  const s = scores[id];
  if (!s) { console.log(id.padEnd(6) + ' -> CRASH'); return; }
  console.log(
    id.padEnd(6) + ' -> best plan ' + String(s.bestPlanLabel).padEnd(7) +
    ' | Total ' + money(s.totalEconomicTco).padStart(14) +
    ' | Saving ' + money(s.savingAbs).padStart(12) + ' (' + pct(s.savingPct).padStart(7) + ')' +
    ' | gatePass ' + s.gatePass + ' | ' + s.gateStatus);
}
['best', 'mid', 'bad', 'blank'].forEach(line);
console.log('');

const best = scores.best, mid = scores.mid, bad = scores.bad, blank = scores.blank;

// ---- best: gate passes, numeric Total, strong positive saving -------------
ok('best gatePass true', best && best.gatePass === true);
ok('best numeric Total', best && isNum(best.totalEconomicTco));
ok('best positive saving', best && isNum(best.savingAbs) && best.savingAbs > 0);
ok('best saving >= 15% (strong)', best && isNum(best.savingPct) && best.savingPct >= 0.15);

// ---- mid: gate passes, numeric Total, MARGINAL positive saving ------------
ok('mid gatePass true', mid && mid.gatePass === true);
ok('mid numeric Total', mid && isNum(mid.totalEconomicTco));
ok('mid saving > 0 (marginal)', mid && isNum(mid.savingAbs) && mid.savingAbs > 0);
ok('mid saving marginal (< 15%)', mid && isNum(mid.savingPct) && mid.savingPct < 0.15);

// ---- bad: EV does NOT beat Keep ICE (saving <= 0) OR gate fails ------------
ok('bad is not a fit (saving <= 0 or gatePass false)',
  bad && ((isNum(bad.savingAbs) && bad.savingAbs <= 0) || bad.gatePass === false));

// ---- blank: honest empty, no crash ----------------------------------------
ok('blank did not crash', !blankCrashed && blank);
ok('blank Total is n.a.', blank && (blank.totalEconomicTco === NA || !isNum(blank.totalEconomicTco)));
ok('blank saving is n.a.', blank && (blank.savingAbs === NA || !isNum(blank.savingAbs)));

// ---- ordering: best.saving > mid.saving > bad.saving ----------------------
const bs = best && isNum(best.savingAbs) ? best.savingAbs : -Infinity;
const ms = mid && isNum(mid.savingAbs) ? mid.savingAbs : -Infinity;
const ds = bad && isNum(bad.savingAbs) ? bad.savingAbs : -Infinity;
ok('ordering best.saving > mid.saving', bs > ms);
ok('ordering mid.saving > bad.saving', ms > ds);

// ---- illustrative labelling / honesty --------------------------------------
for (const id of ['best', 'mid', 'bad', 'blank']) {
  const c = byId(id);
  ok(id + ' evidence illustrative', c.evidence === 'illustrative');
  ok(id + ' note flags illustrative/NOT a real customer',
    /illustrative/i.test(c.note) && /not a real customer/i.test(c.note));
  // fleet_register and replacement_plan share one truck-ID set.
  const fleetIds = c.inputs.fleet_register.rows
    .filter((r) => r.B === 1).map((r) => String(r.A)).sort();
  const replIds = c.inputs.replacement_plan.rows
    .filter((r) => r.A != null).map((r) => String(r.A));
  ok(id + ' fleet/replacement share one truck-ID set',
    fleetIds.length > 0 && fleetIds.every((fid) => replIds.indexOf(fid) !== -1));
}

// ---- report ----------------------------------------------------------------
let allPass = true;
console.log('Assertions:');
checks.forEach(([name, pass]) => { if (!pass) allPass = false; console.log('  ' + (pass ? 'PASS' : 'FAIL') + '  ' + name); });

if (allPass) {
  console.log('\nALL PRESET CHECKS PASSED');
} else {
  console.log('\nPRESET CHECKS FAILED');
  process.exitCode = 1;
}
