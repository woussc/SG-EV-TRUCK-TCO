# EV Truck TCO Calculator: feature evolution and layout proposal

_Status: PROPOSAL for approval. No app code has been changed. This document describes what we intend to build and how, so you can approve, amend or reject it before any implementation round begins._

_Grounded against commit `b5d62b8`: `index.html` (~2,666 lines, single self-contained page), `src/engine.js` (~1,234 lines, frozen deterministic engine), `docs/input-sensitivity-findings.md`, and the "Hong Seh - Fleet and Charging v4 Quick Guide.md"._

---

## 0. Guardrails this proposal respects (read first)

These are hard constraints. Every recommendation below stays inside them.

1. **The engine math is frozen and Excel-exact.** `src/engine.js` reproduces the workbook's Paths -> Annual build -> Results -> Review chain and passes `python tools/validate.py` 19/19. This proposal **re-organises and re-labels how inputs and outputs are presented and grouped**, and proposes **new derived views computed from existing engine outputs**. It does **not** change any formula or number. Wherever a feature would need genuinely new math, it is called out explicitly as **[NEW COMPUTATION]** and described as an additive module layered on top of the frozen engine, with its own validation obligation. The 19 existing assertions must still pass untouched after every phase.
2. **Fully offline, self-contained, single page at repo root.** No CDN, no runtime network, no LLM/API calls. Charts render from in-page engine output. Any asset must be local and inlined. `node tools/build_index.js` remains the only way engine/fixtures reach `index.html` (via the `ENGINE` / `DEMO` / `PROSPECTS` markers).
3. **Model-honesty signals are preserved.** `n.a.` is never zero; evidence tags (Fact / Assumption / Inference / Unknown / Illustrative); conditional-savings caveats ("Meets entered 15% target" is not an adoption probability); demonstration/diagnostic framing. A CEO-facing summary must never dress a diagnostic scenario up as a validated quote. The new journey makes the tool more presentable **without** making it overstate certainty.
4. **No real-browser audit in-sandbox** (no headless Chrome). Layout is reasoned and must stay testable via the existing DOM harness `tools/check_index.mjs`, which already asserts section presence, live recompute on the `input` event, chart redraw, and sidebar toggle behaviour. Every new UI surface must add harness assertions rather than rely on a human eyeballing a browser.

---

## 1. Persona analysis: what actually matters to each viewer

This is grounded in the real engine outputs (`results.*`) and the measured sensitivity ranking in `docs/input-sensitivity-findings.md`, not generic persona talk. The top movers of the two business-critical outputs (best-EV-plan **Total economic TCO** and **Saving % vs Keep ICE**) are, in order: EV purchase quote (~14%), new ICE quote (~6%), ICE fuel L/km (~5.6%), diesel price (~5.3%), diesel-price growth (~3.7%), work km/day & days/year (~3% each), EV insurance / depot electricity / EV kWh/km (~2% each).

### Fleet manager - "will the trucks actually do the work, every day?"
Cares about **feasibility and continuity**, not headline dollars. The engine already produces exactly their evidence:
- **Route-energy / capacity screen** (`site.accessCheck`, `results.siteStatus`) - does the demanding-day route clear the battery reserve and the site's power/plug-hours? This is the quick guide's coarse screen, and a fail here is their veto.
- **Service / evidence screen** (`results.vehicleStatus`, Paths!Q cascade) - can the chosen EV complete the duty on its service schedule, or does a replacement fail for insufficient life?
- **Duty inputs** - work km/day, days/year, peak route km, peak cargo, jobs/day, COE months left (replacement timing). These are both high-impact (~3%) and the fields they personally own and can defend with route logs.
- **Charging realism** - public vs depot share, queues, detours, charging window, concurrent demand (quick-guide section 3). Today these live in Energy & charging / Advanced; they are the fleet manager's domain.

What to surface to them: the **gates table**, the **charging assessment**, and the duty inputs - framed as "here is what must hold true operationally," with `n.a.`/fail states loud, not hidden.

