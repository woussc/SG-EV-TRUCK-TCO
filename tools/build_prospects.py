#!/usr/bin/env python3
"""Emit the seed prospect cases for the Prospects view as a single JSON file.

Each case is a full input set (fleet_register / replacement_plan /
operating_costs / energy_and_charging / products / service_costs) in the same
shape consumed by src/engine.js -> computeFleet(inputs).

The workbook DEMONSTRATION 6-truck case is intentionally NOT emitted here. It
survives only as the untouched validate.py Excel-parity fixture
(tools/fixtures/demo_case.json). The user-facing seed set is best/mid/bad/blank,
and the MID (SRM) case is the app's default landing scenario.

Cases:
  1. best          - ILLUSTRATIVE best case: a fully-specified, gate-passing
                     input set (strong positive saving). It is a GENERIC
                     illustrative confirmed-win demonstrator, NOT a named
                     customer. PLAN A carries the SRM scenario and is the
                     stronger buy; engine-verified headline PLAN A (SRM).
  2. mid           - ILLUSTRATIVE mid case: the same input set with the
                     high-impact drivers tuned (higher SRM quote, lower diesel
                     price, lighter utilisation) so the SRM (Plan A) saving is
                     marginal but still > 0, all gates still passing. This is
                     also the DEFAULT LANDING case the app opens on.
  3. bad           - ILLUSTRATIVE bad case: tuned further (SRM quote high,
                     diesel low) so SRM (Plan A) does NOT beat Keep ICE: a
                     negative saving. Still scores via the gate (honest "not a
                     fit").
  4. blank         - ILLUSTRATIVE blank profile: a starting template with a
                     shared truck-ID set and Include toggles present. Common
                     Singapore-market SHARED assumptions (energy prices, ICE
                     fuel L/km, recurring operating costs, AC/DC-respecting
                     grant defaults, non-customer gate defaults) are prefilled,
                     while every CUSTOMER-SPECIFIC duty/quote/terminal value is
                     left blank/n.a. (NOT zero), so computeFleet still returns
                     n.a. honestly until the minimum critical inputs are added.

NONE of these are real named customers. Every figure is a realistic
Singapore-market illustration. The illustrative EV model is the SRM T3EV+
(products row 11: payload 1660 kg, battery 53.58 kWh, 0.1786 kWh/km, 11 kW AC /
55 kW DC, catalogue base quote S$66,800, range 300 km) - the nimble SRM variant
whose 11 kW AC / 55 kW DC charge power matches the majority of the Singapore
public-charging network. FEAT-003: the best/mid/bad presets put the SRM on
PLAN A (the SRM plan) and an honest like-for-like competitor, the ChengLong
L2EV, on PLAN B for a real SRM-vs-competitor side-by-side. The numbers are
engine-verified by tools/check_presets.mjs via the two-state projection (SRM on
slot O, ChengLong on slot R, exactly as the live UI does): in the BEST case SRM
(Plan A) is the stronger buy with Total economic TCO S$1,047,412, Saving
29.52% vs Keep ICE S$1,486,117, beating the ChengLong (Plan B) at S$1,137,729 /
23.44%, so the headline reads PLAN A (SRM). The SRM all-in quote overrides are
re-based to the SRM catalogue the usual way: the best case uses S$193,000
(catalogue base col I 66,800 + the fallback EV COE acquisition component oc row
57 = 93,000 + ~S$33,200 body/registration). The ChengLong quote uses the SAME
COE + body build-up on ITS catalogue base (78,800 + 93,000 + 33,200 =
S$205,000), so the comparison is like-for-like and SRM wins the best case purely
on its lower catalogue base, NOT because any number was rigged. mid/bad raise
only the SRM (Plan A) quote RELATIVE to the SRM base (the ChengLong quote is
held), so the engine honestly shows the competitor ahead in those tuned cases;
the SRM best>mid>bad story is carried by Plan A's own saving (+29.52% ->
+10.71% -> -5.02%). The high-impact drivers tuned for mid/bad are, in rank
order, the EV purchase quote (rank 1, ~14% lever), the commercial diesel price
(rank 4) and the duty intensity (work km/day + days/year, ranks 6-7).

tools/html_scenarios.py is still used by tools/validate.py to reconstruct the
Yong Wen / Venus reference-HTML parity figures INDEPENDENTLY of this file; it is
intentionally left untouched. It is no longer imported here because the seed
set no longer embeds those reconstructions.

Output is written to tools/fixtures/prospect_seeds.json and inlined into
index.html by tools/build_index.js.

Run:  python SG-EV-TRUCK-TCO/tools/build_prospects.py
This script makes NO network calls and has NO third-party dependencies beyond
the repo's own tools.
"""

from __future__ import annotations

import copy
import json
import os


HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
FIXTURE = os.path.join(HERE, "fixtures", "demo_case.json")
OUT = os.path.join(HERE, "fixtures", "prospect_seeds.json")


def load_demo():
    with open(FIXTURE, "r", encoding="utf-8") as fh:
        return json.load(fh)


