# Simulation profile redesign: honest operational break-even archetypes

_Plan of record for replacing the price-rigged best/mid/bad presets with honest
operational-intensity + fleet-size archetypes. Every figure below is produced by
the FROZEN engine (`src/engine.js`, sha256 `45b388a1...`) on honest, fixed
vehicle prices. Regenerate seeds with `python tools/build_prospects.py`, rebuild
the page with `node tools/build_index.js`, and re-verify with
`node tools/check_presets.mjs` + the full suite._

## The problem being removed

Today `tools/build_prospects.py` holds the ChengLong (Plan B) quote fixed at
S$205,000 but moves the SRM (Plan A) col-D all-in quote **upward** per case to
manufacture the best/mid/bad outcomes:

| Preset (old) | SRM col-D quote | ChengLong quote | SRM saving % |
|---|---:|---:|---:|
| best | S$193,000 | S$205,000 | +29.52% |
| mid | **S$234,000** | S$205,000 | +10.71% |
| bad | **S$284,000** | S$205,000 | −5.02% |

Because the per-truck card / EV-cost slider shows that inflated col-D figure
while the SRM's honest catalogue base is only S$66,800, a loaded profile reads
as "model cost above the vehicle's own price." That is the misleading price-rig
the user wants gone: the profile moves the **price** to force the answer instead
of showing which **operator** actually saves.

## The redesign (user intent)

Hold vehicle prices **honest and fixed** across every profile and vary
**operational intensity (km/day × days/year)** and **fleet size (number of
EV-action trucks)** instead. The profiles then map the real break-even
frontier: which operational intensity and how many vehicles a company needs for
a genuine saving to occur.

- SRM (Plan A) quote fixed at **S$193,000** in every profile.
- ChengLong (Plan B) quote fixed at **S$205,000** in every profile.
- The engine-scored Plan A stays SRM; Plan B stays the honest ChengLong
  competitor via the non-engine `_planB_model` / `_planB_price` fields (frozen
  engine untouched).

### Engine-verified break-even frontier (honest S$193k quote, diesel S$2.50/L)

Saving % vs Keep ICE across operational intensity (4-truck fleet):

| km/day \ days | 150 | 200 | 250 | 300 |
|---|---:|---:|---:|---:|
| **40** | 8.4% | 10.1% | 11.7% | 13.2% |
| **60** | 11.3% | 13.8% | 16.1% | 18.2% |
| **80** | 14.1% | 17.2% | 20.0% | 22.5% |
| **120** | 19.0% | 23.0% | 26.5% | 29.5% |

Fleet-size effect at fixed intensity (120 km/day × 300 days): the shared depot
charging-site cost is counted once per fleet, so more EV-action trucks amortise
it and nudge the saving up until it plateaus:

| Fleet size N | 1 | 2 | 4 | 10 | 20 | 30 |
|---|---:|---:|---:|---:|---:|---:|
| SRM saving % | 13.4% | 22.1% | 26.5% | 29.0% | 29.9% | 30.2% |

### The three honest archetypes (engine-verified, replacing best/mid/bad)

| Profile | Fleet size | Intensity | SRM saving % | Story |
|---|---:|---|---:|---|
| **wins** | 30 EV trucks | 120 km/day × 300 days | **+30.20%** | High-utilisation, large depot-charged urban fleet: EV genuinely wins. |
| **breakeven** | 4 EV trucks | 70 km/day × 220 days | **+12.91%** | Mid fleet, moderate utilisation: sits just below the 15% target — the marginal archetype. |
| **loses** | 2 EV trucks | 40 km/day × 180 days | **−0.89%** | Small, lightly-used fleet: the EV premium does not pay back — EV is not a fit yet. |

All three use the identical fixed prices (SRM S$193k, ChengLong S$205k). The
only things that change between them are **fleet size** and **operational
intensity** — never the vehicle price. `blank` is unchanged (clean-slate
template).

The names change from best/mid/bad to **wins / breakeven / loses** because the
story is now about the operator archetype, not a tuned severity ladder. The
default landing case moves to `breakeven` (the marginal "is it worth it for us?"
conversation), replacing the old `mid`.

## What changes in the code

1. **`tools/build_prospects.py`** — replace `MID_TUNE`/`BAD_TUNE` price tuning
   with fleet-size + intensity builders. Emit `wins`, `breakeven`, `loses`,
   `blank`. SRM col-D fixed at 193,000 and ChengLong `_planB_price` fixed at
   205,000 in all three. Rewrite the case `note` strings to tell the operational
   break-even story (no price-tuning language).
2. **`tools/build_simbrief_models.mjs`** — the held-constant base is currently
   the `best` case; point it at the new `wins` case (same role: a fully-specified
   base). Keep the §6 all-12-model 5yr/10yr table working.
3. **`docs/simulation-results-brief.md`** — rewrite §3 (threshold) and §4 (client
   types) around the operational break-even frontier + fleet-size table above.
   Add the intensity × fleet-size break-even table so the report tabulates
   "which intensity and how many vehicles." Keep §1, §2, §5 and the §6 marker
   block structure intact.
4. **`docs/preset-profiles.md`** — rewrite to document the three honest
   archetypes and the fixed-price contract (supersedes the best/mid/bad tuning
   doc).
5. **`tools/check_presets.mjs`** — update the recorded figures and the id set to
   wins/breakeven/loses/blank, and **add the new honest-contract assertion**:
   for every loaded profile, no included EV-action truck's col-D model cost
   (Plan A SRM quote, and Plan B `_planB_price`) exceeds that vehicle's own
   input-field price. Assert the fixed-price invariant (SRM 193,000, ChengLong
   205,000 across all three) and the ordering wins > breakeven > loses.
6. **`tools/check_simbrief.mjs`** — update any references to the held-constant
   base id (`best` → `wins`) and the brief section wording the harness locks.
7. Rebuild: `python tools/build_prospects.py` → `node tools/build_simbrief_models.mjs`
   → `node tools/build_index.js`. The LANDING block default moves to `breakeven`.

## Invariants held

- `src/engine.js` is NOT edited; sha256 stays `45b388a1...`. All new behaviour
  rides on seed data + non-engine `_planB_*` fields + the existing two-state
  projection.
- Fully offline/static: no new network dependency.
- Honesty: every figure is a frozen-engine result on honest, fixed inputs. The
  whole point is to remove the price-rig, so no number is tuned to force an
  outcome.
- `python tools/validate.py` stays 19/19 (it reads the untouched demo fixture,
  not these presets).

## Open human decisions

- Exact band values (30/120/300, 4/70/220, 2/40/180) are chosen to land the
  three archetypes cleanly on the win / marginal / lose side of the 15% target
  at honest prices; they can be nudged if a particular Singapore operator
  profile is preferred.
