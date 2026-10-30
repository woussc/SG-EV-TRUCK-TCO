# EV Truck TCO - illustrative preset profiles

_Engine-verified outcomes for the four illustrative presets in
`tools/fixtures/prospect_seeds.json`. All figures are produced by the FROZEN
engine (`src/engine.js` -> `computeFleet` + `scoreProspect`). Regenerate the
seeds with `python tools/build_prospects.py` and re-verify with
`node tools/check_presets.mjs`. This supersedes the earlier best/mid/bad
price-tuning doc; see [`docs/preset-redesign-plan.md`](preset-redesign-plan.md)
for the plan of record._

## Why these presets

None of these are real named customers. They are deliberately illustrative
cases (`evidence: "illustrative"`, each with an honest "NOT a real customer"
note) that map the **operational break-even frontier**: at honest, fixed
vehicle prices, which operational intensity and how many trucks a company needs
before EV genuinely saves. The four cases are `wins`, `breakeven`, `loses` and
`blank`.

### The honest fixed-price contract

Earlier presets manufactured a best/mid/bad story by moving the SRM col-D
all-in quote **upward** per case (S$193k → S$234k → S$284k) while holding the
ChengLong quote fixed. Because the per-truck card / EV-cost slider then showed a
model cost **above** the vehicle's own input-field price, a loaded profile read
as misleading. That price-rig is removed. The three archetypes now hold the
vehicle prices **identical and honest** in every profile:

- **Plan A — SRM T3EV+ at S$193,000** (products row 11: 1,660 kg payload, 53.58
  kWh battery, 0.1786 kWh/km, 11 kW AC / 55 kW DC, catalogue base S$66,800, 300
  km range). The all-in quote re-bases to the catalogue: base 66,800 + fallback
  EV COE component (oc row 57 = 93,000) + ~S$33,200 body/registration = S$193,000.
- **Plan B — ChengLong L2EV at S$205,000** (products row 9: 86.55 kWh, 0.2704
  kWh/km, 22 kW AC / 120 kW DC, catalogue base S$78,800). Same COE + body
  build-up on its own catalogue base: 78,800 + 93,000 + 33,200 = S$205,000.

**These two prices are held FIXED and IDENTICAL across `wins`, `breakeven` and
`loses`.** The outcome varies **only** by fleet size (number of EV-action
trucks) and operational intensity (km/day × days/year), never by moving a price.
`tools/check_presets.mjs` locks this in with a fixed-price invariant and an
explicit "no loaded profile sets a vehicle model cost above its own input-field
price" assertion.

### Fleet-sized charging site

The depot charging-site build-up **scales with the fleet**: one AC11 charger and
one usable plug per EV-action truck, net site power = chargers × 11 kW. This is
the honest fix for the capacity gate — a fixed 4-charger depot could not charge a
30-truck fleet within the window, so the engine gated the `wins` case out.
Because the site is now right-sized to the fleet it serves, the per-truck
economics are broadly stable with fleet size, and the genuinely "not a fit" case
is a single, barely-used truck rather than a small fleet artificially burdened
with an oversized depot.

### The frozen-engine constraint and how both paths stay honest

The frozen engine binds **one** col-B model (and one col-D quote) per truck row,
used for both Plan A (col O) and Plan B (col R). A raw `computeFleet(inputs)` on
a single row therefore cannot run SRM on Plan A and a different competitor on
Plan B simultaneously. The live app solves this with the **two-state projection**
(`index.html` `buildPlanState`/`computeReframed`): it deep-clones the state and
runs the engine twice - once with col B = the Plan A model + col D = the Plan A
quote (slot O), once with col B = the Plan B model + col D = the Plan B quote
(slot R) - then reads `plan_a` from the first run and `plan_b` from the second.
The preset stores both models explicitly: **col B / col D = SRM** (Plan A) and
non-engine **`_planB_model` / `_planB_price` = ChengLong L2EV / S$205,000**
(Plan B). The engine never reads the underscore fields (they are not Excel
columns), so `validate.py` and the frozen sha are untouched; the UI's preset
load-sync and `tools/check_presets.mjs` both read them to run the competitor on
Plan B, keeping the standalone harness and the live tool consistent AND honest.

## Engine-verified outcomes

All figures are the frozen engine's real two-state results (SRM on slot O,
ChengLong on slot R). The **headline** is `scoreProspect`'s `bestPlanLabel` (the
better of the two plans by saving). The story is carried entirely by **fleet
size and operational intensity** at fixed prices.

