# Minimum critical inputs (live client-visit set)

This note defines the **smallest set of inputs** a user must touch to get the
model producing a meaningful answer during a live client visit, and explains
each choice against two independent constraints:

1. **Impact ranking** from [`input-sensitivity-findings.md`](./input-sensitivity-findings.md)
   (the deterministic tornado sweep `tools/sensitivity.mjs` writes). This tells
   us which inputs move the answer the most.
2. **Engine gating** in `src/engine.js` (`inputStatus` / `serviceStatus`). This
   tells us which inputs the engine *requires* before it will emit a numeric
   result instead of `n.a.`.

The redesigned input panel (FEAT-002) promotes exactly this set to an
always-visible **primary** surface on each per-truck card and demotes everything
else behind an **Advanced** disclosure. Nothing is deleted: the demoted fields
keep their demonstration defaults so every computed number is unchanged and
`python tools/validate.py` still passes 19/19.

## The minimum critical set

### Per truck (one compact card each)

| Field | Fixture ref | Why it is critical |
| --- | --- | --- |
| **Include** | Fleet `B` | Gate: a truck only enters the paths when Included (`B===1`). COUNTIFS of included rows drives the truck count. |
| **Truck ID** | Fleet `A` / Repl `A` | The link key between Fleet register and Replacement plan. Must stay ID-consistent across add/remove. |
| **Work km/day** | Fleet `E` | Gate: `inputStatus` requires it numeric. Sensitivity: duty intensity (~3%). Sets all running costs. |
| **Days/year** | Fleet `F` | Gate: required numeric. Sensitivity: duty intensity (~3%). |
| **COE months left** | Fleet `J` | Gate: required numeric and drives a valid replacement month when the per-plan month is blank. Primary replacement-timing decision. |
| **Market value SGD** | Fleet `K` | Gate: required numeric (resale / sale-now economics). |
| **EV model** | Repl `B` | Gate (EV paths): an EV-action truck needs a model selected; the model supplies battery / kWh-per-km / list price via the blank-fallback. Selecting it loads catalogue defaults. |
| **New ICE quote** | Repl `C` | Gate: a numeric Total needs it. Sensitivity: sets the Keep / New baseline (~6%). |
| **EV quote** | Repl `D` | Gate (EV paths): needed for a numeric Total. Sensitivity: the single biggest lever (~14%). Loaded from the model (`prod.I + oc[57]`) as an editable default. |
| **Plan A action** | Repl `O` | Chooses Keep ICE / New ICE / EV for Plan A. |
| **Plan B action** | Repl `R` | Chooses the action for Plan B. |

### Shared (entered once, not per truck)

| Field | Fixture ref | Why it is critical |
| --- | --- | --- |
| **Commercial diesel price** | Energy `7`.B | Gate: diesel running cost. Sensitivity: ~5.3% diesel running-cost lever. |
| **Depot electricity price** | Energy `10`.B | Gate (EV): EV running cost. Sensitivity: ~2% EV running-cost lever. |
| **ICE fuel consumption L/km** | OpCost `7` | Sensitivity: ~5.6% diesel running-cost lever (paired with diesel price). |

## Why the rest is Advanced / optional

The engine *also* reads fleet cols **L (scrap), M (straight-line), N (COE term)**
for gating. These are kept at **sensible non-blank demonstration defaults** so
the gate still clears, but they are demoted to the per-card Advanced disclosure:
sensitivity shows them near the bottom of the ranking and they rarely change in
a first-pass conversation. Everything else -- peak route km / peak cargo / jobs
per day, duty / body descriptors, per-plan replacement months and year-10 /
terminal values, keep & new-ICE terminal values, the vehicle grant and its
timing, debt-if-sold, sale fee, finance growth / discount rates, battery reserve
/ fade, auxiliary energy, and the detailed per-charger site line items beyond
equipment price and charger count -- is low-impact (<~1-2% swing) or conditional
and lives behind Advanced with its demonstration default preserved.

### Honesty posture carried into the primary surface

- Amber = editable; white = computed or reference. Blank is never a measured
  zero and `n.a.` is never a value (`H.parseEditable`).
- Selecting an EV model loads the catalogue specs as **editable defaults** only.
  Each field stays overridable.
- Catalogue **payload / body-fit status (`prod.L`) is `Unconfirmed` for every
  model today**, so any loaded payload / body-fit figure renders WITH an
  explicit `Unconfirmed` caveat tag. It is never presented as a confirmed number.
- Because the loaded EV quote default equals `prod.I + oc[57]` (exactly the
  engine's blank-fallback) and the loaded battery / kWh-per-km equal `prod.D` /
  `prod.E`, loading a model and leaving it unoverridden reproduces the same
  number the engine already computes from a blank. No new math is introduced.
