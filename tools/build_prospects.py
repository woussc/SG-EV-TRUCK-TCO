#!/usr/bin/env python3
"""Emit the seed prospect cases for the Prospects view as a single JSON file.

Each case is a full input set (fleet_register / replacement_plan /
operating_costs / energy_and_charging / products / service_costs) in the same
shape consumed by src/engine.js -> computeFleet(inputs).

Cases:
  1. demo          - the frozen DEMONSTRATION 6-truck case (from the workbook).
  2. best          - ILLUSTRATIVE best case: a fully-specified, gate-passing
                     input set (strong positive saving). It is a GENERIC
                     illustrative confirmed-win demonstrator, NOT a named
                     customer. Engine-verified best EV plan PLAN_B.
  3. mid           - ILLUSTRATIVE mid case: the same input set with the
                     high-impact drivers tuned (higher EV quote, lower diesel
                     price, lighter utilisation) so the best-EV-plan saving is
                     marginal but still > 0, all gates still passing.
  4. bad           - ILLUSTRATIVE bad case: tuned further (EV quote high,
                     diesel low) so the EV does NOT beat Keep ICE: a negative
                     saving. Still scores via the gate (honest "not a fit").
  5. blank         - ILLUSTRATIVE blank profile: a starting template with a
                     shared truck-ID set and Include toggles present. Common
                     Singapore-market SHARED assumptions (energy prices, ICE
                     fuel L/km, recurring operating costs, AC/DC-respecting
                     grant defaults, non-customer gate defaults) are prefilled,
                     while every CUSTOMER-SPECIFIC duty/quote/terminal value is
                     left blank/n.a. (NOT zero), so computeFleet still returns
                     n.a. honestly until the minimum critical inputs are added.

NONE of these are real named customers. Every figure is a realistic
Singapore-market illustration. The best/mid/bad numbers are derived from the
previously tabulated model behaviour (the illustrative fully-specified baseline
and the sensitivity sweep in docs/input-sensitivity-findings.md): best EV plan
PLAN_B, Total economic TCO S$1,147,129, Saving 22.81%, Keep ICE total
S$1,486,117. The high-
impact drivers tuned for mid/bad are, in rank order, the EV purchase quote
(rank 1, ~14% lever), the commercial diesel price (rank 4) and the duty
intensity (work km/day + days/year, ranks 6-7).

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

ILLUS_MODEL = "ChengLong L2EV"  # Products row 9: AC 22 kW, DC 120 kW, 86.55 kWh.

# Per-truck register (id, coe_months_left, market_value_now, scrap,
#   straight_line_per_month, keep_year10_value, ev_year10_value).
# Four trucks staged across COE expiries so EVs are deployed by year 10.
ILLUS_TRUCKS = [
    ("EL-01", 18, 28000, 3000, 500, 22000, 24000),
    ("EL-02", 30, 34000, 3000, 500, 30000, 33000),
    ("EL-03", 42, 40000, 3000, 500, 38000, 42000),
    ("EL-04", 54, 46000, 3000, 500, 46000, 51000),
]
ILLUS_WORKLOAD = {"km_year": 36000, "days": 300, "peak_route_km": 150, "peak_load_kg": 1200}

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
    15: "AC22",   # charger type label (informational)
    16: 4,        # installed chargers (units)
    17: 4,        # usable truck plugs
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
    50: 60,       # net site power kW
    51: 10,       # charging window hours
    52: "Yes",    # site permission and access
    53: "Yes",    # shared schedule confirmed
    54: "Verified",  # site cost evidence
    55: "Yes",    # public truck access (not used; depot-only)
    56: 22,       # charger rated input power kW/charger (AC22)
}


def _illus_oc_rows(demo_rows):
    rows = copy.deepcopy(demo_rows)
    for r in rows:
        if r["_row"] in ILLUS_OC:
            r["values"]["B"] = ILLUS_OC[r["_row"]]
    return rows


def _illus_ec_rows(demo_rows):
    rows = copy.deepcopy(demo_rows)
    for r in rows:
        if r["_row"] in ILLUS_EC:
            r["values"]["B"] = ILLUS_EC[r["_row"]]
            r["values"]["C"] = ILLUS_EC[r["_row"]]
    return rows


def _illus_fleet_rows():
    wl = ILLUS_WORKLOAD
    work_km_day = round(wl["km_year"] / wl["days"], 6)
    rows = []
    for i in range(100):
        rr = i + 7
        if i < len(ILLUS_TRUCKS):
            tid, coe, gross, scrap, straight, keep_y10, ev_y10 = ILLUS_TRUCKS[i]
            rows.append({
                "_row": rr, "A": tid, "B": 1,
                "C": "Illustrative", "D": "Box",
                "E": work_km_day, "F": wl["days"], "G": wl["peak_route_km"],
                "H": wl["peak_load_kg"], "I": 20, "J": coe, "K": gross,
                "L": scrap, "M": straight, "N": 120, "O": 0, "P": 0,
                "Q": "ILLUS", "R": 9, "S": None,
            })
        else:
            rows.append({"_row": rr, "A": f"X{str(i + 1).zfill(3)}", "B": 0})
    return rows


def _illus_repl_rows():
    rows = []
    for i in range(100):
        rr = i + 7
        if i < len(ILLUS_TRUCKS):
            tid, coe, gross, scrap, straight, keep_y10, ev_y10 = ILLUS_TRUCKS[i]
            rows.append({
                "_row": rr, "A": tid, "B": ILLUS_MODEL,
                "C": 150000,           # new ICE all-in quote
                "D": 205000,           # EV all-in override (gross)
                "E": "", "F": "",      # use product battery / intensity defaults
                "G": "Battery",
                "H": 2000,             # approved payload (>= peak load 1200)
                "I": "Yes",            # body fits (confirmed)
                "J": 22, "K": "AC", "L": 22,  # depot avg kW, AC mode, plug kW
                "M": "",               # keep retire override (default COE expiry)
                "N": keep_y10,         # keep terminal at year 10
                "O": "EV", "P": "", "Q": keep_y10,   # Plan A = EV at COE expiry
                "R": "EV", "S": "", "T": ev_y10,     # Plan B = EV at COE expiry
                "U": "", "V": "",
                "W": 0, "X": 0, "Y": 0, "Z": 0,
                "AA": 0, "AB": "Yes", "AC": 120, "AD": 120,
                "AE": "Verified", "AF": tid,
            })
        else:
            rows.append({"_row": rr, "A": f"X{str(i + 1).zfill(3)}", "B": ILLUS_MODEL,
                         "O": "Keep ICE", "R": "Keep ICE", "AB": "No",
                         "AC": 120, "AD": 120})
    return rows


def build_illustrative(demo_inputs):
    return {
        "fleet_register": {"range": "A7:S106", "rows": _illus_fleet_rows()},
        "replacement_plan": {"range": "A7:AI106", "rows": _illus_repl_rows()},
        "operating_costs": {
            "range": "A7:D68",
            "rows": _illus_oc_rows(demo_inputs["operating_costs"]["rows"]),
        },
        "energy_and_charging": {
            "range": "A7:E56",
            "rows": _illus_ec_rows(demo_inputs["energy_and_charging"]["rows"]),
            "computed_range": demo_inputs["energy_and_charging"].get("computed_range"),
            "computed_rows": demo_inputs["energy_and_charging"].get("computed_rows"),
        },
        "products": copy.deepcopy(demo_inputs["products"]),
        "service_costs": copy.deepcopy(demo_inputs["service_costs"]),
    }


# ---------------------------------------------------------------------------
# Illustrative best / mid / bad / blank presets
# ---------------------------------------------------------------------------
# best = a deep copy of the fully-specified illustrative input set. Its best EV
#   plan is PLAN_B with a strong positive saving (Total ~S$1,147,129, Saving
#   ~22.81% vs Keep ICE ~S$1,486,117, matching the sensitivity baseline).
#
# mid / bad are the SAME input set with the high-impact drivers tuned (ranked by
# docs/input-sensitivity-findings.md): EV purchase quote (rank 1), commercial
# diesel price (rank 4) and duty intensity (work km/day + days/year, ranks 6-7).
# The magnitudes below are engine-verified by tools/check_presets.mjs:
#   mid -> best EV plan PLAN_B, Total ~S$1,263,882, Saving ~+5.62% (marginal).
#   bad -> best EV plan PLAN_B, Total ~S$1,407,129, Saving ~-4.70% (not a fit).

# (ev_quote, diesel_price_sgd_l, km_factor, days_factor)
MID_TUNE = {"ev_quote": 240000, "diesel": 2.10, "km_factor": 0.9, "days_factor": 0.95}
BAD_TUNE = {"ev_quote": 270000, "diesel": 1.80, "km_factor": 1.0, "days_factor": 1.0}

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


def _ec_row(rows, n):
    for r in rows:
        if r["_row"] == n:
            return r
    return None


def tune_illustrative(inputs, tune):
    """Return a deep copy of an illustrative input set with the high-impact
    drivers overridden. Only the ranked levers are touched so the case stays an
    honest variation of the fully-specified baseline (all gates still cleared)."""
    out = copy.deepcopy(inputs)
    # Rank 1: EV purchase quote (replacement_plan col D) across every EV truck.
    for r in out["replacement_plan"]["rows"]:
        if r.get("A") is not None and isinstance(r.get("D"), (int, float)):
            r["D"] = tune["ev_quote"]
    # Rank 4: commercial diesel price (energy_and_charging row 7, Plan A col B
    # and Plan B col C mirror).
    ec7 = _ec_row(out["energy_and_charging"]["rows"], 7)
    if ec7 is not None and "values" in ec7:
        ec7["values"]["B"] = tune["diesel"]
        ec7["values"]["C"] = tune["diesel"]
    # Ranks 6-7: duty intensity (work km/day col E, days/year col F) across the
    # included trucks.
    if tune["km_factor"] != 1.0 or tune["days_factor"] != 1.0:
        for r in out["fleet_register"]["rows"]:
            if r.get("B") == 1:
                if isinstance(r.get("E"), (int, float)):
                    r["E"] = round(r["E"] * tune["km_factor"], 6)
                if isinstance(r.get("F"), (int, float)):
                    r["F"] = int(round(r["F"] * tune["days_factor"]))
    return out


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

    illustrative = build_illustrative(demo_inputs)

    # Case 1: the demonstration 6-truck case straight from the workbook.
    cases.append({
        "id": "demo",
        "name": "DEMONSTRATION 6-truck case",
        "evidence": "assumption",
        "note": (
            "Workbook demonstration defaults. Not a customer savings claim. "
            "Plan A/B have no itemised charging-site quote, so site cost and "
            "Total economic TCO stay n.a. (diagnostic only)."
        ),
        "inputs": demo_inputs,
    })

    # Case 2: BEST - the fully-specified illustrative confirmed-win set.
    cases.append({
        "id": "best",
        "name": "Best case (illustrative, fully specified, gates pass)",
        "evidence": "illustrative",
        "note": (
            "ILLUSTRATIVE confirmed-win demonstrator, NOT a real customer. A "
            "fully-specified, gate-passing scenario built from realistic "
            "Singapore-market figures: vehicle service/evidence 'Within entered "
            "limits', charging-site 'Complete' with an itemised depot quote, "
            "'Within entered site limits', a numeric Total economic TCO and a "
            "positive Saving vs Keep ICE. Its best EV plan is PLAN_B with a "
            "strong positive saving: Total economic TCO ~S$1,147,129, Saving "
            "~22.81% vs Keep ICE ~S$1,486,117 (the sensitivity-sweep baseline). "
            "This is what a confirmed win looks like once the charging-site "
            "quote and verification evidence are supplied, in contrast to the "
            "illustrative mid/bad/blank presets."
        ),
        "inputs": copy.deepcopy(illustrative),
    })

    # Case 3: MID - high-impact drivers tuned so the saving is marginal but > 0.
    cases.append({
        "id": "mid",
        "name": "Mid case (illustrative, marginal saving)",
        "evidence": "illustrative",
        "note": (
            "ILLUSTRATIVE preset, NOT a real customer. The best-case input set "
            "with the high-impact drivers tuned per docs/input-sensitivity-"
            "findings.md: EV purchase quote raised to S$240,000 (rank 1), "
            "commercial diesel price lowered to S$2.10/L (rank 4) and duty "
            "intensity trimmed (work km/day -10%, days/year -5%, ranks 6-7). All "
            "gates still pass; the best EV plan (PLAN_B) keeps a numeric Total "
            "economic TCO ~S$1,263,882 but the Saving narrows to ~+5.62% - still "
            "worth it, but marginal."
        ),
        "inputs": tune_illustrative(illustrative, MID_TUNE),
    })

    # Case 4: BAD - tuned further so EV does NOT beat Keep ICE (negative saving).
    cases.append({
        "id": "bad",
        "name": "Bad case (illustrative, EV not a fit)",
        "evidence": "illustrative",
        "note": (
            "ILLUSTRATIVE preset, NOT a real customer. The same input set tuned "
            "further against the EV: EV purchase quote pushed to S$270,000 and "
            "commercial diesel price dropped to S$1.80/L. The gates still pass "
            "(the figures are honest and complete) but the best EV plan (PLAN_B) "
            "now costs MORE than Keep ICE: Total economic TCO ~S$1,407,129, a "
            "Saving of ~-4.70% - an honest 'EV is not a fit right now' outcome, "
            "not a crash and not a hidden failure."
        ),
        "inputs": tune_illustrative(illustrative, BAD_TUNE),
    })

    # Case 5: BLANK - a clean-slate starting template (honest blanks, not zeros).
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
                "engine input set. best/mid/bad/blank are ILLUSTRATIVE presets "
                "(not real customers); demo is the workbook demonstration case. "
                "best/mid/bad are derived from the illustrative fully-specified "
                "sensitivity baseline; blank is a prefilled starting template "
                "(common SG shared assumptions filled, customer-specific values "
                "left as honest blanks)."
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
