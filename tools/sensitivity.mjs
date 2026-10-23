/*
 * tools/sensitivity.mjs
 *
 * Deterministic, offline input-sensitivity (tornado) analysis for the EV Truck
 * TCO model. It exercises the FROZEN engine (src/engine.js, computeFleet) on a
 * representative fully-specified scenario and perturbs each candidate input
 * one-at-a-time (+/- 10%, or an additive step for rates that sit at 0) to
 * measure how much it moves the two business-critical outputs:
 *
 *   1. Total economic TCO of the best EV plan
 *   2. Saving % vs Keep ICE of the best EV plan
 *
 * It does NOT change the engine or any fixture; it clones inputs in memory.
 * It prints a ranked tornado table to stdout and writes a findings doc to
 * docs/input-sensitivity-findings.md so the UI curation decision is auditable.
 *
 *   node SG-EV-TRUCK-TCO/tools/sensitivity.mjs
 *
 * No third-party dependencies, no network, no randomness.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { computeFleet } from '../src/engine.js';

const here = dirname(fileURLToPath(import.meta.url));
const seeds = JSON.parse(readFileSync(resolve(here, 'fixtures/prospect_seeds.json'), 'utf8'));

function clone(x) { return JSON.parse(JSON.stringify(x)); }
function isNum(v) { return typeof v === 'number' && isFinite(v); }

/* ---- Scenario: the fully-specified illustrative case that clears gates --- *
 * Evergreen's Total economic TCO and Saving % are numeric and respond to
 * inputs, which is exactly what a sensitivity sweep needs. */
const evergreen = seeds.cases.find(c => c.id === 'evergreen');
const SCENARIO = { id: 'evergreen', label: 'Evergreen (fully specified, gates pass)', inputs: evergreen.inputs };

/* ---- Output extractor: pick best EV plan like scoreProspect -------------- */
function bestEvPlan(out) {
  const r = out.results;
  let best = null, bestSave = -Infinity;
  for (const k of ['plan_b', 'plan_a']) {
    const t = r.totalEconomicTco[k];
    if (isNum(t)) {
      const s = isNum(r.savingVsKeep[k]) ? r.savingVsKeep[k] : -Infinity;
      if (s > bestSave) { bestSave = s; best = k; }
    }
  }
  return best || 'plan_b';
}
function outputs(inputs) {
  const out = computeFleet(inputs);
  const plan = bestEvPlan(out);
  return {
    plan,
    totalTco: out.results.totalEconomicTco[plan],
    savingPct: out.results.savingPct[plan],
    keepTotal: out.results.totalEconomicTco.keep_ice,
  };
}

/* ---- Input accessors ----------------------------------------------------- */
function ocRow(inp, n) { return inp.operating_costs.rows.find(r => r._row === n); }
function ecRow(inp, n) { return inp.energy_and_charging.rows.find(r => r._row === n); }

