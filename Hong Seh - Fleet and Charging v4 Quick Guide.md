---
type: calculator-guide
version: 4
as_of: 2026-10-03
status: demonstration-defaults-customer-evidence-required
---

# Fleet and charging calculator: quick guide

## Start here

Use **Hong Seh - EV TCO Calculator - Fleet and Charging v4.xlsx**. Keep v3 as the earlier version.

The calculator holds the same truck duties constant for 120 months. It compares four ownership paths. It supports up to 100 current trucks, not an unlimited fleet. One EV replaces one ICE truck. It does not automatically add trucks when an EV cannot carry the load or complete the route.

The saved six-truck case is a demonstration. Installation quotations are missing. Its final EV totals correctly show **n.a.**, not zero installation cost or verified customer savings.

### Six steps

1. In **Fleet register**, use one row for each current truck. Set **Include** to `1` for the trucks in scope. Set all other rows to `0`.
2. In **Replacement plan**, match the truck ID. Enter the replacement quotes, replacement actions, dates and year-10 values.
3. In **Energy and charging**, enter each plan's prices, public shares, charging-site costs and access evidence.
4. In **Operating costs**, replace demonstration fuel, maintenance, time and downtime assumptions with company records. Use the per-truck overrides where trucks differ.
5. In **Results**, inspect service and site warnings first. Then inspect total TCO, savings and upfront funding.
6. Use **Paths**, **Annual build** and **Review** only when you need to trace or reconcile a figure. Do not overwrite their formulas.

Amber cells are editable. Blue text identifies entered values. Green text generally identifies linked calculations. A dash in a numeric cell means **an explicit zero**. A blank input means no value has been supplied. `n.a.` means a result is unavailable or not applicable; it is not a zero cost.

## 1. What the four columns mean

| Results column | Meaning |
|---|---|
| Keep ICE, then new ICE | Each old truck runs until its COE expiry or an earlier entered retirement month. It is then replaced with a new ICE truck. |
| All-new ICE now | Replace every included old truck with a new ICE truck at month 0. |
| Plan A | Select Keep ICE, New ICE or EV separately for each truck. Set a replacement month where needed. |
| Plan B | A second set of per-truck actions and dates, using the same work requirements. |

For six trucks, set Plan A to one EV and five Keep ICE paths. Set Plan B to three EVs and three Keep ICE paths. For an all-EV plan, select EV for every included truck. For ten trucks, complete ten records and include those ten records. The count is not hard-coded at six.

**Keep ICE does not mean ten years of free COE extension.** A truck with 24 months of COE left runs for 24 months, is disposed of, and needs a replacement for months 25–120. The fleet size remains constant. To remove a truck from the comparison, change Include; this removes its work from all plans, not only one plan.

Month `0` means replace now. Month `24` means the old truck runs through month 24 and the new truck starts in month 25. Month `120` means the old truck serves the full horizon and is disposed of at the end; no replacement purchase is charged within this horizon. Replacement months must be whole numbers and must not exceed remaining COE.

## 2. Inputs to collect during the company interview

| Group | Fields | Evidence to request |
|---|---|---|
| Work | Work km/day, days/year, demanding-day route km, peak cargo, body and jobs | Route logs, dispatch records and cargo examples. Exclude station detours from work km. |
| Current truck | COE months left, market value now, physical scrap, COE paid basis and original term | Registration record, disposal/dealer offer and COE record. Age and registration date are context, not extra depreciation costs. |
| Replacement | ICE quote, EV quote, chosen model, action, replacement month, year-10 value | Comparable all-in vehicle/body/COE quotes. Future residual values remain forecasts. |
| Energy | Diesel litres/km, EV grid- or battery-side kWh/km, energy prices and source shares | Stock-balanced fuel records, electricity invoices and loaded EV trials. |
| Charging | Truck-compatible access, average charging power, queues, detours, charging window and concurrent demand | Actual site/route observations, not nameplate power alone. |
| Other costs | Maintenance, tyres, tax, insurance, inspection, backup, paid extra time | Matched invoices/quotes. Separate costs already included in contracts. |
| Site | Equipment, local installation, grid/civil works, incremental rent, fees, tenure, restoration and deposit | Itemised installer and landlord quotations, electrical assessment and permissions. |

