# Plan of record: live Download-analysis report, 2-column lowest-TCO prospect cards, charging stat-cards + trim

Scope: four user-requested changes to the single-page offline tool `index.html`,
driven from `src/*` where the content is generated and from the hand-maintained
page-controller JS / CSS (outside the `GENERATED` marker blocks) where the
behaviour lives. No engine math changes. `src/engine.js` stays frozen at
sha256 `45b388a1edaca77081e62f49e52276f6919448e458610474c7f65aafcb50fae3`.

## Hard invariants (unchanged)

- `src/engine.js` FROZEN. `scoreProspect` lives inside the ENGINE marker block
  (index.html ~2790, generated from the engine) and is NOT edited. Economics are
  reused from the engine's computed result, never recomputed.
- Fully offline / `file://`. The live report is generated client-side at click
  time as a `Blob` download (same mechanism the current button already uses). No
  fetch / XHR / network of any kind.
- Honesty: no fabricated figures; `n.a.` stays `n.a.`; keep the
  diagnostic/not-a-quotation and coarse-screen caveats (trimmed, present).
- Typography >= 10-12pt including any new card text. Desktop-first 1440px primary
  plus mobile ~390px non-regression.
- Never hand-edit GENERATED marker blocks; out-of-marker page-controller JS/CSS
  is edited in place and survives `node tools/build_index.js` (verified by a
  rebuild diff).

---

## Change 1 - Download analysis becomes a live print-out of current inputs + TCO

Today `wireBriefDownload()` (index.html ~8757) Blob-downloads the STATIC
`window.HSSimBrief.markdown` (pre-baked `docs/simulation-results-brief.md`).

Decision of record: the `#download-brief` button PRIMARY behaviour becomes a
GENERATED-AT-CLICK-TIME live current-state report built from:
- the live inputs in `window.__HS.state` (fleet/duty register, replacement plan,
  energy & charging, operating costs, committed saving target, customer meta if
  present); and
- the live engine outputs via `window.__HS.computeReframed()` - the SAME
  two-state merged result the live UI renders (`recompute()` -> `renderResults`,
  `renderDecision`, `renderProposal`). We do NOT call the engine a second way; we
  reuse `computeReframed()` so the report matches exactly what is on screen.

Report content (Markdown, `.md`, read like a snapshot of what the user sees):
1. Header + the diagnostic/not-a-quotation caveat (kept verbatim in spirit).
2. Current fleet & duty inputs the user entered (per-truck register summary,
   included-truck count, work km/day, days/year, demanding-day km, peak cargo).
3. Resolved Plan A (SRM) vs Plan B (competitor) models + their resolved prices /
   quotes, from the live reframe label/model resolution the UI already shows.
4. Energy / operating-cost inputs (diesel price & L/km, electricity price &
   kWh/km, the operating-cost rows the engine read).
5. The full TCO comparison table across all four paths (Keep ICE / New ICE /
   Plan A / Plan B): Truck count, Vehicle economic TCO, Net site cost, Total
   economic TCO, Saving vs Keep ICE, Saving %, target headroom, Day-0 funding,
   Cost per productive km, site/vehicle/claim status - exactly the rows
   `renderResults` renders from `out.results`.
6. The decision line: the committed saving target, and the best EV plan by
   LOWEST Total economic TCO (same rule as change 2), with its saving %.

Honesty: every figure uses the shared formatter; where a figure is `n.a.` in the
live state it prints `n.a.` (never a fabricated zero). Numbers come only from the
engine result object - nothing is recomputed in the generator.

