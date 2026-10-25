# Whole-project polish self-audit (Workstream F / FEAT-006)

This is the by-construction polish self-audit of every surface of the EV-truck
TCO calculator, completed after the portfolio specs (FEAT-002), provenance-badge
retirement + switch-over realignment (FEAT-003), vehicle distribution scatter
(FEAT-004) and the project-wide soft-green-on-neutral design system (FEAT-005).

The audit is **by construction**: this agent cannot launch a browser, so each
surface was verified by reading the generated `index.html` markup + CSS + the
chart/scatter render modules, and by the headless Node DOM harness
(`tools/check_index.mjs`) plus the data/engine harnesses. The authoritative
real-browser sweep at 1440px is run separately by the orchestrator.

Scope of checks per surface: column alignment, tabular number formatting, no
overflow/bleed, no orphaned or misplaced tags, sensible reading flow, consistent
card styling and section eyebrows, the soft-green-accent palette applied
coherently, and legible chart text at the >=~13px screen / >=14 inline-SVG floor.

## Project-wide invariants (verified)

- **Flat aesthetic**: no active `box-shadow:` / `linear-gradient` / `radial-gradient`
  declaration anywhere (the only matches are comments describing the flat
  discipline). `check_index.mjs` asserts this.
- **0-runtime-network**: no loadable external URL in `index.html` (no
  `src="https:"` / `href="https:"`, no `<link>`/external `<script src>`, no
  `@import`, no `fetch(`). The only `http(s)://` strings are inside bundled
  data `attribution` fields, which never load.
- **Engine frozen**: `src/engine.js` sha256 unchanged
  (`45b388a1edaca77081e62f49e52276f6919448e458610474c7f65aafcb50fae3`).
- **Typography floor**: body 15px tabular-nums; every screen `font-size` is
  >=13px (sole exception: the upscaled `.rsim-lab` 9px map marker glyph, which
  the harness whitelists); every inline-SVG chart base is >=14 user units
  (hero line FS=15, breakdown/sensitivity/scatter FS=14). Harness-asserted.
- **Tables**: global `td.num,th.num{text-align:right;white-space:nowrap}` +
  `td:not(:first-child){font-variant-numeric:tabular-nums}`, so every numeric
  column right-aligns on tabular figures. Every wide table is wrapped in
  `.table-wrap{overflow-x:auto}` so it scrolls horizontally rather than
  bleeding out of its card at 1440px.
- **Responsive layer intact**: the desktop grids collapse to single-column at
  `max-width:860px` (proposal A/B, finance A/B, scatter layout, charge grids)
  and the print/mobile rules under the 1440px sweep are untouched.

## Per-surface checklist

### 1. Portfolio stage

- **Honesty notice + lead/duty prose** — concise single-paragraph lead, a duty
  line, and the "Diagnostic, not a quote" notice. No stray or duplicated
  caveats. The diagnostic-not-a-quote and Unconfirmed body-fit signals are
  preserved (not weakened).
- **Matched-models grid** (`.matched-grid`) — `auto-fit, minmax(220px,260px)`,
  `justify-content:start`, `align-items:stretch`: one model is a tidy single
  card, several pack into neat left-aligned rows. Count figure is the 23px bold
  tabular `.mc-count`; sub-label and verdict are 13px muted. Aligned.
- **Per-truck match table** — numeric Vehicle price / COE price columns are
  `.num` (right-aligned, tabular, two-decimal `money2`); verdict caveat renders
  as a single inline `.tag`, not a trailing ragged label. `.table-wrap`.
- **Vehicle distribution map (scatter, FEAT-004)** — `.scatter-layout` is a
  `minmax(0,1fr) 220px` grid: plot left, axis selectors + legend right, stacking
  under 860px. Inline-SVG, viewBox 560x380, FS=14; X tick labels centred, Y tick
  labels end-anchored, axis titles ink bold (X bottom-centre, Y rotated
  left-centre), 5 gridlines/ticks per axis. SRM dots filled accent `r=6.5`,
  competitors hollow neutral `r=5.5`; the legend dots mirror this. Missing-axis
  models are named in `#scatter-note`, never plotted at 0. No overflow
  (`svg{width:100%;height:auto}`).
- **Full-portfolio switch-over table** — the provenance-badge system is retired:
  spec cells are plain right-aligned editable `.spec-input`s (7em, tabular,
  >=13px) with the `.spec-edited` amber cue on a user edit and **no** per-field
  tag. The Primary/Competitor tag sits in a fixed slot under the model name
  (`.switchover-model .tag{margin:3px 0 0}`) instead of trailing the name. The
  In-play toggle is a fixed-width (3.5em) centred first column. Stated ranges
  (Forland payload 2500-2700 kg; each service S$/km band) render as a quiet
  `.spec-range` second line under the midpoint, not a stray tag. Body-fit is a
  plain `.fit-status` word; evidence is the col-K citation. `.table-wrap`.
