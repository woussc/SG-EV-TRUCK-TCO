# Research plan: Singapore charging-site installation costs

Status: PLAN for further analysis (not the analysis itself).
Owner: Hong Seh EV TCO project.
Last updated: 2026-10-22.

## 1. Objective and the decision it informs

The Hong Seh EV TCO calculator reproduces the workbook math exactly for the
*vehicle* side of total cost of ownership, but it treats the **charging-site
installation and ownership cost** as the single biggest source of uncertainty.
The v4 quick guide (sections 3 and 4) and the delivered README both flag this:
blank construction and rental fields stay unknown, the published 60 kW
equipment/maintenance numbers are only price anchors, and the industry-partner
"S$500,000" site-cost figure is an unverified claim whose scope must be
reconstructed before use.

The practical consequence today: the two real reconstructions the tool shipped
with - **Yong Wen (5-truck)** and **Venus (3-truck)** full-EV cases - were left
with site status **"Missing site quote"** (Net site ownership cost = `n.a.`) and
charger grant = 0, because the public sources never itemised the AC-depot site
cost or the incentive quanta. As a result the engine can only report
*vehicle-only* EV TCO for those cases, which is why the reference-HTML Full-EV
headline totals (Yong Wen S$1,498,134; Venus S$904,045) do not reconstruct to
the dollar.

**Decision this research informs:** whether, and under what site-cost and grant
assumptions, a depot-charged full-EV plan clears the model's 15% fleet-saving
headroom for a given Hong Seh prospect - and therefore whether a confirmed
"benefits most from switching" claim can be made in the client review rather than
a diagnostic-only `n.a.`.

**Definition of done for the research:** a set of *verified, itemised* AC-depot
(and where relevant DC) site-cost inputs plus grant quanta that drop straight
into the calculator's existing input fields, replacing `n.a.`/assumption tags
with `fact`/`verified` tags for at least the Yong Wen and Venus cases and for a
generic Singapore depot template.

## 2. Research questions

1. What does a scope-complete AC-depot charging-site quote for a small truck
   fleet (3-6 vehicles) in Singapore actually contain, line by line, and what is
   the realistic range for each line?
2. How do the itemised costs split between **per-charger** items and
   **whole-site (once)** items, so they map onto the model's two entry rules
   without double counting?
3. What is the true scope behind the **S$500,000** industry-partner site claim -
   does it include land, major power preparation, or civil works that the model
   treats as whole-site once-off, and is it even comparable to equipment-only
   advertisements?
4. For the EHVCG charger grant: what is the current **eligible-cost ceiling vs
   actual award**, the component caps, the funded-charger count cap, which
   infrastructure is **not** eligible (major electrical, general civil, SP
   connection), and the confirmation that a **22 kW AC charger is not funded**?
5. What recurring and end-of-life costs must be captured: annual charger
   maintenance per charger, incremental space rent, fixed fees / demand charges /
   lost-space value, refundable deposit, and site-end restoration / relocation /
   charger-replacement obligations?
6. AC vs DC and tenure: how do the above change for DC depot charging and for
   short vs long site tenure (a short lease needs a costed, confirmed
   continuation arrangement per the guide)?
7. For the Yong Wen and Venus cases specifically, what itemised AC-depot site
   quote + grant quantum closes the residual against the published Full-EV
   totals?

## 3. Cost-component taxonomy to populate

This taxonomy is **aligned to the calculator's existing input fields** (quick
guide section 3, "Enter site costs in the correct place") so verified numbers
drop straight into the tool. Keep the model's evidence discipline: `n.a.` is not
zero, blank is not zero, enter `0` only when a quote or site assessment supports
zero incremental cost.

### 3.1 Per-charger items (model multiplies by installed charger quantity)

| Component | Entry rule / note |
|---|---|
| Charger equipment | Per charger, by type (AC vs DC, kW rating). Changing type does not auto-select a new price. |
| Local EV board | Per charger. |
| Licensed Electrical Worker (LEW) fee | Per charger. If a quote gives one project-wide LEW fee, allocate across charger quantity first. |
| Local cabling | Per charger. Do not duplicate against whole-site trenching. |
| Registration | Per charger. |
| Charger maintenance (annual) | Per charger, per year. Confirm which inspections, parts and support are included. |

### 3.2 Whole-site, once-off items (enter the incremental amount once)

