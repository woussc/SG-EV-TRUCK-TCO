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

let ok = true;
for (const [name, pass] of checks) {
  console.log((pass ? 'PASS  ' : 'FAIL  ') + name);
  if (!pass) ok = false;
}
console.log('\n' + (ok ? 'ALL FINANCE CHECKS PASSED' : 'FINANCE CHECKS FAILED'));
process.exit(ok ? 0 : 1);