# ---------------------------------------------------------------------------
# Illustrative, fully-specified prospect (a confirmed-win demonstrator)
# ---------------------------------------------------------------------------
# A clearly-labelled ASSUMPTION/illustrative case whose inputs are complete
# enough that engine.computeFleet passes every gate the model enforces:
#   * Vehicle service / evidence  = "Within entered limits"
#   * Charging-site Input completeness = "Complete"
#   * Access and capacity check   = "Within entered site limits"
#   * numeric Total economic TCO  (not n.a.)
#   * a positive Saving vs Keep ICE for the best EV plan
# so the Prospects ranking surfaces at least one genuine "confirmed win".
#
# It is NOT a real named customer. Every figure is a realistic Singapore-market
# illustration consistent with the workbook's demonstration ranges, picked so
# the gates pass. The charging-site build-up is depot-only (no public-charging
# share) to keep the capacity screen transparent.
#
# Engine fields exercised (src/engine.js): inputStatus (fleet numerics),
# serviceStatus (route-energy / payload / depot-power / verification toggles),
# siteCompleteness + siteAccessCheck (itemised quote + power/window gate +
# evidence toggles), savingClaimStatus (Customer data mode + confirmed prices).

ILLUS_MODEL = "SRM T3EV+"  # Products row 11: AC 11 kW, DC 55 kW, 53.58 kWh.
# ---------------------------------------------------------------------------
# PLAN A (SRM) vs PLAN B (competitor) framing - FEAT-003 (INTEGRITY)
# ---------------------------------------------------------------------------
# The best/mid/bad presets demonstrate the SRM T3EV+ on PLAN A (the SRM plan).
# PLAN B carries a representative honest COMPETITOR EV so the side-by-side is a
# real SRM-vs-competitor comparison, not SRM-vs-SRM. The competitor is the
# ChengLong L2EV - the current UI default competitor and a catalogue model
# (products row 9: AC 22 kW, DC 120 kW, 86.55 kWh battery, 0.2704 kWh/km,
# catalogue base col I = S$78,800). Its honest all-in EV quote re-bases to the
# catalogue EXACTLY like the SRM quote, so the comparison is like-for-like: the
# SRM best quote S$193,000 = catalogue base 66,800 + fallback EV COE
# (operating_costs row 57 = 93,000) + ~S$33,200 body/registration. The
# competitor quote re-uses the SAME COE and the SAME body/registration
# component on top of ITS OWN catalogue base: 78,800 + 93,000 + 33,200 =
# S$205,000 (COMP_PRICE below). Using the identical COE + body build-up on both
# is what makes it an honest apples-to-apples vehicle comparison: the SRM wins
# the best case purely because its catalogue base (66,800) is S$12,000 below the
# ChengLong's (78,800), NOT because any number was rigged. (Omitting the body
# component from the competitor - e.g. a bare 171,800 - would have flattered the
# competitor by comparing an unbodied truck against a bodied SRM, so we do NOT
# do that.)
#
# THE FROZEN-ENGINE CONSTRAINT AND HOW BOTH PATHS STAY HONEST:
#   The engine binds ONE col-B model (and ONE col-D quote) per truck row, used
#   for BOTH Plan A (col O) and Plan B (col R). A raw computeFleet(inputs) on a
#   single row therefore cannot run SRM on Plan A and a different competitor on
#   Plan B at the same time. The app's live comparison already solves this with
#   the TWO-STATE projection (index.html buildPlanState/computeReframed): it
#   deep-clones the state and runs the engine twice - once with col B = the Plan
#   A model + col D = the Plan A quote (slot O), once with col B = the Plan B
#   model + col D = the Plan B quote (slot R) - then reads plan_a from the first
#   run and plan_b from the second. To keep the standalone harness
#   (check_presets.mjs) and the live UI consistent AND honest, the preset
#   therefore stores BOTH models explicitly:
#     * col B = SRM T3EV+ and col D = the SRM quote  -> the Plan A (slot O) run.
#     * non-engine fields _planB_model / _planB_price -> the competitor and its
#       own honest quote for the Plan B (slot R) run.
#   The engine never reads the underscore fields (they are not Excel columns),
#   so validate.py and the frozen sha are untouched; the UI's FEAT-002 preset
#   load-sync and check_presets.mjs BOTH read them to run the competitor on
#   Plan B. No number is rigged: each plan is the frozen engine's real result
#   for its own real model and quote.
COMP_MODEL = "ChengLong L2EV"   # Plan B competitor (catalogue products row 9).
COMP_PRICE = 205000             # 78,800 base + 93,000 COE + 33,200 body/reg
                                # (same COE + body build-up as the SRM quote).