### Finance controller - "what is the cash and the risk, and is the saving real?"
Cares about **cash timing, downside, and the honesty of the claim**:
- **Day-0 funding before loans** (`results.day0Funding`) and **incremental day-0** (`results.incrementalDay0`) - the cheque they must write now.
- **Cash less year-10 assets** (`results.cashLessTerminal`) - cash view distinct from economic TCO; the quick guide is explicit this is not a bank balance.
- **Total economic TCO** and **Saving vs Keep ICE / %** (`results.totalEconomicTco`, `savingVsKeep`, `savingPct`) with the **15% headroom** (`headroom15`) and **max site TCO for 15% saving** (`maxSiteTco15`).
- **Sensitivity / break-even** - because the top movers (EV quote, diesel price, fuel L/km) are forecast/quote inputs, the controller needs to see how the saving holds when those move. This is their risk read.
- **Saving claim status** (`savingClaimStatus`) and the conditional/diagnostic flags - they must not sign off a diagnostic case as a quote.

What to surface: funding + cash cards, the sensitivity band on the saving, and the claim-status honesty flags front and centre.

### CEO - "what is the one-line decision and does it hold up?"
Cares about a **defensible headline**:
- **Best plan, Saving % and absolute S$ saving** vs Keep ICE over 10 years, plus **account size** (Total economic TCO) and **cost per productive km** (`results.costPerKm`) as the durable unit metric.
- **Confidence framing** - whether this is a confirmed win (all gates pass, numeric Total) or a diagnostic/illustrative scenario. The CEO summary is exactly where honesty discipline matters most: it must read the gate status, not just the number.
- Does **not** want the per-truck tables or per-charger line items; wants the decision and the top two or three risks behind it.

What to surface: a single **Decision** headline with the saving, the funding, the one unit metric, and an explicit confidence badge driven by `gatePass` / `savingClaimStatus`.

### Driver ("the drive") - "can I get through my shift without being stranded?"
The engine does not model the driver as a persona, but it computes the facts that decide the driver's day, and these are the most under-surfaced today:
- **Demanding-day route km vs usable range / battery reserve** - the route-energy screen result in human terms.
- **Public charging visits, detour km and queue/charging-window time** (quick-guide section 3; the engine already estimates public visits and includes detour energy and paid-time shares). For the driver this is "how many stops, how far off-route, how long waiting."
- **Recovery / backup** - backup rate inputs and the "backup service maintains the same work" check from the quick guide's pre-presentation list.

What to surface: a plain-language **"a day in the life"** read inside the Charging assessment - stops, detour minutes, buffer at end of route - derived from existing figures. Where the engine does not yet express detour/queue **time** as a first-class output (it folds paid-time shares into cost), that is flagged as **[NEW COMPUTATION - derived view]** in Feature 4.

**Net:** the four personas map cleanly onto the five committed features. Feature 1 collects the fleet-manager/driver duty facts; Feature 2 is the fleet-manager fit decision; Feature 3 is the finance/CEO money view; Feature 4 is the fleet-manager/driver feasibility view; Feature 5 is the finance/CEO commitment view. The layout (Section 3) lets you present to any of them without re-teaching the tool.

---

## 2. The five committed features as a staged user journey

The tool becomes a **five-stage journey** (a left-to-right stepper), each stage a self-contained screen that reads and writes the one shared state object and recomputes through the one frozen engine. Below, each feature maps to concrete engine inputs/outputs, and every place that needs new logic is flagged.

### Stage 1 - Customer screen (truck requirements, workload, replacement date, charging opportunity)
**Purpose:** capture who the customer is and what their trucks must do. This is the front door of a live presentation.

- **Maps to existing inputs:** Fleet register (Include, duty: work km/day, days/year, peak route km, peak cargo, jobs/day, body; current truck: COE months left, market value, scrap, COE term) and the replacement timing (replacement month). "Charging opportunity" = the depot/public access and power fields from Energy & charging.
- **Presentation change only** - regroup the existing amber inputs into a guided intake form (duty, current truck, replacement intent, charging opportunity) instead of the current dense tables. No new math.
- **[NEW COMPUTATION - none required].** Pure re-presentation of existing input fields bound to the same state.
- **Honesty:** evidence-reference field and tags carry over; blanks stay blanks (not zeros).