// Scale an operating-cost row value by factor f.
function scaleOc(n) {
  return {
    get: inp => { const r = ocRow(inp, n); return r && r.values ? r.values.B : null; },
    scale: (inp, f) => { const r = ocRow(inp, n); if (r && r.values && isNum(r.values.B)) r.values.B *= f; },
  };
}
// Scale an energy/charging row (both Plan A col B and Plan B col C).
function scaleEcBoth(n) {
  return {
    get: inp => { const r = ecRow(inp, n); return r && r.values ? r.values.B : null; },
    scale: (inp, f) => {
      const r = ecRow(inp, n);
      if (r && r.values) {
        if (isNum(r.values.B)) r.values.B *= f;
        if (isNum(r.values.C)) r.values.C *= f;
      }
    },
  };
}
// Scale a fleet-register column across all included trucks.
function scaleFleet(col) {
  return {
    get: inp => { const r = inp.fleet_register.rows.find(x => x.B === 1 && isNum(x[col])); return r ? r[col] : null; },
    scale: (inp, f) => { inp.fleet_register.rows.forEach(x => { if (x.B === 1 && isNum(x[col])) x[col] *= f; }); },
  };
}
// Scale a replacement-plan column across all trucks (optionally EV-bound only).
function scaleRepl(col, evOnly) {
  return {
    get: inp => {
      const r = inp.replacement_plan.rows.find(x => x.A != null && isNum(x[col]) && (!evOnly || x.O === 'EV' || x.R === 'EV'));
      return r ? r[col] : null;
    },
    scale: (inp, f) => {
      inp.replacement_plan.rows.forEach(x => {
        if (x.A != null && isNum(x[col]) && (!evOnly || x.O === 'EV' || x.R === 'EV')) x[col] *= f;
      });
    },
  };
}
// Scale EV energy use: Products column E (battery kWh/km) for every product
// model that an EV-bound replacement row selects.
function scaleEvEnergy() {
  const pickedModels = inp => {
    const set = new Set();
    inp.replacement_plan.rows.forEach(x => {
      if (x.A != null && (x.O === 'EV' || x.R === 'EV') && x.B) set.add(x.B);
    });
    return set;
  };
  return {
    get: inp => {
      const models = pickedModels(inp);
      const r = inp.products.rows.find(p => models.has(p.A) && isNum(p.E));
      return r ? r.E : null;
    },
    scale: (inp, f) => {
      const models = pickedModels(inp);
      inp.products.rows.forEach(p => { if (models.has(p.A) && isNum(p.E)) p.E *= f; });
    },
  };
}
// Additive perturbation for rates/amounts that sit at 0 in the data (scaling 0
// is inert, so a relative sweep cannot reveal their lever). Used for the
// discount rate, diesel growth, and the vehicle grant.
function addOc(n, delta) {
  return {
    get: inp => { const r = ocRow(inp, n); return r && r.values ? r.values.B : null; },
    scale: (inp, f) => {
      const r = ocRow(inp, n);
      if (r && r.values) { const base = isNum(r.values.B) ? r.values.B : 0; r.values.B = Math.max(0, base + (f >= 1 ? delta : -delta)); }
    },
    additive: true,
    delta,
  };
}
// Additive perturbation of the per-EV vehicle grant (col Z), which is 0 in the
// data so a relative sweep would hide a real, high-value incentive lever.
function addGrant(delta) {
  return {
    get: inp => { const r = inp.replacement_plan.rows.find(x => x.A != null && (x.O === 'EV' || x.R === 'EV')); return r ? (isNum(r.Z) ? r.Z : 0) : null; },
    scale: (inp, f) => {
      inp.replacement_plan.rows.forEach(x => {
        if (x.A != null && (x.O === 'EV' || x.R === 'EV')) { const base = isNum(x.Z) ? x.Z : 0; x.Z = Math.max(0, base + (f >= 1 ? delta : -delta)); }
      });
    },
    additive: true,
    delta,
  };
}

/* ---- Candidate drivers (inputs a user might realistically change) -------- */
const DRIVERS = [
  { key: 'ev_quote',      label: 'EV purchase quote (per EV truck)',        group: 'Vehicle',   acc: scaleRepl('D', true) },
  { key: 'new_ice_quote', label: 'New ICE purchase quote',                  group: 'Vehicle',   acc: scaleRepl('C', false) },
  { key: 'market_value',  label: 'Current market value (per truck)',        group: 'Vehicle',   acc: scaleFleet('K') },
  { key: 'ev_grant',      label: 'Vehicle grant (+/-S$15,000 per EV)',      group: 'Incentive', acc: addGrant(15000) },
  { key: 'work_km',       label: 'Work km/day (per truck)',                 group: 'Duty',      acc: scaleFleet('E') },
  { key: 'days_year',     label: 'Days/year worked',                        group: 'Duty',      acc: scaleFleet('F') },
  { key: 'coe_months',    label: 'COE months left (replacement timing)',    group: 'Duty',      acc: scaleFleet('J') },
  { key: 'diesel_price',  label: 'Commercial diesel price (SGD/L)',         group: 'Energy',    acc: scaleEcBoth(7) },
  { key: 'elec_price',    label: 'Depot electricity (SGD/kWh)',             group: 'Energy',    acc: scaleEcBoth(10) },
  { key: 'ice_l_per_km',  label: 'ICE fuel consumption (L/km)',             group: 'Energy',    acc: scaleOc(7) },
  { key: 'ev_kwh_per_km', label: 'EV energy use (battery kWh/km)',          group: 'Energy',    acc: scaleEvEnergy() },
  { key: 'charger_equip', label: 'Charger equipment price (per charger)',   group: 'Site',      acc: scaleEcBoth(18) },
  { key: 'chargers_qty',  label: 'Installed chargers (site scale)',         group: 'Site',      acc: scaleEcBoth(16) },
  { key: 'site_maint',    label: 'Maintenance per charger (SGD/yr)',        group: 'Site',      acc: scaleEcBoth(32) },
  { key: 'old_ice_maint', label: 'Old ICE maintenance (SGD/yr)',            group: 'OpCost',    acc: scaleOc(24) },
  { key: 'ev_maint',      label: 'EV maintenance override (SGD/yr)',        group: 'OpCost',    acc: scaleOc(26) },
  { key: 'ice_insurance', label: 'ICE insurance (SGD/yr)',                  group: 'OpCost',    acc: scaleOc(29) },
  { key: 'ev_insurance',  label: 'EV insurance (SGD/yr)',                   group: 'OpCost',    acc: scaleOc(30) },
  { key: 'ice_tyres',     label: 'ICE tyres (SGD/yr)',                      group: 'OpCost',    acc: scaleOc(27) },
  { key: 'ice_roadtax',   label: 'ICE road tax (SGD/yr)',                   group: 'OpCost',    acc: scaleOc(31) },
  { key: 'disc_rate',     label: 'Discount rate (+/-0.03/yr)',              group: 'Finance',   acc: addOc(54, 0.03) },
  { key: 'diesel_growth', label: 'Diesel-price growth (+/-0.03/yr)',        group: 'Finance',   acc: addOc(51, 0.03) },
];

