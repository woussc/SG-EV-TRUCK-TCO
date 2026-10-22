#!/usr/bin/env python3
"""Emit the seed prospect cases for the Prospects view as a single JSON file.

Each case is a full input set (fleet_register / replacement_plan /
operating_costs / energy_and_charging / products / service_costs) in the same
shape consumed by src/engine.js -> computeFleet(inputs).

Cases:
  1. demo          - the frozen DEMONSTRATION 6-truck case (from the workbook).
  2. yong_wen      - documented 5-truck ambient-cohort reconstruction (Plan B
                     = every truck replaced by an EV at COE expiry).
  3. venus         - documented 3-truck replenishment reconstruction.

The Yong Wen / Venus input sets are produced by tools/html_scenarios.py, the
architect's documented reconstruction of the reference-HTML scenarios
("Hong Seh - Yong Wen and Venus EV Fleet Simulations - 04-Oct-2026.html").
They are flagged as assumptions in the UI. Output is written to
tools/fixtures/prospect_seeds.json and inlined into index.html by
tools/build_index.js.

Run:  python SG-EV-TRUCK-TCO/tools/build_prospects.py
This script makes NO network calls and has NO third-party dependencies beyond
the repo's own tools.
"""

from __future__ import annotations

import copy
import json
import os

import html_scenarios as hs


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


def main():
    demo = load_demo()
    demo_inputs = demo["inputs"]

    cases = []

    # Case 0: illustrative, fully-specified confirmed-win demonstrator.
    cases.append({
        "id": "evergreen",
        "name": "Evergreen Logistics (illustrative, fully specified)",
        "evidence": "illustrative",
        "note": (
            "ILLUSTRATIVE assumption case, NOT a real customer. Every input is "
            "a realistic Singapore-market figure chosen so the model passes all "
            "gates: vehicle service/evidence 'Within entered limits', charging-"
            "site 'Complete' with an itemised depot quote, 'Within entered site "
            "limits', a numeric Total economic TCO and a positive Saving vs Keep "
            "ICE. It shows what a confirmed-win prospect looks like once the "
            "charging-site quote and verification evidence are supplied, in "
            "contrast to the reconstruction cases below that stay diagnostic-"
            "only pending their site quotes."
        ),
        "inputs": build_illustrative(demo_inputs),
    })

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

    # Case 2: Yong Wen 5-truck ambient cohort (Plan B = full EV).
    cases.append({
        "id": "yong_wen",
        "name": "Yong Wen (5-truck ambient cohort)",
        "evidence": "assumption",
        "note": (
            "Reconstructed from the reference-HTML simulation (sections 5, 5.1, "
            "6-8). Plan B replaces every truck with an EV at COE expiry. "
            "Charging-site line items are not itemised in the published source, "
            "so the EV site cost stays n.a.; see README residual note."
        ),
        "inputs": hs.build_scenario(demo_inputs, "yong_wen", keep_plan=False),
    })

    # Case 3: Venus 3-truck replenishment (Plan B = full EV).
    cases.append({
        "id": "venus",
        "name": "Venus (3-truck replenishment)",
        "evidence": "assumption",
        "note": (
            "Reconstructed from the reference-HTML simulation (sections 5, 5.1, "
            "6-8). Plan B replaces every truck with an EV at COE expiry. "
            "Charging-site line items are not itemised in the published source, "
            "so the EV site cost stays n.a.; see README residual note."
        ),
        "inputs": hs.build_scenario(demo_inputs, "venus", keep_plan=False),
    })

    payload = {
        "_meta": {
            "description": (
                "Seed customer cases for the Prospects view. Each case is a full "
                "engine input set. Yong Wen / Venus are documented reconstructions "
                "(assumptions), not confirmed customer figures."
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
