# EV truck TCO simulation: who switches, why, and under which conditions

_A decision brief on the simulation results produced by this tool. It explains
the calculation variables and conditions, which of them actually move the
answer, the threshold for a sensible ICE-to-EV conversion, and the client
profiles that realistically accept the quantitative case. Every figure quoted
below is produced by the frozen simulation engine (`src/engine.js`,
`computeFleet` + `scoreProspect`) on the shipped illustrative presets, or by the
deterministic sensitivity sweep (`tools/sensitivity.mjs`). Nothing here is a
generic EV-adoption claim and nothing here is a customer quote._

> **How to read this document.** It is a diagnostic companion, not a quotation.
> The simulation compares ownership paths over a fixed 120-month (10-year)
> horizon for a Singapore light-commercial fleet. Where an input is missing the
> model returns **n.a.**, never a substituted zero. A result only becomes a firm
> recommendation once the honesty gates described in section 5 are cleared with
> a complete site quote.

---

## 1. What the simulation actually computes

The engine holds each truck's duty constant for 120 months and prices **four
ownership paths** for the same fleet, then compares them:

| Path | What it means |
|---|---|
| **Keep ICE, then new ICE** | Each current truck runs to its COE expiry (or an earlier entered retirement month), then is replaced with a new diesel truck. This is the **baseline** every saving is measured against. |
| **All-new ICE now** | Replace every included truck with a new diesel truck at month 0. |
| **Plan A** | A per-truck mix of Keep / New-ICE / EV actions. In this tool Plan A is framed as **buy the SRM** (the primary recommended family). |
| **Plan B** | A second independent per-truck action set, framed as **buy a competitor EV**, on the same work requirements. |

One EV replaces one ICE truck; the fleet size stays constant across all paths.
The tool presents the choice as a **business intention** first, Add vs Replace:
are you replacing existing diesel trucks on their existing duty (the case the
engine prices), or adding capacity (which changes the duty assumptions and must
be modelled separately)?

The headline output per plan is the **Total economic TCO**:

```
Total economic TCO = Vehicle economic TCO + Net site ownership cost
```

- **Vehicle economic TCO** = current-asset opportunity value + purchases +
  operating/repair costs + disposal fees − disposal proceeds − entered vehicle
  grants − year-10 asset value.
- **Net site ownership cost** = charger installation + recurring site costs +
  dated site changes/restoration − approved charger grant − equipment recovery;
  shared site cost is counted once per plan, not once per truck.

Loans, interest, wages, income tax and recoverable GST are **excluded by
design** — the economic TCO is a like-for-like asset-and-running comparison, not
a financing schedule. The optional financing view in the Proposal stage is an
illustration layered on top; it changes no economic number.

### 1.1 The calculation variables and what each means

These are the real inputs the model reads. They fall into six groups.

**Duty (per truck, Fleet register)**
- **Work km/day** — distance driven on a working day. Scales every running cost.
- **Days/year worked** — annual utilisation. With km/day this sets annual km.
- **Peak / demanding-day route km** — the hardest single-charge route. Feeds the
  range feasibility screen.
- **Peak cargo kg** — the heaviest load. Feeds the payload feasibility screen.

**Current truck (per truck)**
- **COE months left** — how long the existing truck can legally run before it
  must be disposed of and replaced. Drives replacement timing.
- **Market value now** — the resale / opportunity value of the current asset
  (already includes its remaining COE rights; no second lost-COE charge).

**Vehicle (per truck, Replacement plan)**
- **New-ICE quote** — all-in price of a replacement diesel truck. Sets the
  Keep/New baseline the EV is compared against.
- **EV quote (+ COE)** — all-in EV price. If left blank the engine falls back to
  the catalogue list price + a shared COE assumption (**not** a current quote).
- **Chosen EV model** — supplies battery kWh, kWh/km, charge power and payload as
  editable defaults.

**Energy**
- **Commercial diesel price (S$/L)** and **ICE fuel consumption (L/km)** —
  together the diesel running-cost lever.
- **Depot electricity price (S$/kWh)** and **EV energy use (kWh/km)** — together
  the EV running-cost lever.

