# Final edit plan - client-presentation prep (input integrity, per-card plans, advanced cards)

_Authored by the planning agent after a full read of the live wiring in `index.html`
against the frozen engine `src/engine.js`. This plan is display / input-wiring /
CSS only. The engine stays frozen (sha256
`45b388a1edaca77081e62f49e52276f6919448e458610474c7f65aafcb50fae3`), `validate.py`
stays 19/19, every harness stays green, and the page stays fully offline._

## Why this round exists

The user reports that the per-truck **"EV quote SGD (override)"** field is confusing:
the vehicle price + COE price already equal the real acquisition price, so the
override looks like it double-counts, and the per-plan sensitivity slider seems to
show a number much higher than that combined price. The user wants (1) every input
box audited and synced to the TCO, (2) the input-box EV-model-match removed, (3) the
decision-framing block removed, (4) Plan A / Plan B vehicle selection moved onto each
truck card (with per-plan EV quotes shown and NO override box - the slider is the only
varier), and (5) the operating-cost Advanced inputs laid out as clean, sectioned cards.
Then a handover doc.

## Verified root cause (the headline correctness finding)

The engine (`src/engine.js` lines 331-333) consumes a **single** EV acquisition
number per truck:

```
baseG = blank(rp.D) ? (isNum(prod.I) ? prod.I + oc[57] : NaN) : rp.D
```

So the acquisition cost is EITHER the col-D override (`rp.D`) OR, when col D is blank,
the fallback `prod.I + oc[57]` (catalogue vehicle price + the COE/acquisition adder,
`oc[57] = 93,000` in the demo). There is exactly ONE number; vehicle price and COE
price are the two ADDENDS of that one number, not a second charge on top. So the
engine itself does **not** double-count.

The confusion is in the **UI wiring**, and it is real. The live TCO shown on the right
does not come from a single `computeFleet(state)`; it comes from `computeReframed()`
(index.html ~L6118), which runs the frozen engine **twice** over two derived states
built by `buildPlanState()` (~L6099). `buildPlanState` **force-sets
`rp.D = evPrice`** for every EV-action truck, where `evPrice` is the per-plan slider
value (`evPriceA` / `evPriceB`, defaults 234,000 / 171,800). Consequences:

1. **The per-truck "EV quote SGD (override)" field is dead for the headline TCO.**
   Whatever the user types into col D is deep-cloned away and overwritten by the
   slider value inside `buildPlanState`. A visible, amber (editable) input that does
   not move the headline number is exactly the "confusing / misleading" behaviour the
   user describes - a genuine mis-sync between an input box and the TCO graph.
2. **`buildCompare` shows two competing numbers.** The side-by-side (~L6484) prints
   "Vehicle price + COE price = Default EV quote" AND, separately, "Your EV quote
   (override)", while the number the engine actually used is the slider value - which
   usually equals neither. That is why "the combined price looks much higher."

**Fix posture (display / input-wiring only, engine frozen):** make the per-card,
per-plan EV quote the derived `prod.I + oc[57]` figure for the selected model, shown
**read-only**; delete the override box; and let the per-plan slider remain the single
mechanism that varies that price (it already feeds `rp.D` through `buildPlanState`, so
no engine change is needed). The combined price the card shows for a plan at the
slider's baseline position then IS the price the engine uses for that plan.

## Area 1 - Input-field interaction integrity (audit + sync fix)

**Goal:** every input that can affect the TCO graph is synced to exactly one coherent
acquisition-cost number; no field silently double-applies.

- Remove the `cardField('EV quote SGD (override)', rp, 'D', 'num')` input from the
  truck-card quote grid (index.html ~L6658). The engine still reads `rp.D`, but it is
  now driven exclusively by `buildPlanState` from the per-plan slider, so the TCO has
  one authoritative acquisition number per plan.
- Replace the override box with **read-only per-plan EV-quote displays** on the card
  (see Area 3): "Plan A EV quote (SRM <variant>) = S$<prod.I + oc[57]>" and "Plan B EV
  quote (<competitor>) = S$<prod.I + oc[57]>", each annotated that the per-plan slider
  varies it.
- The `buildCompare` / `refreshComparisons` / `matchForRow` / `matchEnergyContext` /
  `compLine` / `money0` machinery (the input-box model-match, Area 2) is removed, so
  the "two competing numbers" presentation is gone with it.
- Audit table of every TCO-affecting input and its verified post-fix synced effect
  (the coder confirms each against the live wiring):

