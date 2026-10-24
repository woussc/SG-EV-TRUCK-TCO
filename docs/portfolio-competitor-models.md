# Portfolio switch-over: competitor EV-truck models (FEAT-003)

This note documents the **five real competitor battery-electric commercial
vehicles** appended to the product catalogue for the full-portfolio
**switch-over page** in the calculator. They are additions for the switch-over
comparison story only. **SRM stays the primary / recommended model**; the
competitors are never auto-selected and can be toggled out of the matcher.

## Integrity statement (read first)

**Nothing in these rows is fabricated.** The brief for this work carries a
non-negotiable integrity rule for a client-facing business model:

- Every figure that is **sourced** is cited (URL + access date) in the
  catalogue row's evidence column (**col K**) and tagged `sourced` in the
  additive per-field provenance map (`_prov`).
- A figure **derived** from other sourced figures (for example kWh/km computed
  from a sourced battery kWh and a sourced range) is tagged `derived` and names
  the sourced inputs it came from. It is never presented as a measured value.
- Every figure that **could not be verified** from a primary/authoritative
  source is **left blank / `n.a.`** and tagged `unconfirmed`. It is **never**
  filled with an invented precise number.
- The catalogue body-fit status (**col L**) stays `Unconfirmed` for every
  model, following the existing catalogue convention, so no competitor can read
  as a confirmed fit.

Several fields below are deliberately **Unconfirmed**. That is an honest gap,
not a defect: authoritative Singapore-specific figures (notably SGD list prices
and on-board AC charge power) were not available for these models at build
time, so they are shown as `n.a.` rather than guessed.

All access dates below are **2026-10-24**. Sources are reputable encyclopaedia
pages (Wikipedia), used here as the primary/authoritative reference per the
integrity rule's allowance; where Wikipedia itself cites a manufacturer/dealer
spec sheet that lineage is noted in the row.

## Catalogue columns

`A` name · `B` payload kg · `C` 2nd weight · `D` usable battery kWh ·
`E` kWh/km · `F` basis · `G` on-board AC kW · `H` DC kW · `I` list price SGD ·
`J` range km · `K` evidence ref (citation) · `L` body-fit status ·
`P` service S$/km. Each new row also carries an additive `_prov` map keyed by
column letter (`sourced` | `derived` | `unconfirmed`), which the frozen engine
ignores (it only reads A..Q by letter).

---

## 1. BYD T3 (ETP3) — catalogue row 14

Source: <https://en.wikipedia.org/wiki/BYD_T3> (BYD M3 / T3 / ETP3), accessed 2026-10-24.

| Field | Value | Provenance |
|---|---|---|
| D usable battery kWh | 44.9 | **Sourced** — 44.9 kWh LiFePO4 (a 50.3 kWh NCM option also exists) |
| E kWh/km | 0.1497 | **Derived** — 44.9 kWh ÷ 300 km (sourced inputs) |
| J range km | 300 | **Sourced** — ~300 km EV range |
| B payload kg | n.a. | **Unconfirmed** — not sourced |
| C 2nd weight | n.a. | **Unconfirmed** — not sourced |
| G AC kW | n.a. | **Unconfirmed** — not sourced |
| H DC kW | n.a. | **Unconfirmed** — not sourced |
| I list price SGD | n.a. | **Unconfirmed** — not sourced |
| P service S$/km | n.a. | **Unconfirmed** — not sourced |

## 2. Maxus eDeliver 9 — catalogue row 15

Source: <https://en.wikipedia.org/wiki/Maxus_V90> (Maxus V90 / eDeliver 9), accessed 2026-10-24.

| Field | Value | Provenance |
|---|---|---|
| D usable battery kWh | 88.5 | **Sourced** — top option of 51.5 / 72 / 88.5 kWh LFP |
| G AC kW | 11 | **Sourced** — 11 kW AC charging |
| H DC kW | 80 | **Sourced** — 80 kW DC charging |
| B payload kg | n.a. | **Unconfirmed** — not sourced |
| C 2nd weight | n.a. | **Unconfirmed** — not sourced |
| E kWh/km | n.a. | **Unconfirmed** — no single authoritative range to derive from |
| I list price SGD | n.a. | **Unconfirmed** — not sourced |
| J range km | n.a. | **Unconfirmed** — varies by battery option, not sourced cleanly |
| P service S$/km | n.a. | **Unconfirmed** — not sourced |

## 3. Maxus eDeliver 3 (EV30) — catalogue row 16

Source: <https://en.wikipedia.org/wiki/Maxus_eDeliver_3> (Maxus EV30 / eDeliver 3), accessed 2026-10-24.

