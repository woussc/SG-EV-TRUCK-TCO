/*
 * tools/check_presets.mjs
 *
 * Deterministic, offline verification of the shipped prospect seed set in
 * tools/fixtures/prospect_seeds.json: the 10 Gemini real-company prospects
 * (sg-01 .. sg-10) plus the 'blank' fresh-client template. It runs the FROZEN
 * engine (src/engine.js -> computeFleet + scoreProspect) on each prospect via
 * the SAME two-state projection the live UI uses and asserts that the engine
 * result matches the prospect's claimed archetype band. The 10 prospects
 * REPLACE the old illustrative wins/breakeven/loses archetypes; 'blank' is
 * kept as the fresh-client template.
 *
 * THE HONEST FIXED-PRICE CONTRACT (the point of this task):
 *   Every profile holds vehicle prices FIXED and HONEST per named model
 *   (col-D all-in = catalogue base col I + 93,000 COE + 33,200 body/reg). The
 *   SRM runs on PLAN A (col B + col D, slot O = EV); the named competitor runs
 *   on PLAN B via the non-engine _planB_model / _planB_price fields (slot R =
 *   EV). The guard below ('no loaded profile sets a vehicle model cost above
 *   its own input-field price') locks that in PER MODEL: a loaded profile can
 *   never show a model cost above the vehicle's own honest input price, so no
 *   outcome is manufactured by pushing the col-D quote up.
 *
 * TWO-STATE PROJECTION (mirror of index.html buildPlanState / mergeTwoState
 * and tools/verify_gemini_prospects.mjs): the frozen engine binds ONE col-B
 * model + ONE col-D quote per truck row for BOTH Plan A (col O) and Plan B
 * (col R), so a single computeFleet(inputs) cannot run SRM on Plan A and a
 * different competitor on Plan B at once. The UI and this harness deep-clone
 * the state and run the engine twice - once with col B = Plan A model + col D =
 * Plan A quote (slot O), once with col B = _planB_model + col D = _planB_price
 * (slot R) - then read plan_a from the first run and plan_b from the second.
 * No number is rigged: each plan is the frozen engine's real result for its own
 * real model and quote.
 *
 * ARCHETYPE BANDS (SRM = Plan A saving %, verified by
 * tools/verify_gemini_prospects.mjs against the frozen engine):
 *   #1 EV wins      (sg-01..sg-06) -> Plan A saving comfortably >= 15%.
 *   dual wins/b-even (sg-07)       -> positive; lands on the wins side (>=15%).
 *   #2 Break-even   (sg-08, sg-09) -> positive but below the 15% target.
 *   #3 EV not a fit (sg-10)        -> negative / non-saving, scored w/o crash.
 *   blank                          -> honest empty: Total n.a., no crash.
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

// The 11 shipped cases, in emission order: the 10 sg-* prospects + blank.
const PROSPECT_IDS = [
  'sg-01-gls-fairprice', 'sg-02-richland-logistics', 'sg-03-neo-group-catering',
  'sg-04-singpost-bulky', 'sg-05-ninjavan-restock', 'sg-06-fareastflora',
  'sg-07-chye-thiam-maintenance', 'sg-08-move-move-movers', 'sg-09-isoteam-ltd',
  'sg-10-relo-charter-control',
];
const SEED_IDS = [...PROSPECT_IDS, 'blank'];

// Fixed honest col-D all-in input-field price per named model (catalogue base
// col I + 93,000 COE + 33,200 body/reg). A loaded profile's col-D used by the
// engine must EQUAL its model's price here and never exceed it.
const FIXED_PRICE = {
  'SRM T3EV': 190000,
  'SRM T3EV+': 193000,
  'ChengLong L2EV': 205000,
  'BYD T35 Electric Light-Duty': 199200,
  'Farizon F3E': 197000,
  'Forland S1 EV': 202200,
  'JAC N40EV': 194200,
  'Foton eMiler': 199200,
};

const WIN_TARGET = 0.15; // '#1 EV wins' clears this; break-even sits below it.

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
 * This matches index.html's syncReframeFromPreset exactly. Keep in sync. */
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