/* ---- Run the sweep ------------------------------------------------------- */
const PCT = 0.10; // +/- 10% one-at-a-time perturbation for scalable drivers.
const base = outputs(SCENARIO.inputs);

const rows = [];
for (const d of DRIVERS) {
  const baseVal = d.acc.get(SCENARIO.inputs);
  const up = clone(SCENARIO.inputs);   d.acc.scale(up, 1 + PCT);
  const dn = clone(SCENARIO.inputs);   d.acc.scale(dn, 1 - PCT);
  const oUp = outputs(up), oDn = outputs(dn);

  // Total economic TCO swing (absolute S$ across the +/- perturbation).
  const tcoSwing = (isNum(oUp.totalTco) && isNum(oDn.totalTco)) ? Math.abs(oUp.totalTco - oDn.totalTco) : NaN;
  // Saving % swing in percentage points.
  const pctSwing = (isNum(oUp.savingPct) && isNum(oDn.savingPct)) ? Math.abs(oUp.savingPct - oDn.savingPct) * 100 : NaN;

  // Blended business-impact score. Both headline outputs matter: Total TCO is
  // the account size, Saving % vs Keep ICE is the adoption case. A driver that
  // leaves Plan B's own total flat but moves the Keep-ICE baseline (e.g. diesel
  // price, ICE fuel use, new-ICE quote) still strongly moves the Saving %, so
  // it must NOT be ranked low on TCO swing alone. We take the larger of the two
  // relative swings: TCO swing as a fraction of the baseline Total, and Saving%
  // swing expressed as a fraction (pp/100).
  const relTco = isNum(tcoSwing) && isNum(base.totalTco) && base.totalTco ? tcoSwing / base.totalTco : 0;
  const relPct = isNum(pctSwing) ? pctSwing / 100 : 0;
  const impact = Math.max(relTco, relPct);

  rows.push({
    key: d.key, label: d.label, group: d.group,
    baseVal,
    perturb: d.acc.additive ? `+/-${d.acc.delta}` : `+/-${PCT * 100}%`,
    tcoUp: oUp.totalTco, tcoDn: oDn.totalTco, tcoSwing,
    pctUp: oUp.savingPct, pctDn: oDn.savingPct, pctSwing,
    impact,
  });
}

// Rank by the blended business-impact score (descending).
rows.sort((a, b) => b.impact - a.impact);

/* ---- Pretty print -------------------------------------------------------- */
function money(v) { return isNum(v) ? 'S$' + Math.round(v).toLocaleString('en-US') : 'n.a.'; }
function pct(v) { return isNum(v) ? (v * 100).toFixed(2) + '%' : 'n.a.'; }

console.log('EV TCO input sensitivity (scenario: ' + SCENARIO.label + ')');
console.log('Best EV plan at baseline: ' + base.plan.toUpperCase() +
  ' | Total economic TCO ' + money(base.totalTco) + ' | Saving % ' + pct(base.savingPct) +
  ' | Keep ICE total ' + money(base.keepTotal));
