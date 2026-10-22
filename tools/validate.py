#!/usr/bin/env python3
"""Validation harness for the Hong Seh EV TCO engine (FEAT-002).

Runs the shipped engine (``src/engine.js`` via ``tools/engine.py``) against the
frozen demo fixture and asserts the results reproduce the Excel's cached values
and the Review reconciliations exactly. Then it runs a documented reconstruction
of the reference-HTML Yong Wen / Venus scenarios and reports the headline parity
(this is a reported check: see FEAT-002 findings for the residual-delta policy).

Exit code 0 only when every STRICT demo + review assertion passes.

Run:  cd /projects/sandbox && . .venv/bin/activate \\
       && python SG-EV-TRUCK-TCO/tools/validate.py
"""

from __future__ import annotations

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from engine import compute_fleet  # noqa: E402
import html_scenarios  # noqa: E402

FIXTURE_PATH = os.path.join(HERE, "fixtures", "demo_case.json")
HTML_TARGETS_PATH = os.path.join(HERE, "html_targets.json")

TOL = 0.5  # absolute tolerance for demo money figures

# Excel cached demo targets (Results!B12:E12 etc.).
DEMO_TCO = {
    "keep_ice": 2081781.0,
    "all_new_ice": 2103081.0,
    "plan_a": 2046736.015175529,
    "plan_b": 1986546.0455265818,
}

_fail = []
_pass = 0


def load_json(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def check(name, cond, detail=""):
    global _pass
    if cond:
        _pass += 1
        print(f"  PASS  {name}")
    else:
        _fail.append(name)
        print(f"  FAIL  {name}  {detail}")


def approx(a, b, tol=TOL):
    return isinstance(a, (int, float)) and isinstance(b, (int, float)) and abs(a - b) <= tol


def main():
    fixture = load_json(FIXTURE_PATH)
    html = load_json(HTML_TARGETS_PATH)

    print("Hong Seh EV TCO - engine validation (FEAT-002)")
    print("=" * 72)

    out = compute_fleet(fixture["inputs"])
    r = out["results"]
    rev = out["review"]

    # ---- STRICT demo assertions ------------------------------------------
    print("\nDemo case: Vehicle economic TCO (abs tol 0.5)")
    for key, target in DEMO_TCO.items():
        val = r["vehicleEconomicTco"][key]
        check(f"Vehicle economic TCO {key} = {target}", approx(val, target),
              f"got {val}")

    print("\nDemo case: other anchors")
    check("Day-0 funding All-new ICE = 852000",
          approx(r["day0Funding"]["all_new_ice"], 852000))
    check("Truck count Keep ICE = 6", r["truckCount"]["keep_ice"] == 6)
    check("Cost per productive km Keep ~ 0.77103",
          approx(r["costPerKm"]["keep_ice"], 0.77103, 1e-4),
          f"got {r['costPerKm']['keep_ice']}")

    # ---- n.a. propagation (never 0) --------------------------------------
    print("\nDemo case: 'n.a.' propagation (Plan A/B site + totals)")
    check("Net site ownership cost Plan A = 'n.a.'", r["netSiteCost"]["plan_a"] == "n.a.")
    check("Net site ownership cost Plan B = 'n.a.'", r["netSiteCost"]["plan_b"] == "n.a.")
    check("Total economic TCO Plan A = 'n.a.'", r["totalEconomicTco"]["plan_a"] == "n.a.")
    check("Total economic TCO Plan B = 'n.a.'", r["totalEconomicTco"]["plan_b"] == "n.a.")
    check("Cost per km Plan A = 'n.a.'", r["costPerKm"]["plan_a"] == "n.a.")

    # ---- Review reconciliation -------------------------------------------
    print("\nReview reconciliation")
    check("Duty coverage = 720", rev["dutyCoverage"]["actual"] == 720)
    check("Duty coverage status PASS", rev["dutyCoverage"]["status"] == "PASS")
    check("Keep economic/cash bridge ~ 0",
          approx(rev["keepBridge"]["actual"], 0, 0.005),
          f"got {rev['keepBridge']['actual']}")
    check("New ICE economic/cash bridge ~ 0",
          approx(rev["newBridge"]["actual"], 0, 0.005),
          f"got {rev['newBridge']['actual']}")
    check("Included source trucks PASS", rev["includedTrucks"]["status"] == "PASS")
    check("Plan A EV count PASS", rev["planAEvCount"]["status"] == "PASS")
    check("Plan B EV count PASS", rev["planBEvCount"]["status"] == "PASS")

    # ---- Reported HTML parity (non-fatal, documented reconstruction) -----
    print("\nReference-HTML parity (REPORTED; see FEAT-002 findings)")
    print("-" * 72)
    targets = html["targets"]
    for company in ("yong_wen", "venus"):
        keep_inp = html_scenarios.build_scenario(fixture["inputs"], company, keep_plan=True)
        ev_inp = html_scenarios.build_scenario(fixture["inputs"], company, keep_plan=False)
        keep_out = compute_fleet(keep_inp)
        ev_out = compute_fleet(ev_inp)
        keep_tco = keep_out["results"]["vehicleEconomicTco"]["keep_ice"]
        ev_tco = ev_out["results"]["vehicleEconomicTco"]["plan_b"]
        t = targets[company]
        kd = (keep_tco - t["keep_ice"]) if isinstance(keep_tco, (int, float)) else None
        ed = (ev_tco - t["full_ev"]) if isinstance(ev_tco, (int, float)) else None
        print(f"  {company}: Keep ICE engine={fmt(keep_tco)} target={t['keep_ice']:,} "
              f"delta={fmt(kd)}")
        print(f"  {company}: Full-EV  engine={fmt(ev_tco)} target={t['full_ev']:,} "
              f"delta={fmt(ed)}")

    # ---- Summary ----------------------------------------------------------
    print("\n" + "=" * 72)
    print(f"STRICT assertions: {_pass} passed, {len(_fail)} failed")
    if _fail:
        for f in _fail:
            print(f"  - {f}")
        sys.exit(1)
    print("All strict demo + review assertions passed.")


def fmt(v):
    if v is None:
        return "n/a"
    if isinstance(v, (int, float)):
        return f"{v:,.2f}"
    return str(v)


if __name__ == "__main__":
    main()
