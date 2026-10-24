# Portfolio switch-over: competitor EV light-TRUCK models (FEAT-005)

This note documents the **five real competitor battery-electric light goods
vehicle TRUCKS** in the product catalogue for the full-portfolio **switch-over
page** in the calculator. They are additions for the switch-over comparison
story only. **SRM stays the primary / recommended model**; the competitors are
never auto-selected and can be toggled out of the matcher.

## Why the vans were removed (read first)

An earlier round (FEAT-003) populated the five competitor rows with battery
electric **panel VANS**: `BYD T3 (ETP3)`, `Maxus eDeliver 9`,
`Maxus eDeliver 3 (EV30)`, `Farizon SV (Supervan)` and `DFSK EC35`.

The user's requirement is explicit: **compare TRUCKS, not vans.** The SRM T3/
T3EV and the Farizon H-series already in the catalogue are cab-and-chassis
LIGHT GOODS VEHICLE TRUCKS (a cargo box / drop-side / open deck on a light-truck
chassis), so a like-for-like switch-over comparison must be against other LGV
TRUCKS in the same **10-14 ft** class, not against panel vans. **All five vans
were therefore removed** and replaced with five real EV light trucks that are
listed as **available in Singapore**. Each pick was verified to be a TRUCK (a
cab-and-chassis with a cargo body), not a panel van, before inclusion.

## Integrity statement

**Nothing in these rows is fabricated.** The brief carries a non-negotiable
integrity rule for a client-facing business model:

- Every figure that is **sourced** is cited (URL + access date) in the
  catalogue row's evidence column (**col K**) and tagged `sourced` in the
  additive per-field provenance map (`_prov`).
- A figure **derived** from other sourced figures (for example kWh/km computed
  from a sourced battery kWh and a sourced range) is tagged `derived` and names
  the sourced inputs it came from. It is never presented as a measured value.
- Every figure that **could not be verified** from a credible source is **left
  blank / `n.a.`** and tagged `unconfirmed`. It is **never** filled with an
  invented precise number.
- The catalogue body-fit status (**col L**) stays `Unconfirmed` for every
  model, following the existing catalogue convention, so no competitor can read
  as a confirmed fit.

Gaps were genuinely closed with sourced data wherever a credible figure exists:
four of the five trucks carry a sourced battery, a sourced range and a derived
kWh/km, and three of them additionally carry a sourced payload and sourced AC
and DC charge power. The fields that remain **Unconfirmed** are honest gaps:
SGD list prices (the source is supplier-neutral and publishes no prices), and a
few payloads / charge-power figures that the spec sheet lists only as GVW or as
a charge *time* rather than a charge *power*.

All access dates below are **2026-10-24**. The primary source is **EVhubs
(evhubs.sg)**, a Singapore industrial-fleet-electrification listing platform
that spec's commercial EVs side by side and classifies each by vehicle class
(it lists all five picks under **Light trucks**, separately from Commercial
vans). It is the same family of source already cited for the in-catalogue
Farizon H9E row.

## Catalogue columns

`A` name · `B` payload kg · `C` 2nd weight · `D` usable battery kWh ·
`E` kWh/km · `F` basis · `G` on-board AC kW · `H` DC kW · `I` list price SGD ·
`J` range km · `K` evidence ref (citation) · `L` body-fit status ·
`P` service S$/km. Each new row also carries an additive `_prov` map keyed by
column letter (`sourced` | `derived` | `unconfirmed`), which the frozen engine
ignores (it only reads A..Q by letter).

### Trucks rejected (and why)

From the EVhubs **Light trucks** class (10 models, SRM and Farizon already in
the catalogue):

- **Sany FR-601** — a genuine EV light truck with a sourced payload (2,660 kg),
  but its body is **15 ft**, just outside the user's 10-14 ft class; dropped in
  favour of trucks that sit cleanly within 10-14 ft.
- **JAC N30EV** and **JAC N75EV / N90EV** — the N30 overlaps the N40 pick, and
  the N75/N90 are 7.49 / 9 t trucks (heavier LGV / medium-duty), outside the
  10-14 ft light class.

