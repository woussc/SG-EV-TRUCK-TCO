/*
 * tools/check_presets.mjs
 *
 * Deterministic, offline verification of the four illustrative presets
 * (best / mid / bad / blank) that replaced the Yong Wen / Venus reconstructions
 * in tools/fixtures/prospect_seeds.json. It runs the FROZEN engine
 * (src/engine.js -> computeFleet + scoreProspect) on each preset and asserts the
 * intended outcome.
 *
 * FEAT-003 (INTEGRITY): the best/mid/bad presets demonstrate the SRM T3EV+ on
 * PLAN A (the SRM plan) with an honest COMPETITOR EV (ChengLong L2EV) on PLAN B
 * for a real side-by-side. The frozen engine binds ONE col-B model (and ONE
 * col-D quote) per truck row, used for BOTH Plan A (col O) and Plan B (col R),
 * so a raw computeFleet(inputs) on a single row cannot run SRM on Plan A and a
 * different competitor on Plan B at the same time. The live app solves this
 * with the TWO-STATE projection (index.html buildPlanState/computeReframed):
 * it deep-clones the state and runs the engine twice - once with col B = the
 * Plan A model + col D = the Plan A quote (slot O), once with col B = the Plan B
 * model + col D = the Plan B quote (slot R) - then reads plan_a from the first
 * run and plan_b from the second. This harness mirrors that projection EXACTLY,
 * reading the competitor model/quote from the preset's non-engine
 * _planB_model / _planB_price fields (which the engine never reads), so the
 * standalone check and the live UI stay consistent AND honest. No number is
 * rigged: each plan is the frozen engine's real result for its own real model
 * and quote.
 *
 * Intended outcomes (SRM = Plan A):
 *   best  -> gate passes; SRM (Plan A) is the STRONGER choice and the headline:
 *            scoreProspect bestPlanLabel === 'Plan A', strong positive saving.
 *   mid   -> gate passes; SRM (Plan A) saving is a MARGINAL positive (> 0).
 *            The SRM quote is tuned up, so the honest side-by-side can show the
 *            fixed-quote competitor ahead here - surfaced honestly, not hidden.
 *   bad   -> SRM (Plan A) does NOT beat Keep ICE (saving <= 0): an honest
 *            "SRM is not a fit right now" outcome, scored without a crash.
 *   blank -> honest empty: Total economic TCO n.a., no crash.
 *
 *   Ordering of the SRM / Plan A saving: best.planA > mid.planA > bad.planA.
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
function clone(x) { return JSON.parse(JSON.stringify(x)); }

function byId(id) {
  const c = seeds.cases.find((x) => x.id === id);
  if (!c) throw new Error('missing preset: ' + id);
  return c;
}

/* ---- Two-state projection (mirror of index.html buildPlanState / merge) ----
 * Included-truck rule: an inclusive "row is in play" heuristic -- a
 * fleet-register row with Include (B===1) OR any data in cols C-M participates.
 * This matches index.html's syncReframeFromPreset exactly. It is NOT byte-
 * identical to index.html's buildPlanState / effectivePlanModel, which use
 * hasFleetData (cols C-Q, no B check); for the shipped presets both predicates
 * select the same rows, so they agree here. Keep in sync when editing. */
const FLEET_DATA_COLS = ['C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'];
function includedIds(inputs) {
  const inc = {};
  for (const r of inputs.fleet_register.rows) {
    if (r.A == null) continue;
    let has = r.B === 1;
    if (!has) for (const c of FLEET_DATA_COLS) { if (r[c] != null && r[c] !== '') { has = true; break; } }
    if (has) inc[r.A] = true;
  }
  return inc;
}
// Build the per-slot derived input state. Slot 'O' (Plan A) keeps the preset
// col B (SRM) + col D (SRM quote). Slot 'R' (Plan B) swaps in the preset's
// competitor (_planB_model / _planB_price) for every EV-action Plan B truck.
function buildPlanState(inputs, slot) {
  const s = clone(inputs);
  const inc = includedIds(inputs);
  for (const rp of s.replacement_plan.rows) {
    if (!rp || rp.A == null || !inc[rp.A]) continue;
    if (rp[slot] !== 'EV') continue;
    if (slot === 'R' && rp._planB_model != null && rp._planB_model !== '') {
      rp.B = rp._planB_model;
      if (isNum(rp._planB_price)) rp.D = rp._planB_price;
    }
  }
  return s;
}
// Merge: plan_a from the slot-O run, plan_b from the slot-R run (mirror of
// index.html mergeTwoState). Keep/New come from the slot-O (Plan A) run.
function twoStateResult(inputs) {
  const outA = computeFleet(buildPlanState(inputs, 'O'));
  const outB = computeFleet(buildPlanState(inputs, 'R'));
  const r = clone(outA.results);
  for (const field of Object.keys(r)) {
    if (r[field] && typeof r[field] === 'object' && 'plan_b' in r[field]) {
      r[field].plan_b = outB.results[field].plan_b;
    }
  }
  return { results: r, perPlan: outA.perPlan, review: outA.review,
    sites: outA.sites, annualSeries: outA.annualSeries };
}