**Charging / site**
- **Depot-charger feasibility** — can a compatible charger be installed, at what
  power, inside the available charging window; itemised equipment / civil /
  grid quote.
- **Public-charging option** — the share of energy taken publicly, with its
  detour, queue and time penalties, for a fleet that chooses not to build a
  depot.
- **Grants** — a manually-checked vehicle incentive and a separate charger grant
  ceiling (a budget cap, not an automatic award).

**Finance / horizon**
- **120-month economic horizon**, with optional **diesel-price escalation** and
  **discount rate** (both default to 0 in the demonstration, i.e. NPV = nominal).

### 1.2 The honesty conditions (why you sometimes see n.a.)

The simulation refuses to fabricate a number it cannot support:

- A **numeric Total economic TCO** requires a complete, itemised site quote
  (site status "Complete", access/power window within limits) **and** per-truck
  completeness. Without the site quote the model falls back to a **vehicle-only
  diagnostic** and the full Total stays **n.a.**
- A blank input is never a measured zero; **n.a.** is never a value.
- Catalogue payload / body-fit status is **Unconfirmed** for every model today,
  so any loaded payload figure always carries an explicit Unconfirmed caveat and
  no model can read as a clean "Best fit" until that status is confirmed.
- The tool is a **diagnostic, not a quotation**. The SRM is the primary
  recommendation; all preset figures are illustrative.

---

## 2. Which variables matter most

The deterministic tornado sweep (`tools/sensitivity.mjs`) perturbs each driver
±10% around the fully-specified best-case scenario (baseline best-plan Total
economic TCO **S$1,047,412**, saving **29.52%** vs Keep ICE **S$1,486,117**) and
measures the swing in Total TCO and in Saving %. Ranked by business impact:

| Rank | Driver | Group | Impact |
|---:|---|---|---:|
| 1 | **EV purchase quote** (per EV truck) | Vehicle | **~14.7%** |
| 2 | **New-ICE purchase quote** | Vehicle | ~5.7% |
| 3 | **ICE fuel consumption (L/km)** | Energy | ~5.1% |
| 4 | **Commercial diesel price (S$/L)** | Energy | ~4.8% |
| 5 | **Work km/day** | Duty | ~3.7% |
| 6 | **Days/year worked** | Duty | ~3.4% |
| 7 | Diesel-price growth | Finance | ~3.4% |
| 8 | EV insurance | OpCost | ~2.7% |
| 9–10 | Depot electricity price / EV kWh/km | Energy | ~1.6% each |
| <0.5% | Tyres, road tax, maintenance, grant timing | — | negligible in this scenario |

### Why the top movers dominate

The ICE-vs-EV decision is a trade of a **higher purchase premium today** against
a **lower running cost every day for ten years**. That structure explains the
ranking directly:

1. **EV purchase quote (~14.7%)** is the single biggest lever because it is the
   acquisition premium itself, paid up front and never amortised away in the
   economic view. It moves the EV plan's Total TCO pound-for-pound.
2. **New-ICE quote (~5.7%)** moves the *baseline*, not the EV plan — but the
   saving is measured against that baseline, so a dearer diesel replacement makes
   EV look better and a cheaper one makes it look worse. It changes the Saving %
   without changing the EV Total, which is why its Total-TCO swing is 0 but its
   Saving-% swing is large.
3. **ICE fuel consumption (~5.1%) and diesel price (~4.8%)** are the running-cost
   gap. A thirstier, pricier diesel truck is exactly what the EV displaces over
   120 months, so both feed straight into the saving.
4. **Utilisation — work km/day (~3.7%) and days/year (~3.4%)** act as a
   *multiplier* on the running-cost gap. The more the truck is used, the more
   times the cheaper electricity beats diesel, so high utilisation amplifies
   every energy-side advantage above.

Everything below the top five is second-order in this scenario: insurance and
electricity price nudge the answer by ~2%, and tyres/tax/maintenance/grant-timing
move it by well under half a percent. Note that grant timing and the finance
rates read near-zero here only because the demonstration leaves them blank/zero;
they become material the moment they are entered.

---

## 3. The threshold for a sensible ICE-to-EV conversion

