#!/usr/bin/env node
/*
 * tools/check_index.mjs
 * Headless sanity harness for index.html. Provides a tiny DOM + window shim,
 * evaluates the INLINED engine + demo + controller scripts straight out of
 * index.html (not src/engine.js), and asserts the demo figures render.
 * No third-party dependencies.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(here, '..', 'index.html'), 'utf8');

// Extract every <script>...</script> body (in document order).
const scripts = [];
const re = /<script>([\s\S]*?)<\/script>/g;
let m;
while ((m = re.exec(html)) !== null) scripts.push(m[1]);
if (scripts.length < 4) throw new Error('Expected >=4 inline scripts, found ' + scripts.length);

// Minimal DOM shim. Elements collect innerHTML/children; listeners are stored.
function makeEl(tag) {
  return {
    tagName: tag, _html: '', style: {}, children: [], attributes: {},
    listeners: {}, value: '',
    // Setting innerHTML replaces content: mirror the real DOM by also dropping
    // any previously-appended children (so re-rendered containers do not
    // accumulate stale nodes across repeated builds). Clearing to '' is the
    // common reset the controller uses before rebuilding a table/card list.
    set innerHTML(v) { this._html = v; this.children = []; }, get innerHTML() { return this._html; },
    set textContent(v) { this._text = v; }, get textContent() { return this._text || ''; },
    appendChild(c) { this.children.push(c); return c; },
    addEventListener(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); },
    setAttribute(k, v) { this.attributes[k] = v; },
    getAttribute(k) { return this.attributes[k]; },
    fire(ev, extra) {
      const evt = Object.assign({ target: this, currentTarget: this }, extra || {});
      (this.listeners[ev] || []).forEach((fn) => fn(evt));
    },
  };
}
const byId = {};
const ids = ['decision-cards','decision-lead','decision-notice','results-body','site-body',
  'gates-body','review-body','sens-body','sens-controls','fleet-cards','add-truck-btn',
  'oc-form','ec-body','reset-btn','demo-banner',
  'prospect-body','prospect-sort','prospect-current-btn','prospect-note',
  // FEAT-002: curation split containers + toggleable sidebar hooks.
  'oc-form-adv','ec-body-adv','advanced-inputs',
  // FEAT-004: input overlay panel hooks (scrim + in-panel close button).
  'sidebar-toggle','sidebar-toggle-label','input-col','results-col',
  'input-scrim','input-overlay-close',
  // FEAT-005: journey stepper, stage viewports + confidence badge hooks.
  'stepper','step-customer','step-portfolio','step-tco','step-charging','step-proposal',
  'stage-customer','stage-portfolio','stage-tco','stage-charging','stage-proposal',
  'confidence-badge','confidence-dot','confidence-text','stage-open-inputs'];
ids.forEach((id) => { byId[id] = makeEl('div'); });

const document = {
  getElementById: (id) => byId[id] || (byId[id] = makeEl('div')),
  createElement: (t) => makeEl(t),
};
const windowObj = {};
const sandbox = { window: windowObj, document, console, JSON, Math, Number, String, Object, isFinite, Array };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

// Run each script in order (engine, demo, controller, input UI).
for (const code of scripts) {
  vm.runInContext(code, sandbox);
}

// Direct engine check through the inlined namespace.
const out = windowObj.HSEngine.computeFleet(windowObj.HSDemoCase.inputs);
const r = out.results;
const NA = windowObj.HSEngine.NA;

function approx(a, b, tol) { return typeof a === 'number' && Math.abs(a - b) < tol; }
const checks = [];
checks.push(['Keep ICE vehicle TCO', approx(r.vehicleEconomicTco.keep_ice, 2081781.0, 0.5)]);
checks.push(['New ICE vehicle TCO', approx(r.vehicleEconomicTco.all_new_ice, 2103081.0, 0.5)]);
checks.push(['Plan A vehicle TCO', approx(r.vehicleEconomicTco.plan_a, 2046736.015175529, 0.5)]);
checks.push(['Plan B vehicle TCO', approx(r.vehicleEconomicTco.plan_b, 1986546.0455265818, 0.5)]);
checks.push(['Day-0 funding New ICE', approx(r.day0Funding.all_new_ice, 852000, 0.5)]);
checks.push(['Cost/km Keep', approx(r.costPerKm.keep_ice, 0.77103, 1e-4)]);
checks.push(['Truck count 6', r.truckCount.keep_ice === 6]);
checks.push(['Plan A net site n.a.', r.netSiteCost.plan_a === NA]);
checks.push(['Review duty coverage PASS', out.review.dutyCoverage.status === 'PASS']);

// Rendered DOM checks: controller must have populated results + decision + banner.
checks.push(['results-body rendered', byId['results-body'].innerHTML.indexOf('Vehicle economic TCO') !== -1]);
checks.push(['results shows 2,081,781', byId['results-body'].innerHTML.indexOf('2,081,781') !== -1]);
checks.push(['n.a. rendered not 0', byId['results-body'].innerHTML.indexOf('n.a.') !== -1]);
checks.push(['decision cards rendered', byId['decision-cards'].innerHTML.indexOf('Keep ICE') !== -1]);
checks.push(['review rendered PASS', byId['review-body'].innerHTML.indexOf('PASS') !== -1]);
// FEAT-002: the wide fleet/replacement tables are replaced by a per-truck card
// stack (#fleet-cards). The demonstration 6-truck case must still render six
// cards on initial load, and each card must carry a data-truck-id matching the
// included fleet IDs (fleet + replacement are merged into one card per truck).
function truckCards() {
  return (byId['fleet-cards'].children || []).filter(
    (c) => (c.attributes && c.attributes['data-truck-id'] != null));
}
checks.push(['fleet rows built (6 truck cards on demo load)', truckCards().length === 6]);
const demoCardIds = truckCards().map((c) => c.attributes['data-truck-id']);
checks.push(['truck cards carry the demo fleet IDs (T001..T006)',
  ['T001', 'T002', 'T003', 'T004', 'T005', 'T006'].every((id) => demoCardIds.indexOf(id) !== -1)]);
// Replacement plan stays ID-consistent with the fleet register: every included
// fleet ID has a matching replacement_plan row with the same ID (col A).
const replIds = windowObj.__HS.state.replacement_plan.rows
  .filter((r) => r.A != null).map((r) => String(r.A));
checks.push(['replacement rows ID-consistent with the 6 demo trucks',
  demoCardIds.every((id) => replIds.indexOf(String(id)) !== -1)]);
checks.push(['sensitivity rendered', byId['sens-body'].innerHTML.indexOf('Keep ICE') !== -1]);

// ---- Prospects view checks -------------------------------------------------
const seeds = windowObj.HSProspectSeeds;
checks.push(['prospect seeds embedded (4)', !!seeds && Array.isArray(seeds.cases) && seeds.cases.length === 4]);
checks.push(['scoreProspect exposed', typeof windowObj.HSEngine.scoreProspect === 'function']);

const pbodyBenefit = byId['prospect-body'].innerHTML;
checks.push(['prospect table rendered', pbodyBenefit.indexOf('Why this rank') !== -1]);
checks.push(['prospect lists Evergreen (illustrative)', pbodyBenefit.indexOf('Evergreen Logistics') !== -1]);
checks.push(['prospect lists demo', pbodyBenefit.indexOf('DEMONSTRATION 6-truck case') !== -1]);
checks.push(['prospect lists Yong Wen', pbodyBenefit.indexOf('Yong Wen') !== -1]);
checks.push(['prospect lists Venus', pbodyBenefit.indexOf('Venus') !== -1]);
checks.push(['prospect exposes components', pbodyBenefit.indexOf('Account key') !== -1 && pbodyBenefit.indexOf('Benefit key') !== -1]);

// ---- Confirmed-win assertion (review finding #2) ---------------------------
// At least one seeded prospect must be a gate-passing confirmed win: gatePass
// true, a numeric Total economic TCO (not n.a.), a positive saving, and it must
// lead at least one of the two sort modes.
const scoredSeeds = seeds.cases.map((c) => ({
  id: c.id, s: windowObj.HSEngine.scoreProspect(windowObj.HSEngine.computeFleet(c.inputs)),
}));
const confirmedWins = scoredSeeds.filter((x) =>
  x.s.gatePass === true &&
  typeof x.s.totalEconomicTco === 'number' && isFinite(x.s.totalEconomicTco) &&
  typeof x.s.savingAbs === 'number' && x.s.savingAbs > 0 &&
  typeof x.s.savingPct === 'number' && x.s.savingPct > 0);
checks.push(['at least one confirmed-win seed', confirmedWins.length >= 1]);
checks.push(['confirmed win is Evergreen', confirmedWins.some((x) => x.id === 'evergreen')]);
const evergreen = scoredSeeds.find((x) => x.id === 'evergreen');
checks.push(['Evergreen gatePass true', evergreen && evergreen.s.gatePass === true]);
checks.push(['Evergreen numeric Total', evergreen && typeof evergreen.s.totalEconomicTco === 'number']);
checks.push(['Evergreen positive saving S$', evergreen && evergreen.s.savingAbs > 0]);
checks.push(['Evergreen meets 15% target label', evergreen && evergreen.s.fifteenTargetMet === 'Meets entered 15% target']);

// Direct score check on the seeds through the inlined engine.
function orderFor(mode) {
  return seeds.cases
    .map((c) => ({ id: c.id, s: windowObj.HSEngine.scoreProspect(windowObj.HSEngine.computeFleet(c.inputs)) }))
    .sort((a, b) => {
      const ka = mode === 'benefit' ? a.s.benefitKey : a.s.accountKey;
      const kb = mode === 'benefit' ? b.s.benefitKey : b.s.accountKey;
      const na = typeof ka === 'number' && isFinite(ka);
      const nb = typeof kb === 'number' && isFinite(kb);
      if (!na) return 1; if (!nb) return -1; return kb - ka;
    })
    .map((x) => x.id);
}
const accountOrder = orderFor('account');
const benefitOrder = orderFor('benefit');
// The confirmed-win illustrative case (Evergreen) leads BOTH sort modes: it has
// the largest absolute saving and it is the only gate-passing benefit figure.
checks.push(['account order evergreen first', accountOrder[0] === 'evergreen']);
checks.push(['benefit order evergreen first', benefitOrder[0] === 'evergreen']);
// Among the flagged reconstructions the 5-truck Yong Wen still ranks ahead of
// the 3-truck Venus (larger vehicle-only benefit), and both ahead of the demo.
checks.push(['account order yong_wen before venus', accountOrder.indexOf('yong_wen') < accountOrder.indexOf('venus')]);
checks.push(['account order venus before demo', accountOrder.indexOf('venus') < accountOrder.indexOf('demo')]);

// Toggle the live sort control and confirm the rendered order changes.
const sel = byId['prospect-sort'];
const beforeHtml = byId['prospect-body'].innerHTML;
sel.value = 'account';
sel.fire('change');
const afterHtml = byId['prospect-body'].innerHTML;
checks.push(['sort toggle reorders table', beforeHtml !== afterHtml]);
// In account order the confirmed-win Evergreen case leads, and among the
// flagged reconstructions Yong Wen precedes the demonstration case.
checks.push(['account sort puts Evergreen on top',
  afterHtml.indexOf('Evergreen Logistics') < afterHtml.indexOf('Yong Wen') &&
  afterHtml.indexOf('Evergreen Logistics') < afterHtml.indexOf('DEMONSTRATION')]);
checks.push(['account sort Yong Wen before demo', afterHtml.indexOf('Yong Wen') < afterHtml.indexOf('DEMONSTRATION')]);

// ---- Live inline-SVG charts (FEAT-003) ------------------------------------
// The Charts module renders inline SVG strings into the chart containers from
// the SAME engine output as the table. These assertions prove: (a) each chart
// container holds emitted SVG markup after the controllers run; (b) firing a
// sensitivity slider 'input' event redraws the sensitivity chart (live update);
// (c) changing an amber input redraws the comparison charts (live update);
// (d) an n.a. total is drawn as a hatched 'n.a.' marker, never a zero bar.
const chartIds = ['chart-cumulative','chart-total','chart-target','chart-day0','chart-sens'];
chartIds.forEach((id) => {
  const h = byId[id] ? byId[id].innerHTML : '';
  checks.push([id + ' emits <svg>', h.indexOf('<svg') !== -1]);
});
// The cumulative chart draws real geometry (polyline/circle for the numeric runs).
const cumHtml = byId['chart-cumulative'].innerHTML;
checks.push(['cumulative chart draws polyline/point',
  cumHtml.indexOf('polyline') !== -1 || cumHtml.indexOf('<circle') !== -1]);
// The bar charts draw <rect> bars.
checks.push(['total chart draws rect bars', byId['chart-total'].innerHTML.indexOf('<rect') !== -1]);
checks.push(['day0 chart draws rect bars', byId['chart-day0'].innerHTML.indexOf('<rect') !== -1]);

// n.a. is honoured, not drawn as a zero bar. For the demo case plan_a/plan_b
// totalEconomicTco is n.a., so the TCO bar chart MUST carry an 'n.a.' marker and
// MUST use the hatched placeholder pattern (url(#hatch_...)) rather than a solid
// full-height-from-zero bar implying zero cost.
checks.push(['demo plan_a Total is n.a.', r.totalEconomicTco.plan_a === NA]);
checks.push(['demo plan_b Total is n.a.', r.totalEconomicTco.plan_b === NA]);
const totalHtml = byId['chart-total'].innerHTML;
checks.push(['total chart marks n.a. (not zero bar)',
  totalHtml.indexOf('n.a.') !== -1 && totalHtml.indexOf('url(#hatch') !== -1]);
const day0Html = byId['chart-day0'].innerHTML;
checks.push(['day0 chart marks n.a. (not zero bar)',
  day0Html.indexOf('n.a.') !== -1 && day0Html.indexOf('url(#hatch') !== -1]);

// Live update #1: dragging the UNIFIED shared-driver slider ('input' event)
// redraws the sensitivity-response chart. The drivers are appended under
// #sens-controls as panels [h3, input[type=range], input[type=number], div];
// each slider now writes its canonical state field and runs the ONE recompute
// (Task A), so firing it must be observed synchronously -> force sync mode.
// Grab the first driver's slider (range) and fire 'input'.
if (typeof windowObj.__HS.setSyncRecompute === 'function') windowObj.__HS.setSyncRecompute(true);
const sensControls = byId['sens-controls'];
function driverControls(panel) {
  // Returns { slider, box } for a driver panel: slider is input[type=range],
  // box is input[type=number].
  const inputs = (panel.children || []).filter((c) => c.tagName === 'input');
  const slider = inputs.find((c) => c.type === 'range') || inputs[0];
  const box = inputs.find((c) => c.type === 'number') || inputs[1];
  return { slider, box };
}
let sensSlider = null;
if (sensControls && sensControls.children.length) {
  sensSlider = driverControls(sensControls.children[0]).slider;
}
checks.push(['sensitivity slider present', !!sensSlider]);
const sensBefore = byId['chart-sens'].innerHTML;
if (sensSlider) {
  sensSlider.value = String(Number(sensSlider.value) + 1);
  sensSlider.fire('input');
}
const sensAfter = byId['chart-sens'].innerHTML;
checks.push(['sensitivity chart updates live on slider input',
  !!sensSlider && sensBefore !== sensAfter && sensAfter.indexOf('<svg') !== -1]);

// ---- FEAT-003 (A): unified shared diesel driver, no clone divergence -------
// The sensitivity section is a LIVE reflection of committed state (Q6 Option
// A): driving the commercial-diesel driver through its control must update BOTH
// the main results path AND the sensitivity table to the SAME value (the old
// bug kept a separate JSON clone + sensVals store so the slider and the input
// box diverged). Find the diesel driver (first panel, label mentions 'diesel'),
// drive a new litre price through its number box, and assert that the engine
// now reads that exact value on ec row 7 (B and C, the Q5 A/B pair) AND that
// the sens-body renders the recomputed numbers (committed state, not a clone).
function panelLabel(panel) {
  const h = (panel.children || []).find((c) => c.tagName === 'h3');
  return (h && (h.textContent || '')) || '';
}
let dieselPanel = null;
for (const p of (sensControls.children || [])) {
  if (/diesel/i.test(panelLabel(p))) { dieselPanel = p; break; }
}
checks.push(['unified diesel driver present', !!dieselPanel]);
const dieselCtl = dieselPanel ? driverControls(dieselPanel) : {};
const DRIVEN_DIESEL = 3.33;
const sensBodyBeforeDiesel = byId['sens-body'].innerHTML;
if (dieselCtl.box) { dieselCtl.box.value = String(DRIVEN_DIESEL); dieselCtl.box.fire('input'); }
// Canonical state field the engine reads for row 7: Plan A col B only.
const ecRow7 = windowObj.__HS.state.energy_and_charging.rows.find((row) => row._row === 7);
// The engine reads ec[7].B, so this is the assertion that proves per-plan
// engine correctness for the driven commercial diesel value.
checks.push(['driver writes committed state the engine reads (ec row7 B)',
  !!ecRow7 && ecRow7.values.B === DRIVEN_DIESEL]);
// The unified commercial control keeps the Plan A/B pair in sync (setter forces
// C == B). The engine never reads ec[7].C, so this only proves the pair is
// written consistently, NOT per-plan engine correctness (which col B covers).
checks.push(['unified commercial control keeps Plan A/B pair in sync (ec row7 C == B)',
  !!ecRow7 && ecRow7.values.C === ecRow7.values.B]);
// Because ec[7].C is a dead (engine-unread, auto-synced) column, the primary
// energy table must NOT offer it as an editable input: rows 7 and 10 render
// their Plan B (col C) cell as a non-editable mirror of Plan A (a span carrying
// data-mirror-of="B" + data-ec-row), not an <input>. Walk the shim tree to find
// every mirror span and confirm one exists per driven row, and that no editable
// <input> was rendered inside those rows' col C.
function collectMirrorSpans(node, acc) {
  if (!node || typeof node !== 'object') return acc;
  const tag = (node.tagName || '').toLowerCase();
  const isMirror = tag === 'span' &&
    node.attributes && node.attributes['data-mirror-of'] === 'B' &&
    node.attributes['data-ec-row'] != null;
  if (isMirror) acc.push(node);
  (node.children || []).forEach((child) => collectMirrorSpans(child, acc));
  return acc;
}
const mirrorSpans = collectMirrorSpans(byId['ec-body'], []);
const mirroredRows = [7, 10];
const mirroredOk = mirroredRows.every((rowNum) =>
  mirrorSpans.filter((s) => Number(s.attributes['data-ec-row']) === rowNum).length === 1);
checks.push(['primary table rows 7/10 Plan B (col C) is non-editable mirror, not input',
  mirroredOk && mirrorSpans.length === mirroredRows.length]);
// The driver updates the number box and the slider together (single source).
checks.push(['driver slider mirrors driven value',
  !!dieselCtl.slider && Number(dieselCtl.slider.value) === DRIVEN_DIESEL]);
// The sensitivity table recomputed from the SAME committed state (no clone):
// the rendered sens-body changed and the money view (results-body) reflects the
// identical driven engine run. Recompute the engine from committed state and
// confirm the sens-body Keep ICE total matches the main results Keep ICE total.
const sensBodyAfterDiesel = byId['sens-body'].innerHTML;
checks.push(['sens table reflects driven diesel (no clone divergence)',
  sensBodyBeforeDiesel !== sensBodyAfterDiesel]);
const drivenOut = windowObj.HSEngine.computeFleet(windowObj.__HS.state);
function fmtMoneyCell(v) {
  if (v === NA || v == null || typeof v !== 'number' || !isFinite(v)) return null;
  const neg = v < 0, a = Math.abs(v);
  const s = 'S$' + a.toLocaleString('en-SG', { maximumFractionDigits: 0 });
  return neg ? '-' + s : s;
}
const keepTotalCell = fmtMoneyCell(drivenOut.results.totalEconomicTco.keep_ice);
checks.push(['sens table + results agree on driven value (same source of truth)',
  !!keepTotalCell &&
  byId['sens-body'].innerHTML.indexOf(keepTotalCell) !== -1 &&
  byId['results-body'].innerHTML.indexOf(keepTotalCell) !== -1]);

// ---- FEAT-003 (B): live configurable saving-target control -----------------
// A shared saving-target driver (slider + number, shown as a percentage) binds
// to the top-level state.savingTarget field FEAT-002 introduced. It defaults to
// 0.15 (the engine's resolveSavingTarget domain default; the demo fixture sets
// no savingTarget). Moving it must change the rendered headroom / claim label
// live, while the DEFAULT path still yields 'Meets entered 15% target'.
let targetPanel = null;
for (const p of (sensControls.children || [])) {
  if (/target/i.test(panelLabel(p))) { targetPanel = p; break; }
}
checks.push(['saving-target control present', !!targetPanel]);
const targetCtl = targetPanel ? driverControls(targetPanel) : {};
// Initial value reflects the 0.15 default (the demo sets no savingTarget).
checks.push(['saving-target defaults to 0.15',
  !!targetCtl.slider && Math.abs(Number(targetCtl.slider.value) - 0.15) < 1e-9]);
// With the default target the engine still emits the exact legacy claim label.
const defaultTargetOut = windowObj.HSEngine.computeFleet(windowObj.__HS.state);
// (state.savingTarget is still unset here -> engine defaults to 0.15.)
const evForLabel = scoredSeeds.find((x) => x.id === 'evergreen');
checks.push(['default target still yields Meets entered 15% target',
  evForLabel && evForLabel.s.fifteenTargetMet === 'Meets entered 15% target']);
// Moving the target changes the rendered headroom row + the claim label. Drive
// the target to 0.25 and confirm the results-body headroom label + decision
// claim both reflect the new committed target, then restore the default.
const headroomBefore = byId['results-body'].innerHTML;
if (targetCtl.box) { targetCtl.box.value = '0.25'; targetCtl.box.fire('input'); }
checks.push(['saving-target writes committed state.savingTarget',
  windowObj.__HS.state.savingTarget === 0.25]);
const headroomAfter = byId['results-body'].innerHTML;
checks.push(['moving target relabels headroom row (25%)',
  headroomBefore !== headroomAfter && headroomAfter.indexOf('25% fleet saving headroom') !== -1]);
// The sens-table headroom column header also tracks the committed target.
checks.push(['moving target relabels sens headroom header (25%)',
  byId['sens-body'] && byId['sens-headroom-th'] &&
  byId['sens-headroom-th'].textContent === '25% headroom']);
// The 'Meets/Below entered X% target' claim label is conditional (never an
// adoption probability) and only renders for a gate-passing case. Prove the
// label reflects the committed target through the engine on the gate-passing
// Evergreen seed: at the default 0.15 it reads 'Meets entered 15% target'; at a
// higher 0.30 target the SAME case flips to 'Below entered 30% target'.
const everAtDefault = windowObj.HSEngine.scoreProspect(
  windowObj.HSEngine.computeFleet(seeds.cases.find((c) => c.id === 'evergreen').inputs));
const everInputsHi = JSON.parse(JSON.stringify(seeds.cases.find((c) => c.id === 'evergreen').inputs));
everInputsHi.savingTarget = 0.30;
const everAtHi = windowObj.HSEngine.scoreProspect(windowObj.HSEngine.computeFleet(everInputsHi));
checks.push(['claim label reflects committed target (default 15% met)',
  everAtDefault.fifteenTargetMet === 'Meets entered 15% target']);
checks.push(['claim label reflects committed target (30% below, conditional)',
  everAtHi.fifteenTargetMet === 'Below entered 30% target']);
// n.a. propagation preserved at the extreme: driving the target does not turn
// an n.a. headroom into a fake zero (the demo plan_a/plan_b totals are n.a.).
checks.push(['target move keeps n.a. (no fake zero)',
  byId['sens-body'].innerHTML.indexOf('n.a.') !== -1]);
// Restore the default target so later assertions see the baseline.
if (targetCtl.box) { targetCtl.box.value = '0.15'; targetCtl.box.fire('input'); }
// Restore diesel so the later 'change' live-update assertions compare cleanly.
if (dieselCtl.box) {
  const demoDiesel = windowObj.HSDemoCase.inputs.energy_and_charging.rows.find((row) => row._row === 7);
  if (demoDiesel) { dieselCtl.box.value = String(demoDiesel.values.B); dieselCtl.box.fire('input'); }
}
if (typeof windowObj.__HS.setSyncRecompute === 'function') windowObj.__HS.setSyncRecompute(false);

// Live update #2: changing an amber input and recomputing redraws the
// comparison charts (they read from the same computeFleet(state) output).
const totalBefore = byId['chart-total'].innerHTML;
windowObj.__HS.state.energy_and_charging.rows.forEach((row) => {
  if (row._row === 7) { row.values.B = 99; row.values.C = 99; }
});
windowObj.__HS.recompute();
const totalAfter = byId['chart-total'].innerHTML;
checks.push(['comparison charts update live on input change',
  totalBefore !== totalAfter && totalAfter.indexOf('<svg') !== -1]);

// ---- FEAT-002 (A): live update fires on 'input', NOT 'change' --------------
// The editable fleet/energy fields must recompute as the user TYPES (the
// 'input' event), matching the sensitivity sliders. This assertion is honest:
// it (a) proves a built editable input is registered under 'input' and NOT
// under 'change', and (b) proves firing that 'input' listener actually redraws
// a chart. Reverting any builder to addEventListener('change', ...) would make
// the input listener absent and FAIL this block.
//
// Force synchronous recompute so the debounce (setTimeout) is observable.
if (typeof windowObj.__HS.setSyncRecompute === 'function') windowObj.__HS.setSyncRecompute(true);

// Grab a built editable input from the energy (ec-body) primary table: each row
// is [labelTd, bCellTd, cCellTd, unitTd, meaningTd]; the Plan A cell holds the
// amber <input>.
function firstInputIn(container){
  if (!container) return null;
  for (const row of container.children) {
    const kids = (row && row.children) || [];
    for (const td of kids) {
      const gk = (td && td.children) || [];
      // Skip the discrete include checkbox (wired on 'change' by design); the
      // live-update contract is about the editable text/number fields.
      for (const node of gk) { if (node && node.tagName === 'input' && node.type !== 'checkbox') return node; }
    }
  }
  return null;
}
const ecInput = firstInputIn(byId['ec-body']);
checks.push(['ec-body has a built editable input', !!ecInput]);
// The field is wired on 'input' (live), not 'change' (blur-only).
checks.push(['editable field listens on input (live update)',
  !!ecInput && Array.isArray(ecInput.listeners.input) && ecInput.listeners.input.length > 0]);
checks.push(['editable field NOT wired on change (blur-only)',
  !!ecInput && !(Array.isArray(ecInput.listeners.change) && ecInput.listeners.change.length > 0)]);
// Firing 'input' on that field must redraw a chart (same engine output path).
const liveBefore = byId['chart-total'].innerHTML;
if (ecInput) {
  ecInput.value = String((Number(ecInput.value) || 0) + 1234);
  ecInput.fire('input');
}
const liveAfter = byId['chart-total'].innerHTML;
checks.push(['firing input event redraws charts (would FAIL on change)',
  !!ecInput && liveBefore !== liveAfter && liveAfter.indexOf('<svg') !== -1]);

// Also confirm a built truck-card input is wired on 'input' (not change). The
// card fields are nested deeper than the old table rows (card > grid > fld >
// input), so walk the tree for the first editable (non-checkbox) <input>.
function findInputDeep(node, pred) {
  if (!node || typeof node !== 'object') return null;
  if ((node.tagName || '') === 'input' && node.type !== 'checkbox' &&
      (!pred || pred(node))) return node;
  const kids = node.children || [];
  for (const child of kids) {
    const hit = findInputDeep(child, pred);
    if (hit) return hit;
  }
  return null;
}
const fleetInput = findInputDeep(byId['fleet-cards'],
  (n) => Array.isArray(n.listeners.input) && n.listeners.input.length > 0);
checks.push(['truck card has a built editable input', !!fleetInput]);
checks.push(['card editable field listens on input',
  !!fleetInput && Array.isArray(fleetInput.listeners.input) && fleetInput.listeners.input.length > 0]);

if (typeof windowObj.__HS.setSyncRecompute === 'function') windowObj.__HS.setSyncRecompute(false);

// ---- FEAT-002 (C): input curation split (primary vs advanced) --------------
// The always-visible primary containers hold the high-impact drivers; the
// advanced containers (inside the Advanced <details>) hold the rest. Both are
// populated and both bind the same state, so no computed figure changed (the
// 2,081,781 / n.a. assertions above still pass unchanged).
checks.push(['primary op-cost form populated', byId['oc-form'].children.length > 0]);
checks.push(['advanced op-cost form populated', byId['oc-form-adv'].children.length > 0]);
checks.push(['primary energy table populated', byId['ec-body'].children.length > 0]);
checks.push(['advanced energy table populated', byId['ec-body-adv'].children.length > 0]);
// The advanced set holds strictly more rows than the small primary set.
checks.push(['advanced op-cost holds more rows than primary',
  byId['oc-form-adv'].children.length > byId['oc-form'].children.length]);

// ---- FEAT-002 (redesign): de-cluttered primary input surface ---------------
// The primary energy-and-charging table must NOT carry the verbose 'Meaning /
// cell reference' provenance column (it is relocated to a tooltip on the label
// cell and kept in the collapsed Advanced table). Assert on the hand-written
// chrome markup: the primary #ec-table header has NO 'Meaning / cell reference'
// <th>, while the collapsed advanced #ec-table-adv still does (provenance kept,
// not deleted). This UPDATES the old wide-surface expectation without weakening
// coverage.
const ecPrimaryHeadM = html.match(/<table id="ec-table">\s*<thead>([\s\S]*?)<\/thead>/i);
const ecAdvHeadM = html.match(/<table id="ec-table-adv">\s*<thead>([\s\S]*?)<\/thead>/i);
checks.push(['primary energy table drops Meaning / cell reference header',
  !!ecPrimaryHeadM && ecPrimaryHeadM[1].indexOf('Meaning / cell reference') === -1]);
checks.push(['advanced energy table keeps provenance column (kept, not deleted)',
  !!ecAdvHeadM && ecAdvHeadM[1].indexOf('Meaning / cell reference') !== -1]);
// The rendered primary rows carry exactly the de-cluttered column count: each
// primary ec row is [label, Plan A, Plan B, unit] (4 cells, no meaning cell).
const ecPrimaryRow = byId['ec-body'].children[0];
checks.push(['primary energy row has no meaning cell (4 cells)',
  !!ecPrimaryRow && (ecPrimaryRow.children || []).length === 4]);
// Provenance is relocated, not lost: the primary label cell carries a title
// tooltip (the cell reference) so it stays one hover away.
const ecLabelCell = ecPrimaryRow && ecPrimaryRow.children && ecPrimaryRow.children[0];
checks.push(['primary energy label keeps provenance as a tooltip (title=)',
  !!ecLabelCell && ecLabelCell.attributes && typeof ecLabelCell.attributes.title === 'string' &&
  ecLabelCell.attributes.title.length > 0]);

// ---- FEAT-002 (redesign): minimum-critical primary fields present ----------
// Each truck card must surface the minimum-critical inputs as always-visible
// primary fields (per docs/minimum-critical-inputs.md): Work km/day, Days/year,
// COE months left, Market value, plus the replacement EV model, New ICE quote,
// EV quote, and the two plan-action selects. Collect every visible <label> text
// inside the first truck card's PRIMARY area (outside its Advanced <details>)
// and assert the critical labels are there.
function collectLabels(node, acc) {
  if (!node || typeof node !== 'object') return acc;
  if ((node.tagName || '') === 'label') acc.push((node.textContent || '').trim());
  // Do not descend into a per-card Advanced <details> (those are low-impact).
  const isAdv = (node.tagName || '') === 'details' &&
    /(^|\s)truck-adv(\s|$)/.test(node.className || '');
  if (!isAdv) (node.children || []).forEach((c) => collectLabels(c, acc));
  return acc;
}
const card0 = truckCards()[0];
const primaryLabels = collectLabels(card0, []);
const criticalLabels = ['Work km/day', 'Days/year', 'COE months left', 'Market value SGD',
  'EV model', 'New ICE quote SGD', 'EV quote SGD', 'Plan A action', 'Plan B action'];
checks.push(['truck card surfaces the minimum-critical primary fields',
  criticalLabels.every((l) => primaryLabels.indexOf(l) !== -1)]);
// The low-impact fields are behind the card's Advanced disclosure, not primary.
checks.push(['low-impact fields demoted to the card Advanced disclosure',
  primaryLabels.indexOf('Scrap SGD') === -1 && primaryLabels.indexOf('Peak route km') === -1 &&
  primaryLabels.indexOf('Vehicle grant SGD') === -1]);

// ---- FEAT-002 (redesign): EV product-spec loading + Unconfirmed caveat ------
// Selecting an EV model for a truck must load the catalogue specs into the
// row's editable fields as defaults matching the engine's blank-fallback
// (EV quote = prod.I + oc[57]; battery = prod.D; kWh/km = prod.E), and surface
// the payload/body-fit status WITH an explicit 'Unconfirmed' caveat (prod.L is
// 'Unconfirmed' for every model today). Drive it directly through the exposed
// loader on a replacement row, then confirm the card re-renders the caveat.
if (typeof windowObj.__HS.setSyncRecompute === 'function') windowObj.__HS.setSyncRecompute(true);
const prodRows = windowObj.__HS.state.products.rows.filter((r) => r.A != null);
const oc57 = windowObj.__HS.state.operating_costs.rows.find((r) => r._row === 57);
const acqAdder = (oc57 && typeof oc57.values.B === 'number') ? oc57.values.B : 0;
const demoRepl = windowObj.__HS.state.replacement_plan.rows.find((r) => r.A === 'T001');
const pickProd = prodRows.find((p) => p.A === 'Farizon F3E') || prodRows[0];
// Pick the model (as the UI does) then load its specs as editable defaults.
demoRepl.B = pickProd.A;
demoRepl.D = null; demoRepl.E = null; demoRepl.F = null;
windowObj.__HS.loadProductSpecs(demoRepl, pickProd.A);
checks.push(['EV model load sets EV quote = prod.I + oc[57] (engine blank-fallback)',
  demoRepl.D === pickProd.I + acqAdder]);
checks.push(['EV model load sets usable battery kWh = prod.D',
  demoRepl.E === pickProd.D]);
checks.push(['EV model load sets EV kWh/km = prod.E',
  demoRepl.F === pickProd.E]);
// prod.L is Unconfirmed for every catalogue model today.
checks.push(['catalogue payload/body-fit is Unconfirmed (honesty precondition)',
  prodRows.every((p) => p.L === 'Unconfirmed')]);
// The loaded defaults equal the engine's blank-fallback, so loading a model and
// NOT overriding introduces no new math. Prove via the engine: a run with the
// EV quote loaded equals a run with it blank for the same truck.
const stLoaded = JSON.parse(JSON.stringify(windowObj.__HS.state));
const stBlank = JSON.parse(JSON.stringify(windowObj.__HS.state));
stBlank.replacement_plan.rows.forEach((r) => { if (r.A === 'T001') { r.D = null; r.E = null; r.F = null; } });
const outLoaded = windowObj.HSEngine.computeFleet(stLoaded).results.vehicleEconomicTco.plan_a;
const outBlank = windowObj.HSEngine.computeFleet(stBlank).results.vehicleEconomicTco.plan_a;
checks.push(['loaded EV defaults reproduce the blank-fallback number (no new math)',
  typeof outLoaded === 'number' && typeof outBlank === 'number' &&
  Math.abs(outLoaded - outBlank) < 0.5]);
// The card UI renders the Unconfirmed caveat on the payload/body-fit spec strip.
// Re-render the cards and search for a data-fit-status tag carrying 'Unconfirmed'.
windowObj.__HS.rebuildInputs();
function findFitStatus(node) {
  if (!node || typeof node !== 'object') return null;
  if ((node.tagName || '') === 'span' && node.attributes && 'data-fit-status' in node.attributes) return node;
  const kids = node.children || [];
  for (const c of kids) { const hit = findFitStatus(c); if (hit) return hit; }
  return null;
}
const fitTag = findFitStatus(byId['fleet-cards']);
checks.push(['card surfaces payload/body-fit status with Unconfirmed caveat',
  !!fitTag && (fitTag.textContent || '').indexOf('Unconfirmed') !== -1 &&
  /(^|\s)unknown(\s|$)/.test(fitTag.className || '')]);

// ---- FEAT-002 (redesign): add / remove trucks (ID-consistent) --------------
// An 'Add truck' control exists; firing it increases the rendered truck-card
// count AND appends a matching replacement_plan row with the SAME new ID (the
// two sheets always share one ID set). A per-card 'Remove' control decreases
// both again.
const addBtn = byId['add-truck-btn'];
checks.push(['Add truck control present', !!addBtn &&
  Array.isArray(addBtn.listeners.click) && addBtn.listeners.click.length > 0]);
// A "shown" truck is one that renders a card (included or carrying data): that
// is the live truck set the user sees. Adding activates one more; the fixture
// ships paired fleet+replacement IDs, so the new ID must appear in the shown
// set AND stay ID-consistent across both sheets.
function shownTruckIds() { return truckCards().map((c) => String(c.attributes['data-truck-id'])); }
const cardsBeforeAdd = truckCards().length;
const shownBeforeAdd = shownTruckIds();
addBtn.fire('click');
const cardsAfterAdd = truckCards().length;
const shownAfterAdd = shownTruckIds();
checks.push(['Add truck increases rendered truck-card count', cardsAfterAdd === cardsBeforeAdd + 1]);
const newId = shownAfterAdd.find((id) => shownBeforeAdd.indexOf(id) === -1);
checks.push(['Add truck shows a new truck ID', !!newId]);
// The new truck is included in the fleet register AND has a matching
// replacement_plan row with the SAME ID (two sheets share one ID set).
const newFleetRow = windowObj.__HS.state.fleet_register.rows.find((r) => String(r.A) === newId);
const newReplRow = windowObj.__HS.state.replacement_plan.rows.find((r) => String(r.A) === newId);
checks.push(['Add truck appends an included fleet row', !!newFleetRow && newFleetRow.B === 1]);
checks.push(['Add truck has a MATCHING replacement row (same ID, valid action)',
  !!newReplRow && newReplRow.O === 'Keep ICE' && newReplRow.R === 'Keep ICE']);
// computeFleet still returns a valid result after the add.
const outAfterAdd = windowObj.HSEngine.computeFleet(windowObj.__HS.state);
checks.push(['computeFleet valid after add (truck count grew)',
  !!outAfterAdd && outAfterAdd.results.truckCount.keep_ice === cardsAfterAdd]);
// Remove the just-added truck via its card Remove button -> both sheets shrink.
const addedCard = truckCards().find((c) => c.attributes['data-truck-id'] === newId);
function findRemoveBtn(node) {
  if (!node || typeof node !== 'object') return null;
  if ((node.tagName || '') === 'button' && /(^|\s)remove-truck(\s|$)/.test(node.className || '')) return node;
  const kids = node.children || [];
  for (const c of kids) { const hit = findRemoveBtn(c); if (hit) return hit; }
  return null;
}
const removeBtn = addedCard ? findRemoveBtn(addedCard) : null;
checks.push(['added card exposes a Remove control', !!removeBtn &&
  Array.isArray(removeBtn.listeners.click) && removeBtn.listeners.click.length > 0]);
if (removeBtn) removeBtn.fire('click');
const cardsAfterRemove = truckCards().length;
checks.push(['Remove truck decreases rendered truck-card count', cardsAfterRemove === cardsBeforeAdd]);
// The removed truck no longer renders a card and its fleet row is reset to an
// excluded blank placeholder (B=0, no data); the paired ID is kept on both
// sheets so they never diverge.
checks.push(['Remove truck drops the ID from the shown set', shownTruckIds().indexOf(newId) === -1]);
const removedFleetRow = windowObj.__HS.state.fleet_register.rows.find((r) => String(r.A) === newId);
checks.push(['Removed fleet row is an excluded blank placeholder',
  !!removedFleetRow && removedFleetRow.B === 0 && removedFleetRow.E == null && removedFleetRow.K == null]);
const outAfterRemove = windowObj.HSEngine.computeFleet(windowObj.__HS.state);
checks.push(['computeFleet valid after remove', !!outAfterRemove &&
  outAfterRemove.results.truckCount.keep_ice === cardsAfterRemove]);
// Reset-to-demonstration restores the original 6-truck card set unchanged.
byId['reset-btn'].fire('click');
checks.push(['Reset restores the 6-truck demonstration card set', truckCards().length === 6]);
checks.push(['Reset keeps the money view at the demo Keep ICE TCO',
  byId['results-body'].innerHTML.indexOf('2,081,781') !== -1]);
if (typeof windowObj.__HS.setSyncRecompute === 'function') windowObj.__HS.setSyncRecompute(false);

// ---- FEAT-004: input OVERLAY panel (fixed drawer over a scrim, no reflow) ---
// The inputs now live in a position:fixed overlay (#input-col) floating over a
// scrim (#input-scrim); the results underneath keep full width and must NOT
// reflow when the panel opens/closes. The trigger is a modal dialog opener:
// aria-expanded on the trigger, aria-hidden on the panel, and an 'open' class
// on both the panel and the scrim track the state. Default = CLOSED.
const sbToggle = byId['sidebar-toggle'];
const inputCol = byId['input-col'];
const inputScrim = byId['input-scrim'];
const resultsCol = byId['results-col'];
function hasOpen(elm) { return /(^|\s)open(\s|$)/.test(elm.className || ''); }
checks.push(['overlay trigger exists', !!sbToggle]);
checks.push(['overlay trigger registers a click listener',
  Array.isArray(sbToggle.listeners.click) && sbToggle.listeners.click.length > 0]);
checks.push(['overlay scrim element present', !!inputScrim]);
checks.push(['overlay scrim registers a click listener',
  Array.isArray(inputScrim.listeners.click) && inputScrim.listeners.click.length > 0]);
// Default CLOSED: trigger collapsed, panel hidden, scrim not open.
checks.push(['overlay starts closed (default)',
  sbToggle.getAttribute('aria-expanded') === 'false' &&
  inputCol.getAttribute('aria-hidden') === 'true' &&
  !hasOpen(inputCol) && !hasOpen(inputScrim)]);
// No-reflow invariant: capture the results column style before any open/close.
// The results column must never have its width/display mutated by the overlay.
const resWidthBefore = resultsCol.style.width;
const resDisplayBefore = resultsCol.style.display;
// Open via the trigger: aria-expanded true, panel aria-hidden false, both the
// panel and the scrim carry the 'open' class.
sbToggle.fire('click');
checks.push(['overlay opens on trigger click (aria + open class + scrim)',
  sbToggle.getAttribute('aria-expanded') === 'true' &&
  inputCol.getAttribute('aria-hidden') === 'false' &&
  hasOpen(inputCol) && hasOpen(inputScrim)]);
checks.push(['opening overlay does NOT reflow results column (no width/display change)',
  resultsCol.style.width === resWidthBefore && resultsCol.style.display === resDisplayBefore]);
// Toggle again closes it (trigger is a toggle).
sbToggle.fire('click');
checks.push(['overlay closes on second trigger click (toggle)',
  sbToggle.getAttribute('aria-expanded') === 'false' &&
  inputCol.getAttribute('aria-hidden') === 'true' &&
  !hasOpen(inputCol) && !hasOpen(inputScrim)]);
checks.push(['closing overlay does NOT reflow results column (no width/display change)',
  resultsCol.style.width === resWidthBefore && resultsCol.style.display === resDisplayBefore]);
// Scrim click dismisses: open, then fire a click on the scrim -> closed.
sbToggle.fire('click');
inputScrim.fire('click');
checks.push(['overlay closes on scrim click',
  sbToggle.getAttribute('aria-expanded') === 'false' &&
  inputCol.getAttribute('aria-hidden') === 'true' &&
  !hasOpen(inputCol) && !hasOpen(inputScrim)]);
// Esc dismisses: open, then fire an Escape keydown on the panel -> closed. The
// makeEl shim's fire(ev, extra) passes extra event props (here {key:'Escape'}).
sbToggle.fire('click');
checks.push(['overlay open before Esc', hasOpen(inputCol)]);
inputCol.fire('keydown', { key: 'Escape' });
checks.push(['overlay closes on Esc keydown',
  sbToggle.getAttribute('aria-expanded') === 'false' &&
  inputCol.getAttribute('aria-hidden') === 'true' &&
  !hasOpen(inputCol) && !hasOpen(inputScrim)]);

// ---- FEAT-005: journey stepper + stage viewports + confidence badge --------
// A five-step, tablist-like control switches a single visible stage viewport
// with NO routing and NO fetch (pure client-side show/hide). The active stage
// persists in localStorage. The confidence badge is driven by the LIVE engine
// output's gate / saving-claim status for the best EV plan -- never a fabricated
// probability. For the demonstration case both EV plans are 'Total incomplete'
// (site cost n.a.), so the badge MUST show the honest non-confirmed Diagnostic
// state, not a fake 'confirmed'.
const STAGES = ['customer','portfolio','tco','charging','proposal'];
// Hand-written chrome (everything before the first generated block), so the
// markup counts below never pick up generated DEMO/PROSPECTS data.
const chromeEndFeat5 = html.indexOf('<!-- ENGINE:BEGIN');
const chromeFeat5 = chromeEndFeat5 === -1 ? html : html.slice(0, chromeEndFeat5);
// All five stage panels exist in the markup.
STAGES.forEach((s) => {
  checks.push(['stage section ' + s + ' present', chromeFeat5.indexOf('id="stage-' + s + '"') !== -1]);
});
// The stepper exists and carries exactly five step buttons in the markup.
checks.push(['stepper present in markup', chromeFeat5.indexOf('id="stepper"') !== -1]);
const stepMatches = (chromeFeat5.match(/class="step"/g) || []).length;
checks.push(['stepper has five steps', stepMatches === 5]);

// The confidence badge element exists in the markup.
checks.push(['confidence badge present in markup', chromeFeat5.indexOf('id="confidence-badge"') !== -1]);

// Default stage is TCO (the money view): its step is selected and its panel is
// active, while the others are hidden.
const stepTco = byId['step-tco'];
const stageTco = byId['stage-tco'];
const stepCharging = byId['step-charging'];
const stageCharging = byId['stage-charging'];
function stageActive(elm){ return /(^|\s)stage-active(\s|$)/.test(elm.className || ''); }
function stageHidden(elm){ return /(^|\s)stage-hidden(\s|$)/.test(elm.className || ''); }
checks.push(['default stage is TCO (step selected)', stepTco.getAttribute('aria-selected') === 'true']);
checks.push(['default stage TCO panel active', stageActive(stageTco) && !stageHidden(stageTco)]);
checks.push(['non-default stage (charging) starts hidden', stageHidden(stageCharging) && !stageActive(stageCharging)]);
checks.push(['non-default step (charging) not selected', stepCharging.getAttribute('aria-selected') === 'false']);

// Activating a non-default step shows that stage and hides the previously-active
// one (fire the step's click and check the visibility classes on both panels).
stepCharging.fire('click');
checks.push(['activating Charging step shows its stage', stageActive(stageCharging) && !stageHidden(stageCharging)]);
checks.push(['activating Charging step hides previously-active TCO stage', stageHidden(stageTco) && !stageActive(stageTco)]);
checks.push(['activating Charging step selects it (aria-selected)', stepCharging.getAttribute('aria-selected') === 'true']);
checks.push(['activating Charging step deselects TCO', stepTco.getAttribute('aria-selected') === 'false']);
// Keyboard activation also switches: ArrowLeft from Charging moves to TCO.
stepCharging.fire('keydown', { key: 'ArrowLeft', preventDefault() {} });
checks.push(['keyboard ArrowLeft switches stage back to TCO',
  stageActive(stageTco) && stageHidden(stageCharging) &&
  stepTco.getAttribute('aria-selected') === 'true']);

// The persistent demonstration honesty banner is NOT buried inside any one
// stage: it sits above the stepper in the chrome, before the first stage panel.
const bannerIdx = html.indexOf('id="demo-banner"');
const firstStageIdx = html.indexOf('id="stage-customer"');
checks.push(['honesty banner persists above the stages (not inside one)',
  bannerIdx !== -1 && firstStageIdx !== -1 && bannerIdx < firstStageIdx]);

// Confidence badge reflects the computed gate / saving-claim status. For the
// demo case the best EV plan's savingClaimStatus is 'Total incomplete' (site
// cost n.a.), so the badge must render the honest Diagnostic (non-confirmed)
// state: class conf-diagnostic and NOT conf-confirmed, with 'not a confirmed
// win' wording and no fake 'Confirmed win'.
const confBadge = byId['confidence-badge'];
const confText = byId['confidence-text'];
checks.push(['demo best EV plan savingClaimStatus is non-confirmed (Total incomplete)',
  r.savingClaimStatus.plan_a === 'Total incomplete' && r.savingClaimStatus.plan_b === 'Total incomplete']);
checks.push(['confidence badge shows diagnostic (not confirmed) for demo',
  /(^|\s)conf-diagnostic(\s|$)/.test(confBadge.className || '') &&
  !/(^|\s)conf-confirmed(\s|$)/.test(confBadge.className || '')]);
checks.push(['confidence badge wording is honest (not a confirmed win)',
  confText.innerHTML.indexOf('not a confirmed win') !== -1 &&
  confText.innerHTML.indexOf('Confirmed win') === -1]);
checks.push(['confidence badge driven by real claim status (names the status)',
  confText.innerHTML.indexOf('Total incomplete') !== -1]);

// ---- App-screen layout + honesty invariants (FEAT-004) --------------------
// Static checks a DOM harness CAN see, read straight from the raw index.html
// markup (the `html` string already loaded above). These lock in the taste-skill
// app-screen discipline applied in FEAT-002/003 WITHOUT weakening any prior
// assertion: the screen's one question is the h1 and is de-branded; the two
// calculator panels and the charts region exist and are populated; surfaces are
// flat (no shadow/gradient in the page chrome); the page carries no external
// runtime reference; one gutter + equal margins are defined as single tokens;
// figures use tabular numerals; the amber-editable legend and evidence tags are
// present; and the phone fold (<=700px media query) exists.

// The chrome is everything before the first generated block. Scope the "no
// external ref / no shadow / no gradient" checks to the hand-written chrome so
// provenance URL strings inside the generated DEMO/PROSPECTS data never trip it.
const chromeEnd = html.indexOf('<!-- ENGINE:BEGIN');
const chrome = chromeEnd === -1 ? html : html.slice(0, chromeEnd);

// h1: the screen's one question, de-branded.
const h1m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
const h1text = h1m ? h1m[1].replace(/<[^>]+>/g, '').trim() : '';
checks.push(['h1 present', !!h1text]);
checks.push(['h1 is the question (cheapest over 10 years)',
  /cheapest over 10 years/i.test(h1text)]);
checks.push(['h1 free of brand name', h1text.indexOf('Hong Seh') === -1]);

// <title> de-branded.
const titlem = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
const titletext = titlem ? titlem[1].trim() : '';
checks.push(['title free of brand name', titletext.indexOf('Hong Seh') === -1]);

// No page-visible 'Hong Seh' anywhere in the hand-written chrome (the only
// remaining occurrences are the engine provenance comment + oc[68] data key +
// generated DEMO/PROSPECTS data, all below ENGINE:BEGIN).
checks.push(['no brand name in page chrome', chrome.indexOf('Hong Seh') === -1]);

// Two-panel calculator layout: both column containers exist in the markup.
checks.push(['input panel container present', /id="input-col"/.test(chrome)]);
checks.push(['results panel container present', /id="results-col"/.test(chrome)]);
checks.push(['two-panel workspace grid present', /class="workspace"/.test(chrome)]);

// Input overlay trigger + curation hooks exist in the markup.
checks.push(['sidebar-toggle present in markup', /id="sidebar-toggle"/.test(chrome)]);
// The inputs panel is a position:fixed overlay (no reflow) with a scrim.
checks.push(['input overlay panel is position:fixed',
  /#input-col\s*\{[^}]*position:\s*fixed/.test(chrome)]);
checks.push(['input overlay scrim element present in markup',
  /id="input-scrim"/.test(chrome)]);
checks.push(['input overlay scrim CSS is position:fixed',
  /#input-scrim\s*\{[^}]*position:\s*fixed/.test(chrome)]);
checks.push(['advanced-inputs disclosure present', /id="advanced-inputs"/.test(chrome)]);
checks.push(['advanced op-cost container present', /id="oc-form-adv"/.test(chrome)]);
checks.push(['advanced energy container present', /id="ec-body-adv"/.test(chrome)]);
// Responsive: workspace stacks at <=1023px and the page folds at <=700px.
checks.push(['tablet stack media query (<=1023px) present',
  /@media\s*\(\s*max-width:\s*1023px\s*\)/.test(chrome)]);

// Charts region + the five chart containers exist and are populated (the chart
// container id checks above already prove each holds emitted <svg>).
checks.push(['charts region present', /id="charts-region"/.test(chrome)]);
chartIds.forEach((id) => {
  checks.push([id + ' container in markup', chrome.indexOf('id="' + id + '"') !== -1]);
});

// Flat surfaces: no decorative shadow or gradient at rest in the chrome.
checks.push(['no box-shadow in chrome', !/box-shadow/i.test(chrome)]);
checks.push(['no linear-gradient in chrome', !/linear-gradient/i.test(chrome)]);
checks.push(['no radial-gradient in chrome', !/radial-gradient/i.test(chrome)]);

// Offline / self-contained: no external runtime resource added to the chrome.
checks.push(['no external <script src> in chrome', !/<script[^>]*\ssrc=/i.test(chrome)]);
checks.push(['no external <link href> in chrome', !/<link[^>]*\shref=/i.test(chrome)]);

// One gutter value and equal outer margins, defined once as CSS custom props.
checks.push(['single --gutter token defined', /--gutter\s*:/.test(chrome)]);
checks.push(['single --margin token defined', /--margin\s*:/.test(chrome)]);
checks.push(['gutter applied via var(--gutter)', /gap:\s*var\(--gutter\)/.test(chrome)]);
checks.push(['equal margins applied via var(--margin)',
  /padding:\s*[^;]*var\(--margin\)/.test(chrome)]);

// Figures are tabular numerals (aligned KPI/table digits).
checks.push(['tabular-nums on figures', /font-variant-numeric:\s*tabular-nums/.test(chrome)]);

// Nav / top bar folds on the phone: a <=700px media query exists.
checks.push(['phone fold media query (<=700px) present',
  /@media\s*\(\s*max-width:\s*700px\s*\)/.test(chrome)]);

// Model-integrity signals preserved in the chrome: amber-editable legend text
// and the four evidence tags are present.
checks.push(['amber-editable legend present', /Amber\s*=\s*editable input/i.test(chrome)]);
checks.push(['evidence tags present (Fact/Assumption/Inference/Unknown)',
  /tag fact/.test(chrome) && /tag assumption/.test(chrome) &&
  /tag inference/.test(chrome) && /tag unknown/.test(chrome)]);

// One always-visible demonstration / diagnostic caveat (not a customer quote).
checks.push(['demonstration caveat visible in chrome',
  /not a customer quote/i.test(chrome) || /DEMONSTRATION/.test(chrome)]);

// Results still render 'n.a.' and NOT a zero substituted for the sentinel: the
// decision cards for the demo must show the n.a. headline for the n.a. plans,
// never 'S$0' / '0%' in place of an unavailable figure.
const decHtml = byId['decision-cards'].innerHTML;
checks.push(['decision cards render n.a. (not 0 substitute)', decHtml.indexOf('n.a.') !== -1]);

let ok = true;
for (const [name, pass] of checks) {
  console.log((pass ? 'PASS  ' : 'FAIL  ') + name);
  if (!pass) ok = false;
}
console.log('\n' + (ok ? 'ALL INDEX CHECKS PASSED' : 'INDEX CHECKS FAILED'));
process.exit(ok ? 0 : 1);
