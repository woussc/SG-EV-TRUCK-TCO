# Portfolio fit-rules (Stage 2 model-matching guide)

_Status: implemented. This documents the deterministic fit-rules module
`src/portfolio_fit.js` that powers the Portfolio stage (#stage-portfolio) in
`index.html`._

## What it is, and what it is not

The Portfolio stage answers one question: **given this fleet's duty, which
catalogue EV models suit it, and why?** It ranks every catalogue model and gives
each a verdict with the reasons shown.

It is an **additive comparison layer** that sits **on top of** the frozen TCO
engine. It is a separate, dependency-free ES module (`src/portfolio_fit.js`)
that:

- does **not** import, call, or alter `src/engine.js` / `computeFleet`;
- changes **no** economic number (the engine's 19 strict assertions and the
  engine SHA-256 `8a259b83...` are unaffected);
- is inlined into the single offline page through a dedicated build-generated
  marker block (`<!-- PORTFOLIO:BEGIN --> ... <!-- PORTFOLIO:END -->`), stamped
  with its own source SHA, exactly mirroring the ENGINE / DEMO / PROSPECTS
  pattern. Never hand-edit the generated block; edit `src/portfolio_fit.js` and
  re-run `node tools/build_index.js`.

It is deliberately a **coarse feasibility screen**, not a route or charging
scheduler.

## Inputs

### Per model (catalogue row, `demo_case.json` -> `inputs.products.rows`)

| Col | Meaning | Used for |
|-----|---------|----------|
| B | payload / MLW kg | payload check |
| D | usable battery kWh | achievable range = D / E |
| E | battery kWh/km | achievable range; charge-energy demand |
| G | AC charge power kW (null for H9E rows) | charge-power check |
| H | DC charge power kW | charge-power check |
| J | quoted range km | reference only |
| L | payload / body-fit status | **honesty gate** ('Unconfirmed' for all models today) |
| P | service S$/km | reference only |

Best available charge power on the truck = the faster of AC (G) / DC (H).

### Customer duty (fleet register, included rows where col B === 1)

The most demanding figure across the included cohort is used, because a model
must serve the hardest truck:

- **peak cargo kg** = max of fleet col H
- **demanding-day route km** = max of fleet col G
- **work km/day** = max of fleet col E

Available charge power and the charging window come from the
`energy_and_charging` sheet where present: the per-charger rated input power
(row 56) or the charger-type code (row 15, e.g. `DC60` -> 60 kW), intersected
with the net site power (row 50) so a truck is never credited more power than
the site can deliver; the charging window is row 51 (uninterrupted hours),
falling back to a documented 10 h depot window when not entered.

## Deterministic thresholds

Documented in-code in `FIT_THRESHOLDS`:

| Threshold | Value | Meaning |
|-----------|-------|---------|
| `PAYLOAD_MARGIN` | 1.10 | payload must be >= 1.10 x peak cargo for a clean pass; 1.00x..1.10x is marginal (caveat); below 1.00x is **Does not fit** |
| `RANGE_BUFFER` | 1.15 | achievable range (D/E) must be >= 1.15 x the required km for a clean pass; 1.00x..1.15x is marginal (caveat); below 1.00x is **Does not fit** |
| `CHARGE_MARGIN` | 1.10 | available charge power must be >= 1.10 x the kW needed to refill the day's energy inside the charging window for a clean pass; 1.00x..1.10x is marginal (caveat); below 1.00x is a **slow-charge caveat** (an operational nuisance, not an outright veto like payload / range); no power at all is insufficient data |
| `DEFAULT_CHARGE_WINDOW_H` | 10 | depot overnight window used only when the duty does not supply one |

Required range is the more demanding of the demanding-day route (fleet G) and
the daily work distance (fleet E): a truck must cover the harder of the two on
one charge for a clean pass.

Charge-power demand = (daily km x battery kWh/km) / charging-window hours.

## Verdict tiers

- **Best fit** - every checked attribute clears with margin **and** the
  payload/body-fit status is confirmed. Not reachable today (see honesty below).
- **Fits with caveats** - clears the hard gates (payload, range) but is marginal
  on >= 1 attribute, or the fit is not yet confirmed. When the caveat is an
  Unconfirmed attribute or a blank duty input, the label is
  **"Fits with caveats - insufficient data"**.
- **Does not fit** - fails a hard gate: payload under the peak cargo, or
  achievable range under the required distance.

Ranking order (deterministic, fully stable):

1. verdict tier (Best fit < Fits with caveats < Does not fit)
2. a clean caveat ranks above an insufficient-data caveat (more is known)
3. larger payload-over-cargo headroom
4. longer achievable range
5. model name (stable tiebreak)

## Honesty handling (mandatory)

The honesty discipline is the point of this module:

- **Unconfirmed attribute.** The catalogue payload / body-fit status (col L) is
  `'Unconfirmed'` for **every** model today. A model may clear payload, range
  and charge power on the numbers, but while its body-fit status is Unconfirmed
  it can **never** be a clean **Best fit**. It is reported as
  **"Fits with caveats - insufficient data"** with an explicit reason. A **Best
  fit** is only reachable once the status is `'Confirmed'` for the duty.
- **Blank / `n.a.` duty input.** A required duty figure that is blank, empty, or
  the engine's `n.a.` sentinel yields an **insufficient-data** verdict for the
  check that needs it, never a fabricated pass. `n.a.` is never treated as a
  fit.
- **Missing product attribute.** If a product lacks the battery kWh or kWh/km
  needed to compute achievable range, or has no published charge power, the
  affected check is insufficient data, not an invented pass.

## Live behaviour and the TCO tie-in

- The Portfolio stage re-ranks on **every** recompute (the same debounced
  `liveRecompute()` path the money view uses), so editing any duty input in the
  Inputs panel re-ranks the guide live.
- Each row has a **Select / Confirm this model** button. It loads the chosen
  model's catalogue specs into the first EV-action replacement row using the
  **same FEAT-002 loader** (`H.loadProductSpecs`): EV quote = prod.I + oc[57]
  acquisition adder, usable battery kWh = prod.D, EV kWh/km = prod.E, charge
  mode from prod.G/prod.H. These are editable defaults that reproduce the
  engine's blank-fallback, so loading a model and not overriding introduces no
  new math. The loaded payload/body-fit keeps its **Unconfirmed** caveat.

## Validation

`tools/check_portfolio_fit.mjs` (dependency-free Node) asserts the rules against
the real catalogue rows plus representative duty:

1. payload B < peak cargo -> **Does not fit** with a payload reason;
2. an Unconfirmed attribute used in the verdict -> caveat / insufficient data,
   never a clean Best fit on that attribute;
3. a model clearing all thresholds with margin (and a confirmed status) ->
   **Best fit**;
4. a blank / `n.a.` required duty input -> **insufficient data**, never a
   fabricated pass;
5. ranking orders best-fit ahead of does-not-fit.

`tools/check_index.mjs` additionally asserts the Portfolio stage renders the
ranked model list (catalogue names), the three verdict tiers, at least one
Unconfirmed / insufficient-data honesty marker, that changing a duty input
re-ranks, and that Select ties into the FEAT-002 product-spec loading.