Old static brief: KEEP IT AVAILABLE, do not throw away the all-12-model
5yr/10yr section. Decision of record: the generated live report's PRIMARY content
is the current inputs + current TCO (sections 1-6 above); we APPEND a clearly
labelled "Reference: all-models 5yr/10yr TCO & methodology" section by reusing
the bundled `window.HSSimBrief.markdown` so the valuable static context is not
lost. Filename reflects it is a live snapshot (e.g.
`ev-truck-tco-current-analysis.md`). This keeps `window.HSSimBrief` bundled
(check_index's existing simbrief assertions stay valid) while the button now
emits the live report first.

> OPEN HUMAN DECISION (flagged, non-blocking): keep-appended static section vs
> fully dropping it. Default taken: keep it appended, clearly marked "Reference".

Implementation: a new pure generator function (e.g.
`buildLiveAnalysisMarkdown(state, out)`) in the page controller near
`wireBriefDownload`, taking the live state + `computeReframed()` output and
returning a non-empty markdown string. `wireBriefDownload` calls it at click time
instead of reading the static string directly.

## Change 2 - Prospect cards: exactly 2 columns, "Best EV plan" = lowest TCO

Layout: `.prospect-cards` (index.html ~503) currently
`grid-template-columns:repeat(auto-fit,minmax(260px,1fr))` (~3 cols in the
`min(62vw,960px)` drawer). Change to exactly TWO columns
`repeat(2,minmax(0,1fr))`, legible, no overflow. Mobile `<=700px` rule
(index.html ~818 `.prospect-cards{grid-template-columns:1fr}`) already collapses
to 1 column - verified kept.

"Best EV plan": `scoreProspect` is FROZEN (engine block) and currently selects by
largest Saving % with gate logic; it drives BOTH the card display AND the
ranking keys. Decision of record: we DO NOT change `scoreProspect`. We change
only the DISPLAYED "Best EV plan" value on the card, in the prospect card
renderer (index.html ~8470, the `metrics` string building `s.bestPlanLabel`):
- From the SAME `out = ENG.computeFleet(c.inputs)` already computed in
  `scoreCase`, among Plan A / Plan B that deploy EVs (`out.results.evYear10`>0)
  AND have a NUMERIC Total economic TCO (`out.results.totalEconomicTco`), pick
  the plan with the LOWEST Total economic TCO. Ties -> Plan A (matches the
  existing tie rule). If neither EV plan has a numeric Total, fall back to the
  existing honest `s.bestPlanLabel` (diagnostic/vehicle-only), so the honest
  flag is preserved.
- Note on correctness: for a fixed Keep-ICE baseline, lowest Total economic TCO
  == largest saving vs Keep ICE, so this usually coincides with scoreProspect's
  pick; the difference only matters when gate exclusion would otherwise flip the
  displayed plan. The gate/claim caveat on the card (gateStatus, fifteenTarget)
  is left exactly as scoreProspect produced it - we only relabel the displayed
  best plan.
- Ranking keys (`benefitKey`/`accountKey`) are UNCHANGED (still scoreProspect),
  so sort order is not silently broken. This is stated in the handover.

`scoreCase` already returns `{c, s}`; we extend it to also surface the lowest-TCO
displayed plan (e.g. `{c, s, out}` or a precomputed `displayBestPlanLabel`) so the
renderer can show it without a second computeFleet call.

## Change 3 - Charging page: live figures as highlight stat cards; trim prose

The Stage-3 live cost counter `#rsim-cost-counter` (index.html ~1281, rendered by
`renderRsimCostCounter` ~6124) already emits `.rc-metric` tiles for running cost
S$, total charge time, charging stops. Decision of record:
- Restyle `.rsim-cost`/`.rc-metrics`/`.rc-metric` (CSS ~664-671) into distinct
  highlight STAT CARDS that visually pop: bordered/elevated card tiles in a grid,
  large tabular-nums value, muted label, a subtle "live" accent, so a change on
  route edit is obvious at a glance. Keep value font large (>=18px) and labels
  >=12px.
- ADD the other live-updating route numbers as stat cards in the same strip, read
  from the SAME `renderRoutingSim` locals that are already computed: route km
  (`routeKm`, on-road vs straight-line), detour km (already shown inline via
  `detour.detourKm`), reachable-charger count (`reach.reachableCount`), and the
  depot-feasibility margin km (`depot.marginKm`). These are passed into / surfaced
  by the cost-counter render (or a sibling render) so they update live with the
  route. Honesty preserved: `n.a.` when a figure is unavailable.
- TRIM excess prose on the Charging stage that does not add value. The
  methodology caveats are ALREADY consolidated once in `#charging-notes`
  (index.html ~1333, a `<details>`). We shorten the repetitive inline `.small`
  lead paragraphs on the four cards to a single concise honesty line each (and
  remove duplicate sentences that merely repeat `#charging-notes`), keeping the
  `coarse-label` tokens and the `#charge-detour-note` what-if line that harnesses
  assert. The long multi-sentence `rc-caveat` under the cost counter is trimmed to
  one concise "Diagnostic, not a quotation; coarse screen" line (the full
  methodology remains in `#charging-notes`).

> OPEN HUMAN DECISION (flagged, non-blocking): exactly which inline descriptions
> to cut. Default taken: cut only sentences duplicated in `#charging-notes`; keep
> every unique honesty signal and every harness-asserted token.

## Change 4 - Validation (extend, do not weaken)

- `python tools/validate.py` stays 19/19.
- Extend `tools/check_index.mjs` (ADDITIVE, no weakening):
  - live report: a generator function exists and produces non-empty markdown
    from a state + engine output (assert the handler no longer ONLY reads the
    static string; assert a generator symbol exists and still builds a Blob /
    createObjectURL and introduces no fetch/XHR).
  - prospects: `.prospect-cards` grid is exactly 2 columns
    (`repeat(2,...)`), and the mobile `1fr` rule remains.
  - best plan: the card's displayed best plan follows lowest Total economic TCO
    (assert on a synthetic/seed case that the displayed plan equals the numeric
    lowest-Total EV plan).
  - charging: new stat cards present (route km / detour km / reachable chargers /
    depot margin as `.rc-metric`-style tiles), and the trimmed-but-present
    honesty caveat still exists.
- Re-run the full node harness suite green: check_index, check_presets,
  check_portfolio_fit, check_charging_data, check_routing, check_roadrouter,
  check_finance, check_sgmap, sensitivity, check_simbrief, verify_gemini_prospects.

## Build chain

Changes are in hand-maintained page-controller JS/CSS OUTSIDE marker blocks, so
`node tools/build_index.js` must leave them intact (verified by rebuild diff). If
any `src/*` or fixture is touched, run
`python tools/build_prospects.py && node tools/build_simbrief_models.mjs && node tools/build_index.js`.
For this task no `src/*` engine/fixture edit is expected.

## Live/browser verification (orchestrator + Playwright)

At 1440px: (a) click Download analysis, confirm the downloaded markdown reflects
current inputs + current TCO; change an input, re-download, confirm it changed;
(b) Prospects shows exactly 2 columns and each card's Best EV plan is the
lowest-TCO plan (spot-check vs engine results); (c) Charging stage live figures
render as highlight stat cards that update on route change, redundant prose
trimmed. Mobile ~390px: prospects -> 1 column; charging cards stack. Zero runtime
network except the page itself.