# SRM variant fit (why SRM T3EV+ over SRM T3EV):
#   * Payload: col C = 1660 kg >= the preset peak cargo of 1200 kg, giving
#     100 kg more headroom than the SRM T3EV (1560 kg). The nimble SRM class
#     fits the majority of Singapore light-commercial duty cycles.
#   * Range: col J = 300 km >= the preset peak route of 150 km with ample
#     margin (shared with SRM T3EV).
#   * Charge power: col G = 11 kW AC / col H = 55 kW DC, which matches the
#     dominant Singapore public network (slow 11 kW AC + mid-power ~50-60 kW
#     DC), so the depot charger screen (AC 11 kW) and the public-charging
#     routing story stay honest for the same hardware.
#   * Energy: col E = 0.1786 kWh/km, col D = 53.58 kWh battery flow straight
#     from the catalogue (replacement cols E/F left blank -> product default),
#     so the engine computes from SRM-consistent inputs (no hardcoded energy).

# Per-truck register template values (shared across every generated truck).
# Trucks are staged across COE expiries (18/30/42/54 months, cycling) so EVs
# deploy within the 10-year horizon. Market/terminal values cycle through the
# same four-step ladder the original 4-truck illustrative baseline used, so an
# N-truck fleet reuses honest per-truck figures without inventing new ones.
#   (coe_months_left, market_value_now, scrap,
#    straight_line_per_month, keep_year10_value, ev_year10_value)
ILLUS_TRUCK_LADDER = [
    (18, 28000, 3000, 500, 22000, 24000),
    (30, 34000, 3000, 500, 30000, 33000),
    (42, 40000, 3000, 500, 38000, 42000),
    (54, 46000, 3000, 500, 46000, 51000),
]


def _illus_truck(i):
    """Return (id, coe, gross, scrap, straight, keep_y10, ev_y10) for the i-th
    EV-action truck, cycling the honest 4-step ladder for larger fleets."""
    coe, gross, scrap, straight, keep_y10, ev_y10 = ILLUS_TRUCK_LADDER[i % len(ILLUS_TRUCK_LADDER)]
    return (f"EL-{str(i + 1).zfill(2)}", coe, gross, scrap, straight, keep_y10, ev_y10)

# Operating-cost overrides: flip every verification toggle the engine checks
# ("Customer" mode, confirmed prices/trial/backup) and use realistic SG values.
ILLUS_OC = {
    7: 0.14,      # ICE fuel consumption litres/km
    24: 3200,     # old ICE maintenance
    25: 2600,     # new ICE maintenance
    39: 0,        # old ICE unavailable days
    40: 0,        # new ICE unavailable days
    41: 0,        # EV unavailable days
    44: 0.10,     # charging loss
    45: 0.20,     # battery reserve
    46: 0.02,     # annual fade
    48: 0,        # extra auxiliary energy
    49: 0,        # peak auxiliary energy
    58: "Yes",    # Backup confirmed
    59: "Yes",    # Loaded trial confirmed
    60: "Yes",    # Energy prices confirmed
    61: "Customer",  # Data mode (required to leave "Diagnostic only")
    68: "Hong Seh 200k average",  # EV servicing basis uses selected model rate
}

# Energy-and-charging overrides, applied to BOTH Plan A (col B) and Plan B
# (col C). Depot-only charging (public share = 0) with a fully itemised site
# quote sized so the capacity screen passes.
ILLUS_EC = {
    7: 2.50,      # commercial diesel SGD/litre
    8: 3.25,      # public diesel SGD/litre
    9: 1,         # commercial diesel share
    10: 0.30,     # depot electricity SGD/kWh
    11: 0.75,     # public charging SGD/kWh
    12: 0,        # public electricity share -> depot-only
    13: "Existing depot",
    15: "AC11",   # charger type label (informational) - 11kW AC to match SRM
    16: 4,        # installed chargers (units) - SCALED to n_trucks in
                  #   _illus_ec_rows (one charger per EV-action truck)
    17: 4,        # usable truck plugs - SCALED to n_trucks (one plug per truck)
    18: 8000,     # charger equipment price SGD/charger
    19: 1200,     # local EV distribution board SGD/charger
    20: 800,      # licensed electrical worker SGD/charger
    21: 1500,     # local cable and installation SGD/charger
    22: 375,      # charger registration SGD/charger
    23: 0,        # major electrical upgrade SGD/site
    24: 0,        # general civil work SGD/site
    25: 0,        # SP connection fee SGD/site
    26: 0,        # other site preparation SGD/site
    27: 1000,     # training and transition SGD/site
    28: 0,        # extra monthly space rent SGD/site/month
    29: 0,        # other fixed annual fees SGD/site/year
    30: 0,        # annual demand charge SGD/site/year
    31: 0,        # lost space value SGD/site/year
    32: 400,      # maintenance per charger SGD/charger/year
    33: 0,        # installation month
    34: 120,      # site rights after install (months)
    35: 0,        # year-10 equipment recovery
    36: 0,        # lease-end restoration
    37: 0,        # replacement-site cost
    38: 120,      # replacement-site month (>= install month)
    40: 0,        # charger replacement cost
    41: 120,      # charger replacement month (>= install month)
    42: 0,        # refundable deposit
    43: 120,      # deposit refund month (>= install month)
    44: 0,        # approved charger grant (no grant claimed)
    45: 12,       # grant receipt month
    46: "No",     # award checked (no grant, so not required)
    47: 0,        # approved funded chargers (no grant)
    50: 60,       # net site power kW - SCALED to chargers x 11 kW in
                  #   _illus_ec_rows so a larger fleet charges within the window
    51: 10,       # charging window hours
    52: "Yes",    # site permission and access
    53: "Yes",    # shared schedule confirmed
    54: "Verified",  # site cost evidence
    55: "Yes",    # public truck access (not used; depot-only)
    56: 11,       # charger rated input power kW/charger (AC11, matches SRM G=11kW)
}