| Component | Entry rule / note |
|---|---|
| Major electrical upgrade | Whole-site once. Generally NOT grant-eligible. |
| General civil work | Whole-site once. Do not duplicate local cabling/trenching. Generally NOT grant-eligible. |
| SP Group (SP) connection | Whole-site once. Generally NOT grant-eligible. |
| Other site preparation | Whole-site once. |

### 3.3 Recurring / incremental items

| Component | Entry rule / note |
|---|---|
| Incremental space rent | Extra EV space rent per month only. Do not re-charge rent common to both alternatives. |
| Fixed fees, demand charges, lost-space value | Actual incremental annual costs. Do not duplicate charges already in the kWh tariff or rent. |

### 3.4 Funding / end-of-life items

| Component | Entry rule / note |
|---|---|
| Refundable deposit | Refundable amount + refund month. Affects funding / cash tied up, not the full economic expense. |
| Site-end restoration | Amount + date; tied to rights duration. |
| Relocation | Amount + date. |
| Charger replacement | Amount + date; a short lease needs a costed, confirmed continuation arrangement. |
| Equipment recovery at year 10 | Residual value recovered at horizon end. |

### 3.5 Grant inputs (separate from vehicle incentives)

| Component | Entry rule / note |
|---|---|
| EHVCG accepted eligible cost | After component caps. The worksheet shows an eligible-cost budget *ceiling*, not an award. |
| Funded charger quantity | Approved count (model caps the ceiling at MIN(3, funded chargers)). |
| Reimbursement month | When the checked award reduces TCO. |
| Non-eligible exclusions | Major electrical / general civil / SP connection are not automatically eligible; a 22 kW AC charger is not funded. |

Vehicle incentives (CVES/HVZES) are tracked separately and only the checked
amount is entered; a grant-net quote must not take a second grant deduction.

## 4. Candidate data sources

1. **SP Group (SP) connection cost schedules** - published connection application
   fees, capacity-charge schedules, and the incremental infrastructure charge for
   a depot power upgrade. Primary source for the whole-site "SP connection" line.
2. **LEW / EMA electrical requirements** - Energy Market Authority and licensed
   electrical worker guidance to scope the local EV board, cabling, LEW fee and
   any major electrical upgrade, and to sanity-check per-charger vs whole-site
   allocation.
3. **EHVCG / LTA grant documentation** - official scheme terms for the eligible-
   cost ceiling, component caps, funded-charger count cap, excluded
   infrastructure, and the 22 kW AC non-funding rule. Also CVES/HVZES for the
   separate vehicle-incentive side.
4. **Installer / EPC quotations** - itemised quotes from charger installers /
   engineering-procurement-construction contractors for 3-6 charger AC depots
   (and at least one DC comparison), broken into the taxonomy above. Target
   several independent quotes so each line has a range, not a point.
5. **Landlord / space-rent benchmarks** - published or brokered incremental
   industrial space-rent rates to value EV charging bays and any lost-space
   value, normalised to S$/month incremental.
6. **Vendored `sg-electric-chargers` (BoCharge) dataset** - the in-repo
   `vendor/sg-electric-chargers/` project and its `public/data/sample-chargers.json`
   (LTA DataMall-derived) can provide **public-charging-site context**: where
   public AC/DC chargers exist, provider mix and density near candidate depots.
   This is useful where a prospect leans on public charging (set Public
   electricity share) or to benchmark public-charging detours, not as a source of
   depot build quotes. Respect its LTA Open Data / provider-terms as recorded in
   its `NOTICE.md`.
7. **Published case studies** - operator-funded depot arrangements and published
   EV-fleet depot build-outs, used to reconstruct the S$500,000 claim's scope and
   to cross-check installer quotes. Do not compare a total-project figure directly
   with equipment-only advertisements.

## 5. Methodology

1. **Reconstruct the S$500,000 claim's scope first.** Decompose it against the
   section 3 taxonomy: identify whether it bundles land, major power preparation,
   or multi-site works. Only once decomposed can any part of it be used as a
   benchmark; otherwise flag it `unknown` and do not enter it.
2. **Gather itemised quotes.** Collect at least **three** independent installer/EPC
   quotes per depot archetype (small AC depot 3-6 chargers; one DC comparison).
   Request each line of the taxonomy explicitly, including the project-wide LEW
   fee (to be allocated per charger) and any demand-charge assumptions.
