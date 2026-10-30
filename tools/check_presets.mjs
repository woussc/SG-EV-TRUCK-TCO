/*
 * tools/check_presets.mjs
 *
 * Deterministic, offline verification of the four illustrative presets
 * (wins / breakeven / loses / blank) in tools/fixtures/prospect_seeds.json. It
 * runs the FROZEN engine (src/engine.js -> computeFleet + scoreProspect) on each
 * preset and asserts the intended outcome.
 *
 * THE HONEST OPERATIONAL BREAK-EVEN CONTRACT (the point of this task):
 *   The three archetypes hold vehicle prices FIXED and HONEST in every profile
 *   (SRM T3EV+ col-D all-in S$193,000 on Plan A, ChengLong L2EV S$205,000 on
 *   Plan B) and vary ONLY fleet size and operational intensity (km/day x
 *   days/year). This removes the old price-rig (presets that moved the SRM
 *   col-D quote up per case, 193k -> 234k -> 284k, so a loaded profile read as a
 *   "model cost above the vehicle's own input price"). The new guard below
 *   ('no loaded profile sets a vehicle model cost above its own input-field
 *   price') locks that in, plus a fixed-price invariant across all three
 *   archetypes.
 *
 * FEAT-003 (INTEGRITY): the presets demonstrate the SRM T3EV+ on PLAN A (the
 * SRM plan) with an honest COMPETITOR EV (ChengLong L2EV) on PLAN B for a real
 * side-by-side. The frozen engine binds ONE col-B model (and ONE col-D quote)
 * per truck row, used for BOTH Plan A (col O) and Plan B (col R), so a raw
 * computeFleet(inputs) on a single row cannot run SRM on Plan A and a different
 * competitor on Plan B at the same time. The live app solves this with the
 * TWO-STATE projection (index.html buildPlanState/computeReframed): it
 * deep-clones the state and runs the engine twice - once with col B = the Plan A
 * model + col D = the Plan A quote (slot O), once with col B = the Plan B model
 * + col D = the Plan B quote (slot R) - then reads plan_a from the first run and
 * plan_b from the second. This harness mirrors that projection EXACTLY, reading
 * the competitor model/quote from the preset's non-engine _planB_model /
 * _planB_price fields (which the engine never reads), so the standalone check
 * and the live UI stay consistent AND honest. No number is rigged: each plan is
 * the frozen engine's real result for its own real model and quote.
 *
 * Intended outcomes (SRM = Plan A):
 *   wins      -> gate passes; SRM (Plan A) is the STRONGER choice and the
 *                headline: strong positive saving (>= 15%), large/high-use fleet.
 *   breakeven -> gate passes; SRM (Plan A) saving is a MARGINAL positive (> 0)
 *                sitting just below the 15% target - the default landing case.
 *   loses     -> SRM (Plan A) does NOT beat Keep ICE (saving <= 0): an honest
 *                "EV is not a fit yet" outcome, scored without a crash.
 *   blank     -> honest empty: Total economic TCO n.a., no crash.
 *
 *   Ordering of the SRM / Plan A saving: wins > breakeven > loses.
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

// Fixed honest prices held IDENTICAL across all three archetypes.
const SRM_FIXED = 193000;   // SRM T3EV+ col-D all-in quote (Plan A).
const COMP_FIXED = 205000;  // ChengLong L2EV all-in quote (_planB_price, Plan B).

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

console.log('EV TCO illustrative archetypes (engine-verified, SRM = Plan A)\n');

// ---- seed set is EXACTLY the four illustrative archetypes, in order -------
const seedIds = seeds.cases.map((c) => c.id);
ok('seed set is exactly wins/breakeven/loses/blank (no demo)',
  seedIds.length === 4 &&
  ['wins', 'breakeven', 'loses', 'blank'].every((id, i) => seedIds[i] === id));
ok('no demo seed in the user-facing set', !seeds.cases.some((c) => c.id === 'demo'));
ok('no legacy best/mid/bad seeds remain',
  !seeds.cases.some((c) => ['best', 'mid', 'bad'].indexOf(c.id) !== -1));
ok('no legacy named-customer seeds remain',
  !seeds.cases.some((c) => ['yong_wen', 'venus', 'evergreen'].indexOf(c.id) !== -1));

// ---- FEAT-003: SRM on the Plan A slot, a non-SRM competitor on Plan B ------
// For wins/breakeven/loses every INCLUDED EV-action truck must carry the SRM
// model on col B (Plan A, col O = EV) and a non-SRM competitor on the Plan B
// slot (col R = EV, via _planB_model). This is the data assertion that anchors
// the SRM-on-Plan-A framing so it cannot silently regress to SRM-on-both-slots.
for (const id of ['wins', 'breakeven', 'loses']) {
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

// ---- fleet size + intensity differ across the three archetypes ------------
// (The whole point: outcome driven by operations + fleet size, not by price.)
function fleetSizeOf(id) {
  const c = byId(id);
  const inc = includedIds(c.inputs);
  return Object.keys(inc).length;
}
function intensityOf(id) {
  const c = byId(id);
  const inc = includedIds(c.inputs);
  const r = c.inputs.fleet_register.rows.find((x) => x.A != null && inc[x.A] && x.B === 1);
  return r ? { km: r.E, days: r.F } : { km: null, days: null };
}
ok('wins fleet size 30', fleetSizeOf('wins') === 30);
ok('breakeven fleet size 4', fleetSizeOf('breakeven') === 4);
ok('loses fleet size 1', fleetSizeOf('loses') === 1);
ok('wins intensity 120 km/day x 300 days',
  intensityOf('wins').km === 120 && intensityOf('wins').days === 300);
ok('breakeven intensity 60 km/day x 200 days',
  intensityOf('breakeven').km === 60 && intensityOf('breakeven').days === 200);
ok('loses intensity 20 km/day x 100 days',
  intensityOf('loses').km === 20 && intensityOf('loses').days === 100);

// ---- score each preset via the two-state projection, catching crashes -----
const scores = {};
const figs = {};
let blankCrashed = false;
for (const id of ['wins', 'breakeven', 'loses', 'blank']) {
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
  if (!s || !f) { console.log(id.padEnd(9) + ' -> CRASH'); return; }
  console.log(
    id.padEnd(9) + ' | headline ' + String(s.bestPlanLabel).padEnd(7) +
    ' | Plan A (SRM) ' + money(f.aTotal).padStart(13) + ' (' + pct(f.aPct).padStart(7) + ')' +
    ' | Plan B (comp) ' + money(f.bTotal).padStart(13) + ' (' + pct(f.bPct).padStart(7) + ')' +
    ' | Keep ' + money(f.keep).padStart(13));
}
['wins', 'breakeven', 'loses', 'blank'].forEach(line);
console.log('');

const wins = scores.wins, breakeven = scores.breakeven, loses = scores.loses, blank = scores.blank;
const wf = figs.wins, ef = figs.breakeven, lf = figs.loses;

// ---- RECORDED Plan A (SRM) figures, tied to this fresh engine run ----------
// These are the exact numbers quoted in docs/preset-profiles.md and the brief's
// section-3 table. Re-deriving them here from a fresh two-state run and
// asserting the match means the docs CANNOT silently drift from the engine.
const RECORDED = {
  wins:      { keep: 11148680, aTotal: 7867090, aSave: 3281590, aPct: 0.2943,
               bTotal: 8545570, bSave: 2603110, bPct: 0.2335, headline: 'Plan A' },
  breakeven: { keep: 1129145, aTotal: 972937, aSave: 156208, aPct: 0.1383,
               bTotal: 1028776, bSave: 100369, bPct: 0.0889, headline: 'Plan A' },
  loses:     { keep: 247139, aTotal: 248754, aSave: -1615, aPct: -0.0065,
               bTotal: 259973, bSave: -12833, bPct: -0.0519, headline: 'Plan A' },
};
for (const id of ['wins', 'breakeven', 'loses']) {
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

// ---- HONEST-CONTRACT GUARD (the key new assertion) -------------------------
// no loaded profile sets a vehicle model cost above its own input-field price:
// for every INCLUDED EV-action truck in every archetype, the Plan A model cost
// used by the engine (col D) must EQUAL the SRM input-field price (193000) and
// must NOT exceed it; and the Plan B model cost (_planB_price) must EQUAL the
// ChengLong input-field price (205000) and must NOT exceed it. This is exactly
// the price-rig that is being removed: the col-D quote can no longer be pushed
// above the vehicle's own honest input price to manufacture an outcome.
(function honestContract() {
  let allPlanAEqual = true;    // col D === 193000 for every included EV truck
  let allPlanBEqual = true;    // _planB_price === 205000 for every included EV truck
  let noneAbove = true;        // no col D exceeds the fixed honest SRM quote
  let noPlanBAbove = true;     // no _planB_price exceeds the fixed ChengLong quote
  let sawEvTruck = false;
  for (const id of ['wins', 'breakeven', 'loses']) {
    const c = byId(id);
    const inc = includedIds(c.inputs);
    for (const rp of c.inputs.replacement_plan.rows) {
      if (!rp || rp.A == null || !inc[rp.A]) continue;
      if (rp.O !== 'EV') continue;          // Plan A EV-action truck
      sawEvTruck = true;
      if (!(isNum(rp.D) && rp.D === SRM_FIXED)) allPlanAEqual = false;
      if (!(isNum(rp.D) && rp.D <= SRM_FIXED)) noneAbove = false;
      if (!(isNum(rp._planB_price) && rp._planB_price === COMP_FIXED)) allPlanBEqual = false;
      if (!(isNum(rp._planB_price) && rp._planB_price <= COMP_FIXED)) noPlanBAbove = false;
    }
  }
  ok('every included EV-action truck has SRM col D === 193000 (Plan A fixed)',
    sawEvTruck && allPlanAEqual);
  ok('every included EV-action truck has ChengLong _planB_price === 205000 (Plan B fixed)',
    sawEvTruck && allPlanBEqual);
  ok('no loaded profile sets a vehicle model cost above its own input-field price',
    sawEvTruck && noneAbove && noPlanBAbove);
})();

// ---- FIXED-PRICE INVARIANT across archetypes (no per-case price tuning) ----
// The SRM col-D quote is identical (193000) in wins, breakeven and loses, and
// the ChengLong _planB_price is identical (205000) in all three. This directly
// forbids re-introducing the removed MID_TUNE/BAD_TUNE per-case price ladder.
(function fixedPriceInvariant() {
  const srmQuotes = new Set();
  const compQuotes = new Set();
  for (const id of ['wins', 'breakeven', 'loses']) {
    const c = byId(id);
    const inc = includedIds(c.inputs);
    for (const rp of c.inputs.replacement_plan.rows) {
      if (!rp || rp.A == null || !inc[rp.A] || rp.O !== 'EV') continue;
      if (isNum(rp.D)) srmQuotes.add(rp.D);
      if (isNum(rp._planB_price)) compQuotes.add(rp._planB_price);
    }
  }
  ok('SRM col-D quote identical (193000) across wins/breakeven/loses',
    srmQuotes.size === 1 && srmQuotes.has(SRM_FIXED));
  ok('ChengLong _planB_price identical (205000) across wins/breakeven/loses',
    compQuotes.size === 1 && compQuotes.has(COMP_FIXED));
})();

// ---- wins: SRM (Plan A) is the stronger choice AND the headline -----------
ok('wins gatePass true', wins && wins.gatePass === true);
ok('wins headline is Plan A (SRM wins)', wins && wins.bestPlanLabel === 'Plan A');
ok('wins Plan A (SRM) numeric Total', wf && isNum(wf.aTotal));
ok('wins Plan A (SRM) positive saving', wf && isNum(wf.aSave) && wf.aSave > 0);
ok('wins Plan A (SRM) saving >= 15% (strong)', wf && isNum(wf.aPct) && wf.aPct >= 0.15);
ok('wins Plan A (SRM) beats Plan B competitor (SRM is the stronger buy)',
  wf && isNum(wf.aSave) && isNum(wf.bSave) && wf.aSave > wf.bSave);

// ---- breakeven: SRM (Plan A) marginal positive, just below 15% target -----
ok('breakeven gatePass true', breakeven && breakeven.gatePass === true);
ok('breakeven Plan A (SRM) numeric Total', ef && isNum(ef.aTotal));
ok('breakeven Plan A (SRM) saving > 0 (marginal)', ef && isNum(ef.aSave) && ef.aSave > 0);
ok('breakeven Plan A (SRM) saving marginal (< 15%)', ef && isNum(ef.aPct) && ef.aPct < 0.15);

// ---- loses: SRM (Plan A) does NOT beat Keep ICE (honest not-a-fit) --------
ok('loses Plan A (SRM) is not a fit (saving <= 0)', lf && isNum(lf.aSave) && lf.aSave <= 0);
ok('loses Plan B competitor Total is numeric (honest side-by-side)', lf && isNum(lf.bTotal));

// ---- blank: honest empty, no crash ----------------------------------------
ok('blank did not crash', !blankCrashed && blank);
ok('blank Total is n.a.', blank && (blank.totalEconomicTco === NA || !isNum(blank.totalEconomicTco)));
ok('blank saving is n.a.', blank && (blank.savingAbs === NA || !isNum(blank.savingAbs)));

// ---- ordering: SRM / Plan A saving wins > breakeven > loses ---------------
const ws = wf && isNum(wf.aSave) ? wf.aSave : -Infinity;
const es = ef && isNum(ef.aSave) ? ef.aSave : -Infinity;
const ls = lf && isNum(lf.aSave) ? lf.aSave : -Infinity;
ok('ordering (SRM/Plan A) wins.saving > breakeven.saving', ws > es);
ok('ordering (SRM/Plan A) breakeven.saving > loses.saving', es > ls);

// ---- illustrative labelling / honesty --------------------------------------
for (const id of ['wins', 'breakeven', 'loses', 'blank']) {
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
// wins/breakeven/loses notes name the SRM-on-Plan-A framing and Plan B competitor.
for (const id of ['wins', 'breakeven', 'loses']) {
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
