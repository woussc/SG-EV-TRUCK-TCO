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
±10% around the fully-specified **wins** scenario (baseline best-plan Total
economic TCO **S$7,867,090**, saving **29.43%** vs Keep ICE **S$11,148,680**, a
30-truck high-utilisation fleet at honest fixed prices) and measures the swing
in Total TCO and in Saving %. Ranked by business impact:

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

## 3. The operational break-even frontier (which intensity and how many trucks)

A conversion is "sensible" in this tool only when **both** of these hold:

1. **The economics clear the committed fleet saving target** (default **15%**).
   The saving is whole-fleet: `(Keep ICE total − plan total) / Keep ICE total`.
   The engine labels a plan **"Meets entered 15% target"** only when the gate
   passes, the Total is numeric, and `savingPct ≥ target`.
2. **The feasibility gates pass**: the demanding-day route sits inside the SRM's
   usable single-charge range; depot charging is feasible **or** a viable
   public-charging arrangement exists; service/evidence is confirmed; and a
   complete site quote exists so the Total is numeric rather than n.a.

**Prices are held fixed and honest.** Every profile uses the **same** vehicle
quotes — **SRM T3EV+ S$193,000** on Plan A and **ChengLong L2EV S$205,000** on
Plan B — so no profile ever shows a model cost above the vehicle's own input
price. The question this section answers is therefore not "how high can we push
the price," but the operator's real question: **at honest prices, which
operational intensity (km/day × days/year) and how many trucks does a company
need before EV genuinely saves?** Plan A carries the SRM scenario; Plan B carries
the honest like-for-like ChengLong competitor (via the two-state projection, SRM
on slot O and ChengLong on slot R, exactly as the live tool computes it). The
depot charging site is sized to the fleet (one AC11 charger + plug per truck), so
every figure below is a real frozen-engine result with the capacity gate passing.

### The three shipped archetypes (fixed prices, engine-verified)

| Archetype | Fleet size | Intensity (km/day × days/yr) | Plan A — SRM Total | Plan A — SRM Saving % vs Keep ICE | Plan B — ChengLong Saving % | Verdict (SRM) |
|---|---:|---|---:|---:|---:|---|
| **wins** | 30 trucks | 120 × 300 | S$7,867,090 | **+29.43%** (+S$3,281,590) | +23.35% | Clears 15% comfortably — EV genuinely wins |
| **breakeven** | 4 trucks | 60 × 200 | S$972,937 | **+13.83%** (+S$156,208) | +8.89% | Positive but **below** 15% — the marginal "is it worth it?" case |
| **loses** | 1 truck | 20 × 100 | S$248,754 | **−0.65%** (−S$1,615) | −5.19% | **Not a fit** — a single barely-used truck cannot repay the EV premium |

