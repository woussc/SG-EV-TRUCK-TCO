# Charging-map route-simulator upgrade — plan of record

Status: approved to implement (postal-code decision confirmed by user = Option C).
Branch: `feat/charging-map-route-sim`. Frozen engine `src/engine.js` (sha256
`45b388a1edaca77081e62f49e52276f6919448e458610474c7f65aafcb50fae3`) is NOT
touched. All new numbers come from a separate routing/charging simulation that
never feeds back into the economic TCO engine. The tool stays fully offline and
static (opens under `file://`, zero runtime network).

## What the user asked for (Charging tab map)

1. Postal-code input to drop a precise location/stop.
2. Mouse-drag pan (map currently cannot be moved).
3. Datapoints + route lines that scale correctly with zoom in/out.
4. A quick "return to depot" button that closes the loop from the last stop.
5. A live cost counter plus TWO coloured lines on the same map: the SRM's
   on-road route, and a charging-detour line that, from a realistic fleet-manager
   point of view, routes to the nearest charger before the battery would deplete,
   showing where each charging stop is and how long each one takes.

## Current state (what already exists, reuse — do not reinvent)

- `src/sg_map.js` — pure projection (`project`/`unproject`), `routeDistanceKm`,
  `distanceToRouteKm`, `reachableChargers`, `depotFeasibility`. No DOM.
- `src/road_router.js` — offline A* over the bundled major-road graph
  (`routeOnRoad`, `routeOnRoadSequence`). Real roads, honest degrade to
  great-circle for unroutable legs.
- `src/routing_sim.js` — `haversineKm`, `nearestChargers`, `chargeTimeHours`,
  `headlinePlug`. The charge-time math (reserve + loss) lives here.
- `index.html` page-controller (outside marker blocks): `rsimState` holds
  `stops` + a `view` (SVG viewBox) pan/zoom model; zoom +/−/Reset buttons are
  already wired; click-to-drop places depot then stops; `rsimComputeRoute` draws
  the on-road polyline with an honest dashed straight-line fallback; the
  depot/public feasibility panels and the reachable-charger table already render.
- Charger data `tools/fixtures/charging_locations.json` (~1,200 real SG points:
  lat/lon/operator/plug/power/price). Road graph + basemap already bundled.

So three of the five asks are partial-existing (viewBox zoom, click-to-drop) and
two are entirely new (postal code, drag-pan, dual-line charging-detour sim, live
cost counter, return-to-depot).

## Design decisions

### 1. Postal-code input — Option C (user-confirmed)

Honest offline resolution with no geocoder:

- Bundle a NEW compact fixture `tools/fixtures/sg_postal_sectors.json`: the ~80
  Singapore postal SECTORS (first two digits of the 6-digit code) mapped to an
  approximate centroid lat/lon, built by a NEW `tools/build_postal_sectors.mjs`
  from the bundled, public General Register of postal districts/sectors. Bundle
  impact: a few KB inline (negligible next to the existing ~520 KB road graph).
- A 6-digit code resolves to its sector centroid, labelled clearly as
  **sector-level approximate** in the UI and the dropped marker's tooltip. No
  fabricated precise coordinate is ever presented as exact.
- Option C refine: after a code drops a sector-centroid marker, the user can
  still click/drag on the map to nudge the marker to the precise spot (the
  existing click-to-drop behaviour is preserved and documented in the hint).
- Validation: input must be exactly 6 digits; the sector (first two digits) must
  exist in the table, else an inline "unknown sector" message (honest degrade,
  never a silent wrong drop).

Trade-off recorded for the user: sector-level centroids are approximate
(town/sector granularity, typically within ~1–2 km of the true address), chosen
to keep the single static `index.html` small and fully offline. A full 6-digit
building-point dataset (Option B) would be precise but several MB and was
declined.

### 2. Mouse-drag pan

Add `mousedown`/`mousemove`/`mouseup` (and touch equivalents for mobile
non-regression) handlers on the map SVG that translate the `rsimState.view`
viewBox by the dragged pixel delta scaled to viewBox units, clamped by the
existing `clampView()`. A small drag threshold distinguishes a pan-drag from a
click-to-drop so dropping a stop still works (only a near-zero-movement
pointerup drops a stop). Cursor switches to `grab`/`grabbing`.

### 3. Zoom-scaling of datapoints and lines

Because the SVG uses a viewBox zoom, raw geometry scales automatically, but fixed
viewBox-unit marker radii/stroke widths would grow/shrink with zoom and can
become illegible or huge. Introduce a zoom factor `k = RSIM_VIEW_W / view.w` and
divide marker radii, label font-size, route/detour stroke widths and the casing
by `k` so their EFFECTIVE on-screen size stays roughly constant and legible
(labels kept at an effective >= 10–12px). Geometry (polylines, outline) still
scales with the map; only the symbol sizes are zoom-compensated so points and
lines stay consistent and readable at every zoom level. Re-rendered on every
zoom/pan.