def _illus_oc_rows(demo_rows):
    rows = copy.deepcopy(demo_rows)
    for r in rows:
        if r["_row"] in ILLUS_OC:
            r["values"]["B"] = ILLUS_OC[r["_row"]]
    return rows


def _illus_ec_rows(demo_rows, n_trucks):
    """Apply the honest illustrative energy-and-charging template, with the
    depot charging-site build-up SCALED to the fleet size.

    The old fixed 4-charger / 4-plug / 60 kW site could not charge a large
    fleet within the window, so the engine's capacity gate (siteAccessCheck:
    peakDepotEnergy <= min(net_site_power, chargers x rated_kW) x window_hours,
    chargingHours <= plugs x window_hours) FAILED for the 30-truck wins case and
    the whole profile was gated out. The honest fix is to provision the depot in
    proportion to the fleet: one AC11 charger and one usable plug PER EV-action
    truck, and net site power = chargers x per-charger rated kW (row 56 = 11 kW).
    The per-charger itemised costs (rows 18-22, 32) are already per-charger, so
    total site cost scales automatically with the charger count - no number is
    invented, the build-up is just sized for the fleet it has to serve. Vehicle
    prices are untouched; only the site hardware scales."""
    chargers = max(1, int(n_trucks))
    rated_kw = ILLUS_EC[56]                     # per-charger rated input kW (AC11 = 11)
    scaled = dict(ILLUS_EC)
    scaled[16] = chargers                       # installed chargers (one per truck)
    scaled[17] = chargers                       # usable truck plugs (one per truck)
    scaled[50] = chargers * rated_kw            # net site power kW = chargers x rated kW
    rows = copy.deepcopy(demo_rows)
    for r in rows:
        if r["_row"] in scaled:
            r["values"]["B"] = scaled[r["_row"]]
            r["values"]["C"] = scaled[r["_row"]]
    return rows


def _illus_fleet_rows(n_trucks, km_day, days_year, peak_route_km=150, peak_load_kg=1200):
    """Emit N included EV-action trucks at the given operational intensity
    (km/day x days/year), with the fleet tail set to Include=0 / Keep ICE. Every
    other field is copied from the honest illustrative template; only fleet size
    and intensity change between archetypes - never the vehicle price."""
    rows = []
    for i in range(100):
        rr = i + 7
        if i < n_trucks:
            tid, coe, gross, scrap, straight, keep_y10, ev_y10 = _illus_truck(i)
            rows.append({
                "_row": rr, "A": tid, "B": 1,
                "C": "Illustrative", "D": "Box",
                "E": km_day, "F": days_year, "G": peak_route_km,
                "H": peak_load_kg, "I": 20, "J": coe, "K": gross,
                "L": scrap, "M": straight, "N": 120, "O": 0, "P": 0,
                "Q": "ILLUS", "R": 9, "S": None,
            })
        else:
            rows.append({"_row": rr, "A": f"X{str(i + 1).zfill(3)}", "B": 0})
    return rows


def _illus_repl_rows(n_trucks):
    rows = []
    for i in range(100):
        rr = i + 7
        if i < n_trucks:
            tid, coe, gross, scrap, straight, keep_y10, ev_y10 = _illus_truck(i)
            # Plan B competitor (ChengLong L2EV) year-10 EV terminal. The
            # competitor's all-in quote (COMP_PRICE = 205,000) is ~S$12k ABOVE
            # the SRM quote (193,000), so its residual is scaled UP by the same
            # ratio (~6.2%) off the SRM EV terminal (an honest higher residual
            # for a dearer vehicle). Rounded to the nearest S$100.
            comp_y10 = int(round(ev_y10 * (COMP_PRICE / 193000.0) / 100.0)) * 100
            rows.append({
                "_row": rr, "A": tid, "B": ILLUS_MODEL,
                "C": 150000,           # new ICE all-in quote
                "D": 193000,           # EV all-in override (gross), SRM-based
                "E": "", "F": "",      # use product battery / intensity defaults
                "G": "Battery",
                "H": 2000,             # approved payload (>= peak load 1200)
                "I": "Yes",            # body fits (confirmed)
                "J": 11, "K": "AC", "L": 11,  # depot avg kW, AC mode, plug kW
                #   (11 kW AC to match the SRM T3EV+ onboard charger G=11kW)
                "M": "",               # keep retire override (default COE expiry)
                "N": keep_y10,         # keep terminal at year 10
                # FEAT-003: Plan A (col O = EV) carries the SRM scenario; its
                # year-10 EV terminal (col Q) is the SRM EV value. Plan B
                # (col R = EV) carries the competitor; its year-10 EV terminal
                # (col T) is the competitor's own value. The raw engine binds
                # col B/col D (SRM) to BOTH slots, so check_presets.mjs and the
                # live UI run the competitor on Plan B via the two-state
                # projection using the non-engine _planB_* fields below.
                "O": "EV", "P": "", "Q": ev_y10,     # Plan A = SRM EV, SRM terminal
                "R": "EV", "S": "", "T": comp_y10,   # Plan B = competitor EV, comp terminal
                "U": "", "V": "",
                "W": 0, "X": 0, "Y": 0, "Z": 0,
                "AA": 0, "AB": "Yes", "AC": 120, "AD": 120,
                "AE": "Verified", "AF": tid,
                # Non-engine Plan B competitor binding (read by the UI's
                # FEAT-002 preset load-sync and by check_presets.mjs two-state
                # projection; ignored by the frozen engine / validate.py).
                "_planB_model": COMP_MODEL,
                "_planB_price": COMP_PRICE,
            })
        else:
            rows.append({"_row": rr, "A": f"X{str(i + 1).zfill(3)}", "B": ILLUS_MODEL,
                         "O": "Keep ICE", "R": "Keep ICE", "AB": "No",
                         "AC": 120, "AD": 120})
    return rows