A conversion is "sensible" in this tool only when **both** of these hold:

1. **The economics clear the committed fleet saving target** (default **15%**).
   The saving is whole-fleet: `(Keep ICE total − plan total) / Keep ICE total`.
   The engine labels a plan **"Meets entered 15% target"** only when the gate
   passes, the Total is numeric, and `savingPct ≥ target`.
2. **The feasibility gates pass**: the demanding-day route sits inside the SRM's
   usable single-charge range; depot charging is feasible **or** a viable
   public-charging arrangement exists; service/evidence is confirmed; and a
   complete site quote exists so the Total is numeric rather than n.a.

The three shipped presets bracket the win/lose line precisely, all from the same
Evergreen fleet. **Plan A carries the SRM scenario (SRM T3EV+)** and **Plan B
carries an honest like-for-like competitor (ChengLong L2EV)** so the comparison
is a real SRM-vs-competitor side-by-side, not SRM-vs-SRM. Both quotes re-use the
same COE + body/registration build-up, so the SRM wins the best case purely on
its lower catalogue base (S$66,800 vs S$78,800), not because any number was
rigged. The SRM best → mid → bad story is told by **Plan A's own saving vs Keep
ICE** (every figure is the frozen engine's real result for its own model and
quote, produced by the two-state projection, SRM on slot O and ChengLong on
slot R, exactly as the live tool computes it):

| Preset | Plan A — SRM Total | Plan A — SRM Saving % vs Keep ICE | Plan B — ChengLong Total | Plan B — ChengLong Saving % | Headline | Verdict (SRM) |
|---|---:|---:|---:|---:|:--:|---|
| **Best** | S$1,047,412 | **+29.52%** (+S$438,705) | S$1,137,729 | +23.44% | **Plan A (SRM)** | SRM clears 15% and beats the competitor |
| **Mid** | S$1,195,664 | **+10.71%** (+S$143,440) | S$1,114,482 | +16.77% | Plan B | SRM positive but **below** 15%; competitor ahead, shown honestly |
| **Bad** | S$1,411,412 | **−5.02%** (−S$67,418) | S$1,137,729 | +15.35% | Plan B | SRM **not a fit** (costs more than Keep ICE); competitor still positive, shown honestly |

Keep-ICE baselines: Best S$1,486,117, Mid S$1,339,103, Bad S$1,343,994. The
SRM / Plan A saving keeps the intended ordering: **+29.52% > +10.71% > −5.02%**.
Where the fixed-quote competitor beats a deliberately tuned-up SRM (mid, bad),
the engine reports it honestly — nothing is hidden or rigged to force an SRM win.

What changed between them is exactly the top of the sensitivity ranking (only
the SRM / Plan A quote is tuned; the ChengLong / Plan B quote is held at
S$205,000 throughout):

- **Best → Mid**: SRM (Plan A) quote up (S$193k → S$234k), diesel cheaper
  (S$2.10/L), utilisation trimmed (km/day −10%, days/yr −5%). The SRM saving
  falls from +29.52% to +10.71%.
- **Mid → Bad**: SRM (Plan A) quote up again (→ S$284k) and diesel cheaper still
  (S$1.80/L). The SRM saving flips negative to −5.02%.

### Practical break-even conditions

Reading those moves against the sensitivity drivers gives concrete thresholds a
fleet must sit on the right side of:

- **EV acquisition premium is the gatekeeper.** Holding the best-case duty and
  energy spread, pushing the EV quote from ~S$193k toward ~S$234k roughly halves
  the saving (to ~10.7%), and by ~S$284k the case goes negative. So the EV
  all-in quote must land close enough to the diesel replacement that ten years
  of running-cost savings can repay the premium — in the preset family that
  ceiling is on the order of ~S$230–250k for a 15% target, and ~S$280k is already
  loss-making.
- **Diesel exposure is the engine of the saving.** A diesel price around
  S$2.10/L with a thirsty duty cycle still only reaches ~10.7% once the EV is
  dear and utilisation is low; drop diesel to ~S$1.80/L and the case is negative.
  The fleet needs **genuine, high diesel exposure** — high L/km and/or a high
  pump price — for the running-cost gap to clear the target.
