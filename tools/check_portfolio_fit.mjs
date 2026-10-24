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

// Real catalogue rows (12 EV models: 7 original + 5 EV light-TRUCK competitors).
// FEAT-005 swapped the 5 FEAT-003 panel VANS for 5 EV LIGHT TRUCKS (10-14 ft
// LGV, cab-and-chassis with a cargo body) per the user's requirement to compare
// trucks, not vans.
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

// Full live ranking on the real demo: every model is an honest verdict (all
// catalogue payload/body-fit is Unconfirmed), none fabricated as Best fit, and
// the list is non-empty. FEAT-005 swapped 5 vans for 5 real EV light-truck
// competitors, so the catalogue is still 12 (7 original + 5 truck competitors).
const live = fit.rankModelsForInputs(demo.inputs);
check('live demo ranking is non-empty (12 catalogue models)', live.verdicts.length === 12);
check('live demo ranking has NO Best fit (all Unconfirmed)',
  live.verdicts.every((v) => v.verdict !== 'Best fit'));
// Honesty flag: every model that is NOT a hard 'Does not fit' carries the
// insufficient-data flag (an Unconfirmed body-fit or a blank-driven gap can
// never read as a clean confirmed pass). A hard 'Does not fit' is itself an
// honest verdict (e.g. a sourced payload below the duty), not a fabricated one.
check('live demo ranking: every non-does-not-fit model carries insufficient-data honesty flag',
  live.verdicts.every((v) => v.verdict === 'Does not fit' || v.insufficientData === true));

// ===========================================================================
// FEAT-005: the 5 EV LIGHT-TRUCK competitor models + their honest per-field
// provenance. The 5 FEAT-003 panel VANS were REMOVED and replaced with 5 real
// battery-electric LIGHT GOODS VEHICLE TRUCKS (10-14 ft LGV, cab-and-chassis
// with a cargo box / drop-side / open deck), because the user compares TRUCKS,
// not vans. The integrity rule is NON-NEGOTIABLE: no confirmed numeric spec may
// appear without a source; an unsourced figure must be blank/n.a. or tagged
// Unconfirmed/Assumption/Derived. These assertions enforce that on the trucks.
// ===========================================================================
const NEW_MODELS = [
  'BYD T35 Electric Light-Duty', 'Foton eMiler', 'Forland S1 EV',
  'JAC N40EV', 'Qingling EQ2',
];
// The 5 panel VANS swapped out in FEAT-005; they must NO LONGER be present.
const OLD_VANS = [
  'BYD T3 (ETP3)', 'Maxus eDeliver 9', 'Maxus eDeliver 3 (EV30)',
  'Farizon SV (Supervan)', 'DFSK EC35',
];
// (a) all 5 new truck models are present in the catalogue.
check('FEAT-005: all 5 new EV light-truck models present in the catalogue',
  NEW_MODELS.every((n) => !!prod(n)));
// (a2) the 5 removed vans are GONE from the catalogue.
check('FEAT-005: the 5 removed panel vans are no longer present',
  OLD_VANS.every((v) => !prod(v)));
// (b) the catalogue is exactly the 7 original + 5 new = 12 models.
check('FEAT-005: catalogue is 12 models (7 original + 5 truck competitors)',
  products.length === 12);
// (c) SRM remains present and is the primary/recommended family (both SRM rows
//     survive; the primary matcher key 'SRM' is still in the catalogue).
const srmRows = products.filter((p) => String(p.A).indexOf('SRM') === 0);
check('FEAT-003: SRM remains present as the primary model (>=1 SRM row)',
  srmRows.length >= 1 && srmRows.some((p) => p.A === 'SRM T3EV+'));

