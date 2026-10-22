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


def main():
    demo = load_demo()
    demo_inputs = demo["inputs"]

    cases = []

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