### Stage 2 - Portfolio matching guide (suitable models and configuration constraints)
**Purpose:** given Stage 1's workload, show which catalogue models fit and why, and flag the configuration constraints.

- **Maps to existing data:** the **Products catalogue** (7 models in `tools/fixtures/demo_case.json` -> `products.rows`). The engine already consumes product columns: `E` (consumption proxy), `D` (listed battery kWh/km basis), `G` (AC charge power kW), `H` (DC power / used in the payload-vs-capacity screen `rp.L > prod.H`), `B` (payload/body fit), `I` (archived price), `P` (service S$/km). So the fit **facts** exist.
- **[NEW COMPUTATION - model-matching rules].** Deciding "model X fits this duty" is a **new comparison layer**, not currently in the engine. It compares Stage-1 workload against product attributes (payload vs peak cargo, range/energy vs demanding-day km, charge power vs charging window). This is an **additive module** that reads product rows + duty inputs and emits a fit verdict per model; it must **not** alter `computeFleet`. It needs its **own validation** (unit assertions on the fit rules) and must express `n.a.`/"insufficient data" rather than inventing a fit when an attribute is blank or `Unconfirmed` (note product col `L` = "Unconfirmed" today).
- **Decision needed (see Section 7, Q1):** how opinionated should matching be - a hard pass/fail, or a ranked "best fit / fits with caveats / does not fit" with the reasons shown? Recommendation: **ranked with reasons**, because a hard pass/fail would overstate certainty against `Unconfirmed` product data.

### Stage 3 - TCO calculator (Keep ICE vs replacement, including whole-fleet effects)
**Purpose:** the core comparison. This is the most mature part of the tool and needs the least new logic.

- **Maps directly to existing outputs:** the engine already computes the **four whole-fleet paths** (Keep ICE, All-new ICE now, Plan A, Plan B) with Vehicle economic TCO, Net site cost, Total economic TCO, Saving vs Keep / %, 15% headroom, cash less terminal, Day-0 funding, cost per productive km, and the Review reconciliation. The whole-fleet effect the user asked for is **already the engine's native unit** (SUMIFS across included Paths rows).
- **[NEW COMPUTATION - none required for the numbers].** This stage re-presents the current Decision + Results + Charts sections as the journey's money screen. The only new work is the **shared-driver unification** (Section 4) so the diesel/electricity controls here agree with the sensitivity band - that is a state/wiring change, not new math.
- **Honesty:** `n.a.` propagation, the signed-credit convention and the "Saving % is whole-fleet, not per-truck" caveat (quick guide section 5) are preserved verbatim.

### Stage 4 - Charging assessment (usable sites, tariffs, detours, queues, recovery options)
**Purpose:** prove the charging plan is operable, in fleet-manager and driver terms.

- **Maps to existing outputs:** Energy & charging / site build-up (`site.*`: completeness, gross initial, annual, grant ceiling, peak depot energy, charging hours, access/capacity, EV count) and the route-energy screen. Tariffs = diesel/electricity prices and public shares. The quick guide (section 3) documents that the engine **already** estimates public visits, includes detour energy, and folds queues/charging-time/handling and avoidable paid-time into cost.
- **[NEW COMPUTATION - derived view, flagged].** The user wants **detours, queues and recovery options** surfaced explicitly. The engine currently expresses these as **cost and visit counts**, not as a standalone time/feasibility panel. We propose a **derived view** that re-expresses existing engine intermediates (public visit count, detour km, charging-window usage) into a human read ("N public stops/day, ~X detour km, buffer at route end"). If the needed intermediates are not currently returned by `computeFleet`, exposing them is an **additive, read-only extension of the engine's return object** (surfacing values it already computes internally) - it must not change any formula, and the 19 assertions must still pass. "Recovery options" (backup/standby) maps to existing backup-rate inputs; presenting alternative recovery scenarios is a **what-if clone**, same mechanism as sensitivity, not new math.
- **Decision needed (Q2):** do you want a true queue/detour **model** (arrival-by-arrival scheduling), which the quick guide explicitly says the tool is **not** (it is a coarse screen)? Recommendation: **do not** build a scheduling optimiser; keep the coarse-screen honesty and present it well. If genuine queue modelling is wanted later, it is a separate, clearly-flagged module with its own validation and its own caveats.

