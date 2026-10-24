#!/usr/bin/env node
/*
 * tools/check_finance.mjs
 * =======================
 * Validation harness for the OPT-IN finance / amortisation module
 * (src/finance.js). Node, NO third-party deps, NO network. It asserts:
 *   (1) the standard annuity amortisation math on a KNOWN rate / term /
 *       principal matches hand-computed figures within tolerance (monthly
 *       instalment, total interest, total repaid, schedule integrity);
 *   (2) the ZERO-RATE edge case: instalment = principal / term, zero interest;
 *   (3) invalid / non-positive inputs return a clearly-flagged n.a.-style
 *       result (ok:false, null figures) -- NEVER a NaN or a fabricated zero;
 *   (4) an ISOLATION GUARD proving the finance module does NOT change any
 *       computeFleet output: computeFleet(demo) is run BEFORE and AFTER
 *       amortise() and the economic Results (vehicle / total economic TCO,
 *       saving) are byte-identical (deep-equal); AND src/finance.js neither
 *       imports nor references computeFleet / the engine module / the network.
 *
 * Run: node tools/check_finance.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { amortise, financedAmount, summarise, naResult } from '../src/finance.js';
import { computeFleet, scoreProspect } from '../src/engine.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

const checks = [];
function check(name, pass) { checks.push([name, !!pass]); }
function approx(a, b, tol) { return typeof a === 'number' && isFinite(a) && Math.abs(a - b) < tol; }
function isNum(v) { return typeof v === 'number' && isFinite(v); }

// ---- (1) standard annuity math on a KNOWN input ----------------------------
// Principal 100,000, APR 6% (r = 0.5%/month), term 60 months. Hand-computed:
//   M            = P*r / (1 - (1+r)^-n) = 1,933.2801529428275
//   totalRepaid  = 60 * M              = 115,996.809...
//   totalInterest= totalRepaid - P     = 15,996.809...
const a1 = amortise({ principal: 100000, annualRatePct: 6, termMonths: 60 });
check('amortise returns ok for a valid input', !!a1 && a1.ok === true);
check('monthly instalment matches hand-computed 1933.28', approx(a1.monthlyInstalment, 1933.2801529428275, 1e-6));
check('total interest matches hand-computed 15996.81', approx(a1.totalInterest, 15996.809176569644, 1e-4));
check('total repaid matches hand-computed 115996.81', approx(a1.totalRepaid, 115996.80917656964, 1e-4));
check('total repaid = principal + total interest', approx(a1.totalRepaid, a1.principal + a1.totalInterest, 1e-9));
check('schedule has one row per month', Array.isArray(a1.schedule) && a1.schedule.length === 60);
check('schedule opens at the full principal', approx(a1.schedule[0].openingBalance, 100000, 1e-9));
check('schedule closes at exactly zero (no floating residue)', a1.schedule[59].closingBalance === 0);
check('every schedule instalment equals the monthly instalment (within rounding)',
  a1.schedule.every((p) => approx(p.instalment, a1.monthlyInstalment, 1e-6)));
check('monthlyRate is APR/100/12', approx(a1.monthlyRate, 0.06 / 12, 1e-12));
// summarise() exposes compact headline figures matching the full result.
const s1 = summarise(a1);
check('summarise carries the same monthly instalment', approx(s1.monthlyInstalment, a1.monthlyInstalment, 1e-9));
check('summarise exposes first + last period', s1.firstPeriod && s1.lastPeriod && s1.lastPeriod.period === 60);

// financedAmount = principal - deposit.
check('financedAmount subtracts the deposit', financedAmount(100000, 20000) === 80000);
check('financedAmount with no deposit finances the whole principal', financedAmount(100000) === 100000);
check('financedAmount returns null when deposit >= principal (nothing to finance)',
  financedAmount(100000, 100000) === null);

// ---- (2) ZERO-RATE edge case ----------------------------------------------
// r = 0 -> instalment = P / n, no interest. 50,000 over 50 months = 1,000/mo.
const a0 = amortise({ principal: 50000, annualRatePct: 0, termMonths: 50 });
check('zero-rate returns ok', a0 && a0.ok === true);
check('zero-rate instalment = principal / term', approx(a0.monthlyInstalment, 1000, 1e-9));
check('zero-rate total interest is exactly zero', a0.totalInterest === 0);
check('zero-rate total repaid = principal', approx(a0.totalRepaid, 50000, 1e-9));
check('zero-rate schedule has no interest in any period',
  a0.schedule.every((p) => p.interest === 0));
check('zero-rate schedule closes at zero', a0.schedule[a0.schedule.length - 1].closingBalance === 0);

// ---- (3) invalid / non-positive input guards (flagged n.a., never NaN) -----
function isNaFlagged(res) {
  return res && res.ok === false && typeof res.reason === 'string' &&
    res.monthlyInstalment === null && res.totalInterest === null &&
    res.totalRepaid === null && Array.isArray(res.schedule) && res.schedule.length === 0;
}
function noNaN(res) {
  // No numeric field may be NaN.
  const vals = [res.monthlyInstalment, res.totalInterest, res.totalRepaid, res.monthlyRate, res.principal];
  return vals.every((v) => v === null || (typeof v === 'number' && isFinite(v)));
}
const bad = [
  ['zero principal', amortise({ principal: 0, annualRatePct: 6, termMonths: 60 })],
  ['negative principal', amortise({ principal: -100, annualRatePct: 6, termMonths: 60 })],
  ['non-finite principal', amortise({ principal: NaN, annualRatePct: 6, termMonths: 60 })],
  ['missing principal', amortise({ annualRatePct: 6, termMonths: 60 })],
  ['negative rate', amortise({ principal: 100000, annualRatePct: -1, termMonths: 60 })],
  ['zero term', amortise({ principal: 100000, annualRatePct: 6, termMonths: 0 })],
  ['fractional term', amortise({ principal: 100000, annualRatePct: 6, termMonths: 60.5 })],
  ['empty params', amortise()],
];
for (const [label, res] of bad) {
  check('invalid input (' + label + ') returns a flagged n.a.-style result', isNaFlagged(res));
  check('invalid input (' + label + ') is NaN-free', noNaN(res));
}
// naResult itself is a clean flagged shape.
check('naResult() is a flagged n.a. shape', isNaFlagged(naResult('x')));
// summarise() of an n.a. result stays n.a. (no NaN).
const sNa = summarise(naResult('x'));
check('summarise of an n.a. result stays n.a.', sNa.ok === false && sNa.monthlyInstalment === null);

// ---- (4a) ISOLATION GUARD: computeFleet output byte-identical ---------------
// Run the FROZEN economic engine on the demo fixture BEFORE and AFTER invoking
// amortise(), and assert the economic Results are deep-equal. The finance
// module must be incapable of perturbing any economic number.
const demo = JSON.parse(readFileSync(resolve(repoRoot, 'tools/fixtures/demo_case.json'), 'utf8'));
const before = computeFleet(demo.inputs);
const beforeJson = JSON.stringify(before.results);
const beforeScore = JSON.stringify(scoreProspect(before));

// Invoke the finance module (several times, varied inputs) in between.
amortise({ principal: before.results.day0Funding.all_new_ice, annualRatePct: 4.5, termMonths: 72 });
amortise({ principal: 205000, annualRatePct: 3.2, termMonths: 60 });
financedAmount(205000, 20000);
summarise(amortise({ principal: 123456, annualRatePct: 0, termMonths: 36 }));

const after = computeFleet(demo.inputs);
const afterJson = JSON.stringify(after.results);
const afterScore = JSON.stringify(scoreProspect(after));
check('computeFleet Results are byte-identical before/after amortise() (isolation)',
  beforeJson === afterJson);
check('scoreProspect (vehicle/total economic TCO, saving) byte-identical before/after amortise()',
  beforeScore === afterScore);
// Spot-check the authoritative headline numbers survived unchanged.
check('demo Keep-ICE vehicle economic TCO unchanged by finance',
  after.results.vehicleEconomicTco.keep_ice === before.results.vehicleEconomicTco.keep_ice &&
  approx(after.results.vehicleEconomicTco.keep_ice, 2081781.0, 0.5));

// ---- (4b) NO engine coupling in the module source --------------------------
// src/finance.js must NOT import or reference computeFleet / the engine module,
// and must make NO network call. This is the PROVABLE isolation (the planner's
// grep -n 'computeFleet' src/finance.js must be empty).
const financeSrc = readFileSync(resolve(repoRoot, 'src/finance.js'), 'utf8');
check('finance.js does NOT reference computeFleet', financeSrc.indexOf('computeFleet') === -1);
check('finance.js does NOT reference scoreProspect', financeSrc.indexOf('scoreProspect') === -1);
check('finance.js does NOT import the engine module',
  !/\bimport\b[\s\S]*?from\s+['"][^'"]*engine(\.js)?['"]/.test(financeSrc) &&
  !/\brequire\(\s*['"][^'"]*engine(\.js)?['"]\s*\)/.test(financeSrc));
check('finance.js makes NO network call (no fetch/XMLHttpRequest/import())',
  financeSrc.indexOf('fetch(') === -1 && financeSrc.indexOf('XMLHttpRequest') === -1 &&
  !/\bimport\s*\(/.test(financeSrc));

// ---- (5) FEAT-003 PER-PLAN financing split + financial-component breakdown --
// The Proposal applies financing to Plan A (SRM) and Plan B (competitor)
// SEPARATELY: the caller invokes amortise() ONCE PER PLAN with that plan's OWN
// principal (its read-only Day-0 funding) and its own deposit / APR / term, and
// renders a per-plan financial-component breakdown (upfront / principal financed
// / total interest / total repaid / monthly instalment). This section PROVES,
// at the module level the UI uses, that:
//   (a) amortise is invoked per plan and yields independent per-plan breakdown
//       fields (upfront, principal financed, interest, total repaid, instalment);
//   (b) changing Plan A's finance inputs does not alter Plan B's breakdown and
//       vice-versa (the two amortise() calls are fully independent);
//   (c) the economic-TCO numbers are untouched by ANY finance input (isolation).
//
// planBreakdown() is the EXACT per-plan computation the proposal controller does
// (financedAmount -> amortise -> summarise), expressed here against the same
// pure module so the harness locks the contract the UI depends on.
function planBreakdown(day0Funding, deposit, annualRatePct, termMonths) {
  const financed = financedAmount(day0Funding, deposit);
  const result = (financed != null)
    ? amortise({ principal: financed, annualRatePct, termMonths })
    : naResult('financed amount not available');
  const s = summarise(result);
  return {
    upfront: deposit,                                         // down-payment
    principalFinanced: financed,                              // principal - deposit
    totalInterest: s.ok ? s.totalInterest : null,             // flagged n.a. on invalid
    totalRepaid: s.ok ? s.totalRepaid : null,
    monthlyInstalment: s.ok ? s.monthlyInstalment : null,
    ok: !!(result && result.ok),
  };
}

// Two DISTINCT plans with distinct principals + distinct finance inputs.
const planA = planBreakdown(/*day0*/ 300000, /*deposit*/ 30000, /*apr*/ 4.5, /*term*/ 60);
const planB = planBreakdown(/*day0*/ 220000, /*deposit*/ 10000, /*apr*/ 3.2, /*term*/ 72);