| Preset | Fleet | Intensity | Plan A — SRM Total | Plan A — SRM Saving % | Plan B — ChengLong Total | Plan B — ChengLong Saving % | Keep ICE | Headline | Gate |
|---|---:|---|---:|---:|---:|---:|---:|:--:|---|
| **wins** | 30 | 120 × 300 | S$7,867,090 | +29.43% (+S$3,281,590) | S$8,545,570 | +23.35% | S$11,148,680 | **Plan A (SRM)** | passes |
| **breakeven** | 4 | 60 × 200 | S$972,937 | +13.83% (+S$156,208) | S$1,028,776 | +8.89% | S$1,129,145 | **Plan A (SRM)** | passes |
| **loses** | 1 | 20 × 100 | S$248,754 | −0.65% (−S$1,615) | S$259,973 | −5.19% | S$247,139 | **Plan A (SRM)** | passes |
| **blank** | — | — | n.a. | n.a. | n.a. | n.a. | n.a. | n.a. | no EV plan (honest empty) |

- **wins** — 30 EV-action trucks at 120 km/day × 300 days: a large,
  high-utilisation depot-charged urban fleet. SRM saving **+29.43%**, comfortably
  above the 15% target, and SRM beats the ChengLong competitor. This is the
  confirmed-win archetype and the held-constant base for the §6 all-12-model
  table in the simulation brief.
- **breakeven** — 4 EV-action trucks at 60 km/day × 200 days: a mid-sized fleet
  at moderate utilisation. SRM saving **+13.83%**, positive but just **below** the
  15% target — the marginal "is it worth it for us?" case, and the **default
  landing** scenario.
- **loses** — 1 EV-action truck at 20 km/day × 100 days: a single, barely-used
  truck. SRM saving **−0.65%**, slightly negative — an honest "EV is not a fit
  yet". Note the price is the **same honest S$193k** as the winning fleet; the
  sign is set purely by how little the truck is used.

The ordering holds as intended on the SRM / Plan A saving: **wins (+29.43%) >
breakeven (+13.83%) > loses (−0.65%)**. `blank` yields n.a. with no error.

### Band values (open user decision)

The exact bands (30 / 120 × 300, 4 / 60 × 200, 1 / 20 × 100) are chosen to land
`wins` / `breakeven` / `loses` cleanly on the win / below-15% / negative side of
the 15% target **at honest fixed prices with the fleet-sized charging site
passing the engine gate**. With the site right-sized to the fleet, a 2-truck
fleet at realistic intensity actually saves a little, so the honest "not a fit"
case is a single, lightly-used truck. These bands can be nudged to a preferred
Singapore operator profile; see the break-even grid in §3 of
[`docs/simulation-results-brief.md`](simulation-results-brief.md).

## Blank profile (clean slate)

The `blank` preset is a starting template for entering a fresh client on the fly
during a visit. Four truck rows (`NEW-1`..`NEW-4`) are present on **both** input
sheets with the same ID set and the Include toggles on, but every gate-critical
value is left blank (null / n.a.), never a measured zero. Common
non-customer-specific Singapore-market assumptions (energy prices, ICE fuel
L/km, recurring operating costs, AC/DC-respecting grant-config defaults) are
prefilled, while every customer-specific duty / quote / terminal value and the
itemised charging-site quote are left blank. The engine returns n.a. for Total
economic TCO and Saving (no EV plan deployed yet) without error, so the user
sees a clean, honest empty state until the minimum critical inputs are supplied.

## Minimum critical inputs to get a numeric result

From the sensitivity ranking and the gate logic in `src/engine.js`, the fewest
inputs needed to turn a blank profile into a numeric Total economic TCO and a
Saving vs Keep ICE are:

1. **Per truck (Fleet register):** Include = 1, work km/day (E), days/year (F),
   peak route km (G), peak cargo (H), COE months left (J), current market value
   (K), scrap (L), straight-line/month (M), COE term months (N > 0).
2. **Per truck (Replacement plan):** an EV model selected (B), new-ICE quote
   (C), EV quote (D) - or leave D blank to use the catalogue default - and an EV
   action on Plan A (O) and/or Plan B (R).
3. **Energy (both plans):** commercial diesel price (row 7) and depot
   electricity price (row 10).
4. **Charging site (for a numeric *Total*, not just vehicle-only):** an itemised
   depot quote with site status "Complete" and the access/power window within
   limits (one charger + plug per EV truck, net site power ≥ chargers × rated
   kW). Without it the model falls back to the vehicle-only diagnostic and the
   full Total stays n.a. (honest).