console.log('EV TCO Gemini real-company prospects (engine-verified, SRM = Plan A)\n');

// ---- seed set is EXACTLY the 10 sg-* prospects + blank, in order ----------
const seedIds = seeds.cases.map((c) => c.id);
ok('seed set is exactly the 10 sg-* prospects + blank, in order',
  seedIds.length === SEED_IDS.length && SEED_IDS.every((id, i) => seedIds[i] === id));
ok('no demo seed in the user-facing set', !seeds.cases.some((c) => c.id === 'demo'));
ok('no legacy illustrative wins/breakeven/loses seeds remain',
  !seeds.cases.some((c) => ['wins', 'breakeven', 'loses'].indexOf(c.id) !== -1));
ok('no legacy best/mid/bad seeds remain',
  !seeds.cases.some((c) => ['best', 'mid', 'bad'].indexOf(c.id) !== -1));
ok('no legacy named-customer seeds remain',
  !seeds.cases.some((c) => ['yong_wen', 'venus', 'evergreen'].indexOf(c.id) !== -1));

// ---- FEAT-003: SRM on the Plan A slot, a non-SRM competitor on Plan B ------
// For every prospect, every INCLUDED EV-action truck must carry the SRM model
// on col B (Plan A, col O = EV) and a non-SRM competitor on the Plan B slot
// (col R = EV, via _planB_model). This anchors the SRM-on-Plan-A framing so it
// cannot silently regress to SRM-on-both-slots.
for (const id of PROSPECT_IDS) {
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

// ---- fleet size per prospect matches the authoritative JSON truck count ---
function fleetSizeOf(id) {
  const c = byId(id);
  return Object.keys(includedIds(c.inputs)).length;
}
const EXPECTED_FLEET = {
  'sg-01-gls-fairprice': 10, 'sg-02-richland-logistics': 5, 'sg-03-neo-group-catering': 8,
  'sg-04-singpost-bulky': 10, 'sg-05-ninjavan-restock': 6, 'sg-06-fareastflora': 4,
  'sg-07-chye-thiam-maintenance': 6, 'sg-08-move-move-movers': 4, 'sg-09-isoteam-ltd': 4,
  'sg-10-relo-charter-control': 2,
};
for (const id of PROSPECT_IDS) {
  ok(id + ' fleet size ' + EXPECTED_FLEET[id], fleetSizeOf(id) === EXPECTED_FLEET[id]);
}

// ---- score each prospect via the two-state projection, catching crashes ---
const scores = {};
const figs = {};
let blankCrashed = false;
for (const id of SEED_IDS) {
  try {
    scores[id] = score(id);
    figs[id] = id === 'blank' ? null : planFigures(id);
  } catch (e) {
    if (id === 'blank') { blankCrashed = true; }
    console.error('CRASH scoring ' + id + ': ' + e.message);
    scores[id] = null; figs[id] = null;
  }
}

function line(id) {
  const s = scores[id], f = figs[id];
  if (id === 'blank') { console.log('blank'.padEnd(28) + ' -> ' + (s ? 'scored (honest empty)' : 'CRASH')); return; }
  if (!s || !f) { console.log(id.padEnd(28) + ' -> CRASH'); return; }
  console.log(
    id.padEnd(28) + ' | headline ' + String(s.bestPlanLabel).padEnd(7) +
    ' | Plan A (SRM) ' + money(f.aTotal).padStart(13) + ' (' + pct(f.aPct).padStart(7) + ')' +
    ' | Plan B (comp) ' + money(f.bTotal).padStart(13) + ' (' + pct(f.bPct).padStart(7) + ')' +
    ' | Keep ' + money(f.keep).padStart(13));
}
SEED_IDS.forEach(line);
console.log('');

// ---- RECORDED Plan A (SRM) figures, tied to this fresh engine run ----------
// These are the exact engine figures captured by FEAT-002's verification
// harness (tools/verify_gemini_prospects.mjs) against the FROZEN engine.
// Re-deriving them here from a fresh two-state run and asserting the match
// means the archetype docs/claims CANNOT silently drift from the engine.
const RECORDED = {
  'sg-01-gls-fairprice':          { keep: 3807527, aTotal: 2798199, aSave: 1009328, aPct: 0.2651, bTotal: 2907417, bPct: 0.2364, headline: 'Plan A' },
  'sg-02-richland-logistics':     { keep: 1801398, aTotal: 1370844, aSave: 430554,  aPct: 0.2390, bTotal: 1435685, bPct: 0.2030, headline: 'Plan A' },
  'sg-03-neo-group-catering':     { keep: 2900231, aTotal: 2084843, aSave: 815388,  aPct: 0.2811, bTotal: 2287820, bPct: 0.2112, headline: 'Plan A' },
  'sg-04-singpost-bulky':         { keep: 3547793, aTotal: 2597886, aSave: 949907,  aPct: 0.2677, bTotal: 2873670, bPct: 0.1900, headline: 'Plan A' },
  'sg-05-ninjavan-restock':       { keep: 2301115, aTotal: 1778040, aSave: 523075,  aPct: 0.2273, bTotal: 1918288, bPct: 0.1664, headline: 'Plan A' },
  'sg-06-fareastflora':           { keep: 1463116, aTotal: 1042034, aSave: 421082,  aPct: 0.2878, bTotal: 1095520, bPct: 0.2512, headline: 'Plan A' },
  'sg-07-chye-thiam-maintenance': { keep: 1970994, aTotal: 1527662, aSave: 443332,  aPct: 0.2249, bTotal: 1657604, bPct: 0.1590, headline: 'Plan A' },
  'sg-08-move-move-movers':       { keep: 1264732, aTotal: 1116040, aSave: 148692,  aPct: 0.1176, bTotal: 1153875, bPct: 0.0877, headline: 'Plan A' },
  'sg-09-isoteam-ltd':            { keep: 1141541, aTotal: 986159,  aSave: 155382,  aPct: 0.1361, bTotal: 1047027, bPct: 0.0828, headline: 'Plan A' },
  'sg-10-relo-charter-control':   { keep: 562874,  aTotal: 583611,  aSave: -20737,  aPct: -0.0368, bTotal: 634798, bPct: -0.1278, headline: 'Plan A' },
};
for (const id of PROSPECT_IDS) {
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

// ---- HONEST-CONTRACT GUARD (the key assertion, now PER MODEL) --------------
// no loaded profile sets a vehicle model cost above its own input-field price:
// for every INCLUDED EV-action truck in every prospect, the Plan A model cost
// used by the engine (col D) must EQUAL that model's fixed input-field price
// (FIXED_PRICE[model]) and must NOT exceed it; and the Plan B competitor cost
// (_planB_price) must EQUAL its own model's fixed input-field price and must
// NOT exceed it. SRM T3EV (190000) and SRM T3EV+ (193000) have different fixed
// prices, and each competitor has its own; the guard is enforced per model, so
// no col-D quote can be pushed above the vehicle's honest input price.
(function honestContract() {
  let allPlanAEqual = true;   // col D === FIXED_PRICE[planA model] for every EV truck
  let allPlanBEqual = true;   // _planB_price === FIXED_PRICE[planB model]
  let noneAbove = true;       // no col D exceeds its model fixed price
  let noPlanBAbove = true;    // no _planB_price exceeds its model fixed price
  let unknownModel = false;   // any model not in the fixed-price table
  let sawEvTruck = false;
  for (const id of PROSPECT_IDS) {
    const c = byId(id);
    const inc = includedIds(c.inputs);
    for (const rp of c.inputs.replacement_plan.rows) {
      if (!rp || rp.A == null || !inc[rp.A]) continue;
      if (rp.O !== 'EV') continue;          // Plan A EV-action truck
      sawEvTruck = true;
      const aFix = FIXED_PRICE[rp.B];
      const bFix = FIXED_PRICE[rp._planB_model];
      if (!isNum(aFix) || !isNum(bFix)) { unknownModel = true; continue; }
      if (!(isNum(rp.D) && rp.D === aFix)) allPlanAEqual = false;
      if (!(isNum(rp.D) && rp.D <= aFix)) noneAbove = false;
      if (!(isNum(rp._planB_price) && rp._planB_price === bFix)) allPlanBEqual = false;
      if (!(isNum(rp._planB_price) && rp._planB_price <= bFix)) noPlanBAbove = false;
    }
  }
  ok('every included EV-action truck has a known catalogue model (Plan A + Plan B)',
    sawEvTruck && !unknownModel);
  ok('every included EV-action truck Plan A col D === its model fixed input-field price',
    sawEvTruck && allPlanAEqual);
  ok('every included EV-action truck Plan B _planB_price === its competitor fixed input-field price',
    sawEvTruck && allPlanBEqual);
  ok('no loaded profile sets a vehicle model cost above its own input-field price',
    sawEvTruck && noneAbove && noPlanBAbove);
})();

// ---- per-prospect archetype band (the engine-verified classification) ------
// 6 '#1 EV wins' (sg-01..sg-06) clear a positive saving >= 15%; the dual-label
// sg-07 is positive and lands on the wins side (>=15%); the break-even cases
// (sg-08, sg-09) are positive but below the 15% target; sg-10 ('not a fit') is
// negative. These mirror the archetype bands verify_gemini_prospects.mjs proves.
const WINS_IDS = ['sg-01-gls-fairprice', 'sg-02-richland-logistics', 'sg-03-neo-group-catering',
  'sg-04-singpost-bulky', 'sg-05-ninjavan-restock', 'sg-06-fareastflora'];
const BREAKEVEN_IDS = ['sg-08-move-move-movers', 'sg-09-isoteam-ltd'];
const DUAL_ID = 'sg-07-chye-thiam-maintenance';
const NOTAFIT_ID = 'sg-10-relo-charter-control';

for (const id of WINS_IDS) {
  const f = figs[id], s = scores[id];
  ok(id + ' (#1 EV wins) Plan A (SRM) numeric Total', f && isNum(f.aTotal));
  ok(id + ' (#1 EV wins) Plan A (SRM) positive saving', f && isNum(f.aSave) && f.aSave > 0);
  ok(id + ' (#1 EV wins) Plan A (SRM) saving >= 15% (clears target)', f && isNum(f.aPct) && f.aPct >= WIN_TARGET);
  ok(id + ' (#1 EV wins) headline is Plan A (SRM is the stronger buy)', s && s.bestPlanLabel === 'Plan A');
  ok(id + ' (#1 EV wins) Plan A (SRM) beats Plan B competitor',
    f && isNum(f.aSave) && isNum(f.bSave) && f.aSave > f.bSave);
}

// dual-label sg-07: positive and comfortably on the wins side.
{
  const f = figs[DUAL_ID], s = scores[DUAL_ID];
  ok(DUAL_ID + ' (dual wins/break-even) Plan A (SRM) positive saving', f && isNum(f.aSave) && f.aSave > 0);
  ok(DUAL_ID + ' (dual wins/break-even) lands on the wins side (>= 15%)', f && isNum(f.aPct) && f.aPct >= WIN_TARGET);
  ok(DUAL_ID + ' (dual wins/break-even) headline is Plan A', s && s.bestPlanLabel === 'Plan A');
}

// break-even cases: positive but below the 15% target.
for (const id of BREAKEVEN_IDS) {
  const f = figs[id];
  ok(id + ' (#2 break-even) Plan A (SRM) numeric Total', f && isNum(f.aTotal));
  ok(id + ' (#2 break-even) Plan A (SRM) saving > 0 (marginal positive)', f && isNum(f.aSave) && f.aSave > 0);
  ok(id + ' (#2 break-even) Plan A (SRM) saving below 15% target', f && isNum(f.aPct) && f.aPct < WIN_TARGET);
}

// not-a-fit control: negative / non-saving, scored without crash.
{
  const f = figs[NOTAFIT_ID];
  ok(NOTAFIT_ID + ' (#3 not a fit) Plan A (SRM) is not a fit (saving <= 0)', f && isNum(f.aSave) && f.aSave <= 0);
  ok(NOTAFIT_ID + ' (#3 not a fit) Plan B competitor Total is numeric (honest side-by-side)', f && isNum(f.bTotal));
}

// ---- severity ordering across the archetype bands -------------------------
// Replaces the old wins>breakeven>loses ordering: the six #1 wins prospects
// and sg-07 all clear the 15% target; the break-even cases sit below it and
// above zero; sg-10 is negative. Assert the band separation holds.
(function bandOrdering() {
  const winsPcts = [...WINS_IDS, DUAL_ID].map((id) => figs[id] && figs[id].aPct);
  const bePcts = BREAKEVEN_IDS.map((id) => figs[id] && figs[id].aPct);
  const notPct = figs[NOTAFIT_ID] && figs[NOTAFIT_ID].aPct;
  const minWins = Math.min(...winsPcts.filter(isNum));
  const maxBe = Math.max(...bePcts.filter(isNum));
  ok('all #1/dual wins prospects clear the 15% target',
    winsPcts.length === 7 && winsPcts.every((p) => isNum(p) && p >= WIN_TARGET));
  ok('all break-even prospects sit below the 15% target and above zero',
    bePcts.length === 2 && bePcts.every((p) => isNum(p) && p > 0 && p < WIN_TARGET));
  ok('wins band strictly outranks the break-even band (min wins > max break-even)',
    isNum(minWins) && isNum(maxBe) && minWins > maxBe);
  ok('break-even band strictly outranks the not-a-fit control (sg-10 < break-even)',
    isNum(notPct) && isNum(maxBe) && notPct < Math.min(...bePcts.filter(isNum)) && notPct <= 0);
})();

// ---- blank: honest empty, no crash ----------------------------------------
const blank = scores.blank;
ok('blank did not crash', !blankCrashed && blank);
ok('blank Total is n.a.', blank && (blank.totalEconomicTco === NA || !isNum(blank.totalEconomicTco)));
ok('blank saving is n.a.', blank && (blank.savingAbs === NA || !isNum(blank.savingAbs)));

// ---- provenance / honesty labelling ----------------------------------------
// The 10 prospects are real-company CONTEXT (user-supplied provenance), NOT
// customer savings claims; the archetype claim traces to the frozen engine.
for (const id of PROSPECT_IDS) {
  const c = byId(id);
  ok(id + ' evidence is real-company-context', c.evidence === 'real-company-context');
  ok(id + ' note flags real-company context / NOT a customer savings claim',
    /real-company context/i.test(c.note) && /not a (real )?customer savings claim/i.test(c.note));
  ok(id + ' note ties the archetype to the FROZEN engine Plan A (SRM) saving',
    /frozen engine/i.test(c.note) && /plan a/i.test(c.note) && /SRM/.test(c.note));
  // fleet_register and replacement_plan share one truck-ID set.
  const fleetIds = c.inputs.fleet_register.rows
    .filter((r) => r.B === 1).map((r) => String(r.A)).sort();
  const replIds = c.inputs.replacement_plan.rows
    .filter((r) => r.A != null).map((r) => String(r.A));
  ok(id + ' fleet/replacement share one truck-ID set',
    fleetIds.length > 0 && fleetIds.every((fid) => replIds.indexOf(fid) !== -1));
}
// blank is the honest fresh-client template, not a real customer.
{
  const c = byId('blank');
  ok('blank note flags template / NOT a real customer',
    /template/i.test(c.note) && /not a real customer/i.test(c.note));
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
