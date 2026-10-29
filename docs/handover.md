# Handover - Hong Seh EV Truck TCO tool (cold-start progress update)

_Written for a future agent picking this project up cold. Read this first, then
`docs/final-edit-plan.md` for the latest round's plan and the verified root-cause
audit. Everything below is checked against the live wiring in `index.html` and the
frozen engine `src/engine.js` as of the FEAT-003 commit (`7987af3`)._

Repository: `SG-EV-TRUCK-TCO`. Only writable path in the sandbox is the repo root.
Environment: Node v22, python3, Python venv at `/projects/sandbox/.venv` (has
`openpyxl` for `tools/validate.py`). The sandbox is fully offline; so is the tool.

---

## 1. Purpose

A deterministic, fully-offline, single-page EV light-truck **total-cost-of-ownership
(TCO)** tool that reproduces the authoritative Excel workbook *"Hong Seh - EV TCO
Calculator - Fleet, Charging and Service v5.xlsx"* and layers a
prospect-identification and presentation view on top of it.

It is a client-presentation instrument. It compares four ownership paths over a fixed
120-month horizon for a fleet of light trucks:

- **Keep ICE** (run the current diesel trucks, then buy new ICE at end of life)
- **All-new ICE now**
- **Plan A** (the primary strategy; positioned as **SRM** EVs)
- **Plan B** (an alternative strategy; positioned as **competitor** EVs)

Every headline figure traces back to a cell in the source workbook (the provenance
map lives at the top of `src/engine.js` and is summarised in `README.md`). The same
inputs always produce the same outputs. There are **no runtime LLM / API / network
calls** of any kind.

---

## 2. Architecture

### 2.1 `index.html` is a single, self-contained, GENERATED artifact

The deliverable is one file at the repo root: `index.html`. It opens with no server
and no build step (it must work from `file://`, so there are no ES-module imports or
CDN links at runtime).

`index.html` is **generated** by `node tools/build_index.js`. The builder inlines the
`src/*.js` engine/feature modules and the `tools/fixtures/*.json` data between HTML
comment marker pairs of the form `<!-- NAME:BEGIN -->` ... `<!-- NAME:END -->`, and
stamps the engine's SHA-256 into the page for traceability. The marker blocks are:

```
ENGINE               src/engine.js (export-stripped)
DEMO                 tools/fixtures/demo_case.json inputs
PROSPECTS            tools/fixtures/prospect_seeds.json
PORTFOLIO            src/portfolio_fit.js
CHARGING             tools/fixtures/charging_context.json
CHARGING_LOCATIONS   tools/fixtures/charging_locations.json (routing subset)
ROUTING              src/routing_sim.js
FINANCE              src/finance.js
SG_BASEMAP           tools/fixtures/sg_basemap.json
SGMAP                src/sg_map.js
ROADS                tools/fixtures/sg_roads.json
LANDING              landing/startup case wiring
SIMBRIEF             docs/simulation-results-brief.md (client-side Blob download)
```

**NEVER hand-edit anything inside a marker block.** To change inlined logic or data,
edit the `src/*.js` module or the fixture and re-run `node tools/build_index.js`. The
controller UI, CSS and controller JavaScript that live **outside** the marker blocks
ARE hand-authored and are edited directly in `index.html`. Always rebuild after
editing any `src` module or fixture.

### 2.2 The engine is FROZEN

`src/engine.js` is frozen and Excel-exact. Its SHA-256 is:

```
45b388a1edaca77081e62f49e52276f6919448e458610474c7f65aafcb50fae3
```

All work in recent rounds is display / input-wiring / CSS only. If a fix seems to
require an engine formula change, STOP and report; do not edit the engine.

**One EV acquisition number per truck (verified, `src/engine.js` ~L331-333):**

```js
baseG = blank(rp.D)
  ? (isNum(prod.I) ? prod.I + oc[57] : NaN)   // fallback: catalogue price + COE adder
  : rp.D;                                      // explicit col-D override
```

The acquisition cost is EITHER the col-D override (`rp.D`) OR, when col D is blank,
the fallback `prod.I + oc[57]` (catalogue vehicle price plus the COE/acquisition
adder, where `oc[57] = 93000` in the demo). Vehicle price and COE price are the two
**addends** of that one number, not a second charge. The engine does not
double-count.

### 2.3 The live TCO comes from a TWO-STATE projection, not a single compute

The engine's `computeFleet(state)` binds exactly ONE col-B model and ONE col-D quote
per truck. So "Plan A = SRM vs Plan B = competitor" cannot come from a single engine
run. Instead the controller runs the frozen engine **twice**:

- `buildPlanState(modelName, slot, evPrice, intention)` (index.html ~L6099) deep-clones
  `H.state` and, for every EV-action truck, sets col B = the plan's model, forces the
  action to EV, force-sets `rp.D = evPrice` (the per-plan slider value), and (when
  `intention === 'add'`) pulls the replacement month to 0.
- `computeReframed()` (index.html ~L6118) builds `state_A` (Plan A / SRM) and `state_B`
  (Plan B / competitor), runs the engine on each, and `mergeTwoState()` projects
  `plan_a` (engine plan code 2) from `state_A` and `plan_b` (engine plan code 3) from
  `state_B`.

Because `buildPlanState` force-sets `rp.D` from the per-plan slider, the per-plan
slider is the single authoritative EV-cost varier for the headline TCO. (This also
explains the mis-sync fixed this round; see section 6.)

`validate.py` is unaffected by this projection because it calls `compute_fleet` on the
fixture directly and never touches the UI's non-engine `state.__reframe` blob.

### 2.4 Harness suite and commands

Build:

```sh
node tools/build_index.js
```

Verify (the full loop; run from the repo root):

```sh
sha256sum src/engine.js            # MUST equal the frozen sha above
. /projects/sandbox/.venv/bin/activate && python tools/validate.py   # 19 passed, 0 failed
for h in check_index check_presets check_portfolio_fit check_charging_data \
         check_routing check_roadrouter check_finance check_sgmap check_simbrief; do
  node tools/$h.mjs || exit 1
done
node tools/sensitivity.mjs
```

- `tools/validate.py` - 19 strict engine assertions (Excel + reference-HTML parity and
  Review reconciliation) against `tools/fixtures/demo_case.json` via `tools/engine.py`.
- `tools/check_*.mjs` - headless DOM harnesses that evaluate the INLINED scripts in
  `index.html` using a hand-rolled DOM shim. The shim includes a **hardened
  HTMLCollection live-children guard**: it proves `element.children.forEach` is
  `undefined` and throws, and that the controller's real build/recompute path does not
  crash by iterating a live `children` collection with `.forEach`. Do not delete or
  weaken this guard; re-point it if the code it watches is removed.
- `tools/sensitivity.mjs` - Plan A/B slider sanity checks; it also regenerates
  `docs/input-sensitivity-findings.md`.
- `tools/check_simbrief.mjs` - drift-guard for the all-models 5-year / 10-year
  Total economic TCO table in `docs/simulation-results-brief.md` (section 6). It
  recomputes every model's `cumulative[5]` / `cumulative[10]` from the frozen
  engine on the held-constant "best" scenario and asserts the printed figures
  (and the copy embedded in `index.html` via the SIMBRIEF marker) match. The
  table itself is (re)generated deterministically by
  `node tools/build_simbrief_models.mjs`, which rewrites the region between the
  `SIMBRIEF-MODELS` markers in place; re-embed with `node tools/build_index.js`.

### 2.5 Offline / static invariant

Zero runtime network. No CDN, no `fetch`, no `XMLHttpRequest`, no dynamic `import()`,
no external `<script src>` or `<link>` that loads at runtime. Grep the final
`index.html` and `src/*.js` for these to confirm after any edit. The map, roads, and
charging data are all inlined fixtures.

### 2.6 Real browser is ORCHESTRATOR-ONLY

The coder and planner do NOT have a real browser. Verification is
correctness-by-construction plus the host-based node/python harnesses above. A real
browser (for `getBoundingClientRect` pixel-clip checks and interaction drive) is
available ONLY to the orchestrator, via the Playwright power, at **1440px** (the
presentation target) and a **~390px** mobile spot check. Anything that genuinely needs
layout measurement or click-drive must be deferred to the orchestrator.

---

## 3. Feature set per stage

- **Portfolio** - fleet-wide EV matching (`src/portfolio_fit.js`, `window.HSPortfolioFit`),
  a distribution **scatter**, and a full **switch-over table** (`#portfolio-fleet-summary`,
  `renderPortfolio`, `#portfolio-switchover-table`). This is a diagnostic view; body-fit
  for every catalogue model is labelled **Unconfirmed**. This matcher is a DIFFERENT
  feature from the per-card input wiring and must stay intact.
- **TCO** - the four ownership paths (Keep ICE / All-new ICE / Plan A / Plan B) with the
  two-state projection; **per-plan EV-cost sliders** (`evprice_a` / `evprice_b`, range
  120000-300000) as the sole EV-cost varier; and, as of this round, **per-card Plan A
  (SRM) / Plan B (competitor) vehicle selection** with **read-only** per-plan EV-quote
  displays (`prod.I + oc[57]` for the selected model). No override input.
- **Charging** - route energy / capacity / site-cost screens with gates, an offline SG
  map (`src/sg_map.js` + `sg_basemap.json`), and a coarse offline on-road router
  (`src/road_router.js` + `sg_roads.json`, charger subset from `charging_locations.json`).
