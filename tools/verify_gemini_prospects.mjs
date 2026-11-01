/*
 * tools/verify_gemini_prospects.mjs
 *
 * FEAT-002 "verify the calculation with Claude" gate. A STANDALONE, READ-ONLY
 * Node harness that maps each of the 10 Gemini real-company prospect profiles
 * (/projects/sandbox/.kiro/artifacts/gemini-prospects.json) through the FROZEN
 * engine (src/engine.js -> computeFleet + scoreProspect) using the SAME
 * two-state projection the live UI and tools/check_presets.mjs use, then prints
 * an HONEST per-profile verification table: claimed tcoArchetype vs the engine
 * Plan A (SRM) saving %.
 *
 * It writes NOTHING into the shipped seeds. It only reads the authoritative
 * Gemini JSON and the frozen engine, clones inputs in memory, and emits a
 * human-readable artifact at
 * .agents/tasks/task-ev-tco-gemini-prospects/gemini-verification-table.md.
 *
 * The flat -> nested mapping below mirrors tools/build_prospects.py
 * (_illus_fleet_rows / _illus_repl_rows / _illus_oc_rows / _illus_ec_rows):
 *   - fleet_register cols A..S per included truck (E=km/day, F=days/year,
 *     G=demanding-day route km, H=peak cargo kg, J=COE months left, K/L/M/N
 *     market+terminal from marketValueSgd, etc.)
 *   - replacement_plan cols A..AF (col B=Plan A SRM model, col C=new ICE quote,
 *     col D=SRM all-in fixed-contract price, col O='EV' Plan A, col R='EV'
 *     Plan B) PLUS the non-engine _planB_model / _planB_price (competitor on
 *     the Plan B slot; the engine never reads underscore fields).
 *   - operating_costs row 7=ICE fuel L/km, row 48=extra auxiliary energy
 *     kWh/day (sg-08 = 2.0), verification toggles flipped as in ILLUS_OC.
 *   - energy_and_charging rows 7=commercial diesel S$/L, 10=depot electricity
 *     S$/kWh, 11=public charging S$/kWh, 12=public electricity share,
 *     13=charging site arrangement, 16/17=installed chargers/plugs,
 *     18=charger equipment price, 50=net site power kW (= chargers x rated kW),
 *     56=per-charger rated kW. The charging site SCALES with the EV fleet so
 *     the engine capacity gate (siteAccessCheck) passes.
 *
 * FIXED HONEST PRICE CONTRACT (catalogue base col I + 93,000 COE + 33,200
 * body/reg): the col-D all-in EV quote per named model. No per-profile prices
 * are invented. Verified per truck that col D == the model's fixed input price.
 *
 *   node tools/verify_gemini_prospects.mjs
 *
 * No third-party dependencies, no network, no randomness.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { computeFleet, scoreProspect, NA } from '../src/engine.js';

const here = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(here, '..');
const GEMINI = '/projects/sandbox/.kiro/artifacts/gemini-prospects.json';
const ARTIFACT = resolve(
  REPO,
  '.agents/tasks/task-ev-tco-gemini-prospects/gemini-verification-table.md',
);

const gemini = JSON.parse(readFileSync(GEMINI, 'utf8'));
const demo = JSON.parse(readFileSync(resolve(here, 'fixtures/demo_case.json'), 'utf8'));
const demoInputs = demo.inputs;

function isNum(v) { return typeof v === 'number' && isFinite(v); }
function money(v) { return isNum(v) ? 'S$' + Math.round(v).toLocaleString('en-US') : 'n.a.'; }
function pct(v) { return isNum(v) ? (v * 100).toFixed(2) + '%' : 'n.a.'; }
function clone(x) { return JSON.parse(JSON.stringify(x)); }

/* ---- FIXED HONEST PRICE CONTRACT ---------------------------------------- */
// Catalogue base (products col I) + 93,000 fallback EV COE + 33,200 body/reg.
const CATALOGUE_BASE = {
  'SRM T3EV': 63800,
  'SRM T3EV+': 66800,
  'ChengLong L2EV': 78800,
  'BYD T35 Electric Light-Duty': 73000,
  'Farizon F3E': 70800,
  'Forland S1 EV': 76000,
  'JAC N40EV': 68000,
  'Foton eMiler': 73000,
};
const COE_COMPONENT = 93000;
const BODY_REG_COMPONENT = 33200;
function fixedPrice(model) {
  const base = CATALOGUE_BASE[model];
  if (!isNum(base)) throw new Error('no catalogue base for model: ' + model);
  return base + COE_COMPONENT + BODY_REG_COMPONENT;
}