Rejected on class (not light goods trucks): all **Commercial vans** (BYD ET3,
Maxus eDeliver 5/7, Joylong EW4, Higer H5F, Farizon V7E, Opel Combo/Vivaro,
Citroën ë-Berlingo), all **Pickups** (Forland ET5, JAC T9EV, Maxus T90EV,
Riddara RD6), all **Passenger vans / minibuses**, and the **Heavy trucks**
(Sany 24ft, Sany prime mover, Foton eAuman 18 t).

---

## 1. BYD T35 Electric Light-Duty — catalogue row 14

Source: <https://evhubs.sg/electric-vehicles/byd-t35-electric-light-duty.html>, accessed 2026-10-24.
Body: **10 ft aluminium drop-side deck** on a 3.7 t cab-and-chassis light truck (verified TRUCK, not the BYD T3 van).

| Field | Value | Provenance |
|---|---|---|
| B payload kg | 1900 | **Sourced** — payload 1,900 kg (GVW 3,700 kg) |
| D usable battery kWh | 62.36 | **Sourced** — 62.36 kWh BYD Blade battery |
| E kWh/km | 0.1699 | **Derived** — 62.36 kWh ÷ 367 km (sourced inputs) |
| G AC kW | 6.6 | **Sourced** — AC 6.6 kW (CCS2) |
| H DC kW | 71 | **Sourced** — DC 71 kW (CCS2) |
| J range km | 367 | **Sourced** — 367 km per full charge |
| C 2nd weight | n.a. | **Unconfirmed** — not sourced |
| I list price SGD | n.a. | **Unconfirmed** — EVhubs publishes no price |
| P service S$/km | n.a. | **Unconfirmed** — not sourced |

## 2. Foton eMiler — catalogue row 15

Source: <https://evhubs.sg/electric-vehicles/foton-emiler.html>, accessed 2026-10-24.
Body: **3,320 mm steel open deck (~10.9 ft)** on a 4.5 t cab-and-chassis light truck.

| Field | Value | Provenance |
|---|---|---|
| B payload kg | 2620 | **Sourced** — payload 2,620 kg (GVW 4,500 kg) |
| D usable battery kWh | 77 | **Sourced** — 77 kWh LFP |
| E kWh/km | 0.2053 | **Derived** — 77 kWh ÷ 375 km WLTP (sourced inputs) |
| G AC kW | 22 | **Sourced** — AC 22 kW |
| H DC kW | 77 | **Sourced** — DC 77 kW |
| J range km | 375 | **Sourced** — 375 km WLTP |
| C 2nd weight | n.a. | **Unconfirmed** — not sourced |
| I list price SGD | n.a. | **Unconfirmed** — EVhubs publishes no price |
| P service S$/km | n.a. | **Unconfirmed** — not sourced |

## 3. Forland S1 EV — catalogue row 16

Source: <https://evhubs.sg/electric-vehicles/forland-s1-ev.html>, accessed 2026-10-24.
Body: **3,200 mm internal deck (~10.5 ft)** on a 4.5 t cab-and-chassis light-duty truck (fits a 2.0 m car park).

| Field | Value | Provenance |
|---|---|---|
| D usable battery kWh | 63.75 | **Sourced** — 63.75 kWh liquid-cooled CATL |
| E kWh/km | 0.1932 | **Derived** — 63.75 kWh ÷ 330 km (sourced inputs) |
| J range km | 330 | **Sourced** — range up to 330 km |
| B payload kg | n.a. | **Unconfirmed** — only GVW 4,500 kg published, no nett payload |
| C 2nd weight | n.a. | **Unconfirmed** — not sourced |
| G AC kW | n.a. | **Unconfirmed** — not sourced |
| H DC kW | n.a. | **Unconfirmed** — not sourced |
| I list price SGD | n.a. | **Unconfirmed** — EVhubs publishes no price |
| P service S$/km | n.a. | **Unconfirmed** — not sourced |

## 4. JAC N40EV — catalogue row 17

Source: <https://evhubs.sg/electric-vehicles/jac-n40ev.html> (model HFC1040EV3), accessed 2026-10-24.
Body: **3,347 mm (11 ft) body** on a 3.7 t cab-and-chassis light truck.

