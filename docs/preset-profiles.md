# EV Truck TCO - illustrative preset profiles

_Engine-verified outcomes for the four illustrative presets that replaced the
Yong Wen / Venus reconstructions in `tools/fixtures/prospect_seeds.json`. All
figures are produced by the FROZEN engine (`src/engine.js` ->
`computeFleet` + `scoreProspect`). Regenerate the seeds with
`python tools/build_prospects.py` and re-verify with
`node tools/check_presets.mjs`._

## Why these presets

None of these are real named customers. They are deliberately illustrative
cases (`evidence: "illustrative"`, each with an honest "NOT a real customer"
note) that show the full range of outcomes a client visit can produce, from a
confirmed win to "EV is not a fit right now" to a fresh blank slate.

`best`, `mid` and `bad` are all derived from the same fully-specified
**Evergreen** baseline. The illustrative EV model is the **SRM T3EV+** (products
row 11: 1,660 kg payload, 53.58 kWh battery, 0.1786 kWh/km, 11 kW AC / 55 kW DC
charge power, catalogue base S$66,800, 300 km range) - the nimble SRM variant
whose 11 kW AC / 55 kW DC charge power fits the majority of the Singapore
public-charging network. The best case anchors at best EV plan PLAN_B, Total
economic TCO **S$1,047,412**, Saving **29.52%** vs Keep ICE **S$1,486,117**. The
EV all-in quote overrides are re-based to the SRM catalogue: best uses
**S$193,000** (catalogue base col I 66,800 + the fallback EV COE component
oc row 57 = 93,000 + ~S$33,200 body/registration). `mid` and `bad` tune only the
high-impact drivers identified in
[`docs/input-sensitivity-findings.md`](input-sensitivity-findings.md):

| Rank | Driver | Where | Used by |
|---:|---|---|---|
| 1 | EV purchase quote (per EV truck) | Replacement plan, col D | mid, bad |
| 4 | Commercial diesel price (SGD/L) | Energy, row 7 (B + C mirror) | mid, bad |
| 6 | Work km/day (per truck) | Fleet register, col E | mid |
| 7 | Days/year worked | Fleet register, col F | mid |

## Engine-verified outcomes

| Preset | Best EV plan | Total economic TCO | Saving vs Keep ICE | Saving % | Gate | Tuning vs best |
|---|---|---:|---:|---:|---|---|
| **best** | Plan B | S$1,047,412 | +S$438,705 | +29.52% | passes | none (deep copy of Evergreen, SRM T3EV+ @ S$193,000) |
| **mid** | Plan B | S$1,195,664 | +S$143,440 | +10.71% | passes | EV quote S$234,000; diesel S$2.10/L; km/day -10%; days/yr -5% |
| **bad** | Plan B | S$1,411,412 | -S$67,418 | -5.02% | passes | EV quote S$284,000; diesel S$1.80/L |
| **blank** | n.a. | n.a. | n.a. | n.a. | no EV plan (honest empty) | all gate-critical values left blank/n.a. (NOT zero) |

Ordering holds as intended: **best.saving (+438,705) > mid.saving (+143,440) >
bad.saving (-67,418)**. `mid` is marginal but strictly positive; `bad` is a
negative saving scored honestly (the gates still pass, so it is an honest "EV is
not a fit right now", not a crash); `blank` yields n.a. with no error.

## Blank profile (clean slate)

The `blank` preset is a starting template for entering a fresh client on the
fly during a visit. Four truck rows (`NEW-1`..`NEW-4`) are present on **both**
input sheets with the same ID set and the Include toggles on, but every
gate-critical value is left blank (null / n.a.), never a measured zero. The
engine returns n.a. for Total economic TCO and Saving (no EV plan deployed yet)
without error, so the user sees a clean, honest empty state until the minimum
critical inputs are supplied.

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
   limits. Without it the model falls back to the vehicle-only diagnostic and
   the full Total stays n.a. (honest).
