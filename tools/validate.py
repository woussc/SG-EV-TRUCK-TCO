#!/usr/bin/env python3
"""Validation harness (FEAT-001 stub).

Loads the frozen fixture produced by ``extract_excel.py`` and the reference
HTML targets, then prints the DEMONSTRATION case headline figures and the HTML
parity targets.

This is intentionally a reporting stub: the full numeric assertions (Excel
cached values and HTML figures within tolerance) are wired up in FEAT-002 once
the deterministic model is reimplemented. Keeping it runnable now gives a
single command to confirm the baseline of truth is readable and intact.

Run:  python SG-EV-TRUCK-TCO/tools/validate.py
"""

from __future__ import annotations

import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
FIXTURE_PATH = os.path.join(HERE, "fixtures", "demo_case.json")
HTML_TARGETS_PATH = os.path.join(HERE, "html_targets.json")

PLAN_COLS = ("keep_ice", "all_new_ice", "plan_a", "plan_b")
PLAN_LABELS = {
    "keep_ice": "Keep ICE",
    "all_new_ice": "All-new ICE",
    "plan_a": "Plan A",
    "plan_b": "Plan B",
}


def load_json(path):
    if not os.path.isfile(path):
        raise SystemExit(f"Missing file: {path}. Run extract_excel.py first.")
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def fmt(value):
    """Render a value for display, preserving 'n.a.' and blanks verbatim."""
    if value is None:
        return "(blank)"
    if isinstance(value, bool):
        return str(value)
    if isinstance(value, (int, float)):
        return f"{value:,.6g}"
    return str(value)


def print_headline(headline):
    print("\nDEMONSTRATION case headline (Results B9:E26)")
    print("-" * 72)
    header = f"{'Metric':<32}" + "".join(
        f"{PLAN_LABELS[c]:>18}" for c in PLAN_COLS
    )
    print(header)
    for metric, cols in headline.items():
        row = f"{metric:<32}"
        for c in PLAN_COLS:
            row += f"{fmt(cols.get(c)):>18}"
        print(row)


def print_html_targets(targets):
    print("\nReference HTML parity targets (whole-dollar S$)")
    print("-" * 72)
    for name, figs in targets["targets"].items():
        print(f"  {name:<10} full_ev = {figs['full_ev']:>10,}   "
              f"keep_ice = {figs['keep_ice']:>10,}")


def main():
    fixture = load_json(FIXTURE_PATH)
    html = load_json(HTML_TARGETS_PATH)

    print("Hong Seh EV TCO - validation harness (FEAT-001 stub)")
    print("=" * 72)
    meta = fixture.get("_meta", {})
    print(f"Source workbook : {meta.get('source_workbook')}")
    print(f"openpyxl        : {meta.get('openpyxl_version')}")

    headline = fixture["outputs"]["results_headline"]
    print_headline(headline)

    # Echo the specific demo anchors the acceptance criteria call out.
    tco = headline.get("Vehicle economic TCO", {})
    day0 = headline.get("Day-0 funding before loans", {})
    cpk = headline.get("Cost per productive km", {})
    counts = headline.get("Truck count", {})
    print("\nKey demo anchors")
    print("-" * 72)
    print(f"  Truck count (Keep ICE)          : {fmt(counts.get('keep_ice'))}")
    print(f"  Vehicle economic TCO Keep ICE   : {fmt(tco.get('keep_ice'))}")
    print(f"  Vehicle economic TCO All-new ICE: {fmt(tco.get('all_new_ice'))}")
    print(f"  Vehicle economic TCO Plan A     : {fmt(tco.get('plan_a'))}")
    print(f"  Vehicle economic TCO Plan B     : {fmt(tco.get('plan_b'))}")
    print(f"  Day-0 funding All-new ICE       : {fmt(day0.get('all_new_ice'))}")
    print(f"  Cost per productive km Keep ICE : {fmt(cpk.get('keep_ice'))}")

    print_html_targets(html)

    print("\nNote: full numeric assertions are added in FEAT-002.")


if __name__ == "__main__":
    main()