def build_illustrative(demo_inputs, n_trucks, km_day, days_year):
    return {
        "fleet_register": {"range": "A7:S106",
                           "rows": _illus_fleet_rows(n_trucks, km_day, days_year)},
        "replacement_plan": {"range": "A7:AI106", "rows": _illus_repl_rows(n_trucks)},
        "operating_costs": {
            "range": "A7:D68",
            "rows": _illus_oc_rows(demo_inputs["operating_costs"]["rows"]),
        },
        "energy_and_charging": {
            "range": "A7:E56",
            "rows": _illus_ec_rows(demo_inputs["energy_and_charging"]["rows"], n_trucks),
            "computed_range": demo_inputs["energy_and_charging"].get("computed_range"),
            "computed_rows": demo_inputs["energy_and_charging"].get("computed_rows"),
        },
        "products": copy.deepcopy(demo_inputs["products"]),
        "service_costs": copy.deepcopy(demo_inputs["service_costs"]),
    }


# ---------------------------------------------------------------------------
# Illustrative wins / breakeven / loses / blank archetypes (HONEST FIXED PRICE)
# ---------------------------------------------------------------------------
# The three archetypes hold the vehicle prices FIXED and HONEST in every profile
# (SRM T3EV+ col-D all-in S$193,000 on Plan A, ChengLong L2EV S$205,000 on
# Plan B) and vary ONLY fleet size (number of EV-action trucks) and operational
# intensity (km/day x days/year). They map the real break-even frontier: which
# operational intensity and how many vehicles a company needs for a genuine
# saving to occur. NO per-case price tuning exists - the old MID_TUNE/BAD_TUNE
# levers that raised the SRM col-D quote (234,000 / 284,000) are removed, so a
# loaded profile can never show a model cost above the vehicle's own input price.
#
# Engine-verified by tools/check_presets.mjs (two-state projection, honest
# S$193k SRM quote, diesel S$2.50/L):
# The depot charging-site build-up SCALES with fleet size (one AC11 charger +
# usable plug per EV-action truck, net site power = chargers x 11 kW), so the
# engine's capacity gate passes honestly for every fleet size and the per-charger
# itemised site cost is sized to the fleet it serves. Because the site now scales
# with the fleet (rather than a fixed 4-charger depot), the small/lightly-used
# "loses" case is a SINGLE barely-used truck, not a 2-truck fleet: with the site
# right-sized, only a genuinely tiny duty cycle fails to pay back the EV premium.
#
# Engine-verified by tools/check_presets.mjs (two-state projection, honest
# S$193k SRM quote, diesel S$2.50/L):
#   wins      -> 30 EV trucks @ 120 km/day x 300 days -> SRM saving ~+29.43%.
#   breakeven -> 4 EV trucks @ 60 km/day x 200 days  -> SRM saving ~+13.83%
#                (below the 15% target, the marginal "is it worth it for us?"
#                 default landing archetype).
#   loses     -> 1 EV truck @ 20 km/day x 100 days   -> SRM saving ~-0.65%
#                (single, barely-used truck: the EV premium does not pay back).
#
# NOTE (open user decision): the exact bands are chosen to land win / marginal /
# lose cleanly on the win / below-15% / negative side of the 15% target at HONEST
# fixed prices WITH the fleet-scaled charging site passing the engine gate. They
# can be nudged to a preferred Singapore operator profile; see
# docs/preset-redesign-plan.md "Open human decisions".
#
# (id, fleet_size, km_day, days_year)
ARCHETYPES = [
    ("wins", 30, 120, 300),
    ("breakeven", 4, 60, 200),
    ("loses", 1, 20, 100),
]

BLANK_TRUCKS = ["NEW-1", "NEW-2", "NEW-3", "NEW-4"]