- **Full ranked fit guide** — tucked into a `<details>` disclosure so it does
  not compete with the primary matched view. Verdict tiers + thresholds prose.

### 2. TCO dashboard

- **Hero cumulative line chart** — `.chart-hero` is a flex column; `.chart-box`
  is `flex:1 1 auto; min-height:0` and the SVG is `height:100%`, so the chart
  fills the stretched band. viewBox 920x1120 (tall-narrow to match the left
  column), FS=15 so labels clear the floor; wider right margin + de-collision
  gap keep end/target labels legible. n.a. years draw as dashed gaps, never 0.
- **KPI hierarchy** — `.large` 23px bold tight-leading tabular numerals lead;
  `.plan-card h3` / `.kpi` are 13px muted. Consistent S$ formatting.
- **Plan cards + results/validation tables** — `.num` right-aligned tabular;
  all wrapped in `.table-wrap`. Break-even & sensitivity band aligned in the
  dashboard grid.

### 3. Charging & site

- **Lead route-sim panel** — `.charge-panel-lead` carries a 4px accent rail +
  soft wash so the strongest objective evidence reads first. Map container and
  route-sim read panels sit in `.charge-readgrid` (`auto-fit, minmax(230px,1fr)`,
  `align-items:stretch`) so two cards balance to equal columns with no dead
  whitespace at 1440px. Charger table is `.num` + `.table-wrap`.
- **Depot build-up / gates / public-density tables** — all `.table-wrap`, numeric
  columns `.num` tabular. Legends 13px muted. Methodology/caveats consolidated
  into one `.charge-notes` disclosure (coarse-route + dated-snapshot caveats
  preserved, not hidden).

### 4. Proposal (leave-behind)

- **Per-plan A/B blocks** — `.proposal-plan-grid` is a symmetric `1fr 1fr` grid
  with `align-items:start`; each `.proposal-plan-col` stacks its
  Quotation / Servicing / Conditions blocks, so the two plans read as mirrored
  columns. `.block-title` carries a hairline underline as the section spine.
- **Finance breakdown** — `.finance-plan-grid` symmetric `1fr 1fr`; the six
  controls are an `auto-fit, minmax(190px,1fr)` grid (not a ragged flex wrap);
  number fields `width:100%; text-align:right`; breakdown table 13px tabular.
  The finance-excluded exclusion banner is always visible (honesty preserved);
  the whole finance view is fenced with a dashed top rule + canvas wash so it is
  never mistaken for part of the economic TCO.

### 5. Inputs overlay

- Eyebrow `.block-title` "Inputs"; editable tables in `.table-wrap.editwrap`
  with Input / Plan A / Plan B / Unit columns; advanced table adds a meaning
  column. Fields use the shared control styling; `.u` unit labels are right-
  aligned 13px muted min-width 88px so units line up. No bleed (table-wrap).

### 6. Prospects overlay

- `.prospect-card` grid with `.pc-rank` tabular, `.pc-metric .pc-v` right-aligned
  tabular with `overflow-wrap:anywhere` so long values never bleed. The sort
  control matches the shared select styling. Consistent eyebrows and buttons.

## Changes made in this audit

The prior workstreams (FEAT-002..FEAT-005) already resolved the ragged tag
placement, the choppy prose, the number-formatting inconsistencies and the
palette one-offs by construction, and left the full harness suite green. The
by-construction walk + harness run found **no residual overflow/bleed, orphaned
or misplaced tags, ragged text, or inconsistent number formatting** on any
surface, so no further markup/CSS corrections were required. This document is
the deliverable polish checklist; it records the verified state of each surface.

## Final verification gate

- `node tools/build_index.js` — regenerates `index.html`; `git status --short`
  shows only the intended files (index.html, the two harnesses, the two
  fixtures, the competitor + this audit doc).
- `python tools/validate.py` — 19 passed, 0 failed.
- All nine Node harnesses green: check_index, check_portfolio_fit, check_presets,
  check_charging_data, check_routing, check_roadrouter, check_finance,
  check_sgmap, sensitivity.
- `sha256sum src/engine.js` — unchanged
  (`45b388a1edaca77081e62f49e52276f6919448e458610474c7f65aafcb50fae3`).
- 0-runtime-network re-grep — no loadable external URL in `index.html`.
