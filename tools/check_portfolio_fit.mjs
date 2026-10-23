#!/usr/bin/env node
/*
 * tools/check_portfolio_fit.mjs
 * =============================
 * Dependency-free Node unit test for the portfolio fit-rules module
 * (src/portfolio_fit.js). It asserts the deterministic fit rules against the
 * REAL catalogue rows from tools/fixtures/demo_case.json plus representative
 * duty rows, covering the honesty discipline the feature requires:
 *
 *   (i)   payload B < peak cargo             -> 'Does not fit' with a payload reason
 *   (ii)  an 'Unconfirmed' attribute in the verdict -> caveat / insufficient data,
 *         never a clean 'Best fit' on that attribute
 *   (iii) a model clearing all thresholds with margin -> 'Best fit'
 *   (iv)  a blank / n.a. required duty input -> 'insufficient data', not a pass
 *   (v)   ranking orders best-fit ahead of does-not-fit
 *
 * No third-party dependencies, no network, no DOM.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

const fit = (await import(resolve(repoRoot, 'src/portfolio_fit.js'))).default;
const demo = JSON.parse(readFileSync(resolve(repoRoot, 'tools/fixtures/demo_case.json'), 'utf8'));

// Real catalogue rows (7 EV models).
const products = demo.inputs.products.rows.filter((r) => r.A != null);
function prod(name) { return products.find((p) => p.A === name); }

const checks = [];
function check(name, pass) { checks.push([name, !!pass]); }

// ---------------------------------------------------------------------------
// A representative duty the whole cohort can clear on payload/range: light
// cargo, short daily distance, ample charge window. Charge power present.
const lightDuty = {
  peakCargoKg: 1200, routeKm: 120, workKmPerDay: 110,
  availableChargeKw: 60, chargeWindowH: 10, includedCount: 6, blank: {},
};

// ---- (i) payload under peak cargo => 'Does not fit' with a payload reason ----
// SRM T3EV has the smallest published payload (3500 kg). Put the peak cargo
// above it so the payload gate must FAIL.
const heavyDuty = {
  peakCargoKg: 4000, routeKm: 120, workKmPerDay: 110,
  availableChargeKw: 60, chargeWindowH: 10, includedCount: 1, blank: {},
};
const srm = fit.scoreModelFit(heavyDuty, prod('SRM T3EV')); // payload 3500 < 4000
check('(i) payload under peak cargo => Does not fit', srm.verdict === 'Does not fit');
check('(i) does-not-fit carries a payload reason',
  srm.reasons.some((r) => /Payload/.test(r) && /does not fit/i.test(r)));
check('(i) payload cell reads under', srm.cells.payload === 'under');

// ---- (ii) an 'Unconfirmed' attribute used in the verdict => caveat, never a
//           clean Best fit on that attribute. Every catalogue model carries
//           col L = 'Unconfirmed' today, so even a model that clears payload,
//           range and charge power numerically must NOT be 'Best fit'.
check('(ii) precondition: all catalogue models are Unconfirmed',
  products.every((p) => p.L === 'Unconfirmed'));
const h9e = fit.scoreModelFit(lightDuty, prod('Farizon H9E 20ft')); // clears all gates
check('(ii) Unconfirmed status forces a caveat (not Best fit)',
  h9e.verdict === 'Fits with caveats' && h9e.insufficientData === true);
check('(ii) Unconfirmed verdict labelled insufficient data',
  h9e.label === 'Fits with caveats - insufficient data');
check('(ii) Unconfirmed reason is shown',
  h9e.reasons.some((r) => /Unconfirmed/.test(r) && /insufficient data/i.test(r)));
check('(ii) no Unconfirmed model is ever Best fit',
  products.every((p) => fit.scoreModelFit(lightDuty, p).verdict !== 'Best fit'));

// ---- (iii) a model clearing ALL thresholds with margin => 'Best fit'.
// This requires a CONFIRMED payload/body-fit status (the only thing blocking a
// Best fit today). Build a confirmed clone of a strong model and feed a duty it
// clears with margin on payload, range and charge power.
const confirmed = Object.assign({}, prod('Farizon H9E 20ft'), { L: 'Confirmed' });
const bestVerdict = fit.scoreModelFit(lightDuty, confirmed);
check('(iii) confirmed model clearing all thresholds => Best fit',
  bestVerdict.verdict === 'Best fit' && bestVerdict.insufficientData === false);
check('(iii) Best fit cells all ok',
  bestVerdict.cells.payload === 'ok' && bestVerdict.cells.range === 'ok' &&
  bestVerdict.cells.charge === 'ok');

// ---- (iv) a blank / n.a. required duty input => 'insufficient data', never a
//           fabricated pass. Blank the peak cargo (payload gate input).
const blankCargoDuty = {
  peakCargoKg: null, routeKm: 120, workKmPerDay: 110,
  availableChargeKw: 60, chargeWindowH: 10, includedCount: 1,
  blank: { peakCargoKg: true },
};
const blankScore = fit.scoreModelFit(blankCargoDuty, confirmed);
check('(iv) blank peak cargo => insufficient data (not a pass)',
  blankScore.insufficientData === true && blankScore.verdict !== 'Best fit');
check('(iv) blank duty payload cell reads insufficient data',
  blankScore.cells.payload === 'insufficient data');
check('(iv) blank duty payload reason names insufficient data',
  blankScore.checks.payload.reason.toLowerCase().indexOf('insufficient data') !== -1);
// An explicit 'n.a.' duty figure is also treated as missing, never a fit.
const naCargoDuty = Object.assign({}, blankCargoDuty, { peakCargoKg: 'n.a.', blank: {} });
const naScore = fit.scoreModelFit(naCargoDuty, confirmed);
check('(iv) n.a. peak cargo is not treated as a fit',
  naScore.cells.payload === 'insufficient data' && naScore.verdict !== 'Best fit');

// ---- (v) ranking orders best-fit ahead of does-not-fit ----------------------
// Mix a confirmed best-fit model, a plain Unconfirmed caveat model and an
// undersized does-not-fit model, then confirm the rank order.
const mixDuty = {
  peakCargoKg: 3600, routeKm: 120, workKmPerDay: 110,
  availableChargeKw: 60, chargeWindowH: 10, includedCount: 1, blank: {},
};
const mixedCatalogue = [
  Object.assign({}, prod('Farizon H5E'), { L: 'Confirmed' }),  // best fit (payload 5000 > 3600)
  prod('ChengLong L2EV'),                                       // Unconfirmed caveat (payload 5000 > 3600)
  prod('SRM T3EV'),                                             // does not fit (payload 3500 < 3600)
];
const ranked = fit.rankModels(mixDuty, mixedCatalogue);
check('(v) ranking returns all three models', ranked.length === 3);
check('(v) best-fit ranks first',
  ranked[0].verdict === 'Best fit' && ranked[0].name === 'Farizon H5E');
check('(v) does-not-fit ranks last',
  ranked[ranked.length - 1].verdict === 'Does not fit' &&
  ranked[ranked.length - 1].name === 'SRM T3EV');
const idxBest = ranked.findIndex((v) => v.verdict === 'Best fit');
const idxFail = ranked.findIndex((v) => v.verdict === 'Does not fit');
check('(v) best-fit index is before does-not-fit index', idxBest < idxFail);

// A clean caveat ranks above an insufficient-data caveat when tiers are equal.
const cleanCaveat = { verdict: 'Fits with caveats', insufficientData: false, attributes: { payloadKg: 5000, achievableRangeKm: 400, name: 'Clean' } };
const insuffCaveat = { verdict: 'Fits with caveats', insufficientData: true, attributes: { payloadKg: 5000, achievableRangeKm: 400, name: 'Insuff' } };
const tierRanked = fit.rankModels(mixDuty, []); // empty -> smoke, ensure callable
check('(v) rankModels handles empty catalogue', Array.isArray(tierRanked) && tierRanked.length === 0);

// deriveDuty from raw inputs picks the most demanding fleet figures.
const derived = fit.deriveDuty(demo.inputs);
check('deriveDuty peak cargo = max fleet H (1200)', derived.peakCargoKg === 1200);
check('deriveDuty route km = max fleet G (165)', derived.routeKm === 165);
check('deriveDuty work km/day = max fleet E (150)', derived.workKmPerDay === 150);
check('deriveDuty included count = 6', derived.includedCount === 6);
// Available charge power is the honest ceiling: the per-charger rated power
// (row 56 = 60 kW) intersected with the net site power (row 50 = 44 kW), so a
// truck can never be credited more than the site delivers -> 44 kW.
check('deriveDuty uses site-limited available charge power (min of rated 60 and site 44)',
  derived.availableChargeKw === 44);

// Full live ranking on the real demo: every model is an honest caveat (all
// Unconfirmed), none fabricated as Best fit, and the list is non-empty.
const live = fit.rankModelsForInputs(demo.inputs);
check('live demo ranking is non-empty', live.verdicts.length === 7);
check('live demo ranking has NO Best fit (all Unconfirmed)',
  live.verdicts.every((v) => v.verdict !== 'Best fit'));
check('live demo ranking all carry insufficient-data honesty flag',
  live.verdicts.every((v) => v.insufficientData === true));

let ok = true;
for (const [name, pass] of checks) {
  console.log((pass ? 'PASS  ' : 'FAIL  ') + name);
  if (!pass) ok = false;
}
console.log('\n' + (ok ? 'ALL PORTFOLIO FIT CHECKS PASSED' : 'PORTFOLIO FIT CHECKS FAILED'));
process.exit(ok ? 0 : 1);
