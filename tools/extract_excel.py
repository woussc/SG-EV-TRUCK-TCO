#!/usr/bin/env python3
"""Freeze the Hong Seh EV TCO Excel model as a machine-readable JSON fixture.

This is the FEAT-001 baseline-of-truth extractor. It loads the authoritative
workbook twice (formulas + cached values) and writes
``tools/fixtures/demo_case.json`` containing:

  (a) every input-sheet value needed to re-run the model, and
  (b) the cached OUTPUT values of the saved DEMONSTRATION 6-truck case
      (Results B9:E26 and Review B7:D18).

Design rules (see context.json / FEAT-001):
  * The three source documents are READ ONLY. We only read the .xlsx.
  * The literal string 'n.a.' (and any other non-numeric cell content) is
    preserved exactly. We NEVER coerce a non-numeric cell to 0.
  * Blank cells stay ``None`` (blank != zero).
  * Deterministic, offline. openpyxl only.

Run:  python SG-EV-TRUCK-TCO/tools/extract_excel.py
"""

from __future__ import annotations

import json
import os
from collections import OrderedDict

import openpyxl
from openpyxl.utils import get_column_letter, column_index_from_string

# --- Paths ----------------------------------------------------------------

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
WORKBOOK = os.path.join(
    REPO, "Hong Seh - EV TCO Calculator - Fleet, Charging and Service v5.xlsx"
)
FIXTURE_DIR = os.path.join(HERE, "fixtures")
FIXTURE_PATH = os.path.join(FIXTURE_DIR, "demo_case.json")


# --- Cell helpers ---------------------------------------------------------


def norm(value):
    """Normalise a cached cell value for JSON.

    Numbers pass through as-is. Non-numeric content (strings such as 'n.a.',
    status flags, labels) is preserved exactly. Blank cells stay None.
    Booleans are preserved as booleans.
    """
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value
    # Anything else (string, datetime, etc.) -> string, preserved verbatim.
    if isinstance(value, str):
        return value
    return str(value)


def cell(ws, coord):
    return norm(ws[coord].value)


def read_block(ws, min_col, max_col, min_row, max_row):
    """Return a list of row dicts {column_letter: value} for a rectangle.

    Rows that are entirely blank are still included (so row indices line up
    with the sheet), but a row is tagged with its 1-based sheet row number.
    """
    rows = []
    for r in range(min_row, max_row + 1):
        row = OrderedDict()
        row["_row"] = r
        for c in range(min_col, max_col + 1):
            letter = get_column_letter(c)
            row[letter] = norm(ws.cell(row=r, column=c).value)
        rows.append(row)
    return rows


def read_labelled(ws_formula, ws_value, min_row, max_row, label_col="A",
                  value_cols=("B",)):
    """Read label/value rows keyed by the label text.

    Returns a list of entries preserving row order and the originating row.
    Each entry carries the label (from the formula/value workbook), the
    value column(s), the raw cell coordinate(s), and the formula text if the
    value cell holds a formula (useful provenance for later features).
    """
    lcol = column_index_from_string(label_col)
    entries = []
    for r in range(min_row, max_row + 1):
        label = norm(ws_value.cell(row=r, column=lcol).value)
        values = OrderedDict()
        for vc in value_cols:
            vci = column_index_from_string(vc)
            coord = f"{vc}{r}"
            values[vc] = norm(ws_value.cell(row=r, column=vci).value)
        entry = OrderedDict()
        entry["_row"] = r
        entry["label"] = label
        entry["values"] = values
        entries.append(entry)
    return entries


# --- Output (Results / Review) capture ------------------------------------


def read_results_grid(ws_formula, ws_value, min_col, max_col, min_row, max_row):
    """Capture Results output cells with cached value AND formula provenance.

    'n.a.' and other string statuses are preserved verbatim via norm().
    """
    grid = []
    for r in range(min_row, max_row + 1):
        row = OrderedDict()
        row["_row"] = r
        for c in range(min_col, max_col + 1):
            letter = get_column_letter(c)
            coord = f"{letter}{r}"
            vcell = ws_value.cell(row=r, column=c).value
            fcell = ws_formula.cell(row=r, column=c)
            formula = fcell.value if isinstance(fcell.value, str) and str(fcell.value).startswith("=") else None
            row[letter] = OrderedDict(
                [("value", norm(vcell)), ("formula", formula)]
            )
        grid.append(row)
    return grid


# --- Main -----------------------------------------------------------------