- **Proposal** - per-plan shareable leave-behind, plus an opt-in **financing
  illustration** (`src/finance.js`) that is explicitly **excluded from the economic TCO**.

---

## 4. Invariants and honesty rules

- Engine frozen and Excel-exact; `validate.py` stays **19/19**; regenerate `index.html`
  only via `node tools/build_index.js`; the engine SHA must stay the frozen value.
- **Amber = editable input; white = computed or reference.**
- **A blank is not a measured zero** (blank optional overrides use their stated fallback;
  blank required values block the result).
- **`n.a.` is not a value of zero** - it means a gating input is missing; the model never
  substitutes zero for an unknown.
- **Diagnostic, not a quote** - the Portfolio matcher and any un-gated figure are
  diagnostic; they are not a priced offer.
- **Finance is excluded from the economic TCO** - loans, interest, principal, wages,
  income tax and recoverable GST are out of the economic TCO; the financing view is an
  illustration only.
- **Coarse-route and dated-snapshot caveats** must remain visible on the charging/routing
  surfaces.
- **SRM is the primary** marque (Plan A).
- **Unconfirmed body-fit** for every catalogue model.
- Typography floor: **>=13px** screen CSS font-size (except the `.rsim-lab` 9px upscaled
  marker) and **>=14 SVG user-unit** chart font base. Do not regress the mobile
  breakpoints (`<=860px` / `<=640px`).
- Harnesses are EXTENDED, never weakened; keep the hardened HTMLCollection live-children
  guard.
- The **three client source docs must stay byte-for-byte unchanged**:
  `Hong Seh - EV TCO Calculator - Fleet, Charging and Service v5.xlsx`,
  `Hong Seh - Fleet and Charging v4 Quick Guide.md`, and
  `Hong Seh - Yong Wen and Venus EV Fleet Simulations - 04-Oct-2026.html`.
  Confirm with `git diff --stat -- 'Hong Seh*'` (expect no output).

---

## 5. Catalogue / preset / competitor-data state

- **12 catalogue models** in `tools/fixtures/demo_case.json` (`inputs.products.rows`):
  Farizon F3E, SRM T3EV, ChengLong L2EV, Farizon H5E, SRM T3EV+, Farizon H9E 14ft,
  Farizon H9E 20ft, BYD T35 Electric Light-Duty, Foton eMiler, Forland S1 EV, JAC N40EV,
  Qingling EQ2.
- **SRM-vs-competitor split rule:** a model is an SRM variant iff its col A name starts
  with `"SRM"`; everything else is a competitor. `catalogueModels()` splits them into
  `.srm` (Plan A picker) and `.comp` (Plan B picker).
- **COE / acquisition adder:** `oc` row 57 = **93000** in the demo. So a plan's read-only
  EV quote for a model is `prod.I + 93000`. Worked examples: SRM T3EV+ list price (col I)
  66800 -> quote 159800; ChengLong L2EV 78800 -> quote 171800.
- **Landing case** is the MID (SRM) case (the startup state wired via the `LANDING`
  marker).
- **Competitor specs are Unconfirmed body-fit.** `sgcarmart` returns **HTTP 403** to
  automated fetches, so competitor specifications are not programmatically scrapeable;
  they cannot be auto-verified from that source.
- **Presets** live in `docs/preset-profiles.md`. Related rationale docs:
  `docs/minimum-critical-inputs.md`, `docs/input-sensitivity-findings.md`,
  `docs/portfolio-competitor-models.md`.

---

## 6. What changed this round

Two implementation features shipped on top of the frozen engine (both committed). The
engine SHA stayed frozen and `validate.py` stayed 19/19 throughout.

### FEAT-002 (commit `9b6c224`) - input integrity, removals, per-card Plan A/B

- **Removed the dead EV-quote override** (`cardField('EV quote SGD (override)', rp, 'D')`
  at index.html ~L6658). The verified mis-sync: the engine reads `rp.D`, but
  `buildPlanState` deep-clones the state and overwrites `rp.D` with the per-plan slider
  value, so the amber override box never moved the headline TCO. `rp.D` is retained in
  state/fixture; it is now driven exclusively by the slider, giving ONE authoritative
  acquisition number per plan.
- **Removed the input-box model-match machinery**: `buildCompare`, `refreshComparisons`,
  `matchForRow`, `matchEnergyContext`, `compLine`, `money0`, the "Matched EV" section,
  and the `card.appendChild(buildCompare(...))` call. (The Portfolio-stage matcher is a
  separate feature and was left untouched.)
- **Removed the decision-framing block** (`#decision-framing*` markup and
  `buildDecisionFraming()`), keeping its engine-driving parts: a single compact
  **business-intention** (replace / add) `<select>` was relocated near the top of the
  input panel (drives `rf.intention` + `H.recompute()`), and the Plan A / Plan B model
  pickers moved onto each truck card.
