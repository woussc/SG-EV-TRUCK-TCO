#!/usr/bin/env python3
"""Emit the seed prospect cases for the Prospects view as a single JSON file.

Each case is a full input set (fleet_register / replacement_plan /
operating_costs / energy_and_charging / products / service_costs) in the same
shape consumed by src/engine.js -> computeFleet(inputs).

FEAT-003 (Gemini real-company prospects): the user-facing seed set is now the
10 Gemini real-company prospect profiles (sg-01 .. sg-10, ordered) loaded from
the authoritative JSON at /projects/sandbox/.kiro/artifacts/gemini-prospects.json,
followed by the 'blank' fresh-client template. The 3 illustrative archetypes
(wins / breakeven / loses) that this file used to emit are REMOVED; the 10
source-cited real-company prospects already cover the same three archetypes
(#1 EV wins, #2 Break-even, #3 EV not a fit) with richer provenance, so keeping
the generic 3 alongside them would duplicate archetype coverage with weaker,
non-cited cases. The 'blank' template is KEPT as the clean-slate starting case.

The workbook DEMONSTRATION 6-truck case is intentionally NOT emitted here. It
survives only as the untouched validate.py Excel-parity fixture
(tools/fixtures/demo_case.json).

HONESTY. Every archetype claim in a prospect's note traces to the FROZEN engine
(src/engine.js, sha256 45b388a1...), verified by tools/verify_gemini_prospects.mjs
(FEAT-002) and re-asserted by tools/check_presets.mjs. The flat->nested mapping
below is kept IDENTICAL to that verifier's reference mapper. No input is fudged
to force a gate or an outcome, and no vehicle price is invented: each EV-action
truck's col-D all-in price is the FIXED honest contract

    catalogue base (products col I) + 93,000 EV COE + 33,200 body/registration

per named model (SRM T3EV = 190,000, SRM T3EV+ = 193,000, ChengLong L2EV =
205,000, BYD T35 = 199,200, Farizon F3E = 197,000, Forland S1 EV = 202,200,
JAC N40EV = 194,200, Foton eMiler = 199,200). A loaded profile therefore never
shows a model cost above its own input-field price (col D == that model's fixed
price). sourceUrls carried in each prospect's customer provenance are citation
TEXT only and are NEVER fetched.

PLAN A vs PLAN B. Every prospect runs the SRM variant on PLAN A (col B + col
D fixed price, slot O = 'EV') and the named competitor on PLAN B via the
NON-ENGINE _planB_model / _planB_price fields (slot R = 'EV'). The engine binds
one col-B model per row, so the live UI and tools/check_presets.mjs run the
two-state projection: computeFleet once with col B = SRM (read plan_a), once
with col B = the competitor (read plan_b). The engine never reads the
underscore fields, so validate.py and the frozen sha stay untouched.

HONEST GATE NUANCE (FEAT-002). For the high-utilisation / aux-load / public
profiles (sg-01, sg-02, sg-05, sg-08, sg-10) the engine's demanding-day
single-charge range screen flags the SRM Plan A vehicle 'Fails entered limits /
Diagnostic only' because the authoritative demandingDayRouteKm (e.g. 195 / 180
/ 210 / 155 km) exceeds the SRM's usable single-charge range at the 0.20 reserve
- i.e. those duty cycles imply a mid-day top-up. This is a REAL engine signal
from the authoritative data; it is NOT worked around (demandingDayRouteKm and
the reserve are left exactly as supplied). The archetype classification is on
the POSITIVE Plan A saving %, which is independent of that gate flag.

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
GEMINI = "/projects/sandbox/.kiro/artifacts/gemini-prospects.json"


def load_demo():
    with open(FIXTURE, "r", encoding="utf-8") as fh:
        return json.load(fh)


def load_gemini():
    with open(GEMINI, "r", encoding="utf-8") as fh:
        return json.load(fh)


# ===========================================================================
# FIXED HONEST PRICE CONTRACT (mirror tools/verify_gemini_prospects.mjs).
# ===========================================================================
# col-D all-in EV quote = catalogue base (products col I) + 93,000 EV COE
# + 33,200 body/registration. No per-profile prices are invented.
CATALOGUE_BASE = {
    "SRM T3EV": 63800,
    "SRM T3EV+": 66800,
    "ChengLong L2EV": 78800,
    "BYD T35 Electric Light-Duty": 73000,
    "Farizon F3E": 70800,
    "Forland S1 EV": 76000,
    "JAC N40EV": 68000,
    "Foton eMiler": 73000,
}
COE_COMPONENT = 93000
BODY_REG_COMPONENT = 33200


def fixed_price(model):
    base = CATALOGUE_BASE.get(model)
    if base is None:
        raise ValueError("no catalogue base for model: " + str(model))
    return base + COE_COMPONENT + BODY_REG_COMPONENT


# ---------------------------------------------------------------------------
# operating_costs template (mirror verify_gemini_prospects.mjs OC_TEMPLATE).
# ---------------------------------------------------------------------------
# Verification toggles flipped so the engine's serviceStatus / savingClaimStatus
# gates pass (Customer data mode, confirmed prices/trial/backup). Rows 7 and 48
# are overridden per-profile from sharedAssumptions below.
OC_TEMPLATE = {
    7: 0.14,      # ICE fuel consumption litres/km (overridden per profile)
    24: 3200,     # old ICE maintenance
    25: 2600,     # new ICE maintenance
    39: 0,        # old ICE unavailable days
    40: 0,        # new ICE unavailable days
    41: 0,        # EV unavailable days
    44: 0.10,     # charging loss
    45: 0.20,     # battery reserve
    46: 0.02,     # annual fade
    48: 0,        # extra auxiliary energy kWh/day (overridden per profile)
    49: 0,        # peak auxiliary energy
    58: "Yes",    # Backup confirmed
    59: "Yes",    # Loaded trial confirmed
    60: "Yes",    # Energy prices confirmed
    61: "Customer",  # Data mode
    68: "Hong Seh 200k average",  # EV servicing basis
}

# ---------------------------------------------------------------------------
# energy_and_charging template (mirror verify_gemini_prospects.mjs EC_TEMPLATE).
# ---------------------------------------------------------------------------
# Fully itemised depot site. Rows 7/10/11/12/13/16/17/18/50/56 are overridden
# per-profile from sharedAssumptions + the fleet-scaled charging site.
EC_TEMPLATE = {
    7: 2.50, 8: 3.25, 9: 1, 10: 0.30, 11: 0.75, 12: 0,
    13: "Existing depot", 15: "AC11", 16: 4, 17: 4, 18: 8000,
    19: 1200, 20: 800, 21: 1500, 22: 375, 23: 0, 24: 0, 25: 0, 26: 0,
    27: 1000, 28: 0, 29: 0, 30: 0, 31: 0, 32: 400, 33: 0, 34: 120,
    35: 0, 36: 0, 37: 0, 38: 120, 40: 0, 41: 120, 42: 0, 43: 120,
    44: 0, 45: 12, 46: "No", 47: 0, 50: 60, 51: 10, 52: "Yes",
    53: "Yes", 54: "Verified", 55: "Yes", 56: 11,
}
RATED_KW = EC_TEMPLATE[56]  # per-charger rated input power (AC11 = 11 kW)

# Per-truck terminal ladder (mirror verify_gemini_prospects.mjs TRUCK_LADDER):
# the keep/EV year-10 terminal values, cycled across the fleet.
TRUCK_LADDER = [
    {"scrap": 3000, "straight": 500, "keepY10": 22000, "evY10": 24000},
    {"scrap": 3000, "straight": 500, "keepY10": 30000, "evY10": 33000},
    {"scrap": 3000, "straight": 500, "keepY10": 38000, "evY10": 42000},
    {"scrap": 3000, "straight": 500, "keepY10": 46000, "evY10": 51000},
]


def _included(trucks):
    return [t for t in trucks if t.get("include")]


def gem_fleet_rows(trucks):
    rows = []
    included = _included(trucks)
    for i in range(100):
        rr = i + 7
        if i < len(included):
            t = included[i]
            lad = TRUCK_LADDER[i % len(TRUCK_LADDER)]
            rows.append({
                "_row": rr, "A": t["truckId"], "B": 1,
                "C": "Prospect", "D": "Box",
                "E": t["workKmPerDay"], "F": t["daysPerYear"],
                "G": t["demandingDayRouteKm"], "H": t["peakCargoKg"],
                "I": t["peakJobsPerDay"], "J": t["coeMonthsLeft"],
                "K": t["marketValueSgd"], "L": lad["scrap"], "M": lad["straight"],
                "N": 120, "O": 0, "P": 0, "Q": "GEMINI", "R": 9, "S": None,
            })
        else:
            rows.append({"_row": rr, "A": "X" + str(i + 1).zfill(3), "B": 0})
    return rows


def gem_repl_rows(trucks):
    rows = []
    included = _included(trucks)
    for i in range(100):
        rr = i + 7
        if i < len(included):
            t = included[i]
            lad = TRUCK_LADDER[i % len(TRUCK_LADDER)]
            plan_a = t["planAVariant"]   # SRM model on Plan A
            plan_b = t["planBVariant"]   # competitor on Plan B
            price_a = fixed_price(plan_a)
            price_b = fixed_price(plan_b)
            # Competitor year-10 residual scaled by the price ratio off the SRM
            # EV terminal (honest higher residual for a dearer vehicle), to S$100.
            comp_y10 = int(round(lad["evY10"] * (price_b / price_a) / 100.0)) * 100
            rows.append({
                "_row": rr, "A": t["truckId"], "B": plan_a,
                "C": t["newIceQuoteSgd"],   # new ICE all-in quote
                "D": price_a,               # SRM all-in override (fixed contract)
                "E": "", "F": "",           # use product battery / intensity defaults
                "G": "Battery",
                "H": 2000,                  # approved payload (>= peak load)
                "I": "Yes",                 # body fits
                "J": 11, "K": "AC", "L": 11,  # depot avg kW, AC mode, plug kW
                "M": "",
                "N": lad["keepY10"],
                "O": t["planAAction"], "P": "", "Q": lad["evY10"],  # Plan A = SRM EV
                "R": t["planBAction"], "S": "", "T": comp_y10,      # Plan B = competitor EV
                "U": "", "V": "",
                "W": 0, "X": 0, "Y": 0, "Z": 0,
                "AA": 0, "AB": "Yes", "AC": 120, "AD": 120,
                "AE": "Verified", "AF": t["truckId"],
                # Non-engine Plan B competitor binding (read by the UI's preset
                # load-sync and by check_presets.mjs two-state projection;
                # ignored by the frozen engine / validate.py).
                "_planB_model": plan_b,
                "_planB_price": price_b,
            })
        else:
            rows.append({"_row": rr, "A": "X" + str(i + 1).zfill(3), "B": "SRM T3EV",
                         "O": "Keep ICE", "R": "Keep ICE", "AB": "No",
                         "AC": 120, "AD": 120})
    return rows


def gem_oc_rows(demo_rows, shared):
    oc = dict(OC_TEMPLATE)
    oc[7] = shared["iceFuelConsumptionLitresPerKm"]
    oc[48] = shared["extraAuxiliaryEnergyKwhPerDay"]
    rows = copy.deepcopy(demo_rows)
    for r in rows:
        if r["_row"] in oc:
            r["values"]["B"] = oc[r["_row"]]
    return rows


def gem_ec_rows(demo_rows, shared, n_trucks):
    ec = dict(EC_TEMPLATE)
    ec[7] = shared["commercialDieselPriceSgdPerLitre"]
    ec[10] = shared["depotElectricityRateSgdPerKwh"]
    ec[11] = shared["publicChargingPriceSgdPerKwh"]
    ec[12] = shared["publicElectricityShare"]
    ec[13] = shared["chargingSiteArrangement"]
    ec[18] = shared["chargerEquipmentPriceSgd"]
    # Charging-site build-up SCALED to the EV fleet: one AC11 charger + usable
    # plug per EV-action truck, net site power = chargers x rated kW. For a
    # public-charging-only profile (installedChargers 0) there is NO depot site:
    # zero chargers/plugs/site-capex and the gate is driven by public charging.
    installed = shared.get("installedChargers")
    if installed == 0:
        # Public-charging-only: honest no-depot-site. Zero out every per-charger
        # and per-site capex line so there is no depot-site capex, and leave the
        # site arrangement / public share (1.0) to drive all energy through
        # public S$/kWh.
        for row in (16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29,
                    30, 31, 32, 50):
            ec[row] = 0
        ec[52] = "Yes"
        ec[53] = "Yes"
        ec[55] = "Yes"
    else:
        chargers = max(1, int(n_trucks))
        ec[16] = chargers
        ec[17] = chargers
        ec[50] = chargers * RATED_KW
    rows = copy.deepcopy(demo_rows)
    for r in rows:
        vals = r.get("values")
        if isinstance(vals, dict) and r["_row"] in ec:
            if "B" in vals:
                vals["B"] = ec[r["_row"]]
            if "C" in vals:
                vals["C"] = ec[r["_row"]]
    return rows


def build_prospect_inputs(demo_inputs, prospect):
    shared = prospect["sharedAssumptions"]
    included = _included(prospect["trucks"])
    n_trucks = len(included)
    inputs = {
        "fleet_register": {"range": "A7:S106", "rows": gem_fleet_rows(prospect["trucks"])},
        "replacement_plan": {"range": "A7:AI106", "rows": gem_repl_rows(prospect["trucks"])},
        "operating_costs": {
            "range": "A7:D68",
            "rows": gem_oc_rows(demo_inputs["operating_costs"]["rows"], shared),
        },
        "energy_and_charging": {
            "range": "A7:E56",
            "rows": gem_ec_rows(demo_inputs["energy_and_charging"]["rows"], shared, n_trucks),
            "computed_range": demo_inputs["energy_and_charging"].get("computed_range"),
            "computed_rows": demo_inputs["energy_and_charging"].get("computed_rows"),
        },
        "products": copy.deepcopy(demo_inputs["products"]),
        "service_costs": copy.deepcopy(demo_inputs["service_costs"]),
    }
    # Real customer provenance (engine NEVER reads inputs.customer). loadCase's
    # wholesale H.state=inputs replacement lands it in H.state.customer and
    # buildCustomer() renders company/contact/evidenceRef/notes. sourceUrls are
    # appended to notes as citation TEXT only (never fetched).
    cust = prospect.get("customer") or {}
    notes = cust.get("notes") or ""
    source_urls = cust.get("sourceUrls") or []
    if source_urls:
        notes = (notes + " Sources: " + "; ".join(source_urls)).strip()
    inputs["customer"] = {
        "company": cust.get("company"),
        "contact": cust.get("contact"),
        "evidenceRef": cust.get("evidence"),
        "notes": notes or None,
    }
    return inputs


# ---------------------------------------------------------------------------
# Provenance-grounded note builder (archetype claim tied to the frozen engine).
# ---------------------------------------------------------------------------
# The engine figures are captured and verified by tools/verify_gemini_prospects.mjs
# and re-asserted (with a near() tolerance) by tools/check_presets.mjs. They are
# reproduced here as the documented Plan A SRM saving % so the note is honest.
VERIFIED_SAVING_PCT = {
    "sg-01-gls-fairprice": 26.51,
    "sg-02-richland-logistics": 23.90,
    "sg-03-neo-group-catering": 28.11,
    "sg-04-singpost-bulky": 26.77,
    "sg-05-ninjavan-restock": 22.73,
    "sg-06-fareastflora": 28.78,
    "sg-07-chye-thiam-maintenance": 22.49,
    "sg-08-move-move-movers": 11.76,
    "sg-09-isoteam-ltd": 13.61,
    "sg-10-relo-charter-control": -3.68,
}

# Profiles whose SRM Plan A vehicle the engine flags 'Fails entered limits /
# Diagnostic only' on its demanding-day single-charge range screen (FEAT-002).
DIAGNOSTIC_GATE = {
    "sg-01-gls-fairprice", "sg-02-richland-logistics", "sg-05-ninjavan-restock",
    "sg-08-move-move-movers", "sg-10-relo-charter-control",
}


def archetype_phrase(archetype):
    a = str(archetype)
    if "not a fit" in a.lower():
        return "the EV is NOT a fit"
    if "break-even" in a.lower() and "ev wins" in a.lower():
        return "the EV wins / is a break-even call"
    if "break-even" in a.lower():
        return "the EV is a BREAK-EVEN call"
    if "ev wins" in a.lower():
        return "the EV WINS"
    return "the archetype result"


def build_note(prospect):
    pid = prospect["id"]
    shared = prospect["sharedAssumptions"]
    included = _included(prospect["trucks"])
    n = len(included)
    t0 = included[0]
    srm = t0["planAVariant"]
    comp = t0["planBVariant"]
    srm_price = fixed_price(srm)
    comp_price = fixed_price(comp)
    pct = VERIFIED_SAVING_PCT[pid]
    cust = prospect.get("customer") or {}
    company = cust.get("company") or prospect["name"]
    phrase = archetype_phrase(prospect["tcoArchetype"])
    sign = "+" if pct >= 0 else ""
    note = (
        "Real-company CONTEXT profile (user-supplied provenance for %s), NOT a "
        "customer savings claim. Archetype '%s': the FROZEN engine computes a "
        "Plan A (SRM) saving of %s%.2f%% vs Keep ICE, so %s. PLAN A runs the %s "
        "at its HONEST all-in fixed price S$%s (catalogue base + 93,000 EV COE + "
        "33,200 body/registration); PLAN B runs the %s competitor at its HONEST "
        "all-in fixed price S$%s on the same build-up. Fleet: %d EV-action truck%s "
        "at %d km/day x %d days/year. The archetype traces to the engine; the "
        "company/contact/evidence/notes/sourceUrls are real-world context, not an "
        "owned fact or a customer quote."
    ) % (
        company, prospect["tcoArchetype"], sign, pct, phrase, srm,
        format(srm_price, ","), comp, format(comp_price, ","),
        n, "" if n == 1 else "s", t0["workKmPerDay"], t0["daysPerYear"],
    )
    if pid in DIAGNOSTIC_GATE:
        note += (
            " HONEST GATE NUANCE: at the authoritative demanding-day route of "
            "%d km the engine flags the SRM Plan A vehicle 'Fails entered limits "
            "/ Diagnostic only' on its single-charge range screen at the 0.20 "
            "reserve (this duty implies a mid-day top-up). That real engine "
            "signal is NOT worked around; the positive saving %% above is "
            "independent of it."
        ) % (t0["demandingDayRouteKm"],)
    if shared.get("installedChargers") == 0:
        note += (
            " Modelled public-charging-only (installedChargers 0, public share "
            "1.0, 'Public charging only', no depot-site capex, all energy at "
            "public S$%.2f/kWh)."
        ) % (shared["publicChargingPriceSgdPerKwh"],)
    if shared.get("extraAuxiliaryEnergyKwhPerDay"):
        note += (
            " Includes %.1f kWh/day auxiliary load (operating_costs row 48)."
        ) % (shared["extraAuxiliaryEnergyKwhPerDay"],)
    return note


# ---------------------------------------------------------------------------
# Blank fresh-client template (KEPT from the previous seed set, unchanged).
# ---------------------------------------------------------------------------
BLANK_TRUCKS = ["NEW-1", "NEW-2", "NEW-3", "NEW-4"]

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
    gemini = load_gemini()

    cases = []

    # The 10 Gemini real-company prospects in source order (sg-01 .. sg-10),
    # each loaded through the reference mapper and tagged with honest,
    # provenance-grounded real-company CONTEXT (evidence tag
    # 'real-company-context' - index.html loadCase/buildCustomer render an honest
    # banner/label for it that keeps the "not a customer savings claim" caveat
    # visible). The archetype claim in every note traces to the frozen engine.
    for prospect in gemini["prospects"]:
        cases.append({
            "id": prospect["id"],
            "name": prospect["name"],
            "evidence": "real-company-context",
            "note": build_note(prospect),
            "inputs": build_prospect_inputs(demo_inputs, prospect),
        })

    # The fresh-client BLANK template, kept as the final case.
    cases.append({
        "id": "blank",
        "name": "Blank profile (start a fresh client)",
        "evidence": "assumption",
        "note": (
            "Blank template, NOT a real customer. A clean slate for entering a "
            "fresh client on the fly: four truck rows across both sheets share "
            "one ID set (NEW-1..NEW-4) with the Include toggles on, but every "
            "gate-critical value is left blank/n.a. (NOT zero). The engine "
            "handles it gracefully - Total economic TCO and Saving stay n.a. "
            "(honest empty, no crash) until the minimum critical inputs are "
            "supplied."
        ),
        "inputs": build_blank(demo_inputs),
    })

    payload = {
        "_meta": {
            "description": (
                "Seed customer cases for the Prospects view. Each case is a full "
                "engine input set. The 10 sg-xx cases are the Gemini "
                "real-company prospect profiles loaded from the authoritative "
                "artifact (gemini-prospects.json) and mapped through the SAME "
                "reference mapper as tools/verify_gemini_prospects.mjs; their "
                "archetype claims trace to the FROZEN engine (verified by that "
                "harness and re-asserted by tools/check_presets.mjs) at HONEST "
                "fixed per-model prices (catalogue base + 93,000 COE + 33,200 "
                "body/reg). SRM runs on Plan A (col B + col D), the named "
                "competitor on Plan B (_planB_model / _planB_price). Customer "
                "provenance (company/contact/evidence/notes/sourceUrls) is "
                "user-supplied real-world CONTEXT, carried in inputs.customer "
                "(the engine never reads it); sourceUrls are citation text only, "
                "never fetched. 'blank' is a prefilled fresh-client template "
                "(common SG shared assumptions filled, customer-specific values "
                "left as honest blanks). The workbook demonstration case "
                "survives only as the untouched validate.py Excel-parity "
                "fixture."
            ),
            "generated_by": "tools/build_prospects.py",
            "source_artifact": GEMINI,
        },
        "cases": cases,
    }

    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=2)
    print(f"Wrote {OUT} with {len(cases)} cases: " + ", ".join(c["id"] for c in cases))


if __name__ == "__main__":
    main()