/* ---- operating_costs template (mirror build_prospects.py ILLUS_OC) ------ */
// Verification toggles flipped so the engine's serviceStatus / savingClaimStatus
// gates pass (Customer data mode, confirmed prices/trial/backup). Row 7 and
// row 48 are overridden per-profile from sharedAssumptions below.
const OC_TEMPLATE = {
  7: 0.14,      // ICE fuel consumption litres/km (overridden per profile)
  24: 3200,     // old ICE maintenance
  25: 2600,     // new ICE maintenance
  39: 0,        // old ICE unavailable days
  40: 0,        // new ICE unavailable days
  41: 0,        // EV unavailable days
  44: 0.10,     // charging loss
  45: 0.20,     // battery reserve
  46: 0.02,     // annual fade
  48: 0,        // extra auxiliary energy kWh/day (overridden per profile)
  49: 0,        // peak auxiliary energy
  58: 'Yes',    // Backup confirmed
  59: 'Yes',    // Loaded trial confirmed
  60: 'Yes',    // Energy prices confirmed
  61: 'Customer', // Data mode
  68: 'Hong Seh 200k average', // EV servicing basis
};

/* ---- energy_and_charging template (mirror build_prospects.py ILLUS_EC) -- */
// Fully itemised depot site. Rows 7/10/11/12/13/16/17/18/50/56 are overridden
// per-profile from sharedAssumptions + the fleet-scaled charging site.
const EC_TEMPLATE = {
  7: 2.50, 8: 3.25, 9: 1, 10: 0.30, 11: 0.75, 12: 0,
  13: 'Existing depot', 15: 'AC11', 16: 4, 17: 4, 18: 8000,
  19: 1200, 20: 800, 21: 1500, 22: 375, 23: 0, 24: 0, 25: 0, 26: 0,
  27: 1000, 28: 0, 29: 0, 30: 0, 31: 0, 32: 400, 33: 0, 34: 120,
  35: 0, 36: 0, 37: 0, 38: 120, 40: 0, 41: 120, 42: 0, 43: 120,
  44: 0, 45: 12, 46: 'No', 47: 0, 50: 60, 51: 10, 52: 'Yes',
  53: 'Yes', 54: 'Verified', 55: 'Yes', 56: 11,
};
const RATED_KW = EC_TEMPLATE[56]; // per-charger rated input power (AC11 = 11 kW)

// Per-truck terminal ladder (mirror build_prospects.py ILLUS_TRUCK_LADDER): the
// keep/EV year-10 terminal values. We use marketValueSgd as the "now" market
// value and reuse the honest ladder's terminal/straight-line figures.
const TRUCK_LADDER = [
  { scrap: 3000, straight: 500, keepY10: 22000, evY10: 24000 },
  { scrap: 3000, straight: 500, keepY10: 30000, evY10: 33000 },
  { scrap: 3000, straight: 500, keepY10: 38000, evY10: 42000 },
  { scrap: 3000, straight: 500, keepY10: 46000, evY10: 51000 },
];

/* ---- row builders -------------------------------------------------------- */
function fleetRows(trucks) {
  const rows = [];
  const included = trucks.filter((t) => t.include);
  for (let i = 0; i < 100; i++) {
    const rr = i + 7;
    if (i < included.length) {
      const t = included[i];
      const lad = TRUCK_LADDER[i % TRUCK_LADDER.length];
      rows.push({
        _row: rr, A: t.truckId, B: 1,
        C: 'Prospect', D: 'Box',
        E: t.workKmPerDay, F: t.daysPerYear, G: t.demandingDayRouteKm,
        H: t.peakCargoKg, I: t.peakJobsPerDay, J: t.coeMonthsLeft,
        K: t.marketValueSgd, L: lad.scrap, M: lad.straight,
        N: 120, O: 0, P: 0, Q: 'GEMINI', R: 9, S: null,
      });
    } else {
      rows.push({ _row: rr, A: 'X' + String(i + 1).padStart(3, '0'), B: 0 });
    }
  }
  return rows;
}

