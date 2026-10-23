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
    set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html; },
    set textContent(v) { this._text = v; }, get textContent() { return this._text || ''; },
    appendChild(c) { this.children.push(c); return c; },
    addEventListener(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); },
    setAttribute(k, v) { this.attributes[k] = v; },
    getAttribute(k) { return this.attributes[k]; },
    fire(ev) { (this.listeners[ev] || []).forEach((fn) => fn({ target: this, currentTarget: this })); },
  };
}
const byId = {};
const ids = ['decision-cards','decision-lead','decision-notice','results-body','site-body',
  'gates-body','review-body','sens-body','sens-controls','fleet-body','repl-body',
  'oc-form','ec-body','reset-btn','demo-banner',
  'prospect-body','prospect-sort','prospect-current-btn','prospect-note'];
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
checks.push(['fleet rows built', byId['fleet-body'].children.length === 6]);
checks.push(['repl rows built', byId['repl-body'].children.length === 6]);
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

// Live update #1: dragging a sensitivity slider ('input' event) redraws the
// sensitivity-response chart. The sliders are appended under #sens-controls as
// panels [h3, input[type=range], div]; grab the first slider and fire 'input'.
const sensControls = byId['sens-controls'];
let sensSlider = null;
if (sensControls && sensControls.children.length) {
  const panel0 = sensControls.children[0];
  sensSlider = panel0.children.find((c) => c.tagName === 'input') || panel0.children[1];
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