// (d) every new model carries a provenance tag: col K (evidence ref) AND col L
//     (body-fit status) AND a per-field _prov map.
const COL_LETTERS = ['A', 'B', 'C', 'D', 'E', 'G', 'H', 'I', 'J', 'P'];
const PROV_OK = ['sourced', 'derived', 'unconfirmed', 'assumption'];
for (const name of NEW_MODELS) {
  const p = prod(name);
  check(`FEAT-003 [${name}]: has a col-K evidence ref`,
    p.K != null && String(p.K).trim() !== '');
  check(`FEAT-003 [${name}]: has a col-L body-fit status`,
    p.L != null && String(p.L).trim() !== '');
  check(`FEAT-003 [${name}]: carries a per-field _prov map`,
    p._prov && typeof p._prov === 'object');
  // (e) the NO-FABRICATED-CONFIRMED-SPEC rule: for every key spec column, a
  //     present numeric figure must be backed by a provenance tag of 'sourced'
  //     or 'derived' (a derived figure cites the sourced inputs it came from);
  //     and any column tagged 'unconfirmed'/'assumption' must NOT carry a
  //     fabricated number (it is blank/null or explicitly a non-number).
  for (const col of COL_LETTERS) {
    const val = p[col];
    const pv = (p._prov && p._prov[col]) ? String(p._prov[col].status || '').toLowerCase() : null;
    const isNumeric = typeof val === 'number' && isFinite(val);
    if (isNumeric) {
      // A present number must be sourced or derived (never silently present).
      check(`FEAT-003 [${name}] col ${col}: numeric figure is sourced/derived (not fabricated)`,
        pv === 'sourced' || pv === 'derived');
    }
    if (pv === 'unconfirmed' || pv === 'assumption') {
      // An unconfirmed/assumption field must NOT present a precise number.
      check(`FEAT-003 [${name}] col ${col}: unconfirmed field carries no fabricated number`,
        !isNumeric);
    }
    if (pv != null) {
      check(`FEAT-003 [${name}] col ${col}: provenance status is a known tag`,
        PROV_OK.indexOf(pv) !== -1);
    }
  }
}

// (f) the matcher excludes a 'Does not fit' competitor but is never crowned a
//     clean pass; and a feasible competitor keeps its Unconfirmed caveat. Use a
//     duty the BYD T35 light truck (sourced payload 1900 kg, sourced range
//     367 km) can clear on payload and range, so it is a FEASIBLE competitor -
//     yet col L stays 'Unconfirmed', so it can never be a clean Best fit.
const compDuty = {
  peakCargoKg: 1200, routeKm: 150, workKmPerDay: 120,
  availableChargeKw: 60, chargeWindowH: 10, includedCount: 1, blank: {},
};
const bydT35 = fit.scoreModelFit(compDuty, prod('BYD T35 Electric Light-Duty'));
check('FEAT-005: feasible competitor (BYD T35, sourced payload+range) is a caveat, never a clean Best fit',
  bydT35.verdict !== 'Best fit' && bydT35.insufficientData === true);

// (g) FEAT-005 EDITABLE SPECS drive the matcher: the switch-over page binds each
//     editable spec input to an in-memory override of the product row the
//     matcher reads. Simulate that override here on a CLONE of the catalogue
//     row (the UI mutates __HS.state's copy, never the on-disk fixture) and
//     confirm the additive matcher's verdict INPUTS move with the typed value:
//     dropping the payload below the duty flips the payload gate from ok to
//     under (Does not fit); raising it back clears the gate again. This is the
//     module-level proof behind the DOM-level check in check_index.mjs.
const editDuty = {
  peakCargoKg: 1500, routeKm: 150, workKmPerDay: 120,
  availableChargeKw: 60, chargeWindowH: 10, includedCount: 1, blank: {},
};
const editedRow = JSON.parse(JSON.stringify(prod('BYD T35 Electric Light-Duty')));
const beforeEdit = fit.scoreModelFit(editDuty, editedRow);
check('FEAT-005: before a spec edit the sourced payload clears the matcher payload gate',
  beforeEdit.cells.payload === 'ok');
// User types a lower payload (an override) + retags provenance User-entered.
editedRow.B = 900;
editedRow._prov = Object.assign({}, editedRow._prov, { B: { status: 'userentered' } });
const afterEdit = fit.scoreModelFit(editDuty, editedRow);
check('FEAT-005: an edited (lower) payload flips the matcher verdict input to Does not fit',
  afterEdit.cells.payload === 'under' && afterEdit.verdict === 'Does not fit');
check('FEAT-005: the edited field is tagged user-entered, never sourced',
  String(editedRow._prov.B.status).toLowerCase() === 'userentered');
// Raising the payload above the duty clears the gate again (live, reversible).
editedRow.B = 2000;
const afterRaise = fit.scoreModelFit(editDuty, editedRow);
check('FEAT-005: raising the edited payload re-clears the matcher payload gate',
  afterRaise.cells.payload === 'ok');
// Isolation: the on-disk catalogue row is untouched by the clone edit.
check('FEAT-005: editing the clone never mutates the on-disk catalogue payload',
  prod('BYD T35 Electric Light-Duty').B === 1900);

let ok = true;
for (const [name, pass] of checks) {
  console.log((pass ? 'PASS  ' : 'FAIL  ') + name);
  if (!pass) ok = false;
}
console.log('\n' + (ok ? 'ALL PORTFOLIO FIT CHECKS PASSED' : 'PORTFOLIO FIT CHECKS FAILED'));
process.exit(ok ? 0 : 1);