### Stage 5 - Standard proposal (quotation, finance options, servicing coverage, unresolved conditions)
**Purpose:** the leave-behind. A formatted, honest proposal the customer can take away.

- **Maps to existing inputs/outputs:** quotation = replacement quotes + Day-0 funding + Total economic TCO; servicing coverage = the service schedule / `service_costs` rows and the per-plan service status; unresolved conditions = the gates table + any `n.a.`/`Unconfirmed`/"Diagnostic only" flags (this is the honesty backbone of the proposal).
- **[NEW COMPUTATION - finance options].** **Loans, interest and principal schedules are explicitly excluded from the engine** (README + quick guide). Any "finance options" (e.g. loan amortisation, monthly instalment) is **genuinely new math** and must be an **additive finance module** with its own inputs (rate, term, deposit), its own validation, and clear separation from the economic TCO (so it never contaminates the frozen economic figures). **Recommendation:** start with a **presentation-only** proposal (quotation + servicing + unresolved conditions, all from existing outputs) in the first implementation phase, and treat the finance/amortisation module as a **separate, opt-in later phase** so it can be validated on its own without risking the frozen engine. Flagged for your decision (Q3).
- **Honesty:** the proposal view must inherit the gate/claim status. A diagnostic or illustrative case must render as "indicative / pending evidence," never as a firm quotation. This is the single most important honesty rule in the whole redesign.

**Summary of new-computation flags:**

| Stage | New computation? | Nature | Validation obligation |
|---|---|---|---|
| 1 Customer screen | No | Re-present existing inputs | Harness: fields bind to same state, recompute live |
| 2 Portfolio matching | **Yes** | Additive fit-rules module (reads products + duty) | New unit assertions on fit rules; must emit n.a. on blank/Unconfirmed |
| 3 TCO calculator | No (numbers) | Re-present four-path outputs + shared-driver wiring | Existing 19 assertions unchanged; new wiring assertions |
| 4 Charging assessment | **Yes (derived/read-only)** | Surface existing intermediates as a time/feasibility view; what-if recovery clones | 19 assertions unchanged; assertions that derived view matches engine intermediates |
| 5 Standard proposal | **Yes (finance only)** | Presentation from existing outputs; finance/amortisation is a separate additive module | Proposal view inherits gate/claim status; finance module validated independently, never mutates economic TCO |

---

## 3. Better user journey and layout plan (information architecture)

### Core idea
Replace the current two-panel "edit on the left, everything on the right" page (which the user finds unintuitive for presenting) with a **five-stage horizontal stepper** driving a **single stage viewport**, plus a **hover/overlay input panel** (Section 5) available on every stage. One shared state, one recompute path. Still a single offline file; stages are show/hide `<section>`s, not routes, so nothing fetches anything.

### Top-level chrome (persistent on every stage)
```
+---------------------------------------------------------------------------+
| EV  EV Truck TCO Calculator        10-yr fleet, Singapore   [ Inputs ⌘ ]   |  <- topbar; "Inputs" opens hover panel
|  DEMONSTRATION / diagnostic figures, not a customer quote.                 |  <- honesty banner (persists)
+---------------------------------------------------------------------------+
|  (1) Customer  >  (2) Portfolio  >  (3) TCO  >  (4) Charging  >  (5) Proposal |  <- stepper; current stage highlighted
+---------------------------------------------------------------------------+
|                                                                           |
|                        [ ACTIVE STAGE VIEWPORT ]                          |
|                                                                           |
+---------------------------------------------------------------------------+
|  [ < Back ]                              Confidence: ● confirmed / ◐ diagnostic   [ Next > ] |
+---------------------------------------------------------------------------+
```
- The **stepper** is clickable (jump to any stage) and keyboard-navigable; it doubles as a presenter's agenda. It persists the active stage in `localStorage` (same try/catch pattern as the existing sidebar key, so `file://` works).
- A **persistent confidence badge** in the footer reads `gatePass` / `savingClaimStatus` so honesty travels with you across stages.
- The honesty **banner** and evidence legend persist; they are not buried on one stage.

### Stage-by-stage viewport

