#!/usr/bin/env python3
"""Documented reconstruction of the reference-HTML Yong Wen / Venus scenarios.

Source: "Hong Seh - Yong Wen and Venus EV Fleet Simulations - 04-Oct-2026.html"
sections 5, 5.1 and 6-8. Every figure below is quoted from that document's
"Value used" column. These synthetic registers and assumptions are the closest
reconstruction buildable from the published sources; where the HTML leaves a
detail implicit we reuse the workbook's demonstration default.

The scenarios are built by cloning the demo fixture's input sheets and
overriding the HTML-specified values, so they exercise the exact same
src/engine.js math as the demo. They feed the "full-EV" plan (Plan B: every
truck replaced by an EV at COE expiry) and the Keep-ICE baseline.
"""

from __future__ import annotations

import copy


# --- Operating-costs overrides (Operating costs!B, by row) --------------------
# From HTML section 5 "Common vehicle, energy and ownership assumptions".
OC_OVERRIDES = {
    7: 0.14,    # ICE fuel consumption (old) litres/km
    10: 0,      # fuel queue/service min/visit -> use HTML 'incremental station/plug time' boundary
    17: 0,      # other EV paid time
    19: 18,     # avoidable paid time rate S$/hour (HTML: S$18/hour)
    24: 3500,   # old ICE maintenance
    25: 2500,   # new ICE maintenance
    26: 1800,   # EV maintenance annual override (basis switched to override below)
    27: 600,    # ICE tyres
    28: 660,    # EV tyres
    29: 1800,   # ICE insurance
    30: 2300,   # EV insurance
    31: 656,    # ICE road tax
    32: 774,    # EV road tax / AFC
    34: 0,      # old ICE other cost (not itemised separately in HTML)
    35: 0,      # new ICE other cost
    36: 0,      # EV other cost
    39: 4,      # old ICE unavailable days
    40: 2,      # new ICE unavailable days
    41: 3,      # EV unavailable days
    42: 200,    # ICE all-in backup rate
    43: 200,    # EV all-in backup rate
    44: 0.10,   # charging loss
    45: 0.20,   # battery reserve
    46: 0.02,   # annual fade
    48: 2,      # extra auxiliary energy (2 kWh average/day)
    49: 3,      # peak auxiliary energy (3 kWh peak/day)
    54: 0.05,   # discount rate (NPV only; main TCO undiscounted)
    56: 5000,   # new ICE terminal value / immediate EV year-10 = 5,000
    57: 93000,  # fallback EV COE
    64: 8000,   # EV scheduled repair reserve
    65: 84,     # EV repair month after purchase
    68: "Annual override",  # EV servicing basis (HTML uses a flat S$1,800/yr)
}

# Energy and charging overrides (both Plan A col B and Plan B col C).
EC_OVERRIDES = {
    7: 2.50,    # commercial diesel
    8: 3.25,    # public diesel
    10: 0.30,   # depot electricity
    11: 0.75,   # public charging
    12: 0.0,    # public electricity share (full depot charging)
}


def _oc_rows(demo_rows):
    rows = copy.deepcopy(demo_rows)
    for r in rows:
        if r["_row"] in OC_OVERRIDES:
            r["values"]["B"] = OC_OVERRIDES[r["_row"]]
    return rows


def _ec_rows(demo_rows):
    rows = copy.deepcopy(demo_rows)
    for r in rows:
        if r["_row"] in EC_OVERRIDES:
            r["values"]["B"] = EC_OVERRIDES[r["_row"]]
            r["values"]["C"] = EC_OVERRIDES[r["_row"]]
    return rows


# Per-truck register from HTML section 5.1.
#   (id, coe_months_left, current_gross_value, scrap, coe_paid, keep_y10,
#    staged_ev_y10)
# current gross value = 3000 + (coe/120)*84000 ; keep y10 = 5000+(coe/120)*110000
# staged EV y10 = 5000 + (coe/120)*115000 ; new-ICE immediate y10 = 5000
YONG_WEN = [
    ("T001", 12, 11400, 3000, 60000, 16000, 16500),
    ("T002", 24, 19800, 3000, 60000, 27000, 28000),
    ("T003", 36, 28200, 3000, 60000, 38000, 39500),
    ("T004", 48, 36600, 3000, 60000, 49000, 51000),
    ("T005", 60, 45000, 3000, 60000, 60000, 62500),
]
VENUS = [
    ("T001", 24, 19800, 3000, 60000, 27000, 28000),
    ("T002", 48, 36600, 3000, 60000, 49000, 51000),
    ("T003", 72, 53400, 3000, 60000, 71000, 74000),
]