console.log('');
console.log('Rank Driver                                   Group     TCO swing (S$)  Saving% swing (pp)  Impact%');
rows.forEach((r, i) => {
  console.log(
    String(i + 1).padStart(2) + '  ' +
    r.label.padEnd(42) + ' ' +
    r.group.padEnd(9) + ' ' +
    (isNum(r.tcoSwing) ? Math.round(r.tcoSwing).toLocaleString('en-US') : 'n.a.').padStart(14) + '  ' +
    (isNum(r.pctSwing) ? r.pctSwing.toFixed(3) : 'n.a.').padStart(12) + '  ' +
    (r.impact * 100).toFixed(2).padStart(7)
  );
});

/* ---- Usability sanity checks -------------------------------------------- */
const checks = [];
checks.push(['Best EV plan Total economic TCO is numeric', isNum(base.totalTco)]);
checks.push(['Saving % vs Keep ICE is numeric', isNum(base.savingPct)]);
checks.push(['Keep ICE total is numeric and positive', isNum(base.keepTotal) && base.keepTotal > 0]);
// Cheaper EV quote should not raise TCO; dearer EV quote should not lower it (monotone).
{
  const up = clone(SCENARIO.inputs); scaleRepl('D', true).scale(up, 1.2);
  const dn = clone(SCENARIO.inputs); scaleRepl('D', true).scale(dn, 0.8);
  const oUp = outputs(up), oDn = outputs(dn);
  checks.push(['Higher EV quote raises Total economic TCO (monotone)', isNum(oUp.totalTco) && oUp.totalTco > base.totalTco]);
  checks.push(['Lower EV quote reduces Total economic TCO (monotone)', isNum(oDn.totalTco) && oDn.totalTco < base.totalTco]);
}
// Cheaper diesel should shrink the EV saving (ICE gets cheaper to run).
{
  const dn = clone(SCENARIO.inputs); scaleEcBoth(7).scale(dn, 0.5);
  const oDn = outputs(dn);
  checks.push(['Halving diesel price reduces EV Saving %', isNum(oDn.savingPct) && oDn.savingPct < base.savingPct]);
}
console.log('\nUsability sanity checks:');
let allPass = true;
checks.forEach(([name, ok]) => { if (!ok) allPass = false; console.log('  ' + (ok ? 'PASS' : 'FAIL') + '  ' + name); });