Use the **Evidence reference** field to name the invoice, log, quote or interview record. Do not replace unknown information with a plausible estimate without marking it as an assumption.

### Replacement plan field map

| Columns | What to enter |
|---|---|
| A–D | Truck ID, EV model, all-in new ICE price and optional all-in EV price override. |
| E–L | Usable battery, EV consumption override and its energy basis, approved payload/body fit, measured depot/public power and depot AC/DC mode. |
| M–N | Optional earlier Keep ICE retirement month and that reference path's year-10 asset value. |
| O–Q / R–T | Plan A / Plan B action, replacement month override and path-specific year-10 value. |
| U–V | Optional **gross** old-truck disposal proceeds for A / B. Zero is allowed if intentional. |
| W–Y | Per-truck annual extras for old ICE, new ICE and EV, beyond the shared operating inputs. |
| Z–AB | Manually checked vehicle incentive amount, receipt offset after purchase and eligibility confirmation. |
| AC–AF | Entered vehicle life, quote/value evidence status and supporting record reference. |
| AG–AI | Optional old/new ICE fuel-consumption overrides and the all-new-ICE-now year-10 value override. |

Blank optional overrides use their stated fallback. Blank required values block results. For example, blank EV purchase price uses the archived model price plus the shared COE assumption. **This fallback is not a current Hong Seh quote.** Blank usable battery uses the archived listed capacity, which is unconfirmed. Enter verified overrides before presenting a customer result. A year-10 value must reflect the asset actually owned at that time; a delayed purchase is younger than a purchase today.

Keep the ID attached to its record when sorting. IDs must be unique in both input sheets. The calculations link the sheets by ID.

## 3. Charging prices and installation costs

Diesel share is the fraction of litres bought commercially. Public electricity share is the fraction of grid energy supplied publicly. Neither is a fraction of charging visits. The calculator estimates public visits and includes energy used on station detours. It also includes the entered queues, charging time, handling and avoidable paid-time shares. It treats backup rates as all-in, so backup fuel is not charged again.

The small **commercial versus public** table holds energy volumes fixed. It shows the price effect only. To compare complete charging strategies, change the actual Plan A / B shares and site inputs. Detours, time and infrastructure then change too.

### Enter site costs in the correct place

| Cost | Input rule |
|---|---|
| Equipment, local EV board, LEW, local cabling and registration | Enter cost **per charger**. The calculator multiplies these by installed charger quantity. If a quote gives one project-wide LEW fee, allocate it across the entered charger quantity first. |
| Major electrical upgrade, general civil work, SP connection and other preparation | Enter the **whole-site** incremental amount once. Do not duplicate local cabling or trenching. |
| Space rent | Enter extra EV space rent per month. Do not charge the EV again for factory rent already common to both alternatives. |
| Fixed fees, demand charges and lost space value | Enter actual incremental annual costs. Do not duplicate charges already included in the kWh tariff or rent. |
| Maintenance | Enter annual cost per charger. Check which inspections, parts and support are included. |
| Deposit | Enter the refundable amount and refund month. It affects funding and cash tied up, not the full economic expense. |
| Site end / replacement | Enter rights duration, restoration, relocation and charger replacement amounts and dates. A short lease needs a costed, confirmed continuation arrangement. |

The published 60 kW equipment and maintenance values are only price anchors. Blank construction and rental fields remain unknown. Enter `0` only when the quote or site assessment supports zero incremental cost. Changing charger type does **not** automatically select a new price, registration fee or maintenance package; update those fields too.

For public-only charging, set Public electricity share to `100%`. Enter transition cost, fixed annual service fees and the month the arrangement starts. Confirm truck access. Depot equipment and construction are then excluded. For an operator-funded depot, enter the buyer's actual contract charges and explicitly document which installation costs the operator bears. The descriptive arrangement label alone does not change any cost.

Each plan represents **one homogeneous charger bank and one common site arrangement**. Its quantity, ports, net power and common window can differ between A and B. Mixed AC/DC hardware, multiple depots, staged additions or separate lease escalators need further modelling or separate comparable site workbooks. The capacity check is a coarse screen, not an arrival-by-arrival scheduling optimiser.

The route-energy screen tests the entered demanding-day route against the battery reserve and capacity stress. It does not automatically credit a mid-route recharge or redesign the dispatch schedule. A route that fails this screen needs a documented operational trial and a more detailed schedule, not a lower invented peak-km input.