# Common workload per company (HTML section 6/8 "Tested workload").
#   km/truck/year ; the HTML uses 300 working days -> work km/day.
WORKLOADS = {
    "yong_wen": {"km_year": 25140, "days": 300},
    "venus": {"km_year": 17368, "days": 300},
}


def _fleet_rows(register, days, km_year):
    work_km_day = round(km_year / days, 6)
    rows = []
    for i in range(100):
        rr = i + 7
        if i < len(register):
            tid, coe, gross, scrap, coe_paid, keep_y10, ev_y10 = register[i]
            rows.append({
                "_row": rr, "A": tid, "B": 1,
                "C": "HTML", "D": "Box",
                "E": work_km_day, "F": days, "G": 165, "H": 1200,
                "I": 24, "J": coe, "K": gross, "L": scrap,
                "M": coe_paid, "N": 120, "O": 0, "P": 500,
                "Q": "HTML", "R": 9, "S": None,
            })
        else:
            rows.append({"_row": rr, "A": f"T{str(i + 1).zfill(3)}", "B": 0})
    return rows


def _repl_rows(register, keep_plan):
    """keep_plan=True -> Plan B action 'Keep ICE' (baseline).
    keep_plan=False -> Plan B action 'EV' (full-EV cohort)."""
    rows = []
    for i in range(100):
        rr = i + 7
        if i < len(register):
            tid, coe, gross, scrap, coe_paid, keep_y10, ev_y10 = register[i]
            row = {
                "_row": rr, "A": tid, "B": "ChengLong L2EV",
                "C": 160000,              # new ICE all-in quote
                "D": 180000,              # EV all-in override (gross)
                "E": "", "F": 0.34,       # EV kWh/km override (loaded intensity)
                "G": "Battery",
                "H": 2200,                # approved payload
                "I": "Yes", "J": 22, "K": "AC", "L": 48,
                "M": "",                  # keep retire override (default COE expiry)
                "N": keep_y10,            # keep terminal at year 10
                "O": "Keep ICE", "P": "", "Q": keep_y10,
                "R": ("Keep ICE" if keep_plan else "EV"),
                "S": "", "T": ev_y10,
                "U": "", "V": "",
                "W": 0, "X": 0, "Y": 0, "Z": 0,
                "AA": 0, "AB": "Yes", "AC": 120, "AD": 120,
                "AE": "Assumed", "AF": tid,
            }
            rows.append(row)
        else:
            rows.append({"_row": rr, "A": f"T{str(i + 1).zfill(3)}", "B": "ChengLong L2EV",
                         "O": "Keep ICE", "R": "Keep ICE", "AB": "No",
                         "AC": 120, "AD": 120})
    return rows


def build_scenario(demo_inputs, company, keep_plan):
    register = YONG_WEN if company == "yong_wen" else VENUS
    wl = WORKLOADS[company]
    inp = {
        "fleet_register": {
            "range": "A7:S106",
            "rows": _fleet_rows(register, wl["days"], wl["km_year"]),
        },
        "replacement_plan": {
            "range": "A7:AI106",
            "rows": _repl_rows(register, keep_plan),
        },
        "operating_costs": {
            "range": "A7:D68",
            "rows": _oc_rows(demo_inputs["operating_costs"]["rows"]),
        },
        "energy_and_charging": {
            "range": "A7:E56",
            "rows": _ec_rows(demo_inputs["energy_and_charging"]["rows"]),
            "computed_range": demo_inputs["energy_and_charging"].get("computed_range"),
            "computed_rows": demo_inputs["energy_and_charging"].get("computed_rows"),
        },
        "products": copy.deepcopy(demo_inputs["products"]),
        "service_costs": copy.deepcopy(demo_inputs["service_costs"]),
    }
    return inp