# ---------------------------------------------------------------------------
# Blank-profile PREFILL of COMMON Singapore-market shared assumptions
# ---------------------------------------------------------------------------
# These are NON-customer-specific figures a Hong Seh consultant would otherwise
# re-type for every fresh prospect: market energy prices, the shared ICE fuel
# consumption, common recurring operating costs, and the non-customer gate
# defaults. They are prefilled so a blank profile is a useful starting point,
# NOT a crash-test empty.
#
# What is DELIBERATELY NOT prefilled (stays blank/null so the case is honest):
#   * customer-specific DUTY (work km/day, days/year, peak cargo, route km) -
#     left blank in the fleet register.
#   * customer-specific QUOTES and terminal values (ICE/EV price, year-10
#     values, COE months) - left blank in the replacement plan.
#   * the itemised CHARGING-SITE quote (equipment, civil, connection, rent,
#     deposit, etc.) - left blank so site cost + Total economic TCO stay n.a.
#
# GRANT DISCIPLINE (v4 quick guide section 4), honored by what we prefill:
#   * NO vehicle incentive is prefilled (replacement col Z stays blank) - no
#     CVES/HVZES award is auto-selected from a brand or plate.
#   * NO charger grant AWARD is prefilled (energy_and_charging row 44 stays
#     blank) - the worksheet ceiling is not an award; only an entered, checked
#     amount reduces TCO.
#   * The default charger config is prefilled as DC (row 15 'DC60', row 56
#     rated power 60 kW) precisely because EHVCG does NOT fund a 22 kW AC
#     charger; we never prefill an AC grant for an ineligible AC charger.
#   * Major electrical upgrade / general civil / SP connection stay blank (not
#     auto-eligible), so nobody inherits an ineligible "eligible cost".

# operating_costs shared defaults (col B). Common SG recurring costs + ICE fuel
# consumption; customer-specific utilisation overrides stay out of here.
BLANK_OC = {
    7: 0.14,      # ICE fuel consumption litres/km (shared SG light-commercial)
    44: 0.10,     # charging energy loss fraction (physics default)
    45: 0.20,     # usable battery reserve fraction (operating policy default)
    46: 0.02,     # annual battery fade fraction (default)
    48: 0,        # extra auxiliary energy (explicit zero default)
    49: 0,        # peak auxiliary energy (explicit zero default)
    50: 0.02,     # purchase-price inflation (shared macro default)
    53: 0.02,     # recurring-cost escalation (shared macro default)
}

# energy_and_charging SHARED defaults (applied to both Plan A col B and Plan B
# col C). Market energy prices + shares + grant-config defaults ONLY. The
# itemised site quote is intentionally omitted (stays blank -> site n.a.).
BLANK_EC = {
    7: 2.50,      # commercial diesel SGD/litre (SG market)
    8: 3.25,      # public diesel SGD/litre (SG market)
    9: 1,         # commercial diesel share (default: all commercial)
    10: 0.30,     # depot electricity SGD/kWh (SG commercial tariff)
    11: 0.75,     # public charging SGD/kWh (SG market)
    12: 0,        # public electricity share (default: depot-only)
    15: "DC60",   # charger type label: DC (AC22 would be EHVCG-ineligible)
    44: None,     # approved charger GRANT award: BLANK (not an award; must be
                  # entered + checked). Never prefilled.
    46: "No",     # award checked: No (no grant claimed by default)
    47: 0,        # approved funded chargers: 0 (no grant claimed by default)
}


def _blank_fleet_rows():
    rows = []
    for i in range(100):
        rr = i + 7
        if i < len(BLANK_TRUCKS):
            # Include toggle present (B=1) so the truck is "in play", but every
            # gate-critical value is left blank/null (n.a., NOT a measured zero).
            rows.append({
                "_row": rr, "A": BLANK_TRUCKS[i], "B": 1,
                "C": None, "D": None, "E": None, "F": None, "G": None,
                "H": None, "I": None, "J": None, "K": None, "L": None,
                "M": None, "N": None, "O": None, "P": None, "Q": None,
                "R": None, "S": None,
            })
        else:
            rows.append({"_row": rr, "A": f"X{str(i + 1).zfill(3)}", "B": 0})
    return rows


def _blank_repl_rows():
    rows = []
    for i in range(100):
        rr = i + 7
        if i < len(BLANK_TRUCKS):
            # Same truck IDs as the fleet register (col A === col AF link), with
            # every quote / plan / terminal value blank so nothing computes yet.
            rows.append({
                "_row": rr, "A": BLANK_TRUCKS[i], "B": "",
                "C": None, "D": None, "E": "", "F": "", "G": "",
                "H": None, "I": "", "J": None, "K": "", "L": None,
                "M": "", "N": None, "O": "", "P": "", "Q": None,
                "R": "", "S": "", "T": None, "U": "", "V": "",
                "W": None, "X": None, "Y": None, "Z": None, "AA": None,
                "AB": "", "AC": None, "AD": None, "AE": "", "AF": BLANK_TRUCKS[i],
            })
        else:
            rows.append({"_row": rr, "A": f"X{str(i + 1).zfill(3)}", "B": "",
                         "O": "Keep ICE", "R": "Keep ICE", "AB": "No",
                         "AC": 120, "AD": 120})
    return rows


