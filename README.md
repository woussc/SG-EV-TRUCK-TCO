# Hong Seh EV Truck TCO Calculator

A self-contained, deterministic web tool that reproduces the authoritative Excel
workbook *"Hong Seh - EV TCO Calculator - Fleet, Charging and Service v5.xlsx"*
and layers a **prospect-identification** view on top of it.

## What the tool is and why it exists

The calculator answers two business questions about Hong Seh's prospective EV
truck customers, using a bottom-up total-cost-of-ownership (TCO) model that
accounts for Singapore-market conditions, the Hong Seh product catalogue and
each prospect's own truck usage:

1. **Who benefits most from switching** to Hong Seh EV trucks (ranked by the
   best EV plan's *Saving % vs Keep ICE*).
2. **Who is the biggest account opportunity** (ranked by the absolute 10-year
   saving in S$, alongside account size, truck count and Day-0 funding need).

It compares four ownership paths over a fixed 120-month horizon: **Keep ICE
then new ICE**, **All-new ICE now**, **Plan A** and **Plan B** (two independent
per-truck replacement strategies). Every headline number traces back to a cell
in the source workbook (see the provenance table below).

> **This tool makes NO runtime LLM / Claude / API / network calls and is fully
> deterministic.** The same inputs always produce the same outputs. Claude
> models were used **only during development** to reverse-engineer and verify
> the workbook math; they are not invoked at runtime and nothing on the page
> fetches an external resource. The math source of truth is `src/engine.js`.

## How to open it

Just open `index.html` in any modern browser. **No build step, no server, no
install.** The engine and the demonstration inputs are inlined into the page as
plain `<script>` blocks, so the file can be emailed and opened directly from
disk (`file://`).

To regenerate the standalone `index.html` after editing the engine or inputs:

```sh
node tools/build_index.js
```

This copies `src/engine.js` (export-stripped), the demo fixture and the prospect
seeds into `index.html` between the `ENGINE`, `DEMO` and `PROSPECTS` comment
markers, and writes the engine's SHA-256 into the page for traceability. Do not
edit the engine logic inside `index.html` by hand; edit `src/engine.js` and
re-run the command.

## The Prospects view

Open the page and the **Prospects** section (first section, above the Decision
snapshot) lists the seeded customer cases ranked by the current sort mode:

- **Evergreen Logistics (illustrative, fully specified)** - a clearly-labelled
  **Illustrative** assumption case (NOT a real customer). It is the one seed
  whose inputs are complete enough to clear every gate the model enforces:
  vehicle service/evidence "Within entered limits", charging-site "Complete"
  with an itemised depot quote, "Within entered site limits", a **numeric Total
  economic TCO** and a **positive Saving vs Keep ICE**. It therefore shows what
  a **confirmed win** looks like and leads both sort modes. The illustrative EV
  model is the **SRM T3EV+** (the nimble SRM variant: 1,660 kg payload,
  53.58 kWh battery, 0.1786 kWh/km, 11 kW AC / 55 kW DC charge power, catalogue
  base ~S$66,800, 300 km range), whose charge power matches the majority of the
  Singapore public-charging network. Best plan Plan B: Saving ~29.5%
  (~S$438,705) vs Keep ICE, Total economic TCO ~S$1,047,412 over the 4-truck
  fleet. Every figure is a realistic Singapore-market illustration picked so the
  gates pass; depot-only charging keeps the capacity screen transparent.
- **DEMONSTRATION 6-truck case** - the workbook's saved demonstration data.
- **Yong Wen (5-truck ambient cohort)** - a documented reconstruction of the
  reference-HTML simulation, labelled **Assumption**.
- **Venus (3-truck replenishment)** - a documented reconstruction, labelled
  **Assumption**.

**Illustrative confirmed win vs diagnostic-only reconstructions.** The contrast
is deliberate. Evergreen is fully specified, so the engine returns a numeric
Total and a confirmed saving and it ranks as a real confirmed win. The
DEMONSTRATION, Yong Wen and Venus cases have **no itemised charging-site quote**
(the public source never breaks it out), so their site cost and Total economic
TCO stay `n.a.`, they fall into the **vehicle-only diagnostic fallback**, and
they are flagged (`gatePass = false`, "Diagnostic only") rather than presented
as wins. Enter the charging-site quote and the verification evidence for any of
them and the same engine will produce a confirmed Total exactly as it does for
Evergreen.

Each case is a full engine input set. You can **duplicate the currently edited
case** as a new prospect (persisted in-memory, and optionally cached in
`localStorage` so it survives a reload), **Load** any prospect's inputs into the
editable sections below to inspect or adjust them, and toggle between the two
sort modes. Every row expands to show the exact model figures that drove its
rank (so the ranking is auditable). The illustrative case is tagged
**Illustrative** and the reconstructions are tagged **Assumption**; neither is a
confirmed customer figure.

**"Meets entered 15% target" is conditional on the supplied figures. It is not
an adoption probability and not independent proof of future savings** (mirrors
the workbook's "Saving claim status").

## Inputs to collect (evidence discipline)

Summarised from the *Fleet and Charging v4 Quick Guide*. Collect these during
the company interview and name the supporting record in the Evidence reference
field.

| Group | Fields | Evidence to request |
|---|---|---|
| Work | Work km/day, days/year, demanding-day route km, peak cargo, body, jobs | Route logs, dispatch records, cargo examples (exclude station detours from work km) |
| Current truck | COE months left, market value now, physical scrap, COE paid basis and original term | Registration record, dealer/disposal offer, COE record |
| Replacement | ICE quote, EV quote, chosen model, action, replacement month, year-10 value | Comparable all-in vehicle/body/COE quotes (residuals are forecasts) |
| Energy | Diesel L/km, EV kWh/km, energy prices and source shares | Stock-balanced fuel records, electricity invoices, loaded EV trials |
| Charging | Compatible access, charging power, queues, detours, charging window, concurrent demand | Actual site/route observations, not nameplate power alone |
| Other costs | Maintenance, tyres, tax, insurance, inspection, backup, paid extra time | Matched invoices/quotes |
| Site | Equipment, install, grid/civil works, incremental rent, fees, tenure, restoration, deposit | Itemised installer/landlord quotations, electrical assessment, permissions |

**Evidence rules (preserved from the workbook and enforced in the UI):**

- **Amber cells are editable inputs.** White is computed or reference.
- **`n.a.` is not zero.** It means a result is unavailable until the gating
  inputs are supplied (per-truck input completeness, site-quote completeness,
  matching truck count). The model never substitutes zero for an unknown.
- **A blank is not a measured zero.** Blank optional overrides use their stated
  fallback (and the fallback is not a current Hong Seh quote); blank required
  values block the result.
- **Demonstration defaults are not customer claims.** The seeded demo figures
  reproduce the Excel cached values; do not present them as a quotation or an
  owned-fleet fact.
- **Grants require checked awards.** The charger-grant ceiling is a budget
  estimate; only an entered, checked award reduces TCO. The vehicle incentive
  is a manually-checked single-event input.
- Charging-site costs must be entered in the correct place: **per-charger**
  items (equipment, local EV board, LEW, local cabling, registration) are
  multiplied by charger quantity; **whole-site** items (major electrical
  upgrade, civil works, SP connection) are entered once; do not duplicate.

## How each output maps to the Excel (provenance)

The full map lives at the top of `src/engine.js`. Headline outputs:

| Output | Excel source | Derivation |
|---|---|---|
| Truck count | `Results!B9:E9` | COUNTIFS of included `Paths` rows by plan code |
| Vehicle economic TCO | `Results!B12:E12` | SUMIFS `Annual build!N` by plan code |
| Net site ownership cost | `Results!B13:E13` | Sum of the per-year site economic schedule (`Results!F45:I55`); counted once per plan; Keep/New ICE = 0 |
| Total economic TCO | `Results!B14:E14` | Vehicle economic TCO + net site ownership cost |
| Saving vs Keep ICE / % | `Results!B15:E16` | `Keep ICE total - plan total`; divided by Keep ICE total |
| 15% fleet saving headroom | `Results!B17:E17` | `0.85 x Keep ICE total - plan total` |
| Cash less year-10 assets | `Results!B18:E18` | SUM `Annual build!O` + site cash schedule |
| Day-0 funding before loans | `Results!B19:E19` | SUMIFS `Annual build!R` + year-0 site cash |
| Cost per productive km | `Results!B21:E21` | Total economic TCO / SUMIFS `Annual build!S` |
| Saving claim status | `Results!B24:E24` | Conditional-on-inputs IF cascade ("Meets/Below entered 15% target", "Diagnostic only") |
| Max site TCO for 15% saving | `Results!D26:E26` | `0.85 x Keep ICE total - plan vehicle TCO` |
| Review reconciliation | `Review!B7:D18` | Duty coverage, economic/cash bridges, EV counts, path-formula count |

Key definitions reproduced faithfully: diesel visits
`= ROUNDUP(work km x available days x L/km / (refill - detour x L/km))`,
EV grid intensity `= battery kWh/km / (1 - charging loss)`,
EV service/year `= (Hong Seh 200,000 km schedule total / 200,000) x EV km/year`.
Demonstration inflation and discount are 0, so year-band escalation is 1 and NPV
equals nominal.

## Prospect scoring definition

Scoring lives in `src/engine.js` as `scoreProspect(result)` - pure,
deterministic, documented in the provenance comment, with **no invented weights
and no probabilities**. It takes a `computeFleet(...)` result and:

1. Picks the **best EV plan** = whichever of Plan A / Plan B actually deploys
   EVs by year 10; among EV plans with a numeric Total economic TCO (a confirmed
   win) it takes the larger *Saving vs Keep ICE* (ties -> Plan A). If no EV plan
   has a numeric Total (for example the charging-site quote is not itemised so
   site cost stays `n.a.`, or the route-energy screen fails), it still reports
   the EV plan with the larger vehicle-only economic benefit and **flags** the
   case as "Diagnostic only" / "Fails entered limits" - never a confirmed win.
2. Exposes two **sortable ranking keys**, each a plain model output (the UI
   sorts; the table shows the components behind each key):
   - **Benefits most from switching** = best EV-plan *Saving %* vs Keep ICE,
     with the 15% headroom, Max site TCO for 15% saving and gate status shown
     alongside. Flagged cases sink to the bottom and are not ranked as wins.
   - **Biggest account opportunity** = absolute 10-year *Saving vs Keep ICE* in
     S$, with account size (Total economic TCO), truck count and Day-0 funding
     shown alongside. When a case has no confirmed numeric saving it falls back
     to the indicative vehicle-only benefit, then to Keep-ICE account size, so
     scale still ranks - with the caveat flagged.

The ranked table columns are: Rank, Customer, Trucks, Best EV plan,
Saving % vs Keep ICE, Absolute 10-yr saving (S$), 15% target met?,
Account size (Total economic TCO S$), Day-0 funding, Gate status.

## How it was validated

The engine is the single source of math truth; a Python/Node harness asserts it
reproduces both the workbook's cached values and the reference-HTML figures.

Commands (the Python venv at `/projects/sandbox/.venv` has `openpyxl`):

```sh
# Excel + HTML parity and Review reconciliation (19 strict assertions):
. /projects/sandbox/.venv/bin/activate && python tools/validate.py

# Run the engine against the demo fixture and print Results + Review:
node tools/run_engine.js

# Rebuild the self-contained index.html from src/engine.js + fixtures:
node tools/build_index.js

# Headless DOM harness: evaluates the INLINED scripts in index.html and
# asserts the demo figures render and the Prospects view ranks/reorders:
node tools/check_index.mjs
```

**Demo 6-truck Excel parity** (abs tolerance < 0.5): Vehicle economic TCO
Keep ICE = 2,081,781; All-new ICE = 2,103,081; Plan A = 2,046,736.015;
Plan B = 1,986,546.046. Day-0 funding (All-new ICE) = 852,000; truck count = 6;
cost per productive km (Keep) = 0.77103. `n.a.` is preserved (never 0) for the
demo's Plan A/B net site cost, Total economic TCO and cost/km, because the demo
has no itemised charging-site quote ("Missing site quote").

**Review reconciliation:** fixed ten-year duty coverage = 720 (6 trucks x 120
months) PASS; Keep ICE and New ICE economic/cash bridges reconcile to ~0;
included-truck and EV counts PASS.

**Reference-HTML figures (Yong Wen / Venus)** - reproduced by the architect's
documented reconstruction in `tools/html_scenarios.py`:

- Keep-ICE baselines reconstruct close, validating the diesel/disposal/operating
  math on independent 5- and 3-truck registers:
  Yong Wen engine = 1,510,503 vs target 1,497,888 (delta +12,615, ~0.84%);
  Venus engine = 819,922 vs target 815,856 (delta +4,066, ~0.50%).
- **Full-EV residual (documented, tolerance not loosened):** the HTML Full-EV
  headlines (Yong Wen 1,498,134; Venus 904,045) are *Total* economic TCO figures
  that include an AC-depot **charging-site cost** and conditional **vehicle
  incentives**. The published source does not itemise a scope-complete site
  build-up (charger equipment/install/LEW/cabling/registration/site-prep) nor
  the exact per-truck grant quantum, so the reconstructed site status stays
  "Missing site quote" -> site cost `n.a.` and the EV grant is 0. The engine
  therefore reports **vehicle-only** EV TCO (Yong Wen 1,227,955; Venus 676,113),
  which is necessarily lower than the HTML total. The ~270k / ~228k gaps are
  consistent with an un-itemised site build-up plus incentives, **not an engine
  math error** - the demo Plan A/B EV TCO match the workbook exactly. Entering
  the AC-depot site quote and grant quantum for either company would let the
  same engine reproduce the HTML totals. This is why the two reconstructed
  prospects show as "Fails entered limits" / "Diagnostic only" in the Prospects
  table and are ranked by their indicative vehicle-only benefit, not as
  confirmed wins.

**Illustrative confirmed-win seed (Evergreen Logistics).** To show the opposite
case - a prospect that *does* clear every gate - the seed set includes one
fully-specified illustrative case. The headless `tools/check_index.mjs` harness
asserts it is `gatePass = true` with a numeric Total economic TCO and a positive
saving, and that it leads both sort modes. It is an illustration (realistic SG
figures chosen so the gates pass), not a real customer, and it does not change
any engine math - the 19 strict demo/Review assertions are untouched.

The `validate.py` run reports these HTML figures and keeps the strict demo
tolerance intact (19 passed, 0 failed).

## Repository layout

```
index.html                     The deliverable: self-contained, offline tool.
src/engine.js                  Pure, deterministic engine (computeFleet, scoreProspect, NA).
tools/extract_excel.py         Extract the workbook -> tools/fixtures/demo_case.json.
tools/engine.py                Python mirror (shells out to Node to run src/engine.js).
tools/html_scenarios.py        Documented Yong Wen / Venus reconstruction.
tools/build_prospects.py       Emit the Prospects seed cases JSON.
tools/build_index.js           Inline engine + demo + prospect seeds into index.html.
tools/run_engine.js            Run the engine against the demo fixture.
tools/check_index.mjs          Headless DOM harness for index.html.
tools/validate.py              Strict Excel + HTML parity / Review assertions.
tools/fixtures/                demo_case.json, prospect_seeds.json.
```

## Assumptions and limitations

- **Demonstration defaults are not customer claims.** The seeded demo and the
  Yong Wen / Venus reconstructions are assumptions pending verified inputs, and
  the Evergreen Logistics case is an illustrative, fully-specified demonstrator
  (realistic figures chosen so the gates pass), not a real customer.
- **`n.a.` is never zero**; blanks are not measured zeros. Unknowns are not
  auto-filled.
- **Single depot / charger bank per plan.** The charging site is costed once per
  plan and shared across its EVs; one old-truck retirement and one replacement
  per slot are supported (a replacement with insufficient life fails the service
  screen rather than silently buying a second one).
- **Coarse capacity screen.** The route-energy and site power/plug-hour checks
  are screens on the entered figures, not a surveyed engineering sign-off. A
  numeric pass is an *assumed technical* pass, not an evidence pass.
- **Grants require checked awards.** The charger-grant ceiling is a budget
  estimate only; only an entered, checked award reduces TCO.
- **Excluded from TCO:** loans, interest, principal schedules, normal wages,
  income tax and recoverable GST. Old-truck debt settlement appears only in
  Day-0 funding, not as a new economic expense.
- **No runtime LLM / Claude / API / network calls.** The tool is deterministic
  and self-contained; Claude models were used only during development to verify
  the math.