- **Per-card Plan A/B selection with read-only quotes**: each truck card now has a
  "Plan A - SRM variant" picker (from `catalogueModels().srm`), a "Plan B - competitor
  EV" picker (from `catalogueModels().comp`), and two read-only (non-amber, reference)
  EV-quote displays equal to `prod.I + oc[57]`, each noting that the per-plan slider
  varies the price. Per-truck plan model choices are stored on the non-engine
  `state.__reframe` blob (`rf.planA` / `rf.planB`, keyed by truck id col A), defaulting
  to the global `planAModel` / `planBModel`; `buildPlanState` reads the per-truck value
  with fallback to the global. On a pick, the plan's slider baseline is set to
  `prod.I + oc[57]` (clamped to the 120000-300000 range) so the quote and slider agree
  at rest.
- Harness: the HTMLCollection live-children guard in `tools/check_index.mjs` was
  **re-pointed** (not deleted) from the removed `refreshComparisons` to `buildFleet`'s
  live `fleet-cards.children` iteration; truck-card label / compare-absent /
  decision-framing-removed assertions were updated.

### FEAT-003 (commit `7987af3`) - advanced operating-cost cards + presentation sweep

- Re-laid the flat `#oc-form-adv` advanced operating-cost inputs (everything not in
  `PRIMARY_OC = {7, 29, 30}`) into **8 theme-sectioned, aligned cards** via a new
  `OC_ADV_SECTIONS` map keyed by `_row`: Running energy & consumption; Maintenance &
  tyres; Fixed recurring (insurance, road tax, inspection, other); Contract &
  availability / backup; Battery reserve & efficiency; Finance rates (price-growth /
  discount); Terminal values & repair timing; Data-mode / quote-basis flags. Every row
  keeps its demonstration default and its existing engine binding (same `r.values.B` +
  `liveRecompute`), so no computed number changed. The oc row 54 discount-rate note and
  provenance tooltips are preserved. New CSS aligns label / input / unit columns and
  stacks on `<=640px`.
- Presentation sweep: confirmed the FEAT-002 removals leave no dangling live UI (the
  remaining `buildCompare` / `refreshComparisons` / `decision-framing` references in
  `index.html` are explanatory comments or the KEPT Portfolio matcher, not live code).
- Harness: added sectioned-card assertions to `tools/check_index.mjs` (no existing
  assertion weakened); typography-floor assertions stay green.

---

## 7. Known limitations

- **"Add new vehicle" is a replace-now (month 0) approximation**, not a true fleet-count
  increase. A genuine count increase is out of the frozen engine's scope (the engine
  supports one retirement and one replacement per slot), so `intention === 'add'` simply
  pulls the replacement month to 0 in `buildPlanState`.
- **sgcarmart returns HTTP 403** to automated fetches, so competitor specs are not
  programmatically scrapeable or auto-verifiable from that source.
- **Coarse offline on-road router** - the routing/energy/capacity screens are screens on
  the entered figures, not a surveyed engineering sign-off. A numeric pass is an assumed
  technical pass, not an evidence pass.
- **Competitor body-fit is Unconfirmed** for every catalogue model.
- **Pixel-level layout checks need the orchestrator's real browser.** `getBoundingClientRect`
  clip checks and interaction drive cannot be run by the coder/planner; they are verified
  by the orchestrator at 1440px and ~390px via Playwright.

---

## 8. Sensible next steps

- **Confirm competitor specs** when a citable, fetchable source is available (sgcarmart is
  403), then flip the relevant body-fit from Unconfirmed where the evidence supports it.
- **Per-truck independent EV models** - the per-truck `rf.planA` / `rf.planB` maps already
  exist on the `__reframe` blob and `buildPlanState` already honours them; if the business
  wants trucks within a plan to carry different models, surface that in the UI and expand
  the `sensitivity.mjs` / `check_index.mjs` coverage accordingly (keep the engine frozen
  and `validate.py` at 19/19).
- **Tighten the on-road router** if a richer offline road fixture becomes available
  (still no runtime network; regenerate via the build step).
- **Deferred polish** - any remaining orphaned CSS selectors kept only to satisfy
  harness assertions (for example the `.tc-compare` / `.tc-col` rules) could be retired
  together with their assertions in a future harness-aware pass; do this only as an
  extend-not-weaken change.
- Always finish a change with: `node tools/build_index.js`, confirm the frozen engine
  SHA, `python tools/validate.py` (19/19), every `check_*.mjs` + `sensitivity.mjs` green,
  the three client source docs unchanged, and a grep for new runtime network references
  (none). Then have the orchestrator re-audit in a real browser at 1440px and ~390px.