**Stage 1 - Customer screen**
```
+-------------------------- Customer & workload ---------------------------+
|  Duty (per truck)        | Current truck         | Replacement intent    |
|  work km/day, days/yr,   | COE months left,      | target month, quotes  |
|  peak km, cargo, jobs     | market value, scrap   | (ICE / EV)            |
|-------------------------------------------------------------------------|
|  Charging opportunity: depot access? power? public share?               |
+-------------------------------------------------------------------------+
  Evidence ref per group. Blanks stay blank. "Next" is enabled always;
  missing required fields surface as honest n.a. downstream, not blocked here.
```

**Stage 2 - Portfolio matching**
```
+----------------------- Suitable models for this duty --------------------+
| Model            | Payload fit | Range/energy | Charge power | Verdict    |
| Farizon F3E      |  ok         |  ok          |  22kW AC     | Best fit   |
| ChengLong L2EV   |  ok         |  caveat      |  ...         | Fits, note |
| SRM T3EV         |  under      |  ...         |  ...         | Does not fit|
+-------------------------------------------------------------------------+
  Reasons shown per row. "Unconfirmed" product attributes => caveat, not a pass.
  [NEW fit module] Pick a model -> flows into the replacement plan for Stage 3.
```

**Stage 3 - TCO calculator (the money screen)**
```
+--- Decision (CEO one-liner) --------------------------------------------+
| Best plan: Plan B   Saving 22.8% (~S$338,988) vs Keep ICE               |
| Day-0 funding: S$...   Cost/productive km: S$0.77   ● confirmed         |
+-------------------------------------------------------------------------+
| Four-path table (Keep ICE / All-new ICE / Plan A / Plan B)  + charts    |
| Shared drivers live here: [diesel $/L ===|===]  [elec $/kWh ===|===]    |  <- unified control (Section 4)
| Moving a driver updates table, charts AND sensitivity band together.    |
+-------------------------------------------------------------------------+
```

**Stage 4 - Charging assessment**
```
+--- Can the charging plan run, every day? -------------------------------+
| Route-energy screen: PASS/FAIL   Site capacity: PASS/FAIL (n.a. honest) |
| Driver's day: ~N public stops, ~X detour km, ~Y min wait, end buffer Z  |  <- derived view, read-only
| Tariffs: diesel $/L, elec $/kWh (SAME unified controls as Stage 3)      |
| Recovery: backup rate -> what-if clone ("if 1 truck down, work holds?") |
+-------------------------------------------------------------------------+
  Coarse screen, not a scheduler (stated on-screen). n.a. = unknown, not zero.
```

**Stage 5 - Standard proposal (leave-behind)**
```
+--- Proposal (indicative / pending evidence if gates not clear) ----------+
| Quotation: vehicles, site, Day-0 funding, Total economic TCO            |
| Servicing coverage: schedule, S$/km, what's included                    |
| Finance options: [separate module, later phase]  (shown only if built)  |
| UNRESOLVED CONDITIONS: list of n.a./Unconfirmed/Diagnostic flags        |  <- honesty backbone
+-------------------------------------------------------------------------+
  Print/export preserves the existing @media print styles. A diagnostic case
  prints "indicative", never "quotation".
```

### How it stays responsive and offline
- **Responsive:** the stepper collapses to a scrollable chip row under ~700px (existing breakpoints at 1023/860/700 already exist and are reused). Stage viewports use the existing responsive grids (`.grid`, `.grid4`, `.charts-region`) which already collapse to one column on narrow screens.
- **Offline:** stages are `<section>` show/hide toggled by JS; no routing, no fetch. Charts stay the current inline SVG renderer fed by engine output. The build path (`tools/build_index.js` markers) is unchanged.
- **Testable without a browser:** `tools/check_index.mjs` gains assertions that each stage section exists, that the stepper switches the visible stage, that the confidence badge reflects `gatePass`, and that Stage 3/4 share one diesel/electricity value (Section 4). These are DOM-shim assertions, consistent with the existing harness style.

