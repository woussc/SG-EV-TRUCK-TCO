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
    listeners: {},
    set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html; },
    set textContent(v) { this._text = v; }, get textContent() { return this._text || ''; },
    appendChild(c) { this.children.push(c); return c; },
    addEventListener(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); },
    setAttribute(k, v) { this.attributes[k] = v; },
  };
}
const byId = {};
const ids = ['decision-cards','decision-lead','decision-notice','results-body','site-body',
  'gates-body','review-body','sens-body','sens-controls','fleet-body','repl-body',
  'oc-form','ec-body','reset-btn','demo-banner'];
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

let ok = true;
for (const [name, pass] of checks) {
  console.log((pass ? 'PASS  ' : 'FAIL  ') + name);
  if (!pass) ok = false;
}
console.log('\n' + (ok ? 'ALL INDEX CHECKS PASSED' : 'INDEX CHECKS FAILED'));
process.exit(ok ? 0 : 1);