function score(id) {
  const c = byId(id);
  // A crash here is a test failure, surfaced by the try/catch below.
  return scoreProspect(twoStateResult(c.inputs));
}
function planFigures(id) {
  const c = byId(id);
  const r = twoStateResult(c.inputs).results;
  return {
    keep: r.totalEconomicTco.keep_ice,
    aTotal: r.totalEconomicTco.plan_a, aSave: r.savingVsKeep.plan_a, aPct: r.savingPct.plan_a,
    bTotal: r.totalEconomicTco.plan_b, bSave: r.savingVsKeep.plan_b, bPct: r.savingPct.plan_b,
  };
}

const checks = [];
function ok(name, pass) { checks.push([name, !!pass]); }
function near(a, b, tol) { return isNum(a) && isNum(b) && Math.abs(a - b) <= (tol == null ? 1 : tol); }

console.log('EV TCO illustrative presets (engine-verified, SRM = Plan A)\n');

// ---- seed set is EXACTLY the four illustrative presets, in order ----------
const seedIds = seeds.cases.map((c) => c.id);
ok('seed set is exactly best/mid/bad/blank (no demo)',
  seedIds.length === 4 &&
  ['best', 'mid', 'bad', 'blank'].every((id, i) => seedIds[i] === id));
ok('no demo seed in the user-facing set', !seeds.cases.some((c) => c.id === 'demo'));
ok('no legacy named-customer seeds remain',
  !seeds.cases.some((c) => ['yong_wen', 'venus', 'evergreen'].indexOf(c.id) !== -1));

// ---- FEAT-003: SRM on the Plan A slot, a non-SRM competitor on Plan B ------
// For best/mid/bad every INCLUDED EV-action truck must carry the SRM model on
// col B (Plan A, col O = EV) and a non-SRM competitor on the Plan B slot
// (col R = EV, via _planB_model). This is the data assertion that anchors the
// SRM-on-Plan-A framing so it cannot silently regress to SRM-on-both-slots.
for (const id of ['best', 'mid', 'bad']) {
  const c = byId(id);
  const inc = includedIds(c.inputs);
  const evRows = c.inputs.replacement_plan.rows.filter((rp) => rp && rp.A != null && inc[rp.A]);
  const planARows = evRows.filter((rp) => rp.O === 'EV');
  const planBRows = evRows.filter((rp) => rp.R === 'EV');
  ok(id + ' has EV-action trucks on Plan A (col O = EV)', planARows.length > 0);
  ok(id + ' has EV-action trucks on Plan B (col R = EV)', planBRows.length > 0);
  ok(id + ' Plan A slot carries the SRM model (col B starts "SRM")',
    planARows.length > 0 && planARows.every((rp) => String(rp.B).indexOf('SRM') === 0));
  ok(id + ' Plan B slot carries a NON-SRM competitor (_planB_model)',
    planBRows.length > 0 && planBRows.every((rp) =>
      rp._planB_model != null && rp._planB_model !== '' &&
      String(rp._planB_model).indexOf('SRM') !== 0));
  ok(id + ' Plan B competitor carries its own honest quote (_planB_price)',
    planBRows.length > 0 && planBRows.every((rp) => isNum(rp._planB_price) && rp._planB_price > 0));
}

// ---- score each preset via the two-state projection, catching crashes -----
const scores = {};
const figs = {};
let blankCrashed = false;
for (const id of ['best', 'mid', 'bad', 'blank']) {
  try {
    scores[id] = score(id);
    figs[id] = planFigures(id);
  } catch (e) {
    if (id === 'blank') { blankCrashed = true; }
    console.error('CRASH scoring ' + id + ': ' + e.message);
    scores[id] = null; figs[id] = null;
  }
}

function line(id) {
  const s = scores[id], f = figs[id];
  if (!s || !f) { console.log(id.padEnd(6) + ' -> CRASH'); return; }
  console.log(
    id.padEnd(6) + ' | headline ' + String(s.bestPlanLabel).padEnd(7) +
    ' | Plan A (SRM) ' + money(f.aTotal).padStart(13) + ' (' + pct(f.aPct).padStart(7) + ')' +
    ' | Plan B (comp) ' + money(f.bTotal).padStart(13) + ' (' + pct(f.bPct).padStart(7) + ')' +
    ' | Keep ' + money(f.keep).padStart(13));
}
['best', 'mid', 'bad', 'blank'].forEach(line);
console.log('');

const best = scores.best, mid = scores.mid, bad = scores.bad, blank = scores.blank;
const bf = figs.best, mf = figs.mid, df = figs.bad;

