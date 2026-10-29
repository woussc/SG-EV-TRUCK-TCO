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
**Evergreen** baseline. FEAT-003 frames them as a real SRM-vs-competitor
side-by-side:

- **Plan A carries the SRM scenario.** The SRM EV is the **SRM T3EV+** (products
  row 11: 1,660 kg payload, 53.58 kWh battery, 0.1786 kWh/km, 11 kW AC / 55 kW DC
  charge power, catalogue base S$66,800, 300 km range) - the nimble SRM variant
  whose 11 kW AC / 55 kW DC charge power fits the majority of the Singapore
  public-charging network. The SRM all-in quote re-bases to the catalogue:
  best uses **S$193,000** (catalogue base col I 66,800 + the fallback EV COE
  component oc row 57 = 93,000 + ~S$33,200 body/registration).
- **Plan B carries an honest competitor.** The Plan B EV is the **ChengLong
  L2EV** (products row 9: 2,480 kg payload, 86.55 kWh battery, 0.2704 kWh/km,
  22 kW AC / 120 kW DC, catalogue base S$78,800, 320 km range) - the current UI
  default competitor. Its all-in quote re-uses the **same** COE + body/
  registration build-up as the SRM on its own catalogue base:
  78,800 + 93,000 + 33,200 = **S$205,000**. Using an identical build-up on both
  makes it a like-for-like vehicle comparison, so the SRM wins the best case
  purely because its catalogue base (66,800) sits S$12,000 below the ChengLong's
  (78,800) - **no number was rigged**.

### The frozen-engine constraint and how both paths stay honest

The frozen engine binds **one** col-B model (and one col-D quote) per truck row,
used for both Plan A (col O) and Plan B (col R). A raw `computeFleet(inputs)` on
a single row therefore cannot run SRM on Plan A and a different competitor on
Plan B simultaneously. The live app already solves this with the **two-state
projection** (`index.html` `buildPlanState`/`computeReframed`): it deep-clones
the state and runs the engine twice - once with col B = the Plan A model + col D
= the Plan A quote (slot O), once with col B = the Plan B model + col D = the
Plan B quote (slot R) - then reads `plan_a` from the first run and `plan_b` from
the second. The preset stores both models explicitly: **col B / col D = SRM**
(Plan A) and non-engine **`_planB_model` / `_planB_price` = ChengLong L2EV /
S$205,000** (Plan B). The engine never reads the underscore fields (they are not
Excel columns), so `validate.py` and the frozen sha are untouched; the UI's
FEAT-002 preset load-sync and `tools/check_presets.mjs` both read them to run
the competitor on Plan B, keeping the standalone harness and the live tool
consistent AND honest.

`mid` and `bad` tune only the high-impact drivers identified in
[`docs/input-sensitivity-findings.md`](input-sensitivity-findings.md) **on the
SRM (Plan A) side**; the ChengLong (Plan B) quote is held at S$205,000:

| Rank | Driver | Where | Used by |
|---:|---|---|---|
| 1 | SRM (Plan A) purchase quote | Replacement plan, col D | mid, bad |
| 4 | Commercial diesel price (SGD/L) | Energy, row 7 (B + C mirror) | mid, bad |
| 6 | Work km/day (per truck) | Fleet register, col E | mid |
| 7 | Days/year worked | Fleet register, col F | mid |

## Engine-verified outcomes

All figures are the frozen engine's real two-state results (SRM on slot O,
ChengLong on slot R). The **headline** is `scoreProspect`'s `bestPlanLabel`
(the better of the two plans by saving). The SRM best → mid → bad story is
carried by **Plan A's own saving vs Keep ICE**.

| Preset | Plan A — SRM Total | Plan A — SRM Saving % | Plan B — ChengLong Total | Plan B — ChengLong Saving % | Keep ICE | Headline | Gate |
|---|---:|---:|---:|---:|---:|:--:|---|
| **best** | S$1,047,412 | +29.52% (+S$438,705) | S$1,137,729 | +23.44% | S$1,486,117 | **Plan A (SRM)** | passes |
| **mid** | S$1,195,664 | +10.71% (+S$143,440) | S$1,114,482 | +16.77% | S$1,339,103 | Plan B | passes |
| **bad** | S$1,411,412 | −5.02% (−S$67,418) | S$1,137,729 | +15.35% | S$1,343,994 | Plan B | passes |
| **blank** | n.a. | n.a. | n.a. | n.a. | n.a. | n.a. | no EV plan (honest empty) |

Tuning vs best (SRM / Plan A side only; ChengLong / Plan B held at S$205,000):

- **mid**: SRM quote S$234,000; diesel S$2.10/L; km/day −10%; days/yr −5%.
- **bad**: SRM quote S$284,000; diesel S$1.80/L.

**Plan A now carries the SRM scenario** (previously the SRM demonstration sat on
both slots, so `scoreProspect` labelled the SRM win "Plan B", reading as a
competitor win). The ordering holds as intended on the SRM / Plan A saving:
**best (+29.52%) > mid (+10.71%) > bad (−5.02%)**. `best` is a confirmed SRM win
that also beats the competitor; `mid` is a marginal SRM positive; `bad` is an
honest "SRM is not a fit right now". Where the fixed-quote competitor beats a
deliberately tuned-up SRM (mid, bad), the engine surfaces it honestly rather
than hiding or rigging it; `blank` yields n.a. with no error.

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