### Decision needed (Q4): stepper vs keep-scroll
Option A (recommended): **stepper + single stage viewport** as above - best for live presenting, matches the user's "journey" ask.
Option B: keep one long scroll page but add a sticky stage-nav and reorder sections into the five groups - lower risk, less presentation-friendly.
Recommendation: **Option A**, because the user's core complaint is presentation intuitiveness, but note Option A is the larger change and should be phased (Section 6).

---

## 4. Shared-driver unification (single source of truth)

### The problem, confirmed in code
Today diesel price and electricity price each exist **twice with divergent effects**:
- The **input box**: `getDiesel()` reads `H.ecRow(7).values.B`; `getElec()` reads `H.ecRow(10).values.B`. Editing these recomputes the main Results/Charts (`liveRecompute()`).
- The **sensitivity slider**: `renderSensitivity()` deep-clones state (`JSON.parse(JSON.stringify(H.state))`), overrides via `setEc(s,7,...)` / `setEc(s,10,...)` on the **clone**, recomputes the clone, and renders only the sensitivity table/chart. It writes its value into a separate `sensVals` object and **never writes back** to `state` or the input box.

So the slider is a throwaway what-if that moves one chart, while the input box moves everything else. The two can show different diesel prices at the same time. That is exactly the "1 input box and 1 slider on different things" the user described. The same split exists for EV purchase price and discount rate.

Additionally, the sensitivity code sets **both** Plan A and Plan B to the same value (`r.values.B=val; r.values.C=val`) and leaves **public** diesel unchanged - subtleties the unified control must handle deliberately, not by accident.

### Proposed mechanism: one value, two faces, one recompute
For each genuinely shared cost driver, bind a **single state value** to **both** a number box and a slider, so moving either updates the one value and triggers the one recompute path that feeds the table, the charts, the gates and the sensitivity view together. No divergent duplicate.

Design (state-level, not code):
1. **Single source of truth in state.** The canonical value lives where the engine already reads it (`energy_and_charging` row 7 for diesel, row 10 for electricity; the replacement-plan EV quote for EV price; `operating_costs` row 54 for discount). No new parallel store.
2. **Slider + number bound to the same value.** A small "driver control" renders a `range` slider and a `number` box that both read/write that one state field. Either one's `input` event writes the shared value and calls the single `liveRecompute()`.
3. **One recompute path.** `liveRecompute()` already recomputes everything from `state`. The sensitivity section becomes a **live reflection of the real state** (either it reads the same recompute output, or it keeps a what-if overlay that is clearly labelled as a temporary exploration layered on top of the committed value - see decision below). Dragging the driver moves the table, charts, gates and the sensitivity band in lockstep.
4. **Honesty preserved.** Because the canonical value is what the engine reads, there is no way for the headline and the sensitivity to disagree. The 19 assertions are unaffected (same engine, same inputs).