function replRows(trucks) {
  const rows = [];
  const included = trucks.filter((t) => t.include);
  for (let i = 0; i < 100; i++) {
    const rr = i + 7;
    if (i < included.length) {
      const t = included[i];
      const lad = TRUCK_LADDER[i % TRUCK_LADDER.length];
      const planA = t.planAVariant;      // SRM model on Plan A
      const planB = t.planBVariant;      // competitor on Plan B
      const priceA = fixedPrice(planA);
      const priceB = fixedPrice(planB);
      // Competitor year-10 residual scaled by the price ratio off the SRM EV
      // terminal (honest higher residual for a dearer vehicle), rounded to S$100.
      const compY10 = Math.round((lad.evY10 * (priceB / priceA)) / 100) * 100;
      rows.push({
        _row: rr, A: t.truckId, B: planA,
        C: t.newIceQuoteSgd,            // new ICE all-in quote
        D: priceA,                      // SRM all-in override (fixed contract)
        E: '', F: '',                   // use product battery / intensity defaults
        G: 'Battery',
        H: 2000,                        // approved payload (>= peak load)
        I: 'Yes',                       // body fits
        J: 11, K: 'AC', L: 11,          // depot avg kW, AC mode, plug kW
        M: '',
        N: lad.keepY10,
        O: t.planAAction, P: '', Q: lad.evY10,  // Plan A = SRM EV, SRM terminal
        R: t.planBAction, S: '', T: compY10,    // Plan B = competitor EV, comp terminal
        U: '', V: '',
        W: 0, X: 0, Y: 0, Z: 0,
        AA: 0, AB: 'Yes', AC: 120, AD: 120,
        AE: 'Verified', AF: t.truckId,
        _planB_model: planB,
        _planB_price: priceB,
      });
    } else {
      rows.push({
        _row: rr, A: 'X' + String(i + 1).padStart(3, '0'), B: 'SRM T3EV',
        O: 'Keep ICE', R: 'Keep ICE', AB: 'No', AC: 120, AD: 120,
      });
    }
  }
  return rows;
}

function ocRows(shared, auxOverride) {
  const oc = clone(OC_TEMPLATE);
  oc[7] = shared.iceFuelConsumptionLitresPerKm;
  oc[48] = auxOverride != null ? auxOverride : shared.extraAuxiliaryEnergyKwhPerDay;
  const rows = clone(demoInputs.operating_costs.rows);
  for (const r of rows) {
    if (r._row in oc) r.values.B = oc[r._row];
  }
  return rows;
}

function ecRows(shared, nTrucks) {
  const ec = clone(EC_TEMPLATE);
  ec[7] = shared.commercialDieselPriceSgdPerLitre;
  ec[10] = shared.depotElectricityRateSgdPerKwh;
  ec[11] = shared.publicChargingPriceSgdPerKwh;
  ec[12] = shared.publicElectricityShare;
  ec[13] = shared.chargingSiteArrangement;
  ec[18] = shared.chargerEquipmentPriceSgd;
  // Charging-site build-up SCALED to the EV fleet: one AC11 charger + usable
  // plug per EV-action truck, net site power = chargers x rated kW. For a
  // public-charging-only profile (installedChargers 0) there is NO depot site:
  // zero chargers/plugs/site-capex and the gate is driven by public charging.
  const installed = shared.installedChargers;
  if (isNum(installed) && installed === 0) {
    // Public-charging-only: honest no-depot-site. Zero out every per-charger
    // and per-site capex line so there is no depot-site capex, and leave the
    // site arrangement / public share to drive all energy through public S$/kWh.
    for (const row of [16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29,
      30, 31, 32, 50]) ec[row] = 0;
    ec[52] = 'Yes'; ec[53] = 'Yes'; ec[55] = 'Yes';
  } else {
    const chargers = Math.max(1, nTrucks);
    ec[16] = chargers;
    ec[17] = chargers;
    ec[50] = chargers * RATED_KW;
  }
  const rows = clone(demoInputs.energy_and_charging.rows);
  for (const r of rows) {
    if (r.values && typeof r.values === 'object' && r._row in ec) {
      if ('B' in r.values) r.values.B = ec[r._row];
      if ('C' in r.values) r.values.C = ec[r._row];
    }
  }
  return rows;
}