- **Utilisation multiplies everything.** Because km/day and days/year scale the
  running-cost gap, a lightly-used truck cannot repay an EV premium no matter how
  cheap the electricity. High daily km and high annual days are what turn a
  modest per-km advantage into a six-figure ten-year saving (the best case runs
  high utilisation; trimming it ~10%/5% is part of what drops Mid below target).
- **Feasibility is a hard veto, independent of the money.** Even a winning
  spreadsheet fails if the demanding-day route exceeds the SRM's usable range, or
  depot charging cannot be installed in the available window and no viable public
  option exists, or no complete site quote is available to make the Total
  numeric. These gates can turn a +29% case into "not yet".

In short: **a sensible conversion needs a contained EV acquisition premium,
high diesel exposure, high utilisation, a route within range, feasible charging,
and a complete site quote — simultaneously.** Drop any one and the case drifts
from the Best column toward Mid, then Bad.

---

## 4. Which client types realistically accept the quantitative case

Translating the thresholds above into real operator profiles:

### Who wins today (the case clears comfortably)

- **High-mileage urban distribution fleets** — parcel, e-commerce, food and
  beverage, laundry, retail replenishment — running **high daily km on repeating
  routes**. High utilisation multiplies the electricity-vs-diesel gap, exactly the
  Best-case profile (+29.52%).
- **Depot-based operators** who can install overnight charging in a window that
  comfortably refills the day's energy. This clears the charging gate without
  paying public-charging detour/queue penalties, and lets the model produce a
  numeric Total from an itemised site quote.
- **Fleets whose demanding-day route sits well inside the SRM's usable
  single-charge range**, so the range feasibility screen passes with margin.
- **Operators with high current diesel exposure** — thirsty duty cycles and/or
  high pump prices — for whom the running-cost saving is largest.
- **Replacement (not expansion) decisions on trucks at/near COE expiry**, where a
  diesel replacement would otherwise be bought anyway, so the EV premium is
  measured against a real new-ICE outlay rather than against keeping a paid-off
  truck.

### Who does not win yet (the case is marginal or negative)

- **Low-mileage / occasional-use fleets.** Light utilisation cannot repay the EV
  acquisition premium; the running-cost saving is simply too small ×365.
- **Operators with no depot-charging access** who must rely on public charging,
  absorbing detour, queue and time penalties — and who may not reach a numeric
  Total at all without a feasible site.
- **Long-range or heavy-duty work beyond the SRM's usable range or payload.** The
  feasibility gate vetoes the conversion regardless of the economics; a heavier
  truck or a staged-charging route needs separate modelling.
- **Fleets facing a steep EV acquisition premium** (toward ~S$280k in the preset
  family) and/or **low diesel exposure** (cheap diesel, efficient incumbents),
  where the premium outweighs ten years of running-cost savings — the Bad case
  (−5.02%).

### The one-line "who and why"

> EV trucks make quantitative sense **first** for high-utilisation, depot-charged
> urban distribution fleets on repeating routes well within the SRM's range,
> replacing diesel trucks at COE expiry while facing high diesel exposure — and
> **not yet** for low-mileage, no-depot, long-range/heavy, or low-diesel-exposure
> operators where the EV premium outweighs the running-cost saving.

---

## 5. How to read a result, and the honesty caveats

- **Diagnostic vs confirmed.** Until a plan clears its gates with a complete site
  quote, its figures are an *indicative diagnostic*, and the Proposal stage marks
  it "INDICATIVE", not "Confirmed". A numeric Total with n.a. components is
  honest about what is still missing.
- **"Meets entered 15% target" is conditional on the supplied figures.** It is
  not independent proof of future savings and not a customer-adoption
  probability. It simply reports that, at the numbers entered, the whole-fleet
  saving reaches the committed target with the gates passing.
- **Whole-fleet, not per-truck.** One converted truck may save 15% individually
  while the fleet does not; the target is measured across the included fleet.
- **The SRM is the primary recommendation.** Plan A is framed around it;
  competitor EVs (Plan B) are compared on the same duty, and every competitor
  carries an Unconfirmed body-fit caveat until confirmed.