// ---- RECORDED Plan A (SRM) figures, tied to this fresh engine run ----------
// These are the exact numbers quoted in docs/preset-profiles.md and the brief's
// section-3 table. Re-deriving them here from a fresh two-state run and
// asserting the match means the docs CANNOT silently drift from the engine.
const RECORDED = {
  best: { keep: 1486117, aTotal: 1047412, aSave: 438705, aPct: 0.2952,
          bTotal: 1137729, bSave: 348388, bPct: 0.2344, headline: 'Plan A' },
  mid:  { keep: 1339103, aTotal: 1195664, aSave: 143440, aPct: 0.1071,
          bTotal: 1114482, bSave: 224621, bPct: 0.1677, headline: 'Plan B' },
  bad:  { keep: 1343994, aTotal: 1411412, aSave: -67418, aPct: -0.0502,
          bTotal: 1137729, bSave: 206264, bPct: 0.1535, headline: 'Plan B' },
};
for (const id of ['best', 'mid', 'bad']) {
  const f = figs[id], R = RECORDED[id];
  ok(id + ' recorded Keep ICE total matches engine', f && near(f.keep, R.keep, 1));
  ok(id + ' recorded Plan A (SRM) Total matches engine', f && near(f.aTotal, R.aTotal, 1));
  ok(id + ' recorded Plan A (SRM) saving matches engine', f && near(f.aSave, R.aSave, 1));
  ok(id + ' recorded Plan A (SRM) saving% matches engine', f && near(f.aPct, R.aPct, 0.0001));
  ok(id + ' recorded Plan B (comp) Total matches engine', f && near(f.bTotal, R.bTotal, 1));
  ok(id + ' recorded Plan B (comp) saving% matches engine', f && near(f.bPct, R.bPct, 0.0001));
  ok(id + ' recorded headline (bestPlanLabel) matches engine',
    scores[id] && scores[id].bestPlanLabel === R.headline);
}

// ---- best: SRM (Plan A) is the stronger choice AND the headline -----------
ok('best gatePass true', best && best.gatePass === true);
ok('best headline is Plan A (SRM wins)', best && best.bestPlanLabel === 'Plan A');
ok('best Plan A (SRM) numeric Total', bf && isNum(bf.aTotal));
ok('best Plan A (SRM) positive saving', bf && isNum(bf.aSave) && bf.aSave > 0);
ok('best Plan A (SRM) saving >= 15% (strong)', bf && isNum(bf.aPct) && bf.aPct >= 0.15);
ok('best Plan A (SRM) beats Plan B competitor (SRM is the stronger buy)',
  bf && isNum(bf.aSave) && isNum(bf.bSave) && bf.aSave > bf.bSave);

// ---- mid: SRM (Plan A) marginal positive; competitor surfaced honestly ----
ok('mid gatePass true', mid && mid.gatePass === true);
ok('mid Plan A (SRM) numeric Total', mf && isNum(mf.aTotal));
ok('mid Plan A (SRM) saving > 0 (marginal)', mf && isNum(mf.aSave) && mf.aSave > 0);
ok('mid Plan A (SRM) saving marginal (< 15%)', mf && isNum(mf.aPct) && mf.aPct < 0.15);
// Honest surfacing: the Plan B competitor figure is numeric and comparable.
ok('mid Plan B competitor Total is numeric (honest side-by-side)', mf && isNum(mf.bTotal));

// ---- bad: SRM (Plan A) does NOT beat Keep ICE (honest not-a-fit) ----------
ok('bad Plan A (SRM) is not a fit (saving <= 0)', df && isNum(df.aSave) && df.aSave <= 0);
ok('bad Plan B competitor Total is numeric (honest side-by-side)', df && isNum(df.bTotal));

// ---- blank: honest empty, no crash ----------------------------------------
ok('blank did not crash', !blankCrashed && blank);
ok('blank Total is n.a.', blank && (blank.totalEconomicTco === NA || !isNum(blank.totalEconomicTco)));
ok('blank saving is n.a.', blank && (blank.savingAbs === NA || !isNum(blank.savingAbs)));

// ---- ordering: SRM / Plan A saving best > mid > bad -----------------------
const bs = bf && isNum(bf.aSave) ? bf.aSave : -Infinity;
const ms = mf && isNum(mf.aSave) ? mf.aSave : -Infinity;
const ds = df && isNum(df.aSave) ? df.aSave : -Infinity;
ok('ordering (SRM/Plan A) best.saving > mid.saving', bs > ms);
ok('ordering (SRM/Plan A) mid.saving > bad.saving', ms > ds);

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
// best/mid/bad notes name the SRM-on-Plan-A framing and the Plan B competitor.
for (const id of ['best', 'mid', 'bad']) {
  const c = byId(id);
  ok(id + ' note names SRM on Plan A', /plan a/i.test(c.note) && /SRM/.test(c.note));
  ok(id + ' note names the Plan B competitor (ChengLong)', /plan b/i.test(c.note) && /ChengLong/i.test(c.note));
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