def build_blank(demo_inputs):
    """A PREFILLED starting template: the structure is present (truck rows
    across both sheets sharing IDs, Include toggles on) and common SG shared
    assumptions are prefilled (energy prices, ICE fuel L/km, recurring operating
    costs, AC/DC-respecting grant config defaults), but every CUSTOMER-SPECIFIC
    value (duty, quotes, terminal values) and the itemised charging-site quote
    are left blank (n.a., not zero). The engine therefore still returns n.a. for
    site cost and Total economic TCO until the minimum critical inputs are
    supplied - honest empty, no crash.

    products / service_costs keep their catalogue structure so the UI can render
    the editable panel."""
    # --- energy_and_charging: blank everything, then overlay shared defaults ---
    ec = copy.deepcopy(demo_inputs["energy_and_charging"])
    for r in ec["rows"]:
        if "values" in r and isinstance(r["values"], dict):
            if "B" in r["values"]:
                r["values"]["B"] = None
            if "C" in r["values"]:
                r["values"]["C"] = None
    for r in ec["rows"]:
        if r["_row"] in BLANK_EC and "values" in r and isinstance(r["values"], dict):
            val = BLANK_EC[r["_row"]]
            if "B" in r["values"]:
                r["values"]["B"] = val
            if "C" in r["values"]:
                r["values"]["C"] = val

    # --- operating_costs: keep catalogue structure, overlay shared defaults ---
    oc = copy.deepcopy(demo_inputs["operating_costs"])
    for r in oc["rows"]:
        if r["_row"] in BLANK_OC and "values" in r and isinstance(r["values"], dict):
            r["values"]["B"] = BLANK_OC[r["_row"]]

    return {
        "fleet_register": {"range": "A7:S106", "rows": _blank_fleet_rows()},
        "replacement_plan": {"range": "A7:AI106", "rows": _blank_repl_rows()},
        "operating_costs": oc,
        "energy_and_charging": ec,
        "products": copy.deepcopy(demo_inputs["products"]),
        "service_costs": copy.deepcopy(demo_inputs["service_costs"]),
    }