### Which drivers unify
- **Diesel price** (EC row 7) - shared. **Decision (Q5):** does diesel price apply to both Plan A and Plan B and to the public/commercial split identically, or should the unified control respect the A/B and commercial/public structure the engine supports? Recommendation: one unified **commercial diesel** control that writes A and B together (matching today's slider behaviour), with public diesel and A/B overrides available in the hover panel's Advanced area, so the common case is one control but the structure is not lost.
- **Electricity price** (EC row 10) - shared, same treatment.
- **EV purchase quote** - shared across EV-action trucks (today the slider sets col D for every EV truck). Unify as one "EV quote" control that fans out to the EV trucks, with per-truck override still available in the full replacement table.
- **Discount rate / diesel-price growth** - shared finance assumptions; unify but keep behind an Advanced disclosure with the zero demonstration defaults (they read ~0 in the demo per the sensitivity doc, but become material once non-zero).

### Decision needed (Q6): does the sensitivity section become live, or stay as an explicit what-if?
Option A (recommended): the shared driver **is** the control; the sensitivity table/band always reflects the committed state, so there is literally one value. Simpler, no divergence possible.
Option B: keep a separate "explore" overlay for scenario testing, but make it **visibly** a temporary layer (e.g. a "reset to committed value" chip) so it can never be mistaken for the real input.
Recommendation: **Option A** for the shared price drivers (that is the user's explicit ask), with Option B's labelled overlay kept only for deliberate multi-driver stress tests if you still want a tornado explorer.

---

## 5. Hover input panel (overlay instead of push-over slide-in)

### Current behaviour, confirmed in code
`wireSidebar()` toggles a `collapsed` class on `.workspace`, whose CSS is `grid-template-columns:minmax(380px,460px) 1fr` -> `1fr` when collapsed, and hides `#input-col` via `display:none`. That is a **reflow**: showing/hiding inputs resizes the results column and the whole layout jumps. The user wants inputs to **float over** the content instead.

### Proposed interaction design
Replace the grid-column input sidebar with an **overlay panel** that slides in over the content and does not reflow the results.

- **Trigger:** an "Inputs" button in the persistent topbar (replacing today's "Hide inputs" toggle). On every stage, the presenter can pop inputs open without leaving the stage they are showing.
- **Overlay, not reflow:** the panel is `position:fixed` (right or left edge), above the content with a high `z-index`, with a soft scrim/backdrop over the rest of the page. The results/stage viewport keeps its full width underneath; nothing resizes. This directly fixes the "push over slide-in" complaint.
- **Dismissal:** click the scrim, press `Esc`, or click the "Inputs" toggle again. Focus returns to the trigger (accessibility). `aria-expanded` on the trigger and `aria-hidden`/`role="dialog"` semantics on the panel, so the DOM harness can assert open/closed state the same way it asserts the sidebar today.
- **Where it sits / width:** a fixed-width panel (reuse the existing 380-460px sizing) anchored to one edge, internally scrollable so the long input set fits without moving the page. It contains the same curated primary inputs + the Advanced `<details>` disclosure that already exist - no input logic changes, only the container.
- **Context-aware (optional, Q7):** the panel can open focused on the inputs relevant to the current stage (duty fields on Stage 1, energy/site on Stage 4) while keeping "show all" available. Recommendation: yes, open to the stage-relevant group with a "show all inputs" expander, since that reinforces the journey.
- **Mobile behaviour:** under ~700px the overlay becomes a full-width bottom-or-full sheet (still an overlay, still no reflow of the content behind it). Reuses existing narrow breakpoints.
- **Styling:** consistent with the current flat look (`--paper`, `--line2`, `--soft`, the amber input convention). No new fonts or assets; everything inline; fully offline.
- **Persistence:** open/closed state persisted via the same `localStorage` try/catch pattern as today's `hs_sidebar_v1` key so `file://` keeps working.

### Harness testability
`tools/check_index.mjs` currently asserts the sidebar toggle flips `aria-expanded` and hides `#input-col`. The equivalent assertions for the overlay: trigger exists, starts closed (or open) per the chosen default, click toggles `aria-expanded` and the panel's visibility/`aria-hidden`, `Esc` closes. These are DOM-shim-friendly.

---

## 6. Phased implementation sequence

Each phase leaves the tool working and green. Every phase must end with `python tools/validate.py` 19/19 and `node tools/check_index.mjs` all-pass (with new assertions added), and `node tools/build_index.js` re-run if the engine return object is extended. Phases are ordered so the lowest-risk, highest-complaint-relief work lands first and the new-math work is isolated to the end.

**Phase 0 - Environment baseline (required first).** Install/confirm the Node + Python (.venv with openpyxl) toolchain, run `validate.py` (expect 19/19), `check_index.mjs` (expect all-pass), `run_engine.js`, and `build_index.js` to confirm a clean regenerate. Establishes the green baseline before any change. _Validates: existing math and harness are intact._

**Phase 1 - Shared-driver unification (Section 4).** Pure wiring/state change, no new math, directly fixes a named pain point. Bind diesel/electricity (and EV quote, discount) to a single value feeding one recompute path; retire the divergent slider-clone for those drivers (or relabel as explicit what-if per Q6). _Validates: 19/19 unchanged; new harness assertion that the price shown in the money view and the sensitivity view are the same value and move together._

**Phase 2 - Hover input panel (Section 5).** Replace the reflow sidebar with a fixed-overlay panel; same inputs, new container; keyboard + scrim dismissal; persisted state. _Validates: new harness assertions for trigger/open/close/aria; existing recompute-on-input assertions still pass; no reflow (CSS is `position:fixed`, asserted in markup)._

**Phase 3 - Five-stage journey shell + re-presentation of existing content (Stages 1, 3, 4 presentation-only).** Introduce the stepper + stage viewport; move the existing Inputs/Decision/Results/Charts/Charging/Gates content into Stages 1/3/4 with the CEO one-liner, finance cards and driver's-day **derived** read. No engine change beyond possibly surfacing already-computed intermediates (read-only) for the driver's-day view. _Validates: 19/19 unchanged; harness asserts each stage section exists, stepper switches visible stage, confidence badge reflects `gatePass`; if engine return is extended, re-run build_index and confirm the SHA updates and parity holds._

**Phase 4 - Portfolio matching module (Stage 2) [NEW COMPUTATION].** Additive fit-rules module reading `products.rows` + duty inputs, emitting ranked fit verdicts with reasons and honest `n.a.`/caveat on `Unconfirmed` attributes. Does not touch `computeFleet`. _Validates: new unit assertions for the fit rules (payload, range/energy, charge power, blank/Unconfirmed handling); 19/19 unchanged._

**Phase 5 - Standard proposal view (Stage 5), presentation-only.** Compose quotation + servicing + unresolved-conditions from existing outputs, inheriting gate/claim status so diagnostic cases render as "indicative." Print styles preserved. _Validates: harness asserts a diagnostic/illustrative case renders "indicative/pending evidence" and never "quotation"; 19/19 unchanged._

**Phase 6 (optional, separate) - Finance options module [NEW COMPUTATION].** Loan/amortisation module with its own inputs and its own validation, strictly separated from economic TCO. Only if you approve Q3. _Validates: independent unit tests for amortisation; assertion that economic TCO figures are byte-for-byte unchanged when finance is added; 19/19 unchanged._

Recommended first implementation round if you want quick, visible relief with zero math risk: **Phases 0-2** (baseline, shared-driver unification, hover panel). Phases 3-5 deliver the full journey; Phase 6 is opt-in.

---

## 7. Open questions / decisions needed before build

1. **Q1 - Portfolio matching opinionatedness.** Hard pass/fail, or ranked "best fit / fits with caveats / does not fit" with reasons? _Recommendation: ranked with reasons (honest against `Unconfirmed` product data)._
2. **Q2 - Charging detours/queues depth.** Keep the coarse-screen honesty and present existing figures well (recommended), or commission a true queue/scheduling model (separate flagged module, own validation, new caveats)?
3. **Q3 - Finance options.** Ship the proposal presentation-only first and treat loan/amortisation as a separate later module (recommended), or build finance math in the first proposal round? Either way it must never touch economic TCO.
4. **Q4 - Navigation model.** Stepper + single stage viewport (recommended, best for presenting) vs keep-scroll with sticky stage-nav (lower risk)?
5. **Q5 - Diesel/electricity structure.** One unified commercial-diesel/electricity control that writes Plan A and Plan B together (recommended, matches today's slider), with public and A/B overrides in the Advanced area - or expose full A/B + commercial/public structure in the primary control?
6. **Q6 - Sensitivity section.** Make it a live reflection of the committed shared value (recommended, no divergence possible), or keep an explicit, clearly-labelled what-if overlay for multi-driver stress tests?
7. **Q7 - Context-aware input panel.** Open the hover panel focused on stage-relevant inputs with a "show all" expander (recommended), or always show the full input set?
8. **Q8 - Scope/order of the first implementation round.** Phases 0-2 only (fast, zero math risk) vs Phases 0-3 (adds the journey shell) in the first build?

---

## 8. What this proposal explicitly does NOT do

- It does not change any engine formula or number. All existing figures (demo 6-truck parity, Yong Wen/Venus reconstructions, Evergreen illustrative win) stay identical.
- It does not add any runtime network, CDN, or LLM call. The tool stays a single offline file.
- It does not remove honesty signals. `n.a.`, evidence tags, conditional-savings caveats, diagnostic/illustrative framing, and the "not a probability" disclaimers all persist and are made more prominent (persistent confidence badge, unresolved-conditions block in the proposal).
- It does not silently introduce finance/scheduling math; both are flagged as additive, separately-validated, opt-in modules.
```