- **All preset figures are illustrative.** Best / Mid / Bad are engine-verified
  demonstrations of the full range of outcomes, not real customers, and the
  default landing case is the Mid (SRM) scenario.
- **Fallbacks are not quotes.** A blank EV price uses the catalogue list +
  shared COE assumption; a blank battery uses the unconfirmed archived capacity.
  Enter verified overrides before presenting a customer result.

<!-- SIMBRIEF-MODELS:BEGIN  generated by tools/build_simbrief_models.mjs  DO NOT EDIT BY HAND -->
## 6. 5-year and 10-year Total economic TCO by portfolio model

This table reports, for **every one of the 12 portfolio models**, both the
**5-year** and the **10-year** Total economic TCO, computed by the frozen engine
(`src/engine.js`, `computeFleet`) under ONE held-constant scenario so the
per-model comparison is apples-to-apples.

**Held-constant scenario.** The shipped **Best** illustrative preset is used as the
single fixed base and is held identical across all 12 models: the same fleet size
and composition (4 EV-action trucks within a 100-truck register), the same duty
(work km/day and days/year), the same energy prices (commercial diesel and depot
electricity), the same depot charging-site build-up, and the same EV purchase quote
(col D). The **only** input that changes between rows is which catalogue model is
bound as the EV on the EV plan (Plan A). Holding the quote constant isolates each
model's own economics - its energy use (kWh/km), catalogue base and year-10 asset
value - rather than mixing in a different quote per model.

**How the figures are derived.** The engine exposes a per-plan, per-year cumulative
economic-TCO series (`annualSeries[plan].cumulative[0..10]`) - the same series that
draws the TCO line chart. For the EV plan of each run: **5-yr = `cumulative[5]`**
(the cumulative economic cost at year 5) and **10-yr = `cumulative[10]`** (the
full-horizon 120-month Total economic TCO). No figure is invented and no engine
formula was changed; these are genuine frozen-engine cumulative points. Where a
model gates out for the scenario the cell shows **n.a.**, never a substituted zero.

| Portfolio model | 5-year Total economic TCO | 10-year Total economic TCO |
|---|---:|---:|
| Farizon F3E | S$1,022,583 | S$1,074,667 |
| SRM T3EV | S$1,008,956 | S$1,047,412 |
| ChengLong L2EV | S$1,034,815 | S$1,099,129 |
| Farizon H5E | S$1,048,485 | S$1,126,469 |
| **SRM T3EV+** (primary) | S$1,008,956 | S$1,047,412 |
| Farizon H9E 14ft | S$1,070,606 | S$1,170,713 |
| Farizon H9E 20ft | S$1,073,336 | S$1,176,171 |
| BYD T35 Electric Light-Duty | S$1,020,500 | S$1,070,500 |
| Foton eMiler | S$1,036,100 | S$1,101,700 |
| Forland S1 EV | S$1,038,500 | S$1,106,500 |
| JAC N40EV | S$1,058,180 | S$1,145,860 |
| Qingling EQ2 | S$1,062,980 | S$1,155,460 |

**Caveats (unchanged honesty signals).** These figures are a **diagnostic, not a
quotation**. The **SRM is the primary recommendation** (SRM T3EV+ on Plan A);
competitor models are shown on the same held-constant duty for a like-for-like
comparison. Catalogue **body-fit / payload status is Unconfirmed** for every model,
so no row reads as a clean "best fit" until that status is confirmed with a real
quote. All preset figures are **illustrative** (the Best preset is an
engine-verified demonstration, not a real customer). Regenerate this table
deterministically with `node tools/build_simbrief_models.mjs` and re-embed it with
`node tools/build_index.js`.
<!-- SIMBRIEF-MODELS:END -->

_Figures sourced from `docs/preset-profiles.md`, `docs/input-sensitivity-findings.md`,
`docs/minimum-critical-inputs.md`, `docs/portfolio-fit-rules.md` and the frozen
engine `src/engine.js`. Regenerate the presets with `python tools/build_prospects.py`
and the sensitivity ranking with `node tools/sensitivity.mjs`._