def main():
    if not os.path.isfile(WORKBOOK):
        raise SystemExit(f"Workbook not found: {WORKBOOK}")

    wb_f = openpyxl.load_workbook(WORKBOOK, data_only=False)
    wb_v = openpyxl.load_workbook(WORKBOOK, data_only=True)

    def fv(name):
        return wb_f[name], wb_v[name]

    fr_f, fr_v = fv("Fleet register")
    rp_f, rp_v = fv("Replacement plan")
    oc_f, oc_v = fv("Operating costs")
    ec_f, ec_v = fv("Energy and charging")
    pr_f, pr_v = fv("Products")
    sc_f, sc_v = fv("Service costs")
    res_f, res_v = fv("Results")
    rev_f, rev_v = fv("Review")

    data = OrderedDict()
    data["_meta"] = OrderedDict(
        [
            ("source_workbook",
             "Hong Seh - EV TCO Calculator - Fleet, Charging and Service v5.xlsx"),
            ("description",
             "Frozen DEMONSTRATION 6-truck case: all input-sheet values plus "
             "cached Results/Review outputs. 'n.a.' preserved verbatim; blanks "
             "stay null; nothing coerced to 0."),
            ("openpyxl_version", openpyxl.__version__),
            ("generated_by", "tools/extract_excel.py"),
        ]
    )

    # --- Inputs ---
    inputs = OrderedDict()

    # Fleet register: inputs rows 7-106, cols A-S
    inputs["fleet_register"] = OrderedDict(
        [
            ("range", "A7:S106"),
            ("rows", read_block(fr_v, column_index_from_string("A"),
                                column_index_from_string("S"), 7, 106)),
        ]
    )

    # Replacement plan: rows 7-106, cols A-AI
    inputs["replacement_plan"] = OrderedDict(
        [
            ("range", "A7:AI106"),
            ("rows", read_block(rp_v, column_index_from_string("A"),
                                column_index_from_string("AI"), 7, 106)),
        ]
    )

    # Operating costs: rows 7-68, label col A, value col B (+ unit C / note D)
    inputs["operating_costs"] = OrderedDict(
        [
            ("range", "A7:D68"),
            ("rows", read_labelled(oc_f, oc_v, 7, 68, "A",
                                   ("B", "C", "D"))),
        ]
    )

    # Energy and charging: rows 7-56, label col A, Plan A=B, Plan B=C (+ unit/scope)
    inputs["energy_and_charging"] = OrderedDict(
        [
            ("range", "A7:E56"),
            ("rows", read_labelled(ec_f, ec_v, 7, 56, "A",
                                   ("B", "C", "D", "E"))),
            # Also capture the computed/gate rows 59-68 referenced by Results.
            ("computed_range", "A59:C68"),
            ("computed_rows", read_block(ec_v, column_index_from_string("A"),
                                         column_index_from_string("C"), 59, 68)),
        ]
    )

    # Products: rows 7-13, cols A-Q
    inputs["products"] = OrderedDict(
        [
            ("range", "A7:Q13"),
            ("rows", read_block(pr_v, column_index_from_string("A"),
                                column_index_from_string("Q"), 7, 13)),
        ]
    )

    # Service costs: rows 7-14, cols A-Z (intervals B..W, total X, mapping cols)
    inputs["service_costs"] = OrderedDict(
        [
            ("range", "A7:Z14"),
            ("rows", read_block(sc_v, column_index_from_string("A"),
                                column_index_from_string("Z"), 7, 14)),
        ]
    )

    data["inputs"] = inputs

    # --- Outputs ---
    outputs = OrderedDict()

    # Results B9:E26 (plus label col A for readability).
    outputs["results"] = OrderedDict(
        [
            ("range", "A9:E26"),
            ("grid", read_results_grid(res_f, res_v,
                                       column_index_from_string("A"),
                                       column_index_from_string("E"), 9, 26)),
        ]
    )

    # Convenient flat map of the headline demo figures keyed by metric label.
    headline = OrderedDict()
    for r in range(9, 27):
        label = norm(res_v.cell(row=r, column=1).value)
        if label is None:
            continue
        cols = OrderedDict()
        for c, key in ((2, "keep_ice"), (3, "all_new_ice"), (4, "plan_a"),
                       (5, "plan_b")):
            cols[key] = norm(res_v.cell(row=r, column=c).value)
        headline[label] = cols
    outputs["results_headline"] = headline

    # Review B7:D18 (plus label col A).
    outputs["review"] = OrderedDict(
        [
            ("range", "A7:D18"),
            ("grid", read_results_grid(rev_f, rev_v,
                                       column_index_from_string("A"),
                                       column_index_from_string("D"), 7, 18)),
        ]
    )

    data["outputs"] = outputs

    os.makedirs(FIXTURE_DIR, exist_ok=True)
    with open(FIXTURE_PATH, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2, ensure_ascii=False)
        fh.write("\n")

    print(f"Wrote {FIXTURE_PATH}")
    # Quick sanity echo of the headline Vehicle economic TCO row.
    tco = headline.get("Vehicle economic TCO", {})
    print("Vehicle economic TCO:", json.dumps(tco))


if __name__ == "__main__":
    main()
