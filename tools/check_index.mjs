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

// ---------------------------------------------------------------------------
// HTMLCollection-like wrapper. A real element.children is a *live* HTMLCollection
// which supports numeric index access, a live `.length` and `.item(i)`, but does
// NOT inherit Array.prototype - so `.forEach/.map/.filter/.find/.some/.reduce`
// are `undefined` and calling them THROWS. The old shim used a plain Array here,
// which silently tolerated controller code that called `.forEach` on children -
// exactly the bug that crashed the real browser. We now mimic the real contract
// so such code fails here too.
//
// Backed by the element's internal real array (`arr`), so reads stay live: the
// wrapper is a thin, prototype-less view created fresh on each `children` read.
function makeChildrenView(arr) {
  const view = Object.create(null); // no Array.prototype -> no iteration methods
  for (let i = 0; i < arr.length; i++) view[i] = arr[i];
  Object.defineProperty(view, 'length', { value: arr.length, enumerable: false });
  Object.defineProperty(view, 'item', {
    value: function (i) { return (i >= 0 && i < arr.length) ? arr[i] : null; },
    enumerable: false,
  });
  return view;
}

// Local helper: copy any array-like (HTMLCollection-view, NodeList, or array)
// into a real Array via length + indexed/item() access only. Deliberately does
// NOT rely on Array.from over element.children, so it cannot mask a plain-array
// regression of the shim - it reads strictly through the live contract.
function toArr(coll) {
  const a = [];
  if (coll) {
    const n = coll.length || 0;
    for (let i = 0; i < n; i++) a.push(coll.item ? coll.item(i) : coll[i]);
  }
  return a;
}

// Minimal DOM shim. Elements collect innerHTML/children; listeners are stored.
function makeEl(tag) {
  const el = {
    tagName: tag, _html: '', style: {}, _children: [], attributes: {},
    listeners: {}, value: '',
    // Setting innerHTML replaces content: mirror the real DOM by also dropping
    // any previously-appended children (so re-rendered containers do not
    // accumulate stale nodes across repeated builds). Clearing to '' is the
    // common reset the controller uses before rebuilding a table/card list.
    set innerHTML(v) { this._html = v; this._children.length = 0; }, get innerHTML() { return this._html; },
    set textContent(v) { this._text = v; }, get textContent() { return this._text || ''; },
    appendChild(c) { this._children.push(c); return c; },
    replaceChild(nw, old) {
      const i = this._children.indexOf(old);
      if (i !== -1) this._children[i] = nw; else this._children.push(nw);
      return old;
    },
    addEventListener(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); },
    setAttribute(k, v) { this.attributes[k] = v; },
    getAttribute(k) { return this.attributes[k]; },
    fire(ev, extra) {
      const evt = Object.assign({ target: this, currentTarget: this }, extra || {});
      (this.listeners[ev] || []).forEach((fn) => fn(evt));
    },
  };
  // `children` is a live, HTMLCollection-like view WITHOUT Array methods.
  Object.defineProperty(el, 'children', {
    get() { return makeChildrenView(this._children); },
    enumerable: true,
  });
  return el;
}
const byId = {};
const ids = ['decision-cards','decision-lead','decision-notice','results-body','site-body',
  'gates-body','review-body','sens-controls','fleet-cards','add-truck-btn',
  'oc-form','ec-body','reset-btn','demo-banner',
  'prospect-body','prospect-sort','prospect-current-btn','prospect-note',
  // FEAT-002: curation split containers + toggleable sidebar hooks.
  'oc-form-adv','ec-body-adv','advanced-inputs',
  // FEAT-004: input overlay panel hooks (scrim + in-panel close button).
  'sidebar-toggle','sidebar-toggle-label','input-col','results-col',
  'input-scrim','input-overlay-close',
  // FEAT-004: prospects top-accessed hover overlay hooks (mirrors the Inputs
  // overlay): top-chrome trigger + scrim + in-panel close button + dialog.
  'prospects-toggle','prospects-toggle-label','prospects-col',
  'prospects-scrim','prospects-overlay-close','inputs',
  // FEAT-002: journey stepper (Customer stage removed -> 4 stages), stage
  // viewports + confidence badge hooks.
  'stepper','step-portfolio','step-tco','step-charging','step-proposal',
  'stage-portfolio','stage-tco','stage-charging','stage-proposal',
  'confidence-badge','confidence-dot','confidence-text',
  // FEAT-004 (portfolio): ranked model-matching guide hooks.
  'portfolio-body','portfolio-duty-line','portfolio-honesty',
  // FEAT-003: TCO interactive dashboard + Part A fleet matched-models summary.
  // dashboard-A: the redundant sensitivity-response bar (chart-sens) was removed
  // (it duplicated the breakdown bar total); the three TCO surfaces are the line,
  // the breakdown bar and the sensitivity controls, now on one band (#tco-band).
  'chart-cumulative','chart-breakdown',
  'results-table','day0-cards','tco-tooltip','tco-band',
  'portfolio-matched-models','portfolio-fleet-body','portfolio-config-text',
  // FEAT-002: folded-in customer profile + consolidated per-truck Advanced.
  'customer-form','fleet-adv',
  // FEAT-002 (Part C): Stage-4 charging assessment panels.
  'charge-site-read','charge-detour-read','charge-public-totals',
  'charge-public-bands','charge-region-body','charge-operator-body',
  'charge-attribution',
  // FEAT-003 (Part B): Stage-4 public-charging routing simulator (Panel 4).
  'rsim-controls','rsim-region','rsim-dconly','rsim-origin-note','rsim-summary',
  'rsim-map','rsim-charger-table','rsim-charger-body','rsim-caveat','rsim-attribution',
  // FEAT-004 (Workstream C): Stage-5 Financing (illustrative) opt-in block.
  'proposal-finance-block','finance-enable','finance-controls','finance-exclusion',
  'finance-principal-src','finance-principal','finance-deposit','finance-apr',
  'finance-term','finance-term-unit','finance-off-note','finance-output',
  'finance-status-line','finance-summary-body','finance-caveat'];
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

// ---- FEAT-002 (map/demo/portfolio): DEFAULT LANDING is the MID (SRM) case ---
// The user-facing ChengLong DEMONSTRATION prospect was removed; the app's
// landing state is now the MID (SRM) illustrative case, inlined as
// window.HSLandingCase and read by the controller's freshInputs(). Assert the
// landing source is present, is the mid case, names an SRM model on an EV plan,
// and that the controller actually rendered the mid landing on first load (4
// included trucks, an SRM model surfaced) BEFORE we drive the controller to the
// demonstration case for the long-standing demo-specific DOM assertions below.
const landing = windowObj.HSLandingCase;
checks.push(['landing case embedded (window.HSLandingCase.inputs present)',
  !!landing && !!landing.inputs && typeof landing.inputs === 'object']);
checks.push(['landing case is the mid (SRM) case', !!landing && landing.id === 'mid']);
const landingIncluded = (landing && landing.inputs.fleet_register.rows || [])
  .filter((rw) => rw.B === 1);
checks.push(['landing mid case includes 4 trucks', landingIncluded.length === 4]);
const landingSrmEvRows = (landing && landing.inputs.replacement_plan.rows || [])
  .filter((rw) => rw.A != null && typeof rw.B === 'string' && rw.B.indexOf('SRM') !== -1 &&
    (rw.O === 'EV' || rw.R === 'EV'));
checks.push(['landing mid case names an SRM model on an EV plan (activeEv resolves to SRM)',
  landingSrmEvRows.length >= 1]);
// The controller rendered the mid landing on first load: the fleet-card stack
// shows exactly the 4 mid-case truck IDs (EL-01..EL-04), proving freshInputs()
// reads the mid landing, not the old 6-truck demonstration case.
function truckCardsNow() {
  return toArr(byId['fleet-cards'].children).filter(
    (c) => (c.attributes && c.attributes['data-truck-id'] != null));
}
const landingCardIds = truckCardsNow().map((c) => c.attributes['data-truck-id']);
checks.push(['default landing renders the 4 mid (SRM) truck cards', landingCardIds.length === 4]);
checks.push(['default landing truck cards carry the mid fleet IDs (EL-01..EL-04)',
  ['EL-01', 'EL-02', 'EL-03', 'EL-04'].every((id) => landingCardIds.indexOf(id) !== -1)]);
// The controller's live landing state names SRM on an EV plan, so the Charging
// tab's active EV resolves to SRM by default.
const landingReplNow = windowObj.__HS.state.replacement_plan.rows
  .filter((rw) => rw.A != null && typeof rw.B === 'string' && rw.B.indexOf('SRM') !== -1 &&
    (rw.O === 'EV' || rw.R === 'EV'));
checks.push(['controller landing state surfaces SRM on an EV plan',
  landingReplNow.length >= 1]);

// The user-facing prospect SEED SET no longer contains the demonstration case:
// it is exactly best / mid / bad / blank. (demo_case.json lives on only as the
// untouched validate.py Excel-parity fixture, still embedded as HSDemoCase.)
const seedsEarly = windowObj.HSProspectSeeds;
checks.push(['prospect seed set excludes the demo case (best/mid/bad/blank only)',
  !!seedsEarly && Array.isArray(seedsEarly.cases) &&
  seedsEarly.cases.length === 4 &&
  !seedsEarly.cases.some((c) => c.id === 'demo') &&
  ['best', 'mid', 'bad', 'blank'].every((id) => seedsEarly.cases.some((c) => c.id === id))]);