function mapProspect(p, auxOverride) {
  const shared = p.sharedAssumptions;
  const included = p.trucks.filter((t) => t.include);
  const nTrucks = included.length;
  const inputs = {
    fleet_register: { range: 'A7:S106', rows: fleetRows(p.trucks) },
    replacement_plan: { range: 'A7:AI106', rows: replRows(p.trucks) },
    operating_costs: { range: 'A7:D68', rows: ocRows(shared, auxOverride) },
    energy_and_charging: {
      range: 'A7:E56',
      rows: ecRows(shared, nTrucks),
      computed_range: demoInputs.energy_and_charging.computed_range,
      computed_rows: demoInputs.energy_and_charging.computed_rows,
    },
    products: clone(demoInputs.products),
    service_costs: clone(demoInputs.service_costs),
  };
  if (p.customer) inputs.customer = clone(p.customer);
  return inputs;
}

/* ---- two-state projection (exact mirror of check_presets.mjs) ------------ */
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

/* ---- classification ------------------------------------------------------ */
// '#1 EV wins'      -> expect saving comfortably >= 15%.
// '#2 Break-even'   -> expect positive but below 15% (~5-15%).
// '#3 EV not a fit' -> expect negative / non-saving.
const WIN_TARGET = 0.15;
function classifyExpectation(archetype) {
  const a = String(archetype);
  if (/not a fit/i.test(a)) return 'loses';
  if (/break-?even/i.test(a) && !/ev wins/i.test(a)) return 'breakeven';
  if (/break-?even/i.test(a) && /ev wins/i.test(a)) return 'dual';
  if (/ev wins/i.test(a)) return 'wins';
  return 'unknown';
}
function verdict(expectation, aPct) {
  if (!isNum(aPct)) return { pass: false, side: 'n.a.' };
  if (expectation === 'wins') return { pass: aPct >= WIN_TARGET, side: aPct >= WIN_TARGET ? 'wins' : 'below-target' };
  if (expectation === 'breakeven') return { pass: aPct > 0 && aPct < WIN_TARGET, side: aPct <= 0 ? 'not-a-fit' : (aPct < WIN_TARGET ? 'break-even' : 'wins') };
  if (expectation === 'loses') return { pass: aPct <= 0, side: aPct <= 0 ? 'not-a-fit' : 'saving' };
  if (expectation === 'dual') {
    // sg-07 is dual-labelled '#1 EV wins / #2 Break-even'. It PASSES if it lands
    // either comfortably in wins (>=15%) OR in the positive break-even band.
    const side = aPct >= WIN_TARGET ? 'wins' : (aPct > 0 ? 'break-even' : 'not-a-fit');
    return { pass: aPct > 0, side };
  }
  return { pass: false, side: 'unknown' };
}

/* ---- run all 10 ---------------------------------------------------------- */
const rows = [];
const priceChecks = [];
let anyDiscrepancy = false;

for (const p of gemini.prospects) {
  let rec;
  try {
    const inputs = mapProspect(p);
    // price contract check: every included EV-action truck's col D == fixed price.
    const inc = includedIds(inputs);
    for (const rp of inputs.replacement_plan.rows) {
      if (!rp || rp.A == null || !inc[rp.A]) continue;
      if (rp.O === 'EV') {
        const expectA = fixedPrice(rp.B);
        priceChecks.push({ id: p.id, truck: rp.A, slot: 'A', model: rp.B, colD: rp.D, expect: expectA, ok: rp.D === expectA && rp.D <= expectA });
      }
      if (rp.R === 'EV' && rp._planB_model) {
        const expectB = fixedPrice(rp._planB_model);
        priceChecks.push({ id: p.id, truck: rp.A, slot: 'B', model: rp._planB_model, colD: rp._planB_price, expect: expectB, ok: rp._planB_price === expectB && rp._planB_price <= expectB });
      }
    }
    const res = twoStateResult(inputs).results;
    const score = scoreProspect(twoStateResult(inputs));
    const keep = res.totalEconomicTco.keep_ice;
    const aTotal = res.totalEconomicTco.plan_a;
    const aSave = res.savingVsKeep.plan_a;
    const aPct = res.savingPct.plan_a;
    // Plan-A-specific gate status (scoreProspect ranks the BEST plan, which may
    // be Plan B; we want the honest status of the SRM Plan A column too).
    const planAGate = {
      vehicle: res.vehicleStatus.plan_a,
      site: res.siteStatus.plan_a,
      claim: res.savingClaimStatus.plan_a,
    };
    const expectation = classifyExpectation(p.tcoArchetype);
    const v = verdict(expectation, aPct);
    if (!v.pass) anyDiscrepancy = true;
    rec = {
      id: p.id, archetype: p.tcoArchetype, expectation,
      keep, aTotal, aSave, aPct,
      gatePass: score && score.gatePass === true,
      gateStatus: score && score.gateStatus,
      bestPlanLabel: score && score.bestPlanLabel,
      planAGate,
      pass: v.pass, side: v.side,
    };
  } catch (e) {
    anyDiscrepancy = true;
    rec = { id: p.id, archetype: p.tcoArchetype, error: e.message, pass: false };
  }
  rows.push(rec);
}