// (a) amortise invoked per plan -> independent per-plan breakdown fields present.
check('per-plan: Plan A breakdown has all five financial-component fields',
  planA.ok === true && approx(planA.upfront, 30000, 1e-9) &&
  approx(planA.principalFinanced, 270000, 1e-9) &&
  isNum(planA.totalInterest) && isNum(planA.totalRepaid) && isNum(planA.monthlyInstalment));
check('per-plan: Plan B breakdown has all five financial-component fields',
  planB.ok === true && approx(planB.upfront, 10000, 1e-9) &&
  approx(planB.principalFinanced, 210000, 1e-9) &&
  isNum(planB.totalInterest) && isNum(planB.totalRepaid) && isNum(planB.monthlyInstalment));
check('per-plan: each plan total repaid = principal financed + total interest',
  approx(planA.totalRepaid, planA.principalFinanced + planA.totalInterest, 1e-6) &&
  approx(planB.totalRepaid, planB.principalFinanced + planB.totalInterest, 1e-6));
check('per-plan: the two plans produce DIFFERENT breakdowns (different principal / rate / term)',
  planA.principalFinanced !== planB.principalFinanced &&
  planA.monthlyInstalment !== planB.monthlyInstalment &&
  planA.totalInterest !== planB.totalInterest);

// (b) PER-PLAN INDEPENDENCE: recomputing Plan A with changed inputs does not
// touch the already-computed Plan B breakdown object, and vice-versa. (The
// amortise() calls share no state; each is a pure function of its own args.)
const planASnapshot = JSON.stringify(planA);
const planBSnapshot = JSON.stringify(planB);
// Change Plan B's inputs entirely; Plan A's breakdown must be byte-identical.
const planB2 = planBreakdown(150000, 0, 9.9, 24);
check('per-plan independence: changing Plan B inputs leaves Plan A breakdown byte-identical',
  JSON.stringify(planA) === planASnapshot);
