# Portfolio switch-over: competitor EV light-TRUCK models

This note documents the **five real competitor battery-electric light goods
vehicle TRUCKS** in the product catalogue for the full-portfolio **switch-over
page** in the calculator. They are additions for the switch-over comparison
story only. **SRM stays the primary / recommended model**; the competitors are
never auto-selected and can be toggled out of the matcher.

## Why the vans were removed (read first)

An earlier round populated the five competitor rows with battery electric
**panel VANS**: `BYD T3 (ETP3)`, `Maxus eDeliver 9`, `Maxus eDeliver 3 (EV30)`,
`Farizon SV (Supervan)` and `DFSK EC35`.

The user's requirement is explicit: **compare TRUCKS, not vans.** The SRM T3 /
T3EV and the Farizon H-series already in the catalogue are cab-and-chassis
LIGHT GOODS VEHICLE TRUCKS (a cargo box / drop-side / open deck on a light-truck
chassis), so a like-for-like switch-over comparison must be against other LGV
TRUCKS in the same **10-14 ft** class, not against panel vans. **All five vans
were therefore removed** and replaced with five real EV light trucks that are
listed as **available in Singapore**. Each pick was verified to be a TRUCK (a
cab-and-chassis with a cargo body), not a panel van, before inclusion.

## Specs are now USER-SUPPLIED / AUTHORITATIVE (read second)

The five competitor rows previously carried only the figures that could be
sourced from a third-party listing, with every other field left `Unconfirmed` /
`n.a.` (no price, some payloads, some charge powers). An earlier research pass
also recorded that **sgcarmart.com** returned HTTP 403 to automated fetches and,
being a passenger-car marketplace, published no spec sheets for these Chinese
commercial light trucks — so no figure was ever sourced from it.

**That gap is now closed.** The user supplied the complete, **authoritative**
spec table for all five competitor trucks, so every spec column is now filled
from that single table. Because these values come directly from the user and are
treated as authoritative, there is **no third-party provenance caveat**: each
supplied figure is tagged **`userentered`** in the per-field `_prov` map (the
same honest tag the editable-spec flow stamps on a typed value and the
switch-over renderer already draws). A `userentered` figure is **never**
presented as an independently cited `sourced` value, so the honesty discipline
holds: nothing is silently present and nothing claims a citation it does not
have. Col K (evidence ref) now reads **"User-supplied spec table, 2026"** for
each row.

### The authoritative table (as supplied)

| Model | Payload kg | Battery kWh | kWh/km | AC kW | DC kW | Range km | List price | Service S$/km |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| BYD T35 Electric Light-Duty | 1,900 | 62.36 | 0.170 | 6.6 | 71 | 367 | S$73,000 | S$0.02-0.04 |
| Foton eMiler | 2,620 | 77.00 | 0.205 | 22.0 | 77 | 375 | S$73,000 | S$0.03-0.05 |
| Forland S1 EV | 2,500-2,700 | 63.75 | 0.215 | 11.0 | 70 | 300 | S$76,000 | S$0.03-0.05 |
| JAC N40EV | 1,850 | 63.75 | 0.297 | 7.0 | 65 | 230 | S$68,000 | S$0.03-0.05 |
| Qingling EQ2 | 2,530 | 100.46 | 0.287 | 20.0 | 120 | 350 | S$78,800 | S$0.04-0.06 |

### Honest handling of the two stated RANGES (no false point precision)

Two kinds of figure in the supplied table are stated as a **range**, not a
single number. The frozen engine reads a single value per column, so for each
range we store the **midpoint** in the engine column **and** preserve the stated
range verbatim for the portfolio to display, so the page never implies a
precision the source did not give.

- **Forland S1 EV payload** is a stated range **2,500-2,700 kg**. Col B stores
  the **midpoint 2,600 kg**; the stated range is preserved for display.
- **Service S$/km** is a stated range for **all five** trucks. Col P stores the
  **documented midpoint** for each; the stated range is preserved for display:

  | Model | Service S$/km range | Midpoint stored in col P |
  | :--- | :--- | :--- |
  | BYD T35 Electric Light-Duty | S$0.02-0.04/km | **0.03** |
  | Foton eMiler | S$0.03-0.05/km | **0.04** |
  | Forland S1 EV | S$0.03-0.05/km | **0.04** |
  | JAC N40EV | S$0.03-0.05/km | **0.04** |
  | Qingling EQ2 | S$0.04-0.06/km | **0.05** |

The stated ranges are carried on each competitor row in a dedicated, additive
**`_ranges`** object keyed by column letter, so the portfolio renderer (built in
a later feature) can surface the range next to the midpoint and never present a
false point value:

```jsonc
// Forland S1 EV row (abbreviated)
"B": 2600,                       // engine column = midpoint
"P": 0.04,                       // engine column = midpoint
"_ranges": {
  "B": "2500-2700 kg",           // stated payload range, for display
  "P": "S$0.03-0.05/km"          // stated service range, for display
}
```

Every other competitor row carries `_ranges.P` only (service range); Forland is
the only one that also carries `_ranges.B` (payload range). The frozen engine
ignores `_ranges` entirely (it reads only columns A..Q by letter), so this
storage is numerically inert.

## Integrity statement

**Nothing in these rows is fabricated.** Every supplied figure is placed in the
column the user's table specifies and tagged `userentered` in `_prov`; the two
stated ranges are stored as a midpoint **and** preserved verbatim in `_ranges`
for honest display. The catalogue body-fit status (**col L**) stays
`Unconfirmed` for every model, following the existing catalogue convention, so
no competitor can read as a confirmed fit — body-fit is a separate substantive
caveat, not a data-provenance badge.

## Catalogue columns

`A` name · `B` payload kg · `C` 2nd weight · `D` usable battery kWh ·
`E` kWh/km · `F` basis · `G` on-board AC kW · `H` DC kW · `I` list price SGD ·
`J` range km · `K` evidence ref (citation) · `L` body-fit status ·
`P` service S$/km. Each competitor row also carries an additive `_prov` map
keyed by column letter and, where a figure was stated as a range, an additive
`_ranges` map keyed by column letter — both of which the frozen engine ignores
(it only reads A..Q by letter).

### Trucks rejected (and why)

From the Singapore-available **Light trucks** class (SRM and Farizon already in
the catalogue):

- **Sany FR-601** — a genuine EV light truck, but its body is **15 ft**, just
  outside the user's 10-14 ft class; dropped in favour of trucks that sit
  cleanly within 10-14 ft.
- **JAC N30EV** and **JAC N75EV / N90EV** — the N30 overlaps the N40 pick, and
  the N75 / N90 are 7.49 / 9 t trucks (heavier LGV / medium-duty), outside the
  10-14 ft light class.

Rejected on class (not light goods trucks): all **Commercial vans** (BYD ET3,
Maxus eDeliver 5/7, Joylong EW4, Higer H5F, Farizon V7E, Opel Combo/Vivaro,
Citroën ë-Berlingo), all **Pickups** (Forland ET5, JAC T9EV, Maxus T90EV,
Riddara RD6), all **Passenger vans / minibuses**, and the **Heavy trucks**
(Sany 24ft, Sany prime mover, Foton eAuman 18 t).

---

## 1. BYD T35 Electric Light-Duty — catalogue row 14

Body: **10 ft aluminium drop-side deck** on a 3.7 t cab-and-chassis light truck
(verified TRUCK, not the BYD T3 van). All figures user-supplied, 2026.

| Field | Value | Provenance |
|---|---|---|
| B payload kg | 1900 | **User-entered** — authoritative table |
| D usable battery kWh | 62.36 | **User-entered** |
| E kWh/km | 0.170 | **User-entered** |
| G AC kW | 6.6 | **User-entered** |
| H DC kW | 71 | **User-entered** |
| I list price SGD | 73000 | **User-entered** |
| J range km | 367 | **User-entered** |
| P service S$/km | 0.03 | **User-entered** — midpoint of stated **S$0.02-0.04/km** (`_ranges.P`) |
| C 2nd weight | n.a. | **Unconfirmed** — not supplied |

## 2. Foton eMiler — catalogue row 15

Body: **3,320 mm steel open deck (~10.9 ft)** on a 4.5 t cab-and-chassis light
truck. All figures user-supplied, 2026.

| Field | Value | Provenance |
|---|---|---|
| B payload kg | 2620 | **User-entered** |
| D usable battery kWh | 77.00 | **User-entered** |
| E kWh/km | 0.205 | **User-entered** |
| G AC kW | 22.0 | **User-entered** |
| H DC kW | 77 | **User-entered** |
| I list price SGD | 73000 | **User-entered** |
| J range km | 375 | **User-entered** |
| P service S$/km | 0.04 | **User-entered** — midpoint of stated **S$0.03-0.05/km** (`_ranges.P`) |
| C 2nd weight | n.a. | **Unconfirmed** — not supplied |

## 3. Forland S1 EV — catalogue row 16

Body: **3,200 mm internal deck (~10.5 ft)** on a 4.5 t cab-and-chassis
light-duty truck (fits a 2.0 m car park). All figures user-supplied, 2026.