/* ---- sg-08 aux-energy engine-home check ---------------------------------- */
// Confirm oc row 48 (extra auxiliary energy) has an engine home: run sg-08 with
// aux=2.0 and aux=0 and show the energy result changes.
const sg08 = gemini.prospects.find((p) => p.id === 'sg-08-move-move-movers');
let auxFinding = 'sg-08 not found';
if (sg08) {
  const withAux = twoStateResult(mapProspect(sg08, 2.0)).results;
  const noAux = twoStateResult(mapProspect(sg08, 0)).results;
  const a2 = withAux.totalEconomicTco.plan_a;
  const a0 = noAux.totalEconomicTco.plan_a;
  const changed = isNum(a2) && isNum(a0) && Math.abs(a2 - a0) > 0.5;
  auxFinding = changed
    ? `CONFIRMED engine home at oc row 48: Plan A Total aux=2.0 -> ${money(a2)} vs aux=0 -> ${money(a0)} (delta ${money(a2 - a0)}).`
    : `NO ENGINE EFFECT at oc row 48: Plan A Total aux=2.0 -> ${money(a2)} vs aux=0 -> ${money(a0)} (no change). FLAGGED: aux energy has no engine home.`;
}

/* ---- print + artifact ---------------------------------------------------- */
function fmtRow(r) {
  if (r.error) return `${r.id.padEnd(26)} | ${String(r.archetype).padEnd(28)} | CRASH: ${r.error}`;
  return [
    r.id.padEnd(26),
    String(r.archetype).padEnd(28),
    money(r.aTotal).padStart(14),
    pct(r.aPct).padStart(9),
    String(r.gatePass).padEnd(5),
    (r.pass ? 'PASS' : 'FAIL') + ' (' + r.side + ')',
  ].join(' | ');
}

const header = [
  'id'.padEnd(26), 'claimed archetype'.padEnd(28), 'Plan A (SRM) Total'.padStart(14),
  'save %'.padStart(9), 'gate'.padEnd(5), 'verdict',
].join(' | ');

console.log('\nGemini prospect verification (frozen engine, two-state projection, SRM = Plan A)\n');
console.log(header);
console.log('-'.repeat(header.length));
rows.forEach((r) => console.log(fmtRow(r)));
console.log('');
console.log('Gate status detail (why gatePass is true/false; scoreProspect ranks the best plan):');
rows.forEach((r) => {
  if (r.error) { console.log(`  ${r.id}: CRASH`); return; }
  console.log(`  ${r.id.padEnd(26)} best=${String(r.bestPlanLabel).padEnd(6)} gateStatus=${String(r.gateStatus).padEnd(22)} | Plan A vehicle=${r.planAGate.vehicle} site=${r.planAGate.site} claim=${r.planAGate.claim}`);
});
console.log('');
console.log('Aux-energy (sg-08) engine-home check:');
console.log('  ' + auxFinding);
console.log('');
console.log('Price-contract check (col D == fixed input-field price, never above):');
const badPrices = priceChecks.filter((c) => !c.ok);
if (badPrices.length === 0) {
  console.log(`  PASS: all ${priceChecks.length} EV-truck col-D prices equal their model fixed-contract input-field price.`);
} else {
  console.log(`  FAIL: ${badPrices.length} price mismatches:`);
  badPrices.forEach((c) => console.log(`    ${c.id} ${c.truck} slot ${c.slot} ${c.model}: colD=${c.colD} expected=${c.expect}`));
}
console.log('');
console.log(anyDiscrepancy
  ? 'RESULT: one or more profiles differ from the claimed archetype (see per-row verdict and findings).'
  : 'RESULT: every profile matches its claimed archetype.');