| Field | Value | Provenance |
|---|---|---|
| D usable battery kWh | 63.75 | **Sourced** — 63.75 kWh LFP (200 Ah / 318.78 V) |
| E kWh/km | 0.2772 | **Derived** — 63.75 kWh ÷ 230 km (sourced inputs; cf. the quoted 29.7 kWh/100 km) |
| J range km | 230 | **Sourced** — rated 230 km |
| B payload kg | n.a. | **Unconfirmed** — only GVW 3,700 kg published, no nett payload |
| C 2nd weight | n.a. | **Unconfirmed** — not sourced |
| G AC kW | n.a. | **Unconfirmed** — only AC 20-80% 5 h 30 min time published, not kW |
| H DC kW | n.a. | **Unconfirmed** — only DC 20-80% 35 min time published, not kW |
| I list price SGD | n.a. | **Unconfirmed** — EVhubs publishes no price |
| P service S$/km | n.a. | **Unconfirmed** — not sourced |

## 5. Qingling EQ2 — catalogue row 18

Source: <https://evhubs.sg/electric-vehicles/qingling-eq2.html>, accessed 2026-10-24.
Body: **14 ft body** on a cab-and-chassis electric light goods vehicle.

| Field | Value | Provenance |
|---|---|---|
| B payload kg | 2530 | **Sourced** — payload 2,530 kg |
| D usable battery kWh | 100.46 | **Sourced** — 100.46 kWh CATL LFP |
| E kWh/km | 0.2870 | **Derived** — 100.46 kWh ÷ 350 km combined (sourced inputs; cf. the quoted 5.1 km/kWh city best case) |
| G AC kW | 20 | **Sourced** — AC 20 kW |
| H DC kW | 120 | **Sourced** — DC 120 kW |
| J range km | 350 | **Sourced** — 350 km combined (515 km city) |
| C 2nd weight | n.a. | **Unconfirmed** — not sourced |
| I list price SGD | n.a. | **Unconfirmed** — EVhubs publishes no price |
| P service S$/km | n.a. | **Unconfirmed** — not sourced |

---

## How these rows reach the app and the matcher

- The same five rows are copied into **every seed** in
  `tools/fixtures/prospect_seeds.json` (regenerated by
  `tools/build_prospects.py`, which `copy.deepcopy`s `inputs.products` from the
  authoritative `tools/fixtures/demo_case.json`), so the app (which lands on the
  mid seed) and the Excel-parity validation agree.
- The rows are **not referenced by any replacement plan**, so the frozen engine
  (`src/engine.js`) never looks them up. `tools/validate.py` therefore still
  reports **19 passed, 0 failed** after the swap — swapping unreferenced
  catalogue rows changes no economic figure, and the engine sha256 stays the
  frozen `45b388a1edaca77081e62f49e52276f6919448e458610474c7f65aafcb50fae3`.
- The **switch-over page** (Portfolio stage) renders every catalogue model side
  by side with these specs and a per-field Sourced / Derived / Unconfirmed
  badge, plus include/exclude toggles for competitor models. Toggling a
  competitor off removes it from the additive matcher
  (`window.HSPortfolioFit`) only; it never touches the frozen engine. SRM is
  locked on as the primary model and no competitor can read as a clean Best fit
  (col L stays `Unconfirmed`).

## Verification

- `node tools/build_index.js` — regenerate the bundled page; the engine sha line
  shows the frozen `45b388a1edaca770...` (unchanged).
- `python SG-EV-TRUCK-TCO/tools/validate.py` — **19/19**.
- `node tools/check_portfolio_fit.mjs` — asserts the five new TRUCK models are
  present, the five removed vans are GONE, the catalogue is 12 models, each
  truck carries a provenance tag, no present numeric figure is unsourced (every
  numeric figure is `sourced` or `derived`), every `unconfirmed` field carries
  no fabricated number, a feasible competitor (BYD T35, sourced payload + range)
  is forced to a caveat (never a clean Best fit), and SRM remains primary.
- `node tools/check_index.mjs` — asserts the switch-over table lists the five
  new trucks and no longer lists the removed vans, the include/exclude toggles
  (SRM locked on) and the per-field Sourced / Derived / Unconfirmed badges
  render, and that toggling a competitor drives the matcher without breaking the
  engine.