### 4. Return-to-depot button

A new `#rsim-return-depot` button in `.rsim-controls`. When there are >= 2 stops
and a depot, it appends a copy of the depot (stop[0]) as a final stop so the
on-road route closes the loop back to the depot, then `recompute()`. Disabled /
no-op when there is no depot or the last stop already equals the depot.

### 5. Live cost counter + dual-line on-road + charging-detour simulation

New pure function in `src/routing_sim.js`:
`simulateChargingDetour({ stops, routePolyline, locations, spec, startSocFraction,
reserveFraction, chargeLossFraction, graph?, router? })` returning a
deterministic plan:

- Walk the on-road route polyline leg by leg, depleting battery at
  `spec.kwhPerKm`.
- BEFORE SoC would drop below the reserve floor on the next segment, find the
  NEAREST charger (via `nearestChargers`/haversine over the bundled locations)
  to the current position, insert a charging stop there, compute the top-up
  energy and `chargeTimeHours` at that charger's power, and resume.
- Each charging stop records: location (lat/lon + operator), arrival SoC, energy
  added (kWh incl. loss), charge duration (via `chargeTimeHours`), and the
  per-kWh tariff from the charger record.
- Running cost tally = sum over charge events of `energyKwh * pricePerKwh`
  (charger tariff; when a charger has no published price, that event's cost is
  flagged n.a. and excluded from the numeric tally, never fabricated) plus the
  detour distance's energy at the relevant tariff. Returns `totalCost`,
  `totalChargeHours`, `events[]`, and `detourKm`.

Controller wiring:

- Draw a SECOND coloured polyline (the charging-detour path: on-road legs from
  the route to each charger and back, via `routeOnRoad` where possible, honest
  dashed great-circle fallback otherwise) distinct in colour from the primary
  on-road route. Add legend entries + marker styling for charging-stop pins
  (distinct from depot/route/reachable pins) with a tooltip showing operator,
  power, charge duration, and energy.
- A live cost-counter readout (`#rsim-cost-counter`) updates on every route
  change (add stop, postal drop, drag, return-to-depot, DC-only toggle) showing
  running S$ cost, total charge time, and number of charging stops, with the
  standard "diagnostic, not a quotation" caveat and the sector-approximate note.

The counter and detour sim are a SEPARATE client-side simulation; they do not
call or alter `computeFleet` / the frozen engine. SRM stays the modelled vehicle
(battery kWh and kWh/km from the active catalogue row via `activeEvProduct`).

## Build / honesty invariants

- Never hand-edit the generated marker blocks in `index.html`; edit `src/*` and
  `tools/fixtures/*`, then rebuild with `node tools/build_index.js`. The
  page-controller JS (outside marker blocks) is edited in place for the new UI.
- `build_index.js` gains a `sg_postal_sectors.json` inline block
  (`window.HSPostalSectors`) following the existing fixture-block pattern, and
  the `routing_sim.js` namespace export gains `simulateChargingDetour`.
- Keep all existing caveats; add "sector-level approximate" + "charging-detour /
  cost is a diagnostic, not a quotation" lines.
- Typography: all new map text effective >= 10–12px. Desktop-first 1440px,
  mobile ~390px non-regression.

## Validation (extend, never weaken)

- `python tools/validate.py` stays 19/19.
- Extend `tools/check_sgmap.mjs`: assert zoom-factor marker-scaling helper and
  postal-sector resolution (a known 6-digit code -> its sector centroid inside
  the bbox; an unknown sector -> null).
- Extend `tools/check_routing.mjs`: assert `simulateChargingDetour` inserts a
  charging stop before the reserve floor is breached on a long route, that each
  event has a positive duration and energy, that the cost tally equals the hand
  summed `energyKwh * price`, and that a no-price charger is excluded (n.a.) not
  fabricated. Assert the return-to-depot closing leg.
- `tools/check_roadrouter.mjs` / `tools/check_charging_data.mjs`: keep green;
  add a detour-leg routing assertion where relevant.
- `tools/check_index.mjs` (DOM shim, guards the HTMLCollection.forEach-style
  TypeErrors): keep green; add presence assertions for the new postal input,
  return-to-depot button, and cost counter.
- Live browser pass (Playwright, 1440px + 390px): postal drop, drag-pan,
  zoom-scaling legibility, return-to-depot closing leg, two coloured lines +
  charging stops + live cost counter updating; zero runtime network except the
  page itself. Screenshots to `.kiro/artifacts/screenshots/`.

## Open human decisions

- Postal-code precision trade-off: confirmed Option C (sector centroid + map
  click/drag refine). If precise 6-digit building points become required later,
  that is a follow-up (source + bundle the larger dataset, accept the size).