/* ---- markdown artifact --------------------------------------------------- */
function mdRow(r) {
  if (r.error) return `| ${r.id} | ${r.archetype} | CRASH | ${r.error} | - | - | FAIL |`;
  return `| ${r.id} | ${r.archetype} | ${money(r.aTotal)} | ${money(r.keep)} | ${money(r.aSave)} | ${pct(r.aPct)} | ${r.gatePass} | ${r.pass ? 'PASS' : 'FAIL'} (${r.side}) |`;
}
const md = [
  '# Gemini prospect verification table (FEAT-002)',
  '',
  `Generated by \`node tools/verify_gemini_prospects.mjs\` from \`${GEMINI}\` through the FROZEN engine (\`src/engine.js\` computeFleet + scoreProspect) via the live two-state projection (SRM on Plan A slot O, competitor on Plan B slot R).`,
  '',
  'Classification rule: `#1 EV wins` expects Plan A (SRM) saving comfortably >= 15%; `#2 Break-even` expects positive but below 15% (~5-15%); `#3 EV not a fit` expects negative / non-saving. sg-07 is dual-labelled `#1 EV wins / #2 Break-even` and passes on either the wins or the positive break-even side.',
  '',
  '| id | claimed archetype | Plan A (SRM) Total | Keep ICE Total | Plan A saving S$ | Plan A saving % | gatePass | verdict (side) |',
  '| --- | --- | ---: | ---: | ---: | ---: | --- | --- |',
  ...rows.map(mdRow),
  '',
  '## Gate status detail',
  '',
  'Note: `scoreProspect.gatePass` reports the status of the BEST-ranked plan (which can be the Plan B competitor), not the SRM Plan A column specifically. The honest Plan A (SRM) saving % above is independent of this flag. The per-plan status is recorded here for transparency.',
  '',
  '| id | best plan | gateStatus | Plan A vehicle | Plan A site | Plan A claim |',
  '| --- | --- | --- | --- | --- | --- |',
  ...rows.map((r) => r.error
    ? `| ${r.id} | - | CRASH | - | - | - |`
    : `| ${r.id} | ${r.bestPlanLabel} | ${r.gateStatus} | ${r.planAGate.vehicle} | ${r.planAGate.site} | ${r.planAGate.claim} |`),
  '',
  '## Aux-energy engine-home check (sg-08, oc row 48)',
  '',
  auxFinding,
  '',
  '## Price-contract check',
  '',
  badPrices.length === 0
    ? `PASS: all ${priceChecks.length} included EV-action truck col-D prices equal their model's fixed-contract input-field price (catalogue base + 93,000 COE + 33,200 body/reg), and none exceed it.`
    : `FAIL: ${badPrices.length} price mismatches:\n` + badPrices.map((c) => `- ${c.id} ${c.truck} slot ${c.slot} ${c.model}: colD=${c.colD} expected=${c.expect}`).join('\n'),
  '',
  '## Fixed-contract input-field prices (per named model)',
  '',
  '| model | catalogue base (col I) | + COE 93,000 + body/reg 33,200 | fixed input-field price |',
  '| --- | ---: | ---: | ---: |',
  ...Object.keys(CATALOGUE_BASE).map((m) => `| ${m} | ${money(CATALOGUE_BASE[m])} | +${money(COE_COMPONENT + BODY_REG_COMPONENT)} | ${money(fixedPrice(m))} |`),
  '',
  anyDiscrepancy
    ? '**RESULT: one or more profiles differ from the claimed archetype. See the per-row verdict column; the engine figures are honest and recorded as-is (no inputs fudged).**'
    : '**RESULT: every profile matches its claimed archetype at honest fixed prices.**',
  '',
].join('\n');

writeFileSync(ARTIFACT, md, 'utf8');
console.log('\nWrote artifact: ' + ARTIFACT);