| Input (card / panel) | State field | Engine path | Synced effect after fix |
|---|---|---|---|
| Include | fleet col B | gates truck into all paths | toggling recomputes truck counts live |
| Work km/day, Days/year | fleet E/F | running costs all paths | live recompute, both plans |
| COE months left | fleet J | replacement timing | live recompute |
| Market value | fleet K | resale/sale-now | live recompute |
| New ICE quote | repl C | Keep/New baseline | live recompute (unchanged) |
| EV model (per plan, Area 3) | repl B via buildPlanState | EV acquisition + specs | changes the plan's quote AND spec-derived energy; recompute |
| ~~EV quote override~~ | ~~repl D~~ | removed from UI | **gone**; col D now driven only by the slider |
| Plan A / Plan B action | repl O / R | selects path per plan | live recompute |
| Plan A EV-cost slider | `__reframe.evPriceA` -> col D in state_A | EV acquisition (Plan A only) | varies ONLY Plan A quote + TCO |
| Plan B EV-cost slider | `__reframe.evPriceB` -> col D in state_B | EV acquisition (Plan B only) | varies ONLY Plan B quote + TCO |
| Commercial diesel, Depot electricity | ec 7 / 10 (B=C mirrored) | running costs | live recompute |
| ICE fuel L/km, insurance (OC primary) | oc 7 / 29 / 30 | running costs | live recompute |
| Fleet saving target | state.savingTarget | target gate | live recompute |
| Advanced OC / EC rows | oc/ec rows | various low-impact | live recompute, defaults preserved |

## Area 2 - Remove input-box model-match + decision-framing

- **Remove the input-box model-match** (`buildCompare`, `refreshComparisons`,
  `matchForRow`, `matchEnergyContext`, `compLine`, `money0`, the "Matched EV
  (recommended, editable)" section header and its explanatory `<p>` at ~L836-837, and
  the `card.appendChild(buildCompare(row, rp))` call). Also remove `setFleetComparisonRenderer`
  wiring if it is now unused, and `renderFleetComparisons` only if nothing else calls it.
- **Keep the Portfolio-stage matching/scatter** (`src/portfolio_fit.js`,
  `window.HSPortfolioFit`, `#portfolio-fleet-summary`, `renderPortfolio`,
  `#portfolio-switchover-table`, the Scatter module). That is a DIFFERENT, kept feature.
  Only the per-card input-box comparison is removed. `matchForRow` is the only consumer
  of `HSPortfolioFit` inside the input panel; confirm removing it leaves
  `renderPortfolio` / the Portfolio page matcher untouched.
- **Remove the decision-framing block** (`#decision-framing`, `#decision-framing-form`,
  `#decision-framing-note`, the `buildDecisionFraming()` function, its intention /
  Plan A / Plan B pickers, and the explanatory prose at ~L829-833).
  - The `intention` ('replace' | 'add') and the Plan A / Plan B model choices DO drive
    the engine via `buildPlanState`. These must NOT be lost. Relocate them: the Plan A /
    Plan B model pickers move onto each truck card (Area 3). The single **business
    intention** control (replace vs add) is still needed by `buildPlanState` (it pulls
    the replacement month to 0 for 'add'); keep it as ONE minimal control (a compact
    select) with a short label, dropping the verbose framing prose/box. Place it as a
    small shared control near the top of the input panel (not a large framed section).
- The HTMLCollection live-iteration guard in `check_index.mjs` (the `refreshComparisons`
  assertion, ~L714-753) caught a real `.forEach`-on-live-children crash. Since the
  per-card comparison machinery is removed, this assertion must be **re-pointed, not
  deleted**: re-aim it at another live `element.children` index-iteration in the
  controller (e.g. `buildFleet` iterating `cards.children`, or the energy-table row
  loop), keeping a shim probe that `children.forEach` is `undefined` and throws, and
  that the real recompute path does not crash. Do not weaken the shim.

## Area 3 - Per-card Plan A / Plan B vehicle selection + read-only quotes

Move plan vehicle selection from the (removed) stage-level decision-framing onto EACH
truck card. The engine constraint stands: one `col B` model per truck per plan is
expressed through the existing two-state `buildPlanState` approach (state_A uses the
Plan A model, state_B the Plan B model). Per card:

- **Plan A - SRM variant** picker (SRM catalogue models from `catalogueModels().srm`).
- **Plan B - competitor EV** picker (`catalogueModels().comp`).
- Two **read-only** EV-quote displays: Plan A quote = `prod.I + oc[57]` for the chosen
  SRM model; Plan B quote = `prod.I + oc[57]` for the chosen competitor. Shown as
  reference (white, not amber), each with a one-line note: "The Plan A / Plan B EV-cost
  slider varies this price."