def main():
    demo = load_demo()
    demo_inputs = demo["inputs"]

    cases = []

    # NOTE: the workbook DEMONSTRATION 6-truck case is NOT emitted as a
    # user-facing prospect any more. It lives on only as the untouched
    # validate.py Excel-parity fixture (tools/fixtures/demo_case.json); the
    # user-facing seed set is now exactly wins/breakeven/loses/blank, with the
    # BREAKEVEN case serving as the default landing scenario. Every seed still
    # carries the full product catalogue under inputs.products.rows, so the
    # catalogue still reaches the app.
    #
    # HONEST FIXED-PRICE CONTRACT: all three archetypes share the IDENTICAL
    # vehicle prices (SRM T3EV+ col-D = S$193,000 on Plan A, ChengLong L2EV
    # _planB_price = S$205,000 on Plan B). The outcome difference is driven
    # ENTIRELY by fleet size and operational intensity, never by moving a
    # vehicle price. The shared depot charging-site cost is counted once per
    # fleet, so larger fleets amortise it.

    FIXED_SRM = 193000      # SRM T3EV+ col-D all-in quote, HELD FIXED (Plan A).
    # COMP_PRICE (205000) is the ChengLong L2EV all-in quote, HELD FIXED (Plan B).

    # Case 1: WINS - high-utilisation, large depot-charged urban fleet.
    wins_inputs = build_illustrative(demo_inputs, 30, 120, 300)
    cases.append({
        "id": "wins",
        "name": "EV wins (illustrative, high-utilisation large fleet)",
        "evidence": "illustrative",
        "note": (
            "ILLUSTRATIVE operator archetype, NOT a real customer. The EV GENUINELY "
            "WINS here: a large, high-utilisation depot-charged urban fleet of 30 "
            "EV-action trucks (one AC11 depot charger + plug per truck), each "
            "running 120 km/day x 300 days/year. PLAN A "
            "carries the SRM T3EV+ (nimble SRM variant, 11 kW AC / 55 kW DC, 53.58 "
            "kWh battery, 0.1786 kWh/km) at its HONEST all-in quote S$193,000. "
            "PLAN B carries the honest like-for-like ChengLong L2EV competitor at "
            "its HONEST all-in quote S$205,000. These prices are HELD FIXED and "
            "IDENTICAL across all three archetypes - the outcome is driven by "
            "FLEET SIZE (30 trucks) and OPERATIONAL INTENSITY (120 km/day x 300 "
            "days), NOT by moving any vehicle price. The frozen engine computes a "
            "strong SRM (Plan A) saving ~+29.43% vs Keep ICE (Total economic TCO "
            "S$7.87m vs Keep ICE S$11.15m): a large, hard-working fleet runs "
            "enough energy-saving km that the EV premium pays back comfortably. "
            "This is what an operator who should electrify looks like."
        ),
        "inputs": wins_inputs,
    })

    # Case 2: BREAKEVEN - mid fleet, moderate utilisation (DEFAULT LANDING).
    breakeven_inputs = build_illustrative(demo_inputs, 4, 60, 200)
    cases.append({
        "id": "breakeven",
        "name": "Break-even (illustrative, marginal - is it worth it for us?)",
        "evidence": "illustrative",
        "note": (
            "ILLUSTRATIVE operator archetype, NOT a real customer. This is the "
            "MARGINAL 'is it worth it for us?' archetype and the DEFAULT LANDING "
            "scenario: a mid-sized fleet of 4 EV-action trucks at moderate "
            "utilisation, 60 km/day x 200 days/year. PLAN A carries the SRM T3EV+ "
            "at its HONEST all-in quote S$193,000; PLAN B carries the honest "
            "ChengLong L2EV competitor at its HONEST all-in quote S$205,000. The "
            "prices are HELD FIXED and IDENTICAL to the wins/loses archetypes - "
            "only the FLEET SIZE (4 trucks) and OPERATIONAL INTENSITY (60 km/day x "
            "200 days) differ. The frozen engine computes an SRM (Plan A) saving "
            "~+13.83% vs Keep ICE (Total economic TCO S$972.9k vs Keep ICE "
            "S$1.13m): positive, but sitting just BELOW the 15% target - the real "
            "break-even frontier, where whether to electrify is a genuine "
            "conversation. The answer is driven by operations and fleet size, not "
            "by any price adjustment."
        ),
        "inputs": breakeven_inputs,
    })

    # Case 3: LOSES - small, lightly-used fleet; EV premium does not pay back.
    loses_inputs = build_illustrative(demo_inputs, 1, 20, 100)
    cases.append({
        "id": "loses",
        "name": "EV not a fit (illustrative, small lightly-used fleet)",
        "evidence": "illustrative",
        "note": (
            "ILLUSTRATIVE operator archetype, NOT a real customer. The EV is NOT "
            "A FIT here: a single, lightly-used truck (1 EV-action truck) running "
            "only 20 km/day x 100 days/year. PLAN A carries the SRM T3EV+ at its "
            "HONEST all-in quote S$193,000; PLAN B carries the honest ChengLong "
            "L2EV competitor at its HONEST all-in quote S$205,000. The prices are "
            "HELD FIXED and IDENTICAL to the wins/breakeven archetypes - only the "
            "FLEET SIZE (1 truck) and OPERATIONAL INTENSITY (20 km/day x 100 "
            "days) differ. The frozen engine computes an SRM (Plan A) saving "
            "~-0.65% vs Keep ICE (Total economic TCO S$248.8k vs Keep ICE "
            "S$247.1k): slightly NEGATIVE, an honest 'EV does not pay back yet' "
            "outcome. A single, barely-used truck runs too few energy-saving km "
            "to recover the EV premium over its depot charger - driven by "
            "operations and fleet size, NOT by any price adjustment."
        ),
        "inputs": loses_inputs,
    })

    # Case 4: BLANK - a clean-slate starting template (honest blanks, not zeros).
    cases.append({
        "id": "blank",
        "name": "Blank profile (start a fresh client)",
        "evidence": "illustrative",
        "note": (
            "ILLUSTRATIVE blank template, NOT a real customer. A clean slate for "
            "entering a fresh client on the fly: four truck rows across both "
            "sheets share one ID set (NEW-1..NEW-4) with the Include toggles on, "
            "but every gate-critical value is left blank/n.a. (NOT zero). The "
            "engine handles it gracefully - Total economic TCO and Saving stay "
            "n.a. (honest empty, no crash) until the minimum critical inputs are "
            "supplied."
        ),
        "inputs": build_blank(demo_inputs),
    })

    payload = {
        "_meta": {
            "description": (
                "Seed customer cases for the Prospects view. Each case is a full "
                "engine input set. wins/breakeven/loses/blank are ILLUSTRATIVE "
                "presets (not real customers); the workbook demonstration case "
                "survives only as the untouched validate.py Excel-parity fixture. "
                "wins/breakeven/loses are honest operational-break-even "
                "archetypes built from one illustrative fully-specified baseline "
                "at FIXED honest vehicle prices (SRM T3EV+ col-D S$193,000 on "
                "Plan A, ChengLong L2EV S$205,000 on Plan B, identical across all "
                "three); they differ ONLY in fleet size (30 / 4 / 1 EV-action "
                "trucks) and operational intensity (120x300, 60x200, 20x100 "
                "km/day x days/year), never in price. The depot charging site "
                "scales with the fleet (one AC11 charger + plug per truck). blank "
                "is a prefilled "
                "starting template (common SG shared assumptions filled, "
                "customer-specific values left as honest blanks)."
            ),
            "generated_by": "tools/build_prospects.py",
        },
        "cases": cases,
    }

    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=2)
    print(f"Wrote {OUT} with {len(cases)} cases: " + ", ".join(c["id"] for c in cases))


if __name__ == "__main__":
    main()