3. **Normalise per-charger vs whole-site.** Apply the model's entry rules: divide
   project-wide per-charger items (e.g. a single LEW fee) by charger quantity;
   keep major electrical / civil / SP connection / other preparation as single
   whole-site once-off entries. Record the normalisation so it is auditable.
4. **Separate grant-eligible from non-eligible.** Tag each line against EHVCG
   eligibility. Compute the eligible-cost ceiling MIN(30000, 0.5 * accepted cost
   per charger) * MIN(3, funded chargers) as a *ceiling* only; record the expected
   *checked award* separately, because only the entered checked award reduces TCO.
   Exclude major electrical / general civil / SP connection and any 22 kW AC
   charger from eligible cost.
5. **Handle AC vs DC and tenure.** Produce an AC-depot baseline and a DC variant;
   for each, model a long-tenure and a short-tenure case (short tenure requires a
   costed, confirmed continuation arrangement plus restoration/relocation
   amounts and dates).
6. **Record ranges and evidence tags.** Every number carries an evidence tag
   (`fact` = sourced/quoted, `assumption` = reasoned placeholder, `inference` =
   derived, `unknown` = not yet sourced) and a provenance reference, mirroring the
   tool's discipline. Keep `n.a.` where no quote exists rather than inventing 0.
7. **Feed into the calculator and re-run gates.** Enter the verified inputs into
   the tool's Energy-and-charging / site build-up fields, recompute, and check the
   route-energy screen, capacity gate and the 15% fleet-saving headroom. A plan
   that fails the route-energy screen needs a documented operational trial, not a
   lowered peak-km input.
8. **Close the Yong Wen and Venus residual.** Enter the reconstructed itemised
   AC-depot site quote + grant quantum for each; confirm whether the Net site
   ownership cost moves those cases off `n.a.` and how close the Total economic
   TCO then sits to the published Full-EV headlines (Yong Wen S$1,498,134; Venus
   S$904,045). Document any remaining delta and its cause.

## 6. Deliverables

1. **Site-cost input pack** - a table per depot archetype (AC baseline, DC
   variant; long and short tenure) populated to the section 3 taxonomy with
   ranges and evidence tags, formatted to drop directly into the calculator's
   site fields.
2. **S$500,000 scope note** - a short reconstruction of what the claim does and
   does not include, with a verdict on whether any part is usable as a benchmark.
3. **Grant quantum note** - eligible vs non-eligible breakdown, the ceiling
   calculation, the expected checked award, and the 22 kW / non-eligible
   exclusions, for Yong Wen, Venus and the generic template.
4. **Updated Yong Wen and Venus cases** - the two reconstructions re-run with
   verified site quotes + grants, moving them off `Missing site quote` where the
   evidence supports it, with the residual-to-HTML delta documented.
5. **Source log** - every figure traced to its source (SP schedule, EMA/LEW doc,
   EHVCG terms, installer quote ID, rent benchmark, case study, or the vendored
   dataset) for the client review audit trail.

## 7. Sequence and milestones

| Milestone | Work | Rough effort |
|---|---|---|
| M1 - Scope & grant rules | Reconstruct S$500,000 scope; pull EHVCG/LTA grant terms and SP/EMA requirements; confirm non-eligible items and the 22 kW rule. | ~1 week |
| M2 - Quote gathering | Request and receive >=3 itemised AC-depot quotes (+1 DC) from installers/EPCs; collect space-rent benchmarks. | ~2-3 weeks (quote turnaround bound) |
| M3 - Normalise & tag | Allocate per-charger vs whole-site; tag grant eligibility; attach evidence tags and ranges; assemble the input pack. | ~1 week |
| M4 - Model & gate | Enter into the calculator; re-run route-energy, capacity and 15% headroom gates; close the Yong Wen/Venus residual; write the scope and grant notes. | ~1 week |
| M5 - Client review pack | Finalise deliverables and source log for the Hong Seh client review. | ~2-3 days |

## 8. Assumptions and constraints

- The calculator stays deterministic and offline; this research produces inputs
  for it, it does not add any runtime data feed to the client-facing tool.
- Each plan still represents one homogeneous charger bank and one common site
  arrangement; mixed AC/DC hardware, multiple depots or staged additions need
  separate comparable site workbooks.
- Grant eligibility always depends on the actual vehicle registration, purchase
  date and scheme conditions at the time of application; figures gathered here
  are indicative until a checked award exists.
- The vendored BoCharge dataset informs public-charging context only; it is not a
  source of depot installation quotes.