Keep-ICE baselines: wins S$11,148,680, breakeven S$1,129,145, loses S$247,139.
The SRM / Plan A saving keeps the intended ordering: **+29.43% > +13.83% >
−0.65%**. The ONLY things that change between the three profiles are **fleet
size** and **operational intensity** — the vehicle prices are identical in all
three. `breakeven` is the default landing case (the honest "is it worth it for
us?" conversation).

### Break-even grid: SRM saving % across operational intensity

Holding the honest S$193k SRM quote fixed (diesel S$2.50/L, 4-truck fleet with a
fleet-sized depot), the frozen engine tabulates where the 15% target is crossed
as a function of how hard the trucks work. Cells at or above the **15% target**
are the "win" region:

| km/day \ days/yr | 150 | 200 | 250 | 300 |
|---|---:|---:|---:|---:|
| **40** | 8.4% | 10.1% | 11.7% | 13.2% |
| **60** | 11.3% | 13.8% | 16.1% | 18.2% |
| **80** | 14.1% | 17.2% | 20.0% | 22.5% |
| **120** | 19.0% | 23.0% | 26.5% | 29.5% |

Read the frontier: a 4-truck fleet needs roughly **≥ 60 km/day × 250 days** or
**≥ 80 km/day × 200 days** of real work before the honest-priced SRM clears the
15% target. Below that — light daily km and/or few working days — the running-cost
saving is simply too small to repay the fixed EV premium, even though the price
never moved.

### Fleet-size sensitivity at fixed high intensity (120 km/day × 300 days)

Because the depot charging site is sized to the fleet (one charger + plug per
truck), the per-truck economics are broadly stable as the fleet grows; more
trucks mainly add scale and a small amortisation of the shared, lumpy
installation effort:

| Fleet size N | 1 | 2 | 4 | 10 | 20 | 30 |
|---|---:|---:|---:|---:|---:|---:|
| SRM saving % | 26.1% | 27.3% | 29.5% | 29.1% | 29.6% | 29.4% |

At high intensity the case is already strongly positive from a single truck
(+26.1%) and firms up into the high-20s % as the fleet scales. The decisive lever
is therefore **operational intensity first, fleet size second**: a company needs
hard-working trucks (high km/day × days/year) for a real saving, and a larger
fleet then makes that saving both bigger in absolute S$ and steadier.

### Practical break-even conditions

Reading the grid against the sensitivity drivers gives concrete thresholds a
fleet must sit on the right side of — at honest, fixed prices:

- **Operational intensity is the gatekeeper.** Because km/day and days/year scale
  the running-cost gap, a lightly-used truck cannot repay an EV premium no matter
  how cheap the electricity. At the honest S$193k quote a 4-truck fleet needs
  roughly ≥ 60 km/day × 250 days (or ≥ 80 km/day × 200 days) to clear 15%; a
  single truck at 20 km/day × 100 days is slightly negative (−0.65%).
- **Diesel exposure is the engine of the saving.** The running-cost gap that EV
  harvests comes from displacing diesel: high L/km and/or a high pump price make
  every worked km save more, which is why the top of the intensity grid clears
  the target so comfortably.
- **Fleet size amplifies, it does not rescue.** With the site sized to the fleet,
  adding trucks mainly scales an already-positive (or already-negative) per-truck
  result; it will not turn a genuinely light duty cycle into a winner. Intensity
  decides the sign; fleet size decides the magnitude.
- **Feasibility is a hard veto, independent of the money.** Even a winning
  spreadsheet fails if the demanding-day route exceeds the SRM's usable range, or
  depot charging cannot be installed in the available window and no viable public
  option exists, or no complete site quote is available to make the Total
  numeric. These gates can turn a +29% case into "not yet".

In short: **a sensible conversion needs genuine operational intensity (high
km/day × days/year) on top of a route within range, feasible charging, and a
complete site quote — all at the vehicle's honest fixed price.** The price is not
the lever; the way the trucks are used is.

---

## 4. Which client types realistically accept the quantitative case

Translating the thresholds above into real operator profiles:

### Who wins today (the case clears comfortably)

- **High-mileage urban distribution fleets** — parcel, e-commerce, food and
  beverage, laundry, retail replenishment — running **high daily km on repeating
  routes**. High utilisation multiplies the electricity-vs-diesel gap, exactly the
  **wins** archetype (30 trucks at 120 km/day × 300 days, +29.43%).
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

### The marginal case (right on the frontier)

- **Mid-sized fleets at moderate utilisation.** A handful of trucks at ~60 km/day
  × ~200 days sits just below the 15% target (the **breakeven** archetype: 4
  trucks, +13.83%). The economics are genuinely positive but marginal, so the
  decision turns on softer factors — brand, grant timing, residual-value
  confidence — rather than a clear-cut payback. This is the honest "is it worth it
  for us?" conversation, and it is the default landing case.

### Who does not win yet (the case is negative)

- **Low-mileage / occasional-use operators.** Light utilisation cannot repay the
  EV acquisition premium; the running-cost saving is simply too small once the
  truck barely works. A single truck at 20 km/day × 100 days is slightly negative
  (the **loses** archetype, −0.65%) **even though its price is the same honest
  S$193k as the winning fleet** — the sign is set by how the truck is used, not by
  the quote.
- **Operators with no depot-charging access** who must rely on public charging,
  absorbing detour, queue and time penalties — and who may not reach a numeric
  Total at all without a feasible site.
- **Long-range or heavy-duty work beyond the SRM's usable range or payload.** The
  feasibility gate vetoes the conversion regardless of the economics; a heavier
  truck or a staged-charging route needs separate modelling.

### The one-line "who and why"

> At honest, fixed vehicle prices, EV trucks make quantitative sense **first** for
> high-utilisation, depot-charged urban distribution fleets on repeating routes
> well within the SRM's range, replacing diesel at COE expiry with high diesel
> exposure — are a **marginal** call for mid-sized fleets at moderate utilisation
> sitting just below the 15% target — and are **not yet** a fit for low-mileage,
> no-depot, or long-range/heavy operators, because the deciding lever is
> operational intensity and fleet size, not the vehicle price.

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
- **All preset figures are illustrative.** wins / breakeven / loses are
  engine-verified demonstrations of the operational break-even frontier at honest
  fixed prices, not real customers, and the default landing case is the
  **breakeven** archetype.
- **Fallbacks are not quotes.** A blank EV price uses the catalogue list +
  shared COE assumption; a blank battery uses the unconfirmed archived capacity.
  Enter verified overrides before presenting a customer result.

<!-- SIMBRIEF-MODELS:BEGIN  generated by tools/build_simbrief_models.mjs  DO NOT EDIT BY HAND -->
## 6. 5-year and 10-year Total economic TCO by portfolio model

This table reports, for **every one of the 12 portfolio models**, both the
**5-year** and the **10-year** Total economic TCO, computed by the frozen engine
(`src/engine.js`, `computeFleet`) under ONE held-constant scenario so the
per-model comparison is apples-to-apples.

**Held-constant scenario.** The shipped **Wins** illustrative preset is used as the
single fixed base and is held identical across all 12 models: the same fleet size
and composition (30 EV-action trucks within a 100-truck register), the same duty
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
| Farizon F3E | S$7,662,876 | S$8,071,502 |
| SRM T3EV | S$7,560,670 | S$7,867,090 |
| ChengLong L2EV | S$7,754,610 | S$8,254,970 |
| Farizon H5E | S$7,857,136 | S$8,460,021 |
| **SRM T3EV+** (primary) | S$7,560,670 | S$7,867,090 |
| Farizon H9E 14ft | S$8,023,047 | S$8,791,845 |
| Farizon H9E 20ft | S$8,043,517 | S$8,832,784 |
| BYD T35 Electric Light-Duty | S$7,647,250 | S$8,040,250 |
| Foton eMiler | S$7,764,250 | S$8,274,250 |
| Forland S1 EV | S$7,782,250 | S$8,310,250 |
| JAC N40EV | S$7,929,850 | S$8,605,450 |
| Qingling EQ2 | S$7,965,850 | S$8,677,450 |

**Caveats (unchanged honesty signals).** These figures are a **diagnostic, not a
quotation**. The **SRM is the primary recommendation** (SRM T3EV+ on Plan A);
competitor models are shown on the same held-constant duty for a like-for-like
comparison. Catalogue **body-fit / payload status is Unconfirmed** for every model,
so no row reads as a clean "best fit" until that status is confirmed with a real
quote. All preset figures are **illustrative** (the Wins preset is an
engine-verified demonstration, not a real customer). Regenerate this table
deterministically with `node tools/build_simbrief_models.mjs` and re-embed it with
`node tools/build_index.js`.
<!-- SIMBRIEF-MODELS:END -->

_Figures sourced from `docs/preset-profiles.md`, `docs/input-sensitivity-findings.md`,
`docs/minimum-critical-inputs.md`, `docs/portfolio-fit-rules.md` and the frozen
engine `src/engine.js`. Regenerate the presets with `python tools/build_prospects.py`
and the sensitivity ranking with `node tools/sensitivity.mjs`._