## 4. Grants and the S$500,000 claim

Vehicle incentives and charger grants are separate. No CVES or HVZES vehicle award is selected automatically from a brand or plate. Enter the checked vehicle amount only when the quote is gross of that benefit. A grant-net quote plus another grant deduction would double-count the saving.

The charger worksheet shows an eligible-cost budget ceiling. It is **not an award**. Only the entered, checked charger grant reduces TCO. Enter accepted eligible cost after component caps, approved funded charger quantity and the reimbursement month. Major electrical infrastructure, general civil infrastructure and SP connection costs are not automatically eligible. The current EHVCG rules do not fund a 22 kW AC charger.

The industry partner's S$500,000 figure is an unverified site-cost claim. Reconstruct its scope before using it. It could include land or major power preparation. Do not compare it directly with equipment-only advertisements. The research report lists the missing quotation items and regional space benchmarks.

G/Y/X are goods-vehicle registration families. The recorded H9E at 9,800 kg MLW is HGV/Y-family, not VHGV/X-family. Grant eligibility still needs the actual registration, purchase date and applicable scheme conditions.

## 5. Read the outputs correctly

| Output | Meaning |
|---|---|
| Vehicle economic TCO | Current asset opportunity value + purchases + operating/repair costs + disposal fees − disposal proceeds − entered vehicle grants − year-10 asset value. |
| Net site ownership cost | Installation + recurring site costs + dated site changes/restoration − approved charger grant − entered equipment recovery. Shared site costs are counted once. |
| Total economic TCO | Vehicle economic TCO + net site ownership cost. |
| Saving percentage | The main table uses `(Keep ICE total − chosen plan total) / Keep ICE total`. The alternative table at rows 70–73 uses all-new ICE now as the reference. These are **whole-fleet** targets. One changed truck may save 15% individually without saving 15% across an otherwise unchanged fleet. |
| Maximum site TCO for 15% saving | `0.85 × Keep ICE total − chosen plan vehicle TCO`. A negative amount means that vehicle plan misses the fleet target even with a free site. |
| Cash less year-10 assets | Cash flows excluding initial asset opportunity value, less forecast terminal recoveries. It is not a bank balance or a financing schedule. |
| Day-0 funding before loans | Immediate purchases, site outlay and deposit, less immediate disposal/grants, plus entered old-truck debt settlement and disposal fees. Future purchases are not month-0 funding. |
| Selected truck | Direct vehicle costs only. Shared site cost is excluded. Do not present this as an all-in single-truck saving. |

Current market value includes the value of existing COE rights. Do not add a second lost-COE expense. For delayed disposal, the fallback is physical scrap plus a straight-line remaining-COE refund proxy. It is **not a forecast dealer resale offer**. Use a documented gross disposal override where possible. Historical purchase price and book depreciation are not separately added to TCO.

The annual chart deducts forecast terminal assets in year 10. A negative year-10 point is not guaranteed cash income. Loans, interest, principal schedules, normal wages, income tax and recoverable GST are excluded. Use a consistent net/GST basis; include irrecoverable taxes where relevant. Old-truck debt settlement is shown only in immediate funding, not treated as a new economic expense.

Operating costs are prorated by old/new months. Price escalation uses analysis-year bands. Purchase inflation follows the replacement month. Internal NPV discounts annual totals at year-end; it is not an exact monthly valuation. The model supports one old-truck retirement and one replacement per slot. A replacement with insufficient life fails the service screen; the model does not silently buy a second replacement.

## 6. Before presenting a customer result

- Resolve missing prices, quotes, terminal values and installation scope. Refresh dated fees and scheme windows.
- Check loaded route, payload/body fit, charging compatibility, public access, power and the shared schedule.
- Confirm backup service can maintain the same work. Enter downtime as evidence, not a brand assumption.
- Set quote/value evidence to `Verified` only after review. Set Customer mode and the other confirmation fields only when the supporting records exist.
- Inspect Review. `Not available` is acceptable for an incomplete case; it is not a passed reconciliation.
- Show the reference path, the replacement dates, the funding need and the sensitivity to uncertain prices/values.

A status such as “Meets entered 15% target” is conditional on supplied figures. It is not independent proof of future savings or a customer-adoption probability.