| Field | Value | Provenance |
|---|---|---|
| B payload kg | 2600 | **User-entered** — midpoint of stated **2,500-2,700 kg** (`_ranges.B`) |
| D usable battery kWh | 63.75 | **User-entered** |
| E kWh/km | 0.215 | **User-entered** |
| G AC kW | 11.0 | **User-entered** |
| H DC kW | 70 | **User-entered** |
| I list price SGD | 76000 | **User-entered** |
| J range km | 300 | **User-entered** |
| P service S$/km | 0.04 | **User-entered** — midpoint of stated **S$0.03-0.05/km** (`_ranges.P`) |
| C 2nd weight | n.a. | **Unconfirmed** — not supplied |

## 4. JAC N40EV — catalogue row 17

Body: **3,347 mm (11 ft) body** on a 3.7 t cab-and-chassis light truck. All
figures user-supplied, 2026.

| Field | Value | Provenance |
|---|---|---|
| B payload kg | 1850 | **User-entered** |
| D usable battery kWh | 63.75 | **User-entered** |
| E kWh/km | 0.297 | **User-entered** |
| G AC kW | 7.0 | **User-entered** |
| H DC kW | 65 | **User-entered** |
| I list price SGD | 68000 | **User-entered** |
| J range km | 230 | **User-entered** |
| P service S$/km | 0.04 | **User-entered** — midpoint of stated **S$0.03-0.05/km** (`_ranges.P`) |
| C 2nd weight | n.a. | **Unconfirmed** — not supplied |

## 5. Qingling EQ2 — catalogue row 18

Body: **14 ft body** on a cab-and-chassis electric light goods vehicle. All
figures user-supplied, 2026.

| Field | Value | Provenance |
|---|---|---|
| B payload kg | 2530 | **User-entered** |
| D usable battery kWh | 100.46 | **User-entered** |
| E kWh/km | 0.287 | **User-entered** |
| G AC kW | 20.0 | **User-entered** |
| H DC kW | 120 | **User-entered** |
| I list price SGD | 78800 | **User-entered** |
| J range km | 350 | **User-entered** |
| P service S$/km | 0.05 | **User-entered** — midpoint of stated **S$0.04-0.06/km** (`_ranges.P`) |
| C 2nd weight | n.a. | **Unconfirmed** — not supplied |

---

## How these rows reach the app and the matcher

- The same five rows are copied into **every seed** in
  `tools/fixtures/prospect_seeds.json` (regenerated by
  `tools/build_prospects.py`, which `copy.deepcopy`s `inputs.products` from the
  authoritative `tools/fixtures/demo_case.json`), so the app (which lands on the
  mid seed) and the Excel-parity validation agree. The `_ranges` maps propagate
  with the rows.
- The rows are **not referenced by any replacement plan**, so the frozen engine
  (`src/engine.js`) never looks them up. `tools/validate.py` therefore still
  reports **19 passed, 0 failed** after filling the specs — filling unreferenced
  catalogue rows changes no economic figure, and the engine sha256 stays the
  frozen `45b388a1edaca77081e62f49e52276f6919448e458610474c7f65aafcb50fae3`.
- The **switch-over page** (Portfolio stage) renders every catalogue model side
  by side with these specs and a per-field provenance badge, plus
  include/exclude toggles for competitor models. The competitor figures render
  with the **User-entered** badge (authoritative, never a false `Sourced`
  claim). Toggling a competitor off removes it from the additive matcher only;
  it never touches the frozen engine. SRM is locked on as the primary model and
  no competitor can read as a clean Best fit (col L stays `Unconfirmed`).
- The per-field provenance-badge system is scheduled to be **retired in a later
  feature**; the `_prov` maps are left in place here (harmless, engine-ignored)
  and the competitor figures are honestly tagged `userentered` in the meantime.

## Verification

- `node tools/build_index.js` — regenerate the bundled page; the engine sha line
  shows the frozen `45b388a1edaca770...` (unchanged).
- `python tools/validate.py` — **19/19**.
- `node tools/check_portfolio_fit.mjs` — asserts the five new TRUCK models are
  present, the five removed vans are GONE, the catalogue is 12 models, each
  truck carries a provenance tag, every present numeric figure carries an honest
  provenance (`sourced` / `derived` / `userentered`, never silently present),
  every `unconfirmed` field carries no fabricated number, a feasible competitor
  (BYD T35) is forced to a caveat (never a clean Best fit), and SRM remains
  primary.
- `node tools/check_index.mjs` — asserts the switch-over table lists the five
  new trucks and no longer lists the removed vans, the include/exclude toggles
  (SRM locked on) render, the competitor rows render the **User-entered**
  provenance badge for their supplied specs and are never falsely tagged
  `Sourced`, and that toggling a competitor drives the matcher without breaking
  the engine.