check('per-plan independence: Plan B actually recomputed to a DIFFERENT breakdown',
  JSON.stringify(planB2) !== planBSnapshot &&
  planB2.principalFinanced !== planB.principalFinanced);
// Change Plan A's inputs entirely; Plan B's breakdown must be byte-identical.
const planA2 = planBreakdown(500000, 50000, 1.1, 120);
check('per-plan independence: changing Plan A inputs leaves Plan B breakdown byte-identical',
  JSON.stringify(planB) === planBSnapshot);
check('per-plan independence: Plan A actually recomputed to a DIFFERENT breakdown',
  JSON.stringify(planA2) !== planASnapshot &&
  planA2.principalFinanced !== planA.principalFinanced);

// An n.a./invalid per-plan input shows a flagged n.a. result, never NaN / zero.
const planNa = planBreakdown(200000, 250000, 4.5, 60); // deposit >= principal -> nothing to finance
check('per-plan: an invalid plan (deposit >= principal) returns a flagged n.a. breakdown (not a fabricated zero)',
  planNa.ok === false && planNa.principalFinanced === null &&
  planNa.totalInterest === null && planNa.totalRepaid === null && planNa.monthlyInstalment === null);

// (c) ISOLATION under the PER-PLAN split: running BOTH plans' amortisations
// (several times, varied inputs) must leave computeFleet's economic Results
// byte-identical -- financing never feeds back into the frozen engine.
const econBeforePerPlan = JSON.stringify(computeFleet(demo.inputs).results);
planBreakdown(before.results.day0Funding.plan_a, 25000, 4.5, 60);
planBreakdown(before.results.day0Funding.plan_b, 15000, 3.2, 72);
planBreakdown(before.results.day0Funding.plan_a, 0, 0, 36);
const econAfterPerPlan = JSON.stringify(computeFleet(demo.inputs).results);
check('per-plan financing does NOT change any economic-TCO number (isolation preserved)',
  econBeforePerPlan === econAfterPerPlan && econBeforePerPlan === beforeJson);

let ok = true;
for (const [name, pass] of checks) {
  console.log((pass ? 'PASS  ' : 'FAIL  ') + name);
  if (!pass) ok = false;
}
console.log('\n' + (ok ? 'ALL FINANCE CHECKS PASSED' : 'FINANCE CHECKS FAILED'));
process.exit(ok ? 0 : 1);