- **No override input** on the card.
- Wiring: the per-card pickers write the per-plan model choice; `buildPlanState` reads
  the chosen model per plan. Because the engine binds ONE col-B model per truck per
  computeFleet call, the two-state recompute already gives genuine Plan A (SRM) vs
  Plan B (competitor) separation. Decide the honest state model: either keep the
  current GLOBAL Plan A / Plan B model (every truck shares the same SRM / competitor
  choice, matching today's reframe) and simply SHOW it on each card, OR extend
  `buildPlanState` to read a per-truck per-plan model. The simplest engine-frozen,
  validate-safe option is per-truck col B already exists; the Plan A/B split is a
  derived-state concept. **Recommended:** store per-truck Plan A model and Plan B model
  on the non-engine `__reframe` blob (e.g. `rf.planA[truckId]` / `rf.planB[truckId]`),
  defaulting to the current global `planAModel` / `planBModel`, and have `buildPlanState`
  use the per-truck value when present (falling back to the global default). This keeps
  `computeFleet` and the demo fixture untouched (validate.py still 19/19, because
  validate.py calls `compute_fleet` on the fixture directly and never touches the UI
  `__reframe` blob).
- The per-plan sliders (`evprice_a` / `evprice_b`) remain the sole EV-cost varier and
  still fan to col D per plan via `buildPlanState`. The slider's baseline value should
  track the selected model's `prod.I + oc[57]` so the shown quote and the slider agree
  at rest (coder to wire: on model pick, set the plan's slider to the model's derived
  quote, mirroring the existing `loadProductSpecs` default; keep the slider range).

## Area 4 - Operating-cost Advanced inputs as clean, sectioned cards

- Today `#oc-form-adv` is a flat `formgrid` of `ocField()` `.field` divs, and the
  Advanced area mixes per-truck fields, OC-advanced, and EC-advanced under one `.inner`.
- Re-lay the Advanced operating-cost inputs into **aligned cards grouped by theme** with
  section headings, e.g.: _Running energy & consumption_, _Fixed recurring (insurance,
  tax, inspection)_, _Maintenance & tyres_, _Contract & availability_, _Finance rates
  (growth / discount)_, _Terminal values & timing_, _Data-mode / quote-basis flags_.
  Map each `oc` row to a section by `_row` (coder derives the grouping from the row
  labels; every row keeps its demonstration default and engine binding).
- Use a consistent CSS grid so label / input / unit columns align across every card
  (reuse the soft-green / neutral design system and `.tc-grid` / card styling already
  in place). No ragged or stray fields. Respect the >=13px screen / >=14 SVG typography
  floor and do not regress the mobile breakpoints.
- Keep the discount-rate (oc row 54) note. Keep provenance tooltips.

## Area 5 - Client-presentation readiness

After Areas 1-4: input panel is clean and unambiguous; the per-card combined EV price
is the price the TCO uses; sliders transparently vary it; removed features leave no
dangling UI (no empty headers, no orphaned CSS selectors referenced by nothing, no
dead JS symbols that throw); every surface aligned. Preserve all honesty signals
(diagnostic-not-a-quote, finance-excluded, coarse-route/dated-snapshot, n.a. != zero,
SRM primary, illustrative presets, Unconfirmed body-fit, attributions).

## Area 6 - Deliverables

- `docs/final-edit-plan.md` (this file).
- The implementation (Areas 1-5), rebuilt via `node tools/build_index.js`.
- `docs/handover.md` - cold-start handover for a future agent.

## Hard constraints (restated)

- Engine frozen & Excel-exact: `validate.py` 19/19; engine sha unchanged; regenerate
  via `node tools/build_index.js`. These edits are input-wiring + display + CSS, NOT
  engine formula changes. If any fix seems to require an engine change, STOP and report.
- Fully offline self-contained single page at repo root: no CDN, no runtime network.
- Preserve ALL honesty signals.
- >=~13px desktop / >=14 SVG typography floor; do not regress mobile.
- All harnesses stay green and are EXTENDED (not weakened): assert the override field
  is gone, the model-match + decision-framing are gone, per-card Plan A/B pickers +
  read-only quotes exist, the single-acquisition-price sync holds, and the advanced OC
  cards are sectioned. Re-point (do not delete) the HTMLCollection / refreshComparisons
  live-children guard.
- Three client source docs (`.xlsx`, v4 quick guide `.md`, simulation `.html`)
  byte-for-byte unchanged.

## Verification

1. `node tools/build_index.js` then `sha256sum src/engine.js` == frozen sha.
2. `python tools/validate.py` -> 19 passed, 0 failed.
3. `node tools/check_index.mjs` and all other `check_*.mjs` + `sensitivity.mjs` green.
4. `git diff --stat` shows the three client source docs unchanged.
5. Grep final index.html for new `http(s)://` / `fetch` / external resource -> none.
6. Orchestrator real-browser drive at 1440px (and ~390px mobile spot check).