| Field | Value | Provenance |
|---|---|---|
| B payload kg | 1020 | **Sourced** — UK long-wheelbase payload 1020 kg |
| D usable battery kWh | 52.5 | **Sourced** — 52.5 kWh option (35 kWh also offered) |
| C 2nd weight | n.a. | **Unconfirmed** — not sourced |
| E kWh/km | n.a. | **Unconfirmed** — published ranges are NEDC; not derived to avoid a misleading figure |
| G AC kW | n.a. | **Unconfirmed** — not sourced |
| H DC kW | n.a. | **Unconfirmed** — not sourced |
| I list price SGD | n.a. | **Unconfirmed** — not sourced |
| J range km | n.a. | **Unconfirmed** — no consistent (WLTP) cycle figure sourced |
| P service S$/km | n.a. | **Unconfirmed** — not sourced |

## 4. Farizon SV (Supervan) — catalogue row 17

Source: <https://en.wikipedia.org/wiki/Farizon_SV> (Farizon SV / Supervan), accessed 2026-10-24.

| Field | Value | Provenance |
|---|---|---|
| B payload kg | 1350 | **Sourced** — payload up to ~1350 kg |
| D usable battery kWh | 67 | **Sourced** — entry option of 67 / 83 / 106 kWh |
| E kWh/km | 0.1688 | **Derived** — 67 kWh ÷ 397 km WLTP (sourced inputs) |
| J range km | 397 | **Sourced** — up to ~397 km WLTP |
| C 2nd weight | n.a. | **Unconfirmed** — not sourced |
| G AC kW | n.a. | **Unconfirmed** — not sourced |
| H DC kW | n.a. | **Unconfirmed** — 20–80% in ~36–40 min quoted, exact kW not sourced |
| I list price SGD | n.a. | **Unconfirmed** — UK launch ~£45k–£56k is not an SGD figure |
| P service S$/km | n.a. | **Unconfirmed** — not sourced |

## 5. DFSK EC35 — catalogue row 18

Source: <https://en.wikipedia.org/wiki/DFSK_EC35> (DFSK C-Series / EC35), accessed 2026-10-24.

| Field | Value | Provenance |
|---|---|---|
| D usable battery kWh | 42 | **Sourced** — 42 kWh lithium-ion battery |
| B payload kg | n.a. | **Unconfirmed** — not sourced |
| C 2nd weight | n.a. | **Unconfirmed** — not sourced |
| E kWh/km | n.a. | **Unconfirmed** — no sourced range to derive from |
| G AC kW | n.a. | **Unconfirmed** — not sourced |
| H DC kW | n.a. | **Unconfirmed** — not sourced |
| I list price SGD | n.a. | **Unconfirmed** — not sourced |
| J range km | n.a. | **Unconfirmed** — not sourced |
| P service S$/km | n.a. | **Unconfirmed** — not sourced |

(The DFSK EC35 motor rating of 60 kW and body length 4500 mm are noted on the
same source page for context; they are not catalogue columns and are not used
by the engine or the matcher.)

---

## How these rows reach the app and the matcher

- The same five rows are appended to **every seed** in
  `tools/fixtures/prospect_seeds.json` (regenerated by
  `tools/build_prospects.py`) **and** to the validation fixture
  `tools/fixtures/demo_case.json`, so the app (which lands on the mid seed) and
  the Excel-parity validation agree.
- The rows are **not referenced by any replacement plan**, so the frozen engine
  (`src/engine.js`) never looks them up. `tools/validate.py` therefore still
  reports **19 passed, 0 failed** after the append — appending unreferenced
  catalogue rows changes no economic figure.
- The **switch-over page** (Portfolio stage) renders every catalogue model side
  by side with these specs and a per-field Sourced / Derived / Unconfirmed
  badge, plus include/exclude toggles for competitor models. Toggling a
  competitor off removes it from the additive matcher
  (`window.HSPortfolioFit`) only; it never touches the frozen engine. SRM is
  locked on as the primary model.

## Verification

- `node tools/build_index.js` — regenerate the bundled page.
- `python SG-EV-TRUCK-TCO/tools/validate.py` — **19/19**.
- `node tools/check_portfolio_fit.mjs` — asserts the five new models are
  present, each carries a provenance tag, no present numeric figure is
  unsourced (every numeric figure is `sourced` or `derived`), every
  `unconfirmed` field carries no fabricated number, and SRM remains primary.
- `node tools/check_index.mjs` — asserts the switch-over table, the
  include/exclude toggles (SRM locked on), and the per-field provenance badges
  render, and that toggling a competitor drives the matcher without breaking
  the engine.