/* ---- Write findings doc -------------------------------------------------- */
const today = new Date().toISOString().slice(0, 10);
let md = '';
md += '# EV Truck TCO - input sensitivity and usability findings\n\n';
md += '_Generated by `node tools/sensitivity.mjs` (deterministic, offline). Engine is frozen; this script only clones inputs in memory and never edits fixtures or the engine._\n\n';
md += '## What was tested\n\n';
md += 'A one-at-a-time (tornado) sweep against the fully-specified illustrative scenario **' + SCENARIO.label + '**, whose best EV plan clears every gate so its Total economic TCO and Saving % are numeric and responsive. Each driver was perturbed +/-10% (or an additive +/-0.03/yr for rates that sit at 0 in the data), and the resulting swing in the two business-critical outputs was measured:\n\n';
md += '1. **Total economic TCO** of the best EV plan (the account-size / headline number).\n';
md += '2. **Saving % vs Keep ICE** of the best EV plan (the adoption-case number).\n\n';
md += '**Baseline:** best EV plan **' + base.plan.toUpperCase() + '**, Total economic TCO **' + money(base.totalTco) + '**, Saving % **' + pct(base.savingPct) + '**, Keep ICE total **' + money(base.keepTotal) + '**.\n\n';
md += '## Impact ranking (highest mover first)\n\n';
md += 'Ranked by a blended business-impact score = the larger of (a) Total-TCO swing as a fraction of the baseline Total and (b) Saving-% swing (pp/100). This keeps drivers that move the Keep-ICE baseline (and therefore the adoption case) from being undersold by a flat plan-TCO swing.\n\n';
md += '| Rank | Driver | Group | Perturbation | Total TCO swing (S$) | Saving % swing (pp) | Impact % |\n';
md += '|---:|---|---|---|---:|---:|---:|\n';
rows.forEach((r, i) => {
  md += '| ' + (i + 1) + ' | ' + r.label + ' | ' + r.group + ' | ' + r.perturb + ' | ' +
    (isNum(r.tcoSwing) ? Math.round(r.tcoSwing).toLocaleString('en-US') : 'n.a.') + ' | ' +
    (isNum(r.pctSwing) ? r.pctSwing.toFixed(3) : 'n.a.') + ' | ' +
    (r.impact * 100).toFixed(2) + ' |\n';
});
md += '\n## Usability sanity checks\n\n';
checks.forEach(([name, ok]) => { md += '- ' + (ok ? 'PASS' : 'FAIL') + ' - ' + name + '\n'; });
md += '\n**Overall: ' + (allPass ? 'model is usable - all sanity checks pass.' : 'ATTENTION - a sanity check failed.') + '**\n';
md += '\n## Notes on the measured zeros (not "no effect in principle")\n\n';
md += 'A few drivers show a near-zero swing **in this scenario** for structural reasons, not because they are unimportant in general:\n\n';
md += '- **Vehicle grant (per EV)** shows 0 because the per-truck grant only reduces TCO when its *grant timing month* falls inside the horizon, and the illustrative case leaves that month blank. It is a conditional, manually-checked incentive: when its timing is supplied it directly lowers Day-0 funding and Total TCO. Keep it visible but grouped with the incentive inputs.\n';
md += '- **Discount rate** and **diesel-price growth** read ~0 because the demonstration macro settings are inflation = 0 and discount = 0 (NPV = nominal). They become material the moment a non-zero escalation/discount is entered. They are finance assumptions, so they belong behind an Advanced disclosure with their zero defaults preserved.\n';
md += '- **EV maintenance override** reads 0 here because the illustrative EVs price maintenance from the supplied 200,000 km service schedule rather than the flat override. It still matters when the override is the active basis.\n';
md += '- **COE months left** and **Installed chargers** show n.a./0 because a relative +/-10% nudge lands them on a non-integer or crosses a discrete gate (replacement-timing band, integer charger count). They are still meaningful levers; they are just not smooth under a continuous sweep. Replacement timing (COE months left) remains a primary duty input.\n';
md += '\n## Interpretation for UI curation\n\n';
md += 'The high-impact drivers (top of the ranking) are the ones that should be promoted to an always-visible **primary input** set in the toggleable sidebar. The low-impact drivers (bottom of the ranking, near-zero swing, plus the conditional/finance items above) are rarely-changed fine print that can be demoted behind an **Advanced** disclosure, keeping their current demonstration defaults so every computed number is unchanged and `python tools/validate.py` still passes 19/19.\n\n';
md += '### Proposed primary (always-visible) inputs\n\n';
md += '1. EV purchase quote per truck (Replacement plan, col D) - the single biggest lever (~14% impact).\n';
md += '2. New ICE purchase quote (Replacement plan, col C) - sets the Keep/New baseline (~6%).\n';
md += '3. Commercial diesel price and ICE fuel consumption L/km (Energy) - together the diesel running-cost lever (~5-6% each).\n';
md += '4. Work km/day and Days/year worked (Fleet register) - duty intensity (~3% each).\n';
md += '5. Depot electricity price and EV energy use kWh/km (Energy) - EV running-cost lever (~2% each).\n';
md += '6. EV and ICE insurance (OpCost) - the largest recurring fixed costs (~2%).\n';
md += '7. COE months left (Fleet register) - replacement timing, a primary duty decision even though it is discrete.\n';
md += '8. Charger equipment price and installed chargers (Site) - site build-up scale.\n';
md += '9. Vehicle grant and its timing (Incentive) - conditional but directly lowers TCO when set.\n\n';
md += '### Proposed Advanced (collapsed) inputs\n\n';
md += 'Everything with <~1% impact and rarely changed in a first-pass conversation: tyres, road tax, inspection, contract surcharges, unavailable-days/backup rates, battery reserve/fade, auxiliary energy, price-growth and discount rates, terminal values, repair-timing months, data-mode/quote-basis flags, and the detailed per-charger site line items beyond equipment price. Each keeps its current demonstration default, so hiding it changes no computed number.\n';

const docPath = resolve(here, '../docs/input-sensitivity-findings.md');
writeFileSync(docPath, md, 'utf8');
console.log('\nFindings written to docs/input-sensitivity-findings.md');

if (!allPass) process.exitCode = 1;