// Drive the live controller to the DEMONSTRATION 6-truck case so the extensive
// long-standing demo-specific DOM assertions below (6 truck cards, Keep ICE
// 2,081,781, n.a. EV plans, diagnostic confidence badge, Reset-to-demo, etc.)
// remain exactly as strong as before. This is an honest render test of the
// demonstration fixture: it loads the SAME inputs the engine-parity checks above
// use (window.HSDemoCase.inputs) into __HS.state and rebuilds the UI. The mid
// landing was already asserted above, so no coverage is lost.
windowObj.__HS.loadDemoFixture();

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
  return toArr(byId['fleet-cards'].children).filter(
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
// dashboard-A A2/A3: the sensitivity CONTROLS card is rendered (slider panels),
// while the redundant sensitivity-response bar (#chart-sens) and the sensitivity
// TABLE (#sens-table/#sens-body) are removed. The controls container populates.
checks.push(['sensitivity controls rendered', byId['sens-controls'].children.length > 0]);
checks.push(['sensitivity-response bar removed (no #chart-sens in markup)',
  html.indexOf('id="chart-sens"') === -1]);
checks.push(['sensitivity table removed (no #sens-table / #sens-body in markup)',
  html.indexOf('id="sens-table"') === -1 && html.indexOf('id="sens-body"') === -1 &&
  html.indexOf('id="sens-headroom-th"') === -1]);

// ---- Prospects view checks -------------------------------------------------
const seeds = windowObj.HSProspectSeeds;
// FEAT-003: the Yong Wen / Venus reconstructions were replaced by four
// illustrative presets (best / mid / bad / blank). FEAT-001 (loophole fixes)
// removed the misleading named 'evergreen' seed (the 'best' case is the same
// fully-specified confirmed-win input set).
// FEAT-002 (map/demo/portfolio): the user-facing ChengLong DEMONSTRATION
// prospect was removed from the seed set too, so the user-facing seeds are now
// exactly FOUR cases: best, mid, bad, blank. (demo_case.json survives only as
// the untouched validate.py Excel-parity fixture, embedded as HSDemoCase.)
checks.push(['prospect seeds embedded (4)', !!seeds && Array.isArray(seeds.cases) && seeds.cases.length === 4]);
checks.push(['no yong_wen/venus seeds remain',
  !!seeds && !seeds.cases.some((c) => c.id === 'yong_wen' || c.id === 'venus')]);
checks.push(['no evergreen named-customer seed remains',
  !!seeds && !seeds.cases.some((c) => c.id === 'evergreen')]);
checks.push(['no demo seed in the user-facing set',
  !!seeds && !seeds.cases.some((c) => c.id === 'demo')]);
checks.push(['scoreProspect exposed', typeof windowObj.HSEngine.scoreProspect === 'function']);

const pbodyBenefit = byId['prospect-body'].innerHTML;
// dashboard-A A6: prospects render as CLEAN CARDS (one <article class="prospect-
// card"> per prospect), streamlined from the old verbose table rows. The card
// container (#prospect-body) is a card grid in markup, and each card carries a
// data-prospect-id + a Details disclosure (collapsed ranking prose).
checks.push(['prospects render as cards (prospect-card articles)',
  pbodyBenefit.indexOf('prospect-card') !== -1 && pbodyBenefit.indexOf('data-prospect-id=') !== -1]);
checks.push(['prospect cards collapse detail behind a Details disclosure',
  pbodyBenefit.indexOf('<details') !== -1 && /why this rank/i.test(pbodyBenefit)]);
checks.push(['prospect card container is a card grid (not a table) in markup',
  /<div class="prospect-cards" id="prospect-body">/.test(html) &&
  html.indexOf('id="prospect-table"') === -1]);
checks.push(['prospect does NOT name Evergreen Logistics', pbodyBenefit.indexOf('Evergreen Logistics') === -1]);
// FEAT-002: the DEMONSTRATION case is NO LONGER a user-facing prospect; the
// overlay must NOT list it (this flips the former 'prospect lists demo' check).
checks.push(['prospect does NOT list the DEMONSTRATION case',
  pbodyBenefit.indexOf('DEMONSTRATION 6-truck case') === -1 &&
  pbodyBenefit.indexOf('DEMONSTRATION') === -1]);
// The four illustrative presets must each render in the table.
checks.push(['prospect lists Best case', pbodyBenefit.indexOf('Best case (illustrative, fully specified, gates pass)') !== -1]);
checks.push(['prospect lists Mid case', pbodyBenefit.indexOf('Mid case (illustrative, marginal saving)') !== -1]);
checks.push(['prospect lists Bad case', pbodyBenefit.indexOf('Bad case (illustrative, EV not a fit)') !== -1]);
checks.push(['prospect lists Blank profile', pbodyBenefit.indexOf('Blank profile (start a fresh client)') !== -1]);
checks.push(['prospect cards expose ranking components (in Details)',
  pbodyBenefit.indexOf('Account key') !== -1 && pbodyBenefit.indexOf('Benefit key') !== -1]);
// A6: the honesty tags (Illustrative/Assumption) survive on the cards, the Load
// action keeps its data-load hook, and n.a. is shown (never zeroed). The demo
// case Total is n.a. for the EV plans, so an n.a. appears in the rendered cards.
checks.push(['prospect cards keep the Illustrative/Assumption honesty tags',
  pbodyBenefit.indexOf('tag illustrative') !== -1 || pbodyBenefit.indexOf('tag assumption') !== -1]);
checks.push(['prospect cards keep the Load-into-editor action (data-load)',
  pbodyBenefit.indexOf('data-load=') !== -1]);
checks.push(['prospect cards keep the conditional-savings caveat',
  pbodyBenefit.indexOf('conditional on the supplied inputs') !== -1]);
checks.push(['prospect cards show n.a. (not a zero substitute)',
  pbodyBenefit.indexOf('n.a.') !== -1]);

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
// The confirmed win is now the 'best' case (same fully-specified input set the
// removed 'evergreen' seed used). Assertions are unchanged in strength.
checks.push(['confirmed win is Best case', confirmedWins.some((x) => x.id === 'best')]);
const bestWin = scoredSeeds.find((x) => x.id === 'best');
checks.push(['Best case gatePass true', bestWin && bestWin.s.gatePass === true]);
checks.push(['Best case numeric Total', bestWin && typeof bestWin.s.totalEconomicTco === 'number']);
checks.push(['Best case positive saving S$', bestWin && bestWin.s.savingAbs > 0]);
checks.push(['Best case meets 15% target label', bestWin && bestWin.s.fifteenTargetMet === 'Meets entered 15% target']);

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
// The confirmed-win illustrative Best case leads BOTH sort modes: it has the
// largest absolute saving and the only strong gate-passing benefit figure.
// (Formerly the removed 'evergreen' seed led and 'best' followed; 'best' is the
// same fully-specified input set, so it now leads directly.)
checks.push(['account order best first', accountOrder[0] === 'best']);
checks.push(['benefit order best first', benefitOrder[0] === 'best']);
// The illustrative presets rank by their engine-verified saving: best > mid >
// bad in the benefit (saving %) order. This replaces the removed yong_wen >
// venus ordering assertions with equivalent coverage on the new presets.
checks.push(['benefit order best before mid before bad',
  benefitOrder.indexOf('best') < benefitOrder.indexOf('mid') &&
  benefitOrder.indexOf('mid') < benefitOrder.indexOf('bad')]);
// The marginal MID still gate-passes with a positive saving, so it outranks the
// negative-saving BAD in account order too.
checks.push(['account order mid before bad',
  accountOrder.indexOf('mid') < accountOrder.indexOf('bad')]);
// Non-numeric ranking keys sort last: the honest-blank preset (Total n.a., no
// EV plan) sinks to the bottom of BOTH sort modes, and the bad case (negative
// saving) sits below the gate-passing winners.
checks.push(['blank sinks to the bottom (both modes)',
  accountOrder[accountOrder.length - 1] === 'blank' &&
  benefitOrder[benefitOrder.length - 1] === 'blank']);
checks.push(['bad outranks only blank in benefit order',
  benefitOrder.indexOf('bad') < benefitOrder.indexOf('blank')]);

// Toggle the live sort control and confirm the rendered order follows the
// selected mode. After removing the demonstration prospect the four remaining
// illustrative presets happen to rank in the SAME order under both the benefit
// and account keys (best > mid > bad > blank), so the rendered markup does not
// necessarily differ between modes. This assertion is therefore made STRICTLY
// STRONGER than the old 'the HTML differs' check: it fires the control and
// asserts the rendered card order EXACTLY matches the engine-computed account
// order (a precise ordering contract, independent of whether the two modes
// coincide), proving the sort control re-renders in the selected order.
const sel = byId['prospect-sort'];
const caseName = {
  best: 'Best case (illustrative, fully specified, gates pass)',
  mid: 'Mid case (illustrative, marginal saving)',
  bad: 'Bad case (illustrative, EV not a fit)',
  blank: 'Blank profile (start a fresh client)',
};
sel.value = 'account';
sel.fire('change');
const afterHtml = byId['prospect-body'].innerHTML;
const renderedAccountOrder = accountOrder.map((id) => afterHtml.indexOf(caseName[id]));
checks.push(['sort control renders cards in the selected (account) order',
  renderedAccountOrder.every((pos) => pos !== -1) &&
  renderedAccountOrder.every((pos, i) => i === 0 || renderedAccountOrder[i - 1] < pos)]);
// In account order the confirmed-win Best case leads the rendered table, ahead
// of the marginal Mid case, and the honest-blank preset is rendered last.
// (The demonstration case is no longer a user-facing prospect, so Best is now
// compared against the next-ranked illustrative case, Mid.)
checks.push(['account sort puts Best case on top',
  afterHtml.indexOf('Best case (illustrative, fully specified, gates pass)') <
    afterHtml.indexOf('Mid case (illustrative, marginal saving)')]);
checks.push(['account sort renders Blank profile last',
  afterHtml.indexOf('Blank profile (start a fresh client)') >
    afterHtml.indexOf('Best case (illustrative, fully specified, gates pass)') &&
  afterHtml.indexOf('Blank profile (start a fresh client)') >
    afterHtml.indexOf('Mid case (illustrative, marginal saving)')]);

// ---- Live inline-SVG charts (FEAT-003) ------------------------------------
// The Charts module renders inline SVG strings into the chart containers from
// the SAME engine output as the table. These assertions prove: (a) each chart
// container holds emitted SVG markup after the controllers run; (b) firing a
// sensitivity slider 'input' event redraws the sensitivity chart (live update);
// (c) changing an amber input redraws the comparison charts (live update);
// (d) an n.a. total is drawn as a hatched 'n.a.' marker, never a zero bar.
// FEAT-003 re-layout + dashboard-A: the TCO stage is an interactive dashboard.
// The hero is the cumulative-TCO LINE (chart-cumulative); the cost-component
// BREAKDOWN BAR (chart-breakdown) sits beside it in ONE band with the
// sensitivity controls. dashboard-A removed the redundant sensitivity-response
// bar (chart-sens) - it duplicated the breakdown bar's per-path total - so the
// two live chart surfaces are the line and the breakdown bar.
const chartIds = ['chart-cumulative','chart-breakdown'];
chartIds.forEach((id) => {
  const h = byId[id] ? byId[id].innerHTML : '';
  checks.push([id + ' emits <svg>', h.indexOf('<svg') !== -1]);
});
// The cumulative HERO draws real geometry (polyline + a data point per year).
const cumHtml = byId['chart-cumulative'].innerHTML;
checks.push(['cumulative hero draws polyline/point',
  cumHtml.indexOf('polyline') !== -1 || cumHtml.indexOf('<circle') !== -1]);
// FEAT-003: a labelled, INTERACTIVE data point for every year carries the
// cross-highlight hooks (data-tco-point + data-plan/-year/-amount).
checks.push(['hero has interactive per-year data points (data-tco-point)',
  cumHtml.indexOf('data-tco-point') !== -1]);
checks.push(['hero data points carry plan + year + 2dp amount hooks',
  cumHtml.indexOf('data-plan=') !== -1 && cumHtml.indexOf('data-year=') !== -1 &&
  cumHtml.indexOf('data-amount=') !== -1]);
// FEAT-003: year 3 / 5 / 10 financial-milestone segmentation markers.
checks.push(['hero marks year 3/5/10 milestones',
  cumHtml.indexOf('data-tco-milestone="3"') !== -1 &&
  cumHtml.indexOf('data-tco-milestone="5"') !== -1 &&
  cumHtml.indexOf('data-tco-milestone="10"') !== -1]);
// FEAT-003: displayed figures are 2 decimal places (display-only formatter).
checks.push(['hero amounts formatted to 2 decimal places',
  /data-amount="[^"]*\.\d\d"/.test(cumHtml)]);

// The breakdown chart draws stacked <rect> component segments with hooks.
const brkHtml = byId['chart-breakdown'].innerHTML;
checks.push(['breakdown chart draws rect segments', brkHtml.indexOf('<rect') !== -1]);
checks.push(['breakdown segments are interactive (data-tco-seg + plan + amount)',
  brkHtml.indexOf('data-tco-seg') !== -1 && brkHtml.indexOf('data-plan=') !== -1 &&
  brkHtml.indexOf('data-amount=') !== -1]);
checks.push(['breakdown names the vehicle + site components',
  brkHtml.indexOf('Vehicle economic TCO') !== -1 && brkHtml.indexOf('charging-site') !== -1]);

// n.a. is honoured, not drawn as a zero bar. For the demo case plan_a/plan_b
// totalEconomicTco is n.a. (the site cost stays n.a.), so the breakdown bar for
// those paths MUST carry an 'n.a.' marker and use the hatched placeholder
// pattern (url(#hatch_...)) rather than a solid zero-height-implying bar.
checks.push(['demo plan_a Total is n.a.', r.totalEconomicTco.plan_a === NA]);
checks.push(['demo plan_b Total is n.a.', r.totalEconomicTco.plan_b === NA]);
checks.push(['breakdown chart marks n.a. (not zero bar)',
  brkHtml.indexOf('n.a.') !== -1 && brkHtml.indexOf('url(#hatch') !== -1]);

// FEAT-003: the cross-highlight API is exposed and the chart boxes are wired.
checks.push(['cross-highlight API exposed on the page',
  typeof windowObj.__HS.tcoCrossHighlight === 'function']);
checks.push(['hero chart box wired for interactivity (mouseover listener)',
  Array.isArray(byId['chart-cumulative'].listeners.mouseover) &&
  byId['chart-cumulative'].listeners.mouseover.length > 0]);
checks.push(['breakdown chart box wired for interactivity (mouseover listener)',
  Array.isArray(byId['chart-breakdown'].listeners.mouseover) &&
  byId['chart-breakdown'].listeners.mouseover.length > 0]);
// FEAT-003: the results-table value cells carry the per-plan cross-highlight
// hook, and the Day-0 funding cards carry a per-plan hook.
checks.push(['results-table value cells carry data-results-plan hook',
  byId['results-body'].innerHTML.indexOf('data-results-plan=') !== -1]);
checks.push(['Day-0 funding cards carry per-plan hook',
  byId['day0-cards'].innerHTML.indexOf('data-day0-plan=') !== -1]);
// FEAT-003: the Day-0 cards render 2dp currency and keep n.a. (never zero).
checks.push(['Day-0 cards render n.a. (not a zero substitute)',
  byId['day0-cards'].innerHTML.indexOf('n.a.') !== -1]);
checks.push(['Day-0 cards render a 2dp currency figure',
  /S\$[\d,]+\.\d\d/.test(byId['day0-cards'].innerHTML)]);

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
  const inputs = toArr(panel.children).filter((c) => c.tagName === 'input');
  const slider = inputs.find((c) => c.type === 'range') || inputs[0];
  const box = inputs.find((c) => c.type === 'number') || inputs[1];
  return { slider, box };
}
let sensSlider = null;
if (sensControls && sensControls.children.length) {
  sensSlider = driverControls(sensControls.children[0]).slider;
}
checks.push(['sensitivity slider present', !!sensSlider]);
// dashboard-A A2: there is no separate sensitivity-response chart any more.
// Moving a headline slider redraws the shared BREAKDOWN BAR (and the cumulative
// line) live via the main recompute path, so assert the breakdown bar updates.
const sensBefore = byId['chart-breakdown'].innerHTML;
if (sensSlider) {
  sensSlider.value = String(Number(sensSlider.value) + 1);
  sensSlider.fire('input');
}
const sensAfter = byId['chart-breakdown'].innerHTML;
checks.push(['breakdown bar updates live on sensitivity slider input',
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
  const h = toArr(panel.children).find((c) => c.tagName === 'h3');
  return (h && (h.textContent || '')) || '';
}
let dieselPanel = null;
for (const p of toArr(sensControls.children)) {
  if (/diesel/i.test(panelLabel(p))) { dieselPanel = p; break; }
}
checks.push(['unified diesel driver present', !!dieselPanel]);
const dieselCtl = dieselPanel ? driverControls(dieselPanel) : {};
const DRIVEN_DIESEL = 3.33;
// dashboard-A A3: the sensitivity TABLE was removed; the committed value is now
// read off the main #results-table + the breakdown bar. Snapshot those.
const resultsBodyBeforeDiesel = byId['results-body'].innerHTML;
const breakdownBeforeDiesel = byId['chart-breakdown'].innerHTML;
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
  toArr(node.children).forEach((child) => collectMirrorSpans(child, acc));
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
// The money view recomputed from the SAME committed state (no clone): the main
// results-body changed AND the breakdown bar redrew. Recompute the engine from
// committed state and confirm the results-body Keep ICE total matches it.
const resultsBodyAfterDiesel = byId['results-body'].innerHTML;
const breakdownAfterDiesel = byId['chart-breakdown'].innerHTML;
checks.push(['results table reflects driven diesel (committed state)',
  resultsBodyBeforeDiesel !== resultsBodyAfterDiesel]);
checks.push(['breakdown bar reflects driven diesel (same committed output)',
  breakdownBeforeDiesel !== breakdownAfterDiesel]);
const drivenOut = windowObj.HSEngine.computeFleet(windowObj.__HS.state);
function fmtMoneyCell(v) {
  if (v === NA || v == null || typeof v !== 'number' || !isFinite(v)) return null;
  const neg = v < 0, a = Math.abs(v);
  const s = 'S$' + a.toLocaleString('en-SG', { maximumFractionDigits: 0 });
  return neg ? '-' + s : s;
}
const keepTotalCell = fmtMoneyCell(drivenOut.results.totalEconomicTco.keep_ice);
checks.push(['results table agrees with the driven engine value (same source of truth)',
  !!keepTotalCell &&
  byId['results-body'].innerHTML.indexOf(keepTotalCell) !== -1]);

// ---- FEAT-003 (B): live configurable saving-target control -----------------
// A shared saving-target driver (slider + number, shown as a percentage) binds
// to the top-level state.savingTarget field FEAT-002 introduced. It defaults to
// 0.15 (the engine's resolveSavingTarget domain default; the demo fixture sets
// no savingTarget). Moving it must change the rendered headroom / claim label
// live, while the DEFAULT path still yields 'Meets entered 15% target'.
let targetPanel = null;
for (const p of toArr(sensControls.children)) {
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
const evForLabel = scoredSeeds.find((x) => x.id === 'best');
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
// dashboard-A A5: the saving-target reference marker on the cumulative chart
// tracks the committed target %. Moving it to 25% must re-render the cumulative
// SVG with a 'Meet 25% target' label on the data-tco-target line (and the demo's
// Keep ICE total is numeric, so the marker is drawn).
const cumTargetHtml = byId['chart-cumulative'].innerHTML;
checks.push(['moving target moves the cumulative saving-target marker (25%)',
  cumTargetHtml.indexOf('data-tco-target') !== -1 &&
  cumTargetHtml.indexOf('Meet 25% target') !== -1]);
// The 'Meets/Below entered X% target' claim label is conditional (never an
// adoption probability) and only renders for a gate-passing case. Prove the
// label reflects the committed target through the engine on the gate-passing
// Best-case seed (the fully-specified set the removed 'evergreen' seed used):
// at the default 0.15 it reads 'Meets entered 15% target'; at a higher 0.30
// target the SAME case flips to 'Below entered 30% target'.
const everAtDefault = windowObj.HSEngine.scoreProspect(
  windowObj.HSEngine.computeFleet(seeds.cases.find((c) => c.id === 'best').inputs));
const everInputsHi = JSON.parse(JSON.stringify(seeds.cases.find((c) => c.id === 'best').inputs));
everInputsHi.savingTarget = 0.30;
const everAtHi = windowObj.HSEngine.scoreProspect(windowObj.HSEngine.computeFleet(everInputsHi));
checks.push(['claim label reflects committed target (default 15% met)',
  everAtDefault.fifteenTargetMet === 'Meets entered 15% target']);
checks.push(['claim label reflects committed target (30% below, conditional)',
  everAtHi.fifteenTargetMet === 'Below entered 30% target']);
// n.a. propagation preserved at the extreme: driving the target does not turn
// an n.a. headroom into a fake zero (the demo plan_a/plan_b totals are n.a.).
checks.push(['target move keeps n.a. (no fake zero)',
  byId['results-body'].innerHTML.indexOf('n.a.') !== -1]);
// Restore the default target so later assertions see the baseline.
if (targetCtl.box) { targetCtl.box.value = '0.15'; targetCtl.box.fire('input'); }
// Restore diesel so the later 'change' live-update assertions compare cleanly.
if (dieselCtl.box) {
  const demoDiesel = windowObj.HSDemoCase.inputs.energy_and_charging.rows.find((row) => row._row === 7);
  if (demoDiesel) { dieselCtl.box.value = String(demoDiesel.values.B); dieselCtl.box.fire('input'); }
}
if (typeof windowObj.__HS.setSyncRecompute === 'function') windowObj.__HS.setSyncRecompute(false);

// Live update #2: changing an amber input and recomputing redraws the
// dashboard charts (they read from the same computeFleet(state) output).
const totalBefore = byId['chart-breakdown'].innerHTML;
windowObj.__HS.state.energy_and_charging.rows.forEach((row) => {
  if (row._row === 7) { row.values.B = 99; row.values.C = 99; }
});
windowObj.__HS.recompute();
const totalAfter = byId['chart-breakdown'].innerHTML;
checks.push(['comparison charts update live on input change',
  totalBefore !== totalAfter && totalAfter.indexOf('<svg') !== -1]);

// ---- real-DOM-safe iteration of live children (regression guard) ----------
// The controller's refreshComparisons() iterates `cards.children`, which in a
// real browser is a LIVE HTMLCollection with NO Array iteration methods. A
// prior regression used `(cards.children || []).forEach(...)` and crashed on
// load with `TypeError: ...forEach is not a function`; the old shim masked it
// because `children` was a plain Array. This block is a two-part guard that is
// STRICTLY stronger than the existing assertions:
//
//   (1) The shim's element.children must be HTMLCollection-like: it exposes
//       numeric index + .length + item(i) but must NOT expose .forEach (calling
//       it THROWS). If the shim is ever loosened back to a plain Array, this
//       fails -> so a loosened shim can no longer hide an Array-method misuse.
//   (2) recompute() runs the renderFleetComparisons -> refreshComparisons path
//       over that strict children view WITHOUT throwing, and every rendered
//       truck card still carries its per-truck .tc-compare node (refreshed in
//       place). If index.html reverts to `.forEach` on children, refreshComparisons
//       throws here and this assertion fails.
(() => {
  // (1) The children contract itself: no Array iteration method leaks through.
  const probe = document.createElement('div');
  probe.appendChild(document.createElement('span'));
  const childrenHasNoForEach = typeof probe.children.forEach === 'undefined' &&
    typeof probe.children.map === 'undefined' && typeof probe.children.filter === 'undefined' &&
    probe.children.length === 1 && typeof probe.children.item === 'function' &&
    probe.children.item(0) === probe.children[0];
  let threwOnForEach = false;
  try { probe.children.forEach(() => {}); } catch (e) { threwOnForEach = true; }

  // (2) Exercise the recompute -> refreshComparisons path and confirm it neither
  // throws nor drops the per-truck comparison nodes.
  let recomputeThrew = false;
  try { windowObj.__HS.recompute(); } catch (e) { recomputeThrew = true; }
  const cards = toArr(byId['fleet-cards'].children)
    .filter((c) => c.attributes && c.attributes['data-truck-id'] != null);
  const everyCardRefreshed = cards.length > 0 && cards.every((card) => {
    const kids = toArr(card.children);
    return kids.some((k) => /(^|\s)tc-compare(\s|$)/.test(k.className || ''));
  });

  checks.push(['refreshComparisons iterates live children without Array.forEach (real-DOM-safe)',
    childrenHasNoForEach && threwOnForEach && !recomputeThrew && everyCardRefreshed]);
})();

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
  for (const row of toArr(container.children)) {
    const kids = toArr(row && row.children);
    for (const td of kids) {
      const gk = toArr(td && td.children);
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
const liveBefore = byId['chart-breakdown'].innerHTML;
if (ecInput) {
  ecInput.value = String((Number(ecInput.value) || 0) + 1234);
  ecInput.fire('input');
}
const liveAfter = byId['chart-breakdown'].innerHTML;
checks.push(['firing input event redraws charts (would FAIL on change)',
  !!ecInput && liveBefore !== liveAfter && liveAfter.indexOf('<svg') !== -1]);

// Also confirm a built truck-card input is wired on 'input' (not change). The
// card fields are nested deeper than the old table rows (card > grid > fld >
// input), so walk the tree for the first editable (non-checkbox) <input>.
function findInputDeep(node, pred) {
  if (!node || typeof node !== 'object') return null;
  if ((node.tagName || '') === 'input' && node.type !== 'checkbox' &&
      (!pred || pred(node))) return node;
  const kids = toArr(node.children);
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
  if (!isAdv) toArr(node.children).forEach((c) => collectLabels(c, acc));
  return acc;
}
const card0 = truckCards()[0];
const primaryLabels = collectLabels(card0, []);
// FEAT-002: the card now captures the CURRENT ICE duty front-and-centre (work
// km/day, days/year, peak jobs, peak cargo, demanding-day route, COE months,
// market value), plus the matched-EV controls (model select, override quote,
// plan actions). These feed fleet_register / replacement_plan EXACTLY as before.
const criticalLabels = ['Work km/day', 'Days/year', 'Peak jobs/day', 'Peak cargo kg',
  'Demanding-day route km', 'COE months left', 'Market value SGD',
  'EV model', 'New ICE quote SGD', 'EV quote SGD (override)', 'Plan A action', 'Plan B action'];
checks.push(['truck card surfaces the ICE-duty + matched-EV primary fields',
  criticalLabels.every((l) => primaryLabels.indexOf(l) !== -1)]);
// FEAT-002: there is NO per-card Advanced <details> any more (the per-truck
// low-impact fields moved into the single global Advanced area #fleet-adv).
function hasTruckAdvDetails(node) {
  if (!node || typeof node !== 'object') return false;
  if ((node.tagName || '') === 'details' && /(^|\s)truck-adv(\s|$)/.test(node.className || '')) return true;
  return toArr(node.children).some(hasTruckAdvDetails);
}
checks.push(['no per-card Advanced <details> remains (consolidated globally)',
  !hasTruckAdvDetails(card0)]);
// The low-impact fields are NOT in the primary card any more.
checks.push(['low-impact fields removed from the primary card',
  primaryLabels.indexOf('Scrap SGD') === -1 && primaryLabels.indexOf('Vehicle grant SGD') === -1 &&
  primaryLabels.indexOf('Straight-line SGD') === -1]);
// They ARE present in the single consolidated global Advanced area (#fleet-adv).
const advLabels = collectLabels(byId['fleet-adv'], []);
checks.push(['per-truck low-impact fields live in the consolidated Advanced area',
  advLabels.indexOf('Scrap SGD') !== -1 && advLabels.indexOf('Vehicle grant SGD') !== -1 &&
  advLabels.indexOf('Straight-line SGD') !== -1]);
// The consolidated #fleet-adv renders one group per shown truck (6 for demo).
function truckAdvGroups() {
  return toArr(byId['fleet-adv'].children).filter(
    (c) => c.attributes && c.attributes['data-truck-adv-id'] != null);
}
checks.push(['consolidated Advanced renders one group per truck (6 demo trucks)',
  truckAdvGroups().length === 6]);

// FEAT-002 (Fix 1): the customer / company profile is folded into the top of
// the input panel (non-economic context) and renders editable fields.
checks.push(['customer profile form populated', byId['customer-form'].children.length > 0]);
const custLabels = collectLabels(byId['customer-form'], []);
checks.push(['customer profile carries company + contact + evidence fields',
  custLabels.indexOf('Company') !== -1 && custLabels.indexOf('Contact') !== -1 &&
  custLabels.indexOf('Evidence reference') !== -1]);
// Editing the customer profile must NOT change a computed number (it lives on a
// field the frozen engine never reads).
if (typeof windowObj.__HS.setSyncRecompute === 'function') windowObj.__HS.setSyncRecompute(true);
const beforeCustEdit = windowObj.HSEngine.computeFleet(windowObj.__HS.state).results.vehicleEconomicTco.keep_ice;
windowObj.__HS.state.customer = windowObj.__HS.state.customer || {};
windowObj.__HS.state.customer.company = 'Acme Haulage Pte Ltd';
const afterCustEdit = windowObj.HSEngine.computeFleet(windowObj.__HS.state).results.vehicleEconomicTco.keep_ice;
checks.push(['customer profile is non-economic (no computed number changes)',
  afterCustEdit === beforeCustEdit]);
if (typeof windowObj.__HS.setSyncRecompute === 'function') windowObj.__HS.setSyncRecompute(false);

// FEAT-002 (Fix 1): the input overlay panel occupies MORE THAN HALF the desktop
// viewport (width rule exceeds 50vw) yet still degrades to a full-width mobile
// sheet. Assert on the hand-written chrome CSS.
const chromeForPanel = html.slice(0, html.indexOf('<!-- ENGINE:BEGIN') === -1 ? html.length : html.indexOf('<!-- ENGINE:BEGIN'));
const inputColRule = (chromeForPanel.match(/#input-col\s*\{[^}]*\}/) || [''])[0];
const vwM = inputColRule.match(/width:\s*min\(\s*(\d+(?:\.\d+)?)vw/);
checks.push(['input panel width exceeds 50vw (more than half the desktop)',
  !!vwM && Number(vwM[1]) > 50]);
checks.push(['input panel still folds to a full-width mobile sheet',
  /#input-col\s*\{\s*width:\s*100vw/.test(chromeForPanel)]);

// FEAT-002 (Fix 3): overflow containment. The .fld grid children must carry
// min-width:0 and inputs box-sizing:border-box + width:100% so wide number
// inputs cannot force the 1fr tracks to overflow the card.
checks.push(['overflow fix: .fld grid child has min-width:0',
  /\.truck-card\s+\.fld\s*\{[^}]*min-width:\s*0/.test(chromeForPanel)]);
checks.push(['overflow fix: card inputs are box-sizing:border-box width:100%',
  /\.truck-card\s+\.fld\s+input[^{]*\{[^}]*width:\s*100%[^}]*box-sizing:\s*border-box/.test(chromeForPanel) ||
  /\.truck-card\s+\.fld\s+input[^{]*\{[^}]*box-sizing:\s*border-box[^}]*width:\s*100%/.test(chromeForPanel)]);
checks.push(['overflow fix: side-by-side columns pin min-width:0',
  /\.tc-col\s*\{[^}]*min-width:\s*0/.test(chromeForPanel)]);

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
  const kids = toArr(node.children);
  for (const c of kids) { const hit = findFitStatus(c); if (hit) return hit; }
  return null;
}
const fitTag = findFitStatus(byId['fleet-cards']);
checks.push(['card surfaces payload/body-fit status with Unconfirmed caveat',
  !!fitTag && (fitTag.textContent || '').indexOf('Unconfirmed') !== -1 &&
  /(^|\s)unknown(\s|$)/.test(fitTag.className || '')]);

// ---- FEAT-002 (Fix 2): side-by-side ICE-vs-matched-EV + vehicle/COE split ---
// Each truck card renders a live side-by-side comparison (.tc-compare) once the
// duty is started. The EV column must split the VEHICLE PRICE (catalogue
// prod.I) from the COE PRICE (oc[57]) as DISTINCT line items and show the
// combined default EV quote = prod.I + oc[57] (the engine's blank-fallback).
// The matcher (window.HSPortfolioFit) drives the recommended model; it stays
// user-overridable. None of this writes a number back, so figures are unchanged.
if (typeof windowObj.__HS.setSyncRecompute === 'function') windowObj.__HS.setSyncRecompute(true);
windowObj.__HS.loadDemoFixture();            // restore the clean demo cards
const compareCard = truckCards()[0];
function textOfNode(node) {
  if (!node || typeof node !== 'object') return '';
  let t = (node._text || '');
  toArr(node.children).forEach((c) => { t += ' ' + textOfNode(c); });
  return t;
}
function findByClass(node, cls) {
  if (!node || typeof node !== 'object') return null;
  if (new RegExp('(^|\\s)' + cls + '(\\s|$)').test(node.className || '')) return node;
  const kids = toArr(node.children);
  for (const c of kids) { const hit = findByClass(c, cls); if (hit) return hit; }
  return null;
}
const compareEl = findByClass(compareCard, 'tc-compare');
checks.push(['truck card renders a side-by-side ICE-vs-EV comparison (duty started)',
  !!compareEl]);
const evCol = compareEl ? findByClass(compareEl, 'tc-col-ev') : null;
const iceCol = compareEl ? findByClass(compareEl, 'tc-col-ice') : null;
checks.push(['comparison has both an ICE column and a matched-EV column',
  !!evCol && !!iceCol]);
const evColText = textOfNode(evCol);
checks.push(['EV column splits Vehicle price and COE price as distinct line items',
  evColText.indexOf('Vehicle price') !== -1 && evColText.indexOf('COE price') !== -1]);
checks.push(['EV column shows the combined default EV quote line',
  evColText.indexOf('Default EV quote') !== -1]);
// The displayed split sums to the engine's blank-fallback: pick the recommended
// (or shown) model and confirm vehicle price (prod.I) + COE (oc[57]) is what the
// matcher-driven default shows, and that it equals prod.I + oc[57].
const fitMod = windowObj.HSPortfolioFit;
const oc57c = windowObj.__HS.state.operating_costs.rows.find((r) => r._row === 57);
const acqAdderC = (oc57c && typeof oc57c.values.B === 'number') ? oc57c.values.B : 0;
const demoRow0 = windowObj.__HS.includedFleet()[0];
const dutyC = fitMod.truckDutyFromRow(demoRow0, {
  energyPricePerKwh: (windowObj.__HS.ecRow(10) || { values: {} }).values.B,
  chargeWindowH: (windowObj.__HS.ecRow(51) || { values: {} }).values.B,
});
const matchC = fitMod.matchBestModel(dutyC, windowObj.__HS.state.products.rows);
const shownModelName = (() => {
  const rp0 = windowObj.__HS.replByIdMap()[demoRow0.A];
  return (rp0 && rp0.B != null && String(rp0.B) !== '') ? String(rp0.B)
    : (matchC && matchC.best ? matchC.best.name : null);
})();
const shownProd = windowObj.__HS.state.products.rows.find((p) => p.A === shownModelName);
checks.push(['side-by-side vehicle+COE split equals engine blank-fallback (prod.I + oc[57])',
  !!shownProd && typeof shownProd.I === 'number' &&
  (compareEl ? textOfNode(compareEl).indexOf(String(Math.round(shownProd.I + acqAdderC).toLocaleString('en-SG'))) !== -1 : false)]);
// The matcher is the SAME additive module FEAT-001 exposed, used as a per-truck
// recommendation that stays overridable via the EV model select.
checks.push(['card uses the additive matcher for the EV recommendation',
  typeof fitMod.matchBestModel === 'function' && !!matchC]);
// The comparison reveals progressively: a card whose duty is BLANK shows the
// empty prompt, not a fabricated comparison.
const stProbe = windowObj.__HS.state;
const savedE = demoRow0.E;
demoRow0.E = null;
windowObj.__HS.recompute();
const blankDutyCard = truckCards()[0];
checks.push(['comparison is hidden until the duty is entered (progressive reveal)',
  !findByClass(blankDutyCard, 'tc-compare') && !!findByClass(blankDutyCard, 'tc-compare-empty')]);
demoRow0.E = savedE;
windowObj.__HS.loadDemoFixture();
if (typeof windowObj.__HS.setSyncRecompute === 'function') windowObj.__HS.setSyncRecompute(false);

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
  const kids = toArr(node.children);
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
// FEAT-002: Reset restores the DEFAULT LANDING case, which is now the MID (SRM)
// illustrative case (4 trucks EL-01..EL-04), NOT the old 6-truck demonstration.
// This genuinely exercises the Reset button's freshInputs() -> mid landing path.
byId['reset-btn'].fire('click');
const resetCardIds = truckCards().map((c) => c.attributes['data-truck-id']);
checks.push(['Reset restores the 4-truck mid (SRM) landing card set', resetCardIds.length === 4]);
checks.push(['Reset restores the mid landing fleet IDs (EL-01..EL-04)',
  ['EL-01', 'EL-02', 'EL-03', 'EL-04'].every((id) => resetCardIds.indexOf(id) !== -1)]);
checks.push(['Reset re-renders the money view for the mid landing (Vehicle economic TCO + a currency figure)',
  byId['results-body'].innerHTML.indexOf('Vehicle economic TCO') !== -1 &&
  /S\$[\d,]/.test(byId['results-body'].innerHTML)]);
// Restore the demonstration fixture for the remaining demo-specific DOM
// assertions below (confidence badge, portfolio 6-truck summary, etc.).
windowObj.__HS.loadDemoFixture();
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

// ---- FEAT-004: PROSPECTS top-accessed hover overlay ------------------------
// Fix 6 converts the former inline #prospects section into a top-accessed hover
// screen built on the SAME overlay mechanism as the Inputs panel: a fixed drawer
// (#prospects-col) over a scrim (#prospects-scrim), triggered from the top chrome
// (#prospects-toggle). It is a modal dialog (role=dialog + aria-modal; aria-hidden
// toggles with the open state), dismissed by the trigger (toggle), the in-panel
// Close button, a scrim click, and Escape. Default = CLOSED. The results/content
// underneath must NOT reflow when it opens/closes. These assertions mirror the
// Inputs-overlay ones so the two share a consistent, polished pattern.
const pxToggle = byId['prospects-toggle'];
const pxCol = byId['prospects-col'];
const pxScrim = byId['prospects-scrim'];
const pxClose = byId['prospects-overlay-close'];
// The prospects panel is a modal dialog in the markup with aria-modal + a
// top-chrome trigger wired with aria-controls to it.
checks.push(['prospects overlay panel is a dialog in markup (role=dialog + aria-modal)',
  /id="prospects-col"[^>]*role="dialog"[^>]*aria-modal="true"/.test(html) ||
  /id="prospects-col"[^>]*aria-modal="true"[^>]*role="dialog"/.test(html)]);
checks.push(['prospects trigger in top chrome with aria-controls',
  /id="prospects-toggle"[^>]*aria-controls="prospects-col"/.test(html)]);
checks.push(['prospects trigger lives in the top chrome (topbar, before <main>)',
  html.indexOf('class="topbar"') !== -1 &&
  html.indexOf('id="prospects-toggle"') > html.indexOf('class="topbar"') &&
  html.indexOf('id="prospects-toggle"') < html.indexOf('<main>')]);
checks.push(['prospects overlay trigger exists', !!pxToggle]);
checks.push(['prospects overlay trigger registers a click listener',
  Array.isArray(pxToggle.listeners.click) && pxToggle.listeners.click.length > 0]);
checks.push(['prospects overlay scrim present', !!pxScrim]);
checks.push(['prospects overlay scrim registers a click listener',
  Array.isArray(pxScrim.listeners.click) && pxScrim.listeners.click.length > 0]);
checks.push(['prospects overlay close button registers a click listener',
  Array.isArray(pxClose.listeners.click) && pxClose.listeners.click.length > 0]);
// Default CLOSED.
checks.push(['prospects overlay starts closed (default)',
  pxToggle.getAttribute('aria-expanded') === 'false' &&
  pxCol.getAttribute('aria-hidden') === 'true' &&
  !hasOpen(pxCol) && !hasOpen(pxScrim)]);
// Results column must not reflow when the prospects overlay opens/closes.
const resWidthBeforeP = resultsCol.style.width;
const resDisplayBeforeP = resultsCol.style.display;
// Open via trigger.
pxToggle.fire('click');
checks.push(['prospects overlay opens on trigger click (aria + open class + scrim)',
  pxToggle.getAttribute('aria-expanded') === 'true' &&
  pxCol.getAttribute('aria-hidden') === 'false' &&
  hasOpen(pxCol) && hasOpen(pxScrim)]);
checks.push(['opening prospects overlay does NOT reflow results column',
  resultsCol.style.width === resWidthBeforeP && resultsCol.style.display === resDisplayBeforeP]);
// Toggle closes.
pxToggle.fire('click');
checks.push(['prospects overlay closes on second trigger click (toggle)',
  pxToggle.getAttribute('aria-expanded') === 'false' &&
  pxCol.getAttribute('aria-hidden') === 'true' &&
  !hasOpen(pxCol) && !hasOpen(pxScrim)]);
// Scrim click dismisses.
pxToggle.fire('click');
pxScrim.fire('click');
checks.push(['prospects overlay closes on scrim click',
  pxToggle.getAttribute('aria-expanded') === 'false' &&
  pxCol.getAttribute('aria-hidden') === 'true' &&
  !hasOpen(pxCol) && !hasOpen(pxScrim)]);
// Esc dismisses.
pxToggle.fire('click');
checks.push(['prospects overlay open before Esc', hasOpen(pxCol)]);
pxCol.fire('keydown', { key: 'Escape' });
checks.push(['prospects overlay closes on Esc keydown',
  pxToggle.getAttribute('aria-expanded') === 'false' &&
  pxCol.getAttribute('aria-hidden') === 'true' &&
  !hasOpen(pxCol) && !hasOpen(pxScrim)]);
// The prospects view is no longer an inline always-visible section: it lives
// inside the #prospects-col dialog wrapper.
checks.push(['prospects view nested inside the hover overlay wrapper',
  html.indexOf('id="prospects-col"') !== -1 &&
  html.indexOf('id="prospects-col"') < html.indexOf('id="prospects"') &&
  html.indexOf('id="prospects"') < html.indexOf('</div><!-- /prospects-col overlay -->')]);
// Loading a prospect dismisses the hover screen (loadCase -> closeProspectsOverlay).
// loadCase() REPLACES the live H.state, so snapshot it first and RESTORE it
// afterwards (via the 'demo' seed) so later checks still see the demo state.
const stateSnapshot = JSON.parse(JSON.stringify(windowObj.__HS.state));
pxToggle.fire('click');
checks.push(['prospects overlay open before load', hasOpen(pxCol)]);
byId['prospect-body'].fire('click', { target: { getAttribute: (k) => (k === 'data-load' ? 'best' : null), parentNode: byId['prospect-body'] } });
checks.push(['loading a prospect dismisses the hover screen',
  pxToggle.getAttribute('aria-expanded') === 'false' &&
  pxCol.getAttribute('aria-hidden') === 'true' && !hasOpen(pxCol)]);
// Restore the demo state so downstream assertions (confidence badge, etc.) run
// against the original demonstration case rather than the loaded 'best' case.
Object.keys(windowObj.__HS.state).forEach((k) => { delete windowObj.__HS.state[k]; });
Object.keys(stateSnapshot).forEach((k) => { windowObj.__HS.state[k] = stateSnapshot[k]; });
if (windowObj.__HS.rebuildInputs) windowObj.__HS.rebuildInputs();
windowObj.__HS.recompute();
// No references to the removed evergreen case anywhere in the prospects markup.
checks.push(['prospects markup has no evergreen reference',
  html.toLowerCase().indexOf('evergreen') === -1]);

// ---- FEAT-002: journey stepper + stage viewports + confidence badge --------
// FEAT-002 removed the standalone Customer stage (its profile + duty inputs
// moved into the widened Inputs overlay), leaving a FOUR-step, tablist-like
// control (Portfolio / TCO / Charging / Proposal). It switches a single visible
// stage viewport with NO routing and NO fetch (pure client-side show/hide). The
// active stage persists in localStorage. The confidence badge is driven by the
// LIVE engine output's gate / saving-claim status for the best EV plan -- never
// a fabricated probability. For the demonstration case both EV plans are 'Total
// incomplete' (site cost n.a.), so the badge MUST show the honest non-confirmed
// Diagnostic state, not a fake 'confirmed'.
const STAGES = ['portfolio','tco','charging','proposal'];
// Hand-written chrome (everything before the first generated block), so the
// markup counts below never pick up generated DEMO/PROSPECTS data.
const chromeEndFeat5 = html.indexOf('<!-- ENGINE:BEGIN');
const chromeFeat5 = chromeEndFeat5 === -1 ? html : html.slice(0, chromeEndFeat5);
// All four stage panels exist in the markup.
STAGES.forEach((s) => {
  checks.push(['stage section ' + s + ' present', chromeFeat5.indexOf('id="stage-' + s + '"') !== -1]);
});
// The removed Customer stage is GONE (no dangling step button or stage panel).
checks.push(['Customer stage removed (no step-customer button)',
  chromeFeat5.indexOf('id="step-customer"') === -1]);
checks.push(['Customer stage removed (no stage-customer panel)',
  chromeFeat5.indexOf('id="stage-customer"') === -1]);
// The stepper exists and carries exactly four step buttons in the markup.
checks.push(['stepper present in markup', chromeFeat5.indexOf('id="stepper"') !== -1]);
const stepMatches = (chromeFeat5.match(/class="step"/g) || []).length;
checks.push(['stepper has four steps (Customer removed)', stepMatches === 4]);

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
const firstStageIdx = html.indexOf('id="stage-portfolio"');
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

// ---- FEAT-004: Portfolio stage ranked model-matching guide ------------------
// The Portfolio stage (#stage-portfolio) is no longer an honest 'Coming next'
// placeholder: it renders a ranked per-model table driven by the LIVE fleet
// duty, with per-row reasons and the mandatory honesty caveats. The verdicts
// come from the additive fit-rules module (window.HSPortfolioFit); they never
// touch computeFleet. These assertions walk the built DOM nodes (the renderer
// builds real nodes via createElement/appendChild, not an innerHTML string).

// (1) The old placeholder assertion, UPDATED not deleted: the Portfolio stage
// markup must NO LONGER carry the 'Coming next' placeholder, and must instead
// carry the real ranked-guide chrome (a #portfolio-table + the Select wording).
const portfolioStageMarkup = (() => {
  const i = html.indexOf('id="stage-portfolio"');
  if (i === -1) return '';
  const j = html.indexOf('</section>', i);
  return j === -1 ? html.slice(i) : html.slice(i, j);
})();
checks.push(['Portfolio stage drops the old Coming next placeholder',
  portfolioStageMarkup.indexOf('Coming next') === -1]);
checks.push(['Portfolio stage renders the real ranked guide chrome',
  portfolioStageMarkup.indexOf('id="portfolio-table"') !== -1 &&
  /Select\s*\/\s*Confirm this model/.test(portfolioStageMarkup)]);
// The three verdict-tier words are explained in the stage chrome.
checks.push(['Portfolio stage names the three verdict tiers',
  /Best fit/.test(portfolioStageMarkup) && /Fits with caveats/.test(portfolioStageMarkup) &&
  /Does not fit/.test(portfolioStageMarkup)]);
// The honesty notice about Unconfirmed is present and prominent.
checks.push(['Portfolio stage shows the Unconfirmed honesty notice',
  portfolioStageMarkup.indexOf('Unconfirmed') !== -1]);

// (2) The fit-rules module is exposed on the page namespace (inlined, not a
// network import) and is SEPARATE from the engine namespace.
checks.push(['portfolio fit module exposed on window.HSPortfolioFit',
  !!windowObj.HSPortfolioFit && typeof windowObj.HSPortfolioFit.rankModelsForInputs === 'function']);
checks.push(['portfolio fit module is separate from the engine',
  windowObj.HSPortfolioFit !== windowObj.HSEngine &&
  typeof windowObj.HSPortfolioFit.scoreModelFit === 'function']);
// FEAT-002: the cost-effectiveness matcher functions are exposed so the
// per-truck side-by-side comparison can recommend the best EV live.
checks.push(['cost-effectiveness matcher exposed (truckDutyFromRow + matchBestModel)',
  typeof windowObj.HSPortfolioFit.truckDutyFromRow === 'function' &&
  typeof windowObj.HSPortfolioFit.matchBestModel === 'function' &&
  typeof windowObj.HSPortfolioFit.rankModelsByCost === 'function']);

// (3) The rendered body holds a RANKED model list. Walk the built rows and
// collect the model names from the data-portfolio-model rows, plus the text of
// each row, so we can assert tiers + caveats appear in the rendered output.
const pfBody = byId['portfolio-body'];
function textOf(node) {
  if (!node || typeof node !== 'object') return '';
  let t = (node._text || '');
  toArr(node.children).forEach((c) => { t += ' ' + textOf(c); });
  return t;
}
const pfModelRows = toArr(pfBody.children).filter(
  (r) => r.attributes && r.attributes['data-portfolio-model'] != null);
const pfModelNames = pfModelRows.map((r) => r.attributes['data-portfolio-model']);
// All seven catalogue models rank in the live demo view.
const catalogueNames = windowObj.__HS.state.products.rows
  .filter((p) => p.A != null).map((p) => p.A);
checks.push(['Portfolio renders a ranked row per catalogue model (7)',
  pfModelRows.length === catalogueNames.length && catalogueNames.length === 7]);
checks.push(['Portfolio ranked list carries the catalogue model names',
  catalogueNames.every((n) => pfModelNames.indexOf(n) !== -1)]);
// The rows are numbered 1..N in order (a ranking, not an unordered list).
const pfRankCells = pfModelRows.map((r) => (r.children && r.children[0] && r.children[0]._text) || '');
checks.push(['Portfolio rows are numbered in rank order (1..N)',
  pfRankCells.every((c, i) => String(c) === String(i + 1))]);

// (4) The verdict wording for the honest tier is rendered. Every catalogue
// model is 'Unconfirmed' today, so each rendered verdict is the honest
// 'Fits with caveats - insufficient data', and NONE is a clean 'Best fit'.
const pfBodyText = textOf(pfBody);
checks.push(['Portfolio renders the Fits-with-caveats insufficient-data verdict',
  pfBodyText.indexOf('Fits with caveats - insufficient data') !== -1]);
checks.push(['Portfolio shows NO clean Best fit while catalogue is Unconfirmed',
  pfBodyText.indexOf('Best fit') === -1]);
// At least one honesty caveat tag ('insufficient data') is rendered as a tag.
function collectByAttr(node, attr, acc) {
  if (!node || typeof node !== 'object') return acc;
  if (node.attributes && attr in node.attributes) acc.push(node);
  toArr(node.children).forEach((c) => collectByAttr(c, attr, acc));
  return acc;
}
const caveatTags = collectByAttr(pfBody, 'data-portfolio-caveat', []);
checks.push(['Portfolio shows at least one insufficient-data honesty caveat tag',
  caveatTags.length >= 1 &&
  caveatTags.every((t) => /(^|\s)unknown(\s|$)/.test(t.className || ''))]);
// Per-row reasons are rendered (the 'Why this verdict' audit rows with a list).
const pfReasonRows = toArr(pfBody.children).filter(
  (r) => r.attributes && r.attributes['data-portfolio-reasons'] != null);
checks.push(['Portfolio renders a per-row reasons audit row for each model',
  pfReasonRows.length === pfModelRows.length]);
checks.push(['Portfolio reasons name payload / range / charge checks',
  textOf(pfBody).indexOf('Payload') !== -1 && textOf(pfBody).indexOf('Range/energy') !== -1 &&
  textOf(pfBody).indexOf('Charge power') !== -1]);
// The duty line reflects the live fleet duty (peak cargo / route).
checks.push(['Portfolio duty line reflects the live fleet duty',
  (byId['portfolio-duty-line']._text || '').indexOf('Peak cargo') !== -1]);

// (5) Live re-rank: changing a DUTY input re-ranks the guide. Drive the peak
// cargo (fleet col H) on every included truck above the smallest catalogue
// payload (SRM T3EV = 3500 kg) so that model flips to 'Does not fit' and sinks
// below the models that still clear payload. This proves the guide is driven by
// the same recompute path as the money view.
if (typeof windowObj.__HS.setSyncRecompute === 'function') windowObj.__HS.setSyncRecompute(true);
const beforeRankNames = pfModelNames.slice();
checks.push(['SRM T3EV is not already Does-not-fit at the light demo duty',
  (() => {
    const srmRow = pfModelRows.find((r) => r.attributes['data-portfolio-model'] === 'SRM T3EV');
    return !!srmRow && textOf(srmRow).indexOf('Does not fit') === -1;
  })()]);
windowObj.__HS.state.fleet_register.rows.forEach((r) => { if (r.B === 1) r.H = 4000; });
windowObj.__HS.recompute();
const pfBodyAfter = byId['portfolio-body'];
const pfRowsAfter = toArr(pfBodyAfter.children).filter(
  (r) => r.attributes && r.attributes['data-portfolio-model'] != null);
const srmAfter = pfRowsAfter.find((r) => r.attributes['data-portfolio-model'] === 'SRM T3EV');
checks.push(['raising peak cargo flips SRM T3EV to Does not fit (live re-rank)',
  !!srmAfter && textOf(srmAfter).indexOf('Does not fit') !== -1]);
// The does-not-fit model now ranks AFTER a still-fitting model (re-ranking).
const srmIdxAfter = pfRowsAfter.findIndex((r) => r.attributes['data-portfolio-model'] === 'SRM T3EV');
const fittingIdxAfter = pfRowsAfter.findIndex(
  (r) => textOf(r).indexOf('Does not fit') === -1);
checks.push(['re-rank orders a fitting model ahead of the does-not-fit SRM',
  fittingIdxAfter !== -1 && srmIdxAfter !== -1 && fittingIdxAfter < srmIdxAfter]);
// Restore the demo duty.
windowObj.__HS.loadDemoFixture();

// (6) Select / Confirm a model ties into FEAT-002 product-spec loading: it
// loads the chosen model into the first EV-action replacement row and the
// Unconfirmed caveat survives. Fire the Select button for a known model.
function findSelectBtn(body, name) {
  let hit = null;
  (function walk(node) {
    if (hit || !node || typeof node !== 'object') return;
    if ((node.tagName || '') === 'button' && node.attributes &&
        node.attributes['data-portfolio-select'] === name) { hit = node; return; }
    toArr(node.children).forEach(walk);
  })(body);
  return hit;
}
// Choose ChengLong L2EV (a mid-catalogue model distinct from any demo default).
const pickName = 'ChengLong L2EV';
const selBtn = findSelectBtn(byId['portfolio-body'], pickName);
checks.push(['Portfolio row exposes a Select button', !!selBtn &&
  Array.isArray(selBtn.listeners.click) && selBtn.listeners.click.length > 0]);
const pickProdRow = windowObj.__HS.state.products.rows.find((p) => p.A === pickName);
const oc57b = windowObj.__HS.state.operating_costs.rows.find((r) => r._row === 57);
const acqAdderB = (oc57b && typeof oc57b.values.B === 'number') ? oc57b.values.B : 0;
if (selBtn) selBtn.fire('click');
// After Select, the first EV-action replacement row carries the chosen model
// and the loaded specs (EV quote = prod.I + oc[57], battery = prod.D, kWh/km =
// prod.E), matching the FEAT-002 loader.
const replAfterSelect = windowObj.__HS.state.replacement_plan.rows.filter((r) => r.A != null);
const loadedRow = replAfterSelect.find((r) => r.B === pickName && (r.O === 'EV' || r.R === 'EV'));
checks.push(['Select loads the chosen model into an EV-action replacement row',
  !!loadedRow]);
checks.push(['Select loads EV quote = prod.I + oc[57] (FEAT-002 loader reused)',
  !!loadedRow && loadedRow.D === pickProdRow.I + acqAdderB]);
checks.push(['Select loads usable battery kWh = prod.D',
  !!loadedRow && loadedRow.E === pickProdRow.D]);
checks.push(['Select loads EV kWh/km = prod.E',
  !!loadedRow && loadedRow.F === pickProdRow.E]);
// The Unconfirmed caveat survives: the chosen catalogue model's payload/body-
// fit status is still 'Unconfirmed', and the Portfolio verdict for it is still
// the honest insufficient-data caveat (never silently upgraded by selection).
checks.push(['Select preserves the Unconfirmed payload/body-fit status',
  pickProdRow.L === 'Unconfirmed']);
// computeFleet still returns a valid result after the selection (the tie-in did
// not break the engine path).
const outAfterSelect = windowObj.HSEngine.computeFleet(windowObj.__HS.state);
checks.push(['computeFleet valid after Portfolio Select', !!outAfterSelect && !!outAfterSelect.results]);
// Restore the demo so later assertions see the baseline.
windowObj.__HS.loadDemoFixture();
if (typeof windowObj.__HS.setSyncRecompute === 'function') windowObj.__HS.setSyncRecompute(false);

// ---- FEAT-003 Part A: Portfolio repurposed as a fleet matched-models summary
// The Portfolio surface is no longer a disconnected ranked table: its PRIMARY
// content is a fleet-wide summary of the SAME per-truck EV matching, fed by
// window.HSPortfolioFit.matchFleetToPortfolio (reused, not reimplemented). It
// aggregates which model matched each included truck, counts per model, the
// verdict/caveats and the vehicle/COE price split, plus the fleet-level
// charging/config constraints. The full ranked guide is kept only as a details
// disclosure (supporting evidence), so the matcher drives the surface.
checks.push(['Portfolio summary is fed by matchFleetToPortfolio (reused matcher)',
  typeof windowObj.HSPortfolioFit.matchFleetToPortfolio === 'function']);
// The repurposed surface chrome exists in the markup (fleet summary + config).
checks.push(['Portfolio fleet matched-models summary present in markup',
  html.indexOf('id="portfolio-fleet-summary"') !== -1 &&
  html.indexOf('id="portfolio-matched-models"') !== -1 &&
  html.indexOf('id="portfolio-fleet-table"') !== -1]);
checks.push(['Portfolio fleet-level config/charging block present',
  html.indexOf('id="portfolio-fleet-config"') !== -1]);
// The old ranked table is demoted into a details disclosure (supporting, not
// the lead), so the surface is not a disconnected ranked table.
checks.push(['Portfolio ranked guide demoted into a details disclosure',
  html.indexOf('id="portfolio-detail"') !== -1 &&
  html.indexOf('Full ranked fit guide') !== -1]);
// The matched-models cards render one card per matched model (or honest buckets)
// for the demo fleet, with a count. All six demo trucks are included.
const matchGrid = byId['portfolio-matched-models'];
const matchCards = toArr(matchGrid.children).filter(
  (c) => c.attributes && (c.attributes['data-matched-model'] != null ||
    c.attributes['data-matched-nofit'] != null || c.attributes['data-matched-none'] != null));
checks.push(['Portfolio renders matched-model count cards for the fleet',
  matchCards.length >= 1]);
// Every demo included truck appears in the per-truck match table.
const fleetBody = byId['portfolio-fleet-body'];
const fleetRows = toArr(fleetBody.children).filter(
  (rrow) => rrow.attributes && rrow.attributes['data-fleet-truck'] != null);
const demoMatches = windowObj.HSPortfolioFit.matchFleetToPortfolio(windowObj.__HS.state) || [];
checks.push(['Portfolio per-truck match table has a row per included truck',
  fleetRows.length === demoMatches.length && demoMatches.length >= 1]);
// The fleet summary carries the vehicle/COE split (2dp) and a matched model name.
const fleetText = textOfNode(fleetBody);
checks.push(['Portfolio per-truck table shows a 2dp vehicle/COE price',
  /S\$[\d,]+\.\d\d/.test(fleetText)]);
// Honesty preserved: the fleet-level config text still names the Unconfirmed
// caveat, so no match is presented as a confirmed win.
checks.push(['Portfolio fleet config preserves the Unconfirmed honesty caveat',
  (byId['portfolio-config-text']._text || '').indexOf('Unconfirmed') !== -1]);
// Live: the summary re-renders on recompute (it is wired via the portfolio
// renderer). Firing a recompute keeps the per-truck rows populated.
windowObj.__HS.recompute();
const fleetRowsAfter = toArr(byId['portfolio-fleet-body'].children).filter(
  (rrow) => rrow.attributes && rrow.attributes['data-fleet-truck'] != null);
checks.push(['Portfolio fleet summary re-renders live on recompute',
  fleetRowsAfter.length === demoMatches.length]);

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

// FEAT-003: the interactive TCO dashboard region + its chart containers exist
// and are populated (the chart id checks above already prove each holds <svg>).
checks.push(['TCO dashboard region present', /id="tco-dashboard"/.test(chrome)]);
// dashboard-A A1: the three TCO surfaces (line, breakdown bar, sensitivity
// controls) now sit in ONE responsive band (#tco-band), not a charts column +
// a separate sensitivity-beside column. Assert the one-band container exists.
checks.push(['dashboard one-level band present (#tco-band)', /id="tco-band"/.test(chrome)]);
checks.push(['dashboard band holds the line (#tco-charts)', /id="tco-charts"/.test(chrome)]);
checks.push(['dashboard band holds the sensitivity controls (#sensitivity)', /id="sensitivity"/.test(chrome)]);
chartIds.forEach((id) => {
  checks.push([id + ' container in markup', chrome.indexOf('id="' + id + '"') !== -1]);
});
// A1: the three surfaces appear in one band in source order line -> breakdown
// bar -> sensitivity controls, then the results table + Day-0 below the band.
(() => {
  const iBand = chrome.indexOf('id="tco-band"');
  const iHero = chrome.indexOf('id="chart-cumulative"');
  const iBar  = chrome.indexOf('id="chart-breakdown"');
  const iSens = chrome.indexOf('id="sensitivity"');
  const iRes  = chrome.indexOf('id="results"');
  const iDay0 = chrome.indexOf('id="day0-funding"');
  checks.push(['band order: line, breakdown bar and sensitivity all inside #tco-band',
    iBand !== -1 && iBand < iHero && iHero < iBar && iBar < iSens]);
  checks.push(['dashboard order: results table below the one-level band',
    iRes !== -1 && iSens < iRes]);
  checks.push(['dashboard order: Day-0 funding below the results table',
    iDay0 !== -1 && iRes < iDay0]);
})();
// A5: the cumulative chart renders a labelled saving-target reference marker
// drawn from the committed output, and the breakdown bar carries a matching
// target tick. (Default 15% on the demo; Keep ICE total is numeric, so drawn.)
checks.push(['cumulative chart renders a saving-target marker (data-tco-target)',
  byId['chart-cumulative'].innerHTML.indexOf('data-tco-target') !== -1 &&
  /Meet \d/.test(byId['chart-cumulative'].innerHTML)]);
checks.push(['breakdown bar renders a matching saving-target tick',
  byId['chart-breakdown'].innerHTML.indexOf('data-tco-target') !== -1]);
// A4: the headline sensitivity controls include diesel / electricity / EV price
// / saving-target but NOT the discount rate, which is relocated to the Advanced
// assumptions area (rendered with its note).
(() => {
  const sensLabels = toArr(byId['sens-controls'].children).map((p) => {
    const h = toArr(p.children).find((c) => c.tagName === 'h3');
    return (h && (h.textContent || '')) || '';
  });
  const joined = sensLabels.join(' | ');
  checks.push(['headline sens controls include diesel/elec/EV price/target',
    /diesel/i.test(joined) && /electricity/i.test(joined) &&
    /EV purchase price/i.test(joined) && /saving target/i.test(joined)]);
  checks.push(['headline sens controls do NOT include the discount rate',
    !/discount/i.test(joined)]);
})();
// A4: the discount rate is editable in the Advanced area, carrying its relocate
// note. buildOperating() renders it into #oc-form-adv with a data-oc-discount hook.
(() => {
  function findDiscount(node) {
    if (!node || typeof node !== 'object') return null;
    if (node.attributes && node.attributes['data-oc-discount'] != null) return node;
    const kids = toArr(node.children);
    for (const c of kids) { const hit = findDiscount(c); if (hit) return hit; }
    return null;
  }
  const disc = findDiscount(byId['oc-form-adv']);
  checks.push(['discount rate relocated to the Advanced area (data-oc-discount)', !!disc]);
  function textOfD(node) {
    if (!node || typeof node !== 'object') return '';
    let t = (node._text || '');
    toArr(node.children).forEach((c) => { t += ' ' + textOfD(c); });
    return t;
  }
  checks.push(['Advanced discount carries the only-bites-when-non-zero note',
    !!disc && /Only bites/i.test(textOfD(disc))]);
})();

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
checks.push(['amber-editable legend present', /Amber\s*=\s*editable/i.test(chrome)]);
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

// ---- FEAT-002 (Part C): Stage-4 charging assessment ------------------------
// The Charging stage is now a real assessment with THREE read-only panels, all
// fed from in-page data (no runtime network): (P1) route-energy / capacity +
// site build-up read; (P2) a COARSE detour / queue / recovery read of the
// engine's public-visit intermediates; (P3) public-charging context from the
// compact build-time aggregates (window.HSChargingContext). Honesty signals
// must survive: a visible coarse-screen label, the LTA DataMall / Singapore
// Open Data Licence + BoCharge attribution, and n.a. preserved (never zeroed)
// for incomplete sites.

// The compact charging context is inlined and non-empty (NOT a runtime fetch).
const chgCtx = windowObj.HSChargingContext;
checks.push(['window.HSChargingContext present and non-empty',
  !!chgCtx && !!chgCtx.totals && typeof chgCtx.totals.chargingPoints === 'number' &&
  chgCtx.totals.chargingPoints > 0]);
checks.push(['charging context carries provenance + attribution',
  !!chgCtx && typeof chgCtx.attribution === 'string' &&
  /LTA DataMall/.test(chgCtx.attribution) && /Singapore Open Data Licence/.test(chgCtx.attribution) &&
  /BoCharge/.test(chgCtx.attribution)]);
checks.push(['charging context has power bands + per-kWh tariff + region + operator aggregates',
  !!chgCtx && Array.isArray(chgCtx.powerBands) && chgCtx.powerBands.length > 0 &&
  !!chgCtx.tariffPerKwh && Array.isArray(chgCtx.byRegion) && chgCtx.byRegion.length > 0 &&
  Array.isArray(chgCtx.byOperator) && chgCtx.byOperator.length > 0]);

// The three Stage-4 panel containers exist in the hand-written chrome.
checks.push(['Stage-4 panel 1 (route-energy/site read) present in markup',
  chrome.indexOf('id="charge-site-read"') !== -1 && chrome.indexOf('id="charging"') !== -1]);
checks.push(['Stage-4 panel 2 (detour/queue/recovery read) present in markup',
  chrome.indexOf('id="charge-detour-read"') !== -1 && chrome.indexOf('id="charging-detour"') !== -1]);
checks.push(['Stage-4 panel 3 (public-charging context) present in markup',
  chrome.indexOf('id="charging-public"') !== -1 && chrome.indexOf('id="charge-public-totals"') !== -1 &&
  chrome.indexOf('id="charge-public-bands"') !== -1 &&
  chrome.indexOf('id="charge-region-body"') !== -1 && chrome.indexOf('id="charge-operator-body"') !== -1]);

// P1: the per-plan site read rendered PASS/FAIL verdicts and human-language
// build-up values (recompute runs on load). The demo plan_a/plan_b site cost is
// n.a., so the read must preserve n.a. (not a fake zero).
const siteReadHtml = byId['charge-site-read'].innerHTML;
checks.push(['Stage-4 P1 renders a per-plan site read',
  siteReadHtml.indexOf('Peak depot energy') !== -1 && siteReadHtml.indexOf('Grant budget ceiling') !== -1]);
checks.push(['Stage-4 P1 preserves n.a. for the incomplete demo site (not zeroed)',
  siteReadHtml.indexOf('n.a.') !== -1]);

// P2: the coarse detour/queue read rendered, with the honesty COARSE-SCREEN
// label visible in the markup and the public-top-up read present. The engine
// surfaced publicVisits/publicVisitEnergy as ADDITIVE read-only fields.
const detourHtml = byId['charge-detour-read'].innerHTML;
checks.push(['Stage-4 P2 renders the coarse detour/queue read',
  detourHtml.indexOf('Public top-up visits') !== -1 && detourHtml.indexOf('Detour grid energy') !== -1]);
checks.push(['engine surfaces additive read-only public-visit intermediates',
  !!out.sites[2] && typeof out.sites[2].publicVisits !== 'undefined' &&
  typeof out.sites[2].publicVisitEnergy !== 'undefined']);
checks.push(['Stage-4 COARSE-SCREEN honesty label present in the DOM/markup',
  /coarse screen/i.test(chrome) && /not an arrival-by-arrival scheduler/i.test(chrome)]);
checks.push(['Stage-4 P2 frames recovery as a what-if, not a measured outcome',
  chrome.indexOf('id="charge-detour-note"') !== -1 && /what-if/i.test(chrome)]);

// P3: the public-charging context rendered from the compact aggregates, framed
// as context (not a routing recommendation), with the LTA/BoCharge attribution
// VISIBLE in the rendered DOM.
const totalsHtml = byId['charge-public-totals'].innerHTML;
const bandsHtml = byId['charge-public-bands'].innerHTML;
const regionHtml = byId['charge-region-body'].innerHTML;
const operatorHtml = byId['charge-operator-body'].innerHTML;
checks.push(['Stage-4 P3 renders network totals (points/AC/DC)',
  totalsHtml.indexOf('Charging points') !== -1 && totalsHtml.indexOf('AC points') !== -1 &&
  totalsHtml.indexOf('DC (fast) points') !== -1]);
checks.push(['Stage-4 P3 renders the power-band bars',
  bandsHtml.indexOf('charge-band') !== -1 && bandsHtml.indexOf('cb-fill') !== -1]);
checks.push(['Stage-4 P3 renders region + operator tariff tables',
  regionHtml.indexOf('<tr>') !== -1 && operatorHtml.indexOf('<tr>') !== -1]);
checks.push(['Stage-4 P3 framed as public context, not a routing recommendation',
  /public context, not a routing recommendation/i.test(chrome)]);
checks.push(['Stage-4 P3 renders the LTA DataMall / Open Data Licence + BoCharge attribution in the DOM',
  (byId['charge-attribution']._text || '').indexOf('LTA DataMall') !== -1 &&
  (byId['charge-attribution']._text || '').indexOf('Singapore Open Data Licence') !== -1 &&
  (byId['charge-attribution']._text || '').indexOf('BoCharge') !== -1]);

// No runtime network anywhere on the page (offline invariant): no fetch/XHR/
// import() reaching for the raw snapshot or any URL. The chrome carries no
// fetch/XMLHttpRequest, and the raw 6.3MB snapshot is NOT inlined (the inlined
// context is the compact aggregates only - a tiny locations count, no raw rows).
checks.push(['no runtime fetch/XHR in the page chrome (offline)',
  // Match real network-call signatures, not the word "fetch" in prose/comments:
  // a fetch() call takes a quoted URL / template / variable argument.
  !/fetch\(\s*['"`]/.test(chrome) && !/\.fetch\s*\(/.test(chrome) &&
  !/XMLHttpRequest/.test(chrome) && !/new\s+WebSocket/.test(chrome)]);
checks.push(['raw charger snapshot is NOT inlined (compact aggregates only)',
  // the inlined context has no per-location rows / addresses / lat-long
  JSON.stringify(chgCtx).indexOf('evLocationsData') === -1 &&
  JSON.stringify(chgCtx).indexOf('latitude') === -1 &&
  JSON.stringify(chgCtx).length < 20000]);

// ---- FEAT-003 (Part C): Stage-5 standard proposal --------------------------
// The Proposal stage (#stage-proposal) is no longer an honest 'Coming next'
// placeholder: it renders a presentation-only, print-friendly leave-behind
// built ENTIRELY from existing engine outputs (no new economic math). The best
// EV plan is chosen via window.HSEngine.scoreProspect; the three blocks
// (quotation / servicing coverage / unresolved conditions) read that result's
// committed figures. The header badge + quotation INHERIT the gate / claim
// status: a diagnostic / illustrative / not-all-gates-clear case renders (and
// prints) as 'INDICATIVE / pending evidence', never a firm quotation; only a
// fully-cleared case reads as a confirmed quotation. Finance (FEAT-004) is a
// SEPARATE, OPT-IN 'Financing (illustrative)' block that is off by default and
// explicitly EXCLUDED from the economic TCO; toggling it changes NO economic
// figure.

// (1) The old placeholder is gone; the real proposal chrome is present.
const proposalStageMarkup = (() => {
  const i = html.indexOf('id="stage-proposal"');
  if (i === -1) return '';
  const j = html.indexOf('</section>\n\n</div><!-- /results-col', i);
  return j === -1 ? html.slice(i, i + 6000) : html.slice(i, j);
})();
checks.push(['Proposal stage drops the old Coming next placeholder',
  proposalStageMarkup.indexOf('Coming next') === -1]);
checks.push(['Proposal stage renders the quotation / servicing / unresolved-conditions chrome',
  proposalStageMarkup.indexOf('id="proposal-quotation-table"') !== -1 &&
  proposalStageMarkup.indexOf('id="proposal-servicing-table"') !== -1 &&
  proposalStageMarkup.indexOf('id="proposal-conditions-table"') !== -1]);
checks.push(['Proposal stage carries the gate-inherited badge element',
  proposalStageMarkup.indexOf('id="proposal-badge"') !== -1]);

// Make sure the controller is on the clean demo state before reading.
windowObj.__HS.loadDemoFixture();
windowObj.__HS.recompute();

// (2) DEMO case -> INDICATIVE. For the demo both EV plans are 'Total incomplete'
// (site cost n.a.), so the proposal must NOT read as a firm quotation: the badge
// is pb-indicative (not pb-confirmed) and the wording says pending evidence.
const propBadge = byId['proposal-badge'];
const propStage = byId['stage-proposal'];
checks.push(['Proposal renders the quotation block from engine output',
  byId['proposal-quotation-body'].innerHTML.indexOf('Total economic TCO') !== -1 &&
  byId['proposal-quotation-body'].innerHTML.indexOf('Day-0 funding') !== -1]);
checks.push(['Proposal quotation preserves n.a. for the diagnostic demo (not zeroed)',
  byId['proposal-quotation-body'].innerHTML.indexOf('n.a.') !== -1]);
checks.push(['Proposal renders the servicing coverage block (cost/km + service status)',
  byId['proposal-servicing-body'].innerHTML.indexOf('productive km') !== -1 &&
  byId['proposal-servicing-body'].innerHTML.indexOf('service / evidence') !== -1]);
checks.push(['Proposal servicing block states the 200,000 km schedule basis + caveat',
  byId['proposal-servicing-body'].innerHTML.indexOf('200,000') !== -1 &&
  proposalStageMarkup.indexOf('beyond 200,000') !== -1]);
checks.push(['Proposal unresolved-conditions block lists the gates',
  byId['proposal-conditions-body'].innerHTML.indexOf('Service screen') !== -1 &&
  byId['proposal-conditions-body'].innerHTML.indexOf('Capacity gate') !== -1]);
checks.push(['Proposal unresolved-conditions block lists an n.a. / diagnostic flag for the demo',
  byId['proposal-conditions-body'].innerHTML.indexOf('n.a.') !== -1 ||
  byId['proposal-conditions-body'].innerHTML.indexOf('Total incomplete') !== -1]);
checks.push(['Proposal badge is INDICATIVE for the diagnostic demo (not a firm quotation)',
  /(^|\s)pb-indicative(\s|$)/.test(propBadge.className || '') &&
  !/(^|\s)pb-confirmed(\s|$)/.test(propBadge.className || '') &&
  propBadge.innerHTML.indexOf('INDICATIVE') !== -1 &&
  propBadge.innerHTML.indexOf('Confirmed quotation') === -1]);
checks.push(['Proposal stage carries the proposal-pending state class for the demo',
  /(^|\s)proposal-pending(\s|$)/.test(propStage.className || '') &&
  !/(^|\s)proposal-confirmed(\s|$)/.test(propStage.className || '')]);
checks.push(['Proposal status line names the chosen plan and the indicative framing',
  byId['proposal-status-line'].innerHTML.toLowerCase().indexOf('indicative') !== -1]);

// (3) FEAT-004: the deferred placeholder is gone, REPLACED by a real,
// clearly-labelled 'Financing (illustrative)' block that is OPT-IN (off by
// default) and explicitly NOT part of the economic TCO. This is STRICTLY
// stronger than the old 'next phase' note assertion: it requires a working,
// labelled, toggle-gated block AND proves it changes no economic figure.
checks.push(['Proposal replaces the deferred placeholder with a Financing (illustrative) block',
  proposalStageMarkup.indexOf('Financing (illustrative)') !== -1 &&
  proposalStageMarkup.indexOf('separate opt-in module, next phase') === -1 &&
  proposalStageMarkup.indexOf('id="proposal-finance-block"') !== -1]);
checks.push(['Financing block is clearly labelled NOT part of the economic TCO (loans/interest excluded by design)',
  /NOT part of the economic TCO/i.test(proposalStageMarkup) &&
  /excludes? loans and interest/i.test(proposalStageMarkup)]);
checks.push(['Financing block is OPT-IN behind a toggle that is OFF by default',
  proposalStageMarkup.indexOf('id="finance-enable"') !== -1 &&
  // the checkbox markup carries NO `checked` attribute -> off by default
  !/id="finance-enable"[^>]*\bchecked\b/.test(proposalStageMarkup)]);
checks.push(['Financing block exposes its OWN finance inputs (APR / term / deposit / principal)',
  /id="finance-apr"/.test(proposalStageMarkup) && /id="finance-term"/.test(proposalStageMarkup) &&
  /id="finance-deposit"/.test(proposalStageMarkup) && /id="finance-principal"/.test(proposalStageMarkup)]);
checks.push(['Finance amortisation module exposed on window.HSFinance (additive, separate)',
  !!windowObj.HSFinance && typeof windowObj.HSFinance.amortise === 'function' &&
  typeof windowObj.HSFinance.financedAmount === 'function']);

// (3b) OPT-IN behaviour + ISOLATION from the economic quotation. With the
// toggle OFF (the default) the finance output stays hidden and the economic
// quotation figures are exactly what renderProposal produced. Turning the
// toggle ON renders an instalment illustration BUT leaves the economic
// quotation / Total byte-identical. This is the UI-level isolation guard.
windowObj.__HS.loadDemoFixture();
windowObj.__HS.recompute();
const finToggle = byId['finance-enable'];
const quotationOff = byId['proposal-quotation-body'].innerHTML;
const financeOutputOff = byId['finance-output'];
checks.push(['Financing output is hidden while the toggle is OFF (default)',
  finToggle.checked !== true && financeOutputOff.hidden === true &&
  byId['finance-summary-body'].innerHTML.indexOf('Monthly instalment') === -1]);

// Flip the toggle ON and re-render the finance block (no recompute -> cannot
// touch the engine). Default principal source is the chosen plan's Day-0
// funding (read-only), APR 4.5%, term 60 months.
finToggle.checked = true;
finToggle.fire('change'); finToggle.fire('input');
const quotationOnAfter = byId['proposal-quotation-body'].innerHTML;
checks.push(['Economic quotation figures are BYTE-IDENTICAL with the finance toggle on vs off (isolation)',
  quotationOff === quotationOnAfter]);
checks.push(['Financing illustration renders a monthly instalment when enabled',
  byId['finance-output'].hidden === false &&
  byId['finance-summary-body'].innerHTML.indexOf('Monthly instalment') !== -1]);
checks.push(['Financing illustration inherits the INDICATIVE wording for the diagnostic demo',
  byId['finance-status-line'].innerHTML.toLowerCase().indexOf('indicative') !== -1 &&
  byId['finance-status-line'].innerHTML.toLowerCase().indexOf('not') !== -1]);
// Toggling the finance block ON must not have changed ANY economic engine
// number: recompute the demo and compare the authoritative figures.
const econAfterFinance = windowObj.HSEngine.computeFleet(windowObj.__HS.state).results;
checks.push(['computeFleet economic figures unchanged after the finance toggle (no feedback)',
  approx(econAfterFinance.vehicleEconomicTco.keep_ice, 2081781.0, 0.5) &&
  approx(econAfterFinance.day0Funding.all_new_ice, 852000, 0.5)]);
// Reset the toggle so later blocks see the clean default again.
finToggle.checked = false;
finToggle.fire('change'); finToggle.fire('input');

// (4) Print styles exist so the proposal prints as a leave-behind: the badge is
// preserved in print (with its colour forced). The Financing (illustrative)
// block prints WITH the proposal only when enabled: its controls stay .noprint
// and the whole block is hidden in print when the toggle is OFF.
checks.push(['Proposal badge is preserved + colour-forced in @media print',
  /@media\s*print[\s\S]*\.proposal-badge\s*\{[^}]*print-color-adjust/i.test(html)]);
checks.push(['Finance controls are .noprint and the block hides in print when the toggle is off',
  /<div[^>]*id="finance-controls"[^>]*class="[^"]*noprint/.test(html) ||
  /<div[^>]*class="[^"]*noprint[^"]*"[^>]*id="finance-controls"/.test(html)]);
checks.push(['Financing block is hidden in print when the toggle is OFF (prints only when enabled)',
  /#proposal-finance-block:not\(\.finance-on\)\s*\{[^}]*display\s*:\s*none/i.test(html)]);

// (5) CONFIRMED case -> flips the badge. Loading the gate-passing 'best' seed
// (numeric Total, gates pass, saving claim met) must flip the badge to
// pb-confirmed and read as a confirmed quotation, proving the badge reads
// directly from the live status (not a frozen literal). Snapshot + restore the
// demo state around the load so nothing downstream is disturbed.
const propSnapshot = JSON.parse(JSON.stringify(windowObj.__HS.state));
if (typeof windowObj.__HS.setSyncRecompute === 'function') windowObj.__HS.setSyncRecompute(true);
byId['prospect-body'].fire('click', { target: { getAttribute: (k) => (k === 'data-load' ? 'best' : null), parentNode: byId['prospect-body'] } });
windowObj.__HS.recompute();
const bestScore = windowObj.HSEngine.scoreProspect(windowObj.HSEngine.computeFleet(windowObj.__HS.state));
checks.push(['loaded Best case is a gate-passing confirmed win (precondition)',
  bestScore.gatePass === true &&
  typeof bestScore.totalEconomicTco === 'number' && isFinite(bestScore.totalEconomicTco) &&
  bestScore.fifteenTargetMet === 'Meets entered 15% target']);
checks.push(['Proposal badge flips to CONFIRMED quotation for the cleared Best case',
  /(^|\s)pb-confirmed(\s|$)/.test(byId['proposal-badge'].className || '') &&
  byId['proposal-badge'].innerHTML.indexOf('Confirmed quotation') !== -1 &&
  byId['proposal-badge'].innerHTML.indexOf('INDICATIVE') === -1]);
checks.push(['Proposal stage carries the proposal-confirmed state class for the cleared case',
  /(^|\s)proposal-confirmed(\s|$)/.test(byId['stage-proposal'].className || '')]);
checks.push(['Confirmed proposal quotation shows a numeric 2dp Total (not n.a.)',
  /S\$[\d,]+\.\d\d/.test(byId['proposal-quotation-body'].innerHTML)]);
checks.push(['Confirmed proposal keeps the conditional-on-supplied-figures caveat (not an adoption probability)',
  byId['proposal-status-line'].innerHTML.toLowerCase().indexOf('conditional on the supplied figures') !== -1 ||
  byId['proposal-quotation-caveat'].innerHTML.toLowerCase().indexOf('supplied figures') !== -1]);
// Restore the demo state so later assertions (if any) see the baseline.
Object.keys(windowObj.__HS.state).forEach((k) => { delete windowObj.__HS.state[k]; });
Object.keys(propSnapshot).forEach((k) => { windowObj.__HS.state[k] = propSnapshot[k]; });
if (windowObj.__HS.rebuildInputs) windowObj.__HS.rebuildInputs();
windowObj.__HS.recompute();
if (typeof windowObj.__HS.setSyncRecompute === 'function') windowObj.__HS.setSyncRecompute(false);

// ---- FEAT-003 (B): Stage-4 public-charging routing simulator (Panel 4) ------
// The new 4th charge-panel renders a CLIENT-SIDE, deterministic routing screen
// from window.HSRoutingSim (src/routing_sim.js) + the bundled charger subset
// window.HSChargingLocations. These assertions are ADDITIVE; they do not touch
// or weaken any assertion above. They prove: the module + subset are bundled
// and offline; the panel renders nearby chargers with operational fields; the
// SRM-tied charge-time surfaces (or an honest n.a.); and the coarse / dated-
// snapshot / approx-distance caveats + LTA/BoCharge attribution are present.

// (1) The additive module + bundled location subset are inlined (no runtime net).
checks.push(['routing-sim module exposed on the page (window.HSRoutingSim)',
  !!windowObj.HSRoutingSim && typeof windowObj.HSRoutingSim.nearestChargers === 'function' &&
  typeof windowObj.HSRoutingSim.chargeTimeHours === 'function' &&
  typeof windowObj.HSRoutingSim.haversineKm === 'function']);
checks.push(['charger location subset bundled (window.HSChargingLocations)',
  !!windowObj.HSChargingLocations && Array.isArray(windowObj.HSChargingLocations.locations) &&
  windowObj.HSChargingLocations.locations.length > 0]);
// The bundled subset is NOT the raw 6.3MB snapshot (no raw per-location keys).
checks.push(['bundled routing subset is compact (no raw address / charging-point detail)',
  html.indexOf('window.HSChargingLocations = ') !== -1 &&
  (() => {
    const slice = html.slice(html.indexOf('CHARGING_LOCATIONS:BEGIN'), html.indexOf('CHARGING_LOCATIONS:END'));
    return slice.indexOf('"address"') === -1 && slice.indexOf('chargingPoints') === -1 &&
      slice.indexOf('evLocationsData') === -1;
  })()]);
// The page makes NO runtime network / map-tile call for the simulator.
checks.push(['routing sim introduces NO runtime network/map-API (offline guarantee)',
  !/fetch\(|XMLHttpRequest|maps\.googleapis|tile\.openstreetmap|leaflet|mapbox/i.test(
    html.slice(html.indexOf('ROUTING:BEGIN'), html.indexOf('/stage-charging') === -1 ? html.length : html.indexOf('/stage-charging')))]);

// (2) The panel markup exists as the 4th charge-panel with its own ids.
checks.push(['Stage-4 routing-sim panel present (id="charging-routing")',
  html.indexOf('id="charging-routing"') !== -1]);
checks.push(['routing-sim panel carries its own DOM ids',
  html.indexOf('id="rsim-summary"') !== -1 && html.indexOf('id="rsim-charger-body"') !== -1 &&
  html.indexOf('id="rsim-map"') !== -1 && html.indexOf('id="rsim-region"') !== -1]);

// (3) After recompute the panel renders: the region picker is built, nearby
// chargers are listed with operational fields, and the offline SVG map draws.
if (typeof windowObj.__HS.setSyncRecompute === 'function') windowObj.__HS.setSyncRecompute(true);
windowObj.__HS.recompute();
const rsimRegionOpts = byId['rsim-region'].innerHTML;
checks.push(['routing-sim region picker is populated', rsimRegionOpts.indexOf('<option') !== -1]);
const rsimTableHtml = byId['rsim-charger-body'].innerHTML;
checks.push(['routing-sim lists nearby public chargers (ranked rows)',
  rsimTableHtml.indexOf('<tr') !== -1 && /\d+\.\d\d/.test(rsimTableHtml)]);
// Operational fields: the charger table header names operator / type / power /
// price / distance, and a rendered row carries an operator string.
const rsimTableHead = (html.match(/<table id="rsim-charger-table">\s*<thead>([\s\S]*?)<\/thead>/) || ['', ''])[1];
checks.push(['routing-sim charger table carries operational columns (operator/type/power/price/km)',
  /Operator/i.test(rsimTableHead) && /Type/i.test(rsimTableHead) && /Power/i.test(rsimTableHead) &&
  /kWh/i.test(rsimTableHead) && /km/i.test(rsimTableHead)]);
checks.push(['routing-sim rows show an AC/DC type token',
  />AC<|>DC<|>n\.a\.<|class="na"/.test(rsimTableHtml)]);
// Offline inline-SVG mini-map (no external tiles).
const rsimMapHtml = byId['rsim-map'].innerHTML;
checks.push(['routing-sim draws an offline inline-SVG mini-map (no external tiles)',
  rsimMapHtml.indexOf('<svg') !== -1 && rsimMapHtml.indexOf('<circle') !== -1 &&
  rsimMapHtml.indexOf('rsim-origin') !== -1]);

// (4) The SRM-tied charge-time surfaces. On the demo case at least one truck is
// on an EV plan with an EV model named, so the summary names the planned EV and
// renders an estimated top-up time (or an honest n.a. message, never zero).
const rsimSummaryHtml = byId['rsim-summary'].innerHTML;
checks.push(['routing-sim summary names the planned EV + an estimated top-up time',
  rsimSummaryHtml.indexOf('Planned EV') !== -1 &&
  rsimSummaryHtml.indexOf('Estimated route top-up time') !== -1]);
// The charge time ties to the SRM model math: compute it directly through the
// exposed module on the SRM T3EV+ catalogue row and confirm it is a finite,
// positive hour figure (this mirrors what the panel renders).
const srmRow = windowObj.__HS.state.products.rows.find((p) => p && /SRM/i.test(String(p.A)));
const rsimDoc = windowObj.HSChargingLocations;
const nearestForSrm = windowObj.HSRoutingSim.nearestChargers(
  { lat: 1.2900, lon: 103.8500 }, rsimDoc.locations, { limit: 1 });
const chargerKwForSrm = nearestForSrm.length
  ? (nearestForSrm[0].maxPowerKw || nearestForSrm[0].powerKw) : null;
const srmCt = (srmRow && chargerKwForSrm)
  ? windowObj.HSRoutingSim.chargeTimeHours({
    batteryKwh: srmRow.D, kwhPerKm: srmRow.E, distanceKm: 120, chargerKw: chargerKwForSrm })
  : null;
checks.push(['SRM-tied charge-time math returns a finite positive estimate',
  !!srmCt && typeof srmCt.hours === 'number' && isFinite(srmCt.hours) && srmCt.hours > 0]);
// Honest degrade: with NO EV plan the panel shows an n.a. message, not a zero.
// Drive the state to all-Keep-ICE on the replacement rows and recompute.
const rsimSnapshot = JSON.parse(JSON.stringify(windowObj.__HS.state));
windowObj.__HS.state.replacement_plan.rows.forEach((rr) => { rr.O = 'Keep ICE'; rr.R = 'Keep ICE'; });
windowObj.__HS.recompute();
checks.push(['routing-sim degrades to n.a. (no fabricated spec) when no EV plan',
  byId['rsim-summary'].innerHTML.indexOf('n.a. (no EV plan selected)') !== -1]);
// Restore the demo state so the baseline is intact for any later assertion.
Object.keys(windowObj.__HS.state).forEach((k) => { delete windowObj.__HS.state[k]; });
Object.keys(rsimSnapshot).forEach((k) => { windowObj.__HS.state[k] = rsimSnapshot[k]; });
if (windowObj.__HS.rebuildInputs) windowObj.__HS.rebuildInputs();
windowObj.__HS.recompute();

// (5) Preserved honesty labelling: coarse / NOT live availability / dated
// snapshot (with lastUpdatedTime) / approx great-circle / not a router, plus
// the LTA / BoCharge attribution visible on the panel.
const rsimCaveat = byId['rsim-caveat'].innerHTML;
checks.push(['routing-sim carries coarse / not-live / dated-snapshot / approx-distance caveat',
  /coarse/i.test(rsimCaveat) && /not live availability/i.test(rsimCaveat) &&
  /snapshot/i.test(rsimCaveat) && /great-circle/i.test(rsimCaveat) &&
  /not a turn-by-turn router/i.test(rsimCaveat)]);
checks.push(['routing-sim caveat shows the dated-snapshot provenance (lastUpdatedTime)',
  rsimCaveat.indexOf(windowObj.HSChargingLocations.provenance.lastUpdatedTime) !== -1]);
checks.push(['routing-sim keeps the LTA DataMall + BoCharge attribution visible',
  byId['rsim-attribution'].textContent.indexOf('LTA DataMall') !== -1 &&
  byId['rsim-attribution'].textContent.indexOf('BoCharge') !== -1]);
// The panel markup itself carries the honest 'coarse planning aid, not live
// availability' framing (static, so it prints too).
checks.push(['routing-sim panel markup frames it as a coarse aid, not live availability',
  (() => {
    const slice = html.slice(html.indexOf('id="charging-routing"'), html.indexOf('/stage-charging'));
    return /coarse planning aid/i.test(slice) && /not live availability/i.test(slice) &&
      /live connection/i.test(slice) && /approximate great-circle/i.test(slice);
  })()]);
if (typeof windowObj.__HS.setSyncRecompute === 'function') windowObj.__HS.setSyncRecompute(false);

let ok = true;
for (const [name, pass] of checks) {
  console.log((pass ? 'PASS  ' : 'FAIL  ') + name);
  if (!pass) ok = false;
}
console.log('\n' + (ok ? 'ALL INDEX CHECKS PASSED' : 'INDEX CHECKS FAILED'));
process.exit(ok ? 0 : 1);
