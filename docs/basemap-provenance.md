# Offline Singapore basemap: source, licence, and simplification

The Charging-tab route simulator (FEAT-004) draws a **real, fully-offline**
Singapore outline. Because the shipped page makes **zero runtime network calls**
(no map tiles, no map API, no geocoder, no CDN), the outline is bundled at build
time as a small local asset and inlined into `index.html` as `window.HSBasemap`.

## Source

- **Dataset:** geoBoundaries gbOpen `SGP` ADM0 (national boundary).
- **API:** `https://www.geoboundaries.org/api/current/gbOpen/SGP/ADM0/` →
  `gjDownloadURL` (a GeoJSON `MultiPolygon`).
- **Raw file (vendored, build-time only):** `assets/sg-adm0-source.geojson`
  (~314 KB, 12 polygons, ~8,070 vertices; bbox lon 103.605–104.089 /
  lat 1.189–1.471).
- **Licence:** ODbL 1.0.
- **Boundary source:** Urban Redevelopment Authority, derived from ADM 3.
- **Licence source:** data.gov.sg `master-plan-2014-subzone-boundary-no-sea`.

The raw high-detail file is **not shipped**; only the simplified asset is.

## Build-time simplification

`tools/build_basemap.mjs` (deterministic, Node stdlib only, no network):

1. Parses the source `MultiPolygon` (each polygon is a single outer ring here).
2. Drops tiny slivers (rings whose bounding-box diagonal is below ~0.010° ≈ 1.1 km).
3. Simplifies each kept ring with **Douglas–Peucker** (tolerance ~0.0012° ≈ 130 m)
   in lon/lat degree space.
4. Rounds coordinates to 4 decimal places (~11 m).
5. Emits `tools/fixtures/sg_basemap.json` with `schemaVersion`, `attribution`,
   `license`, `bounds`, `source`, `generatedAt`, and
   `polygons:[[ [lon,lat], … ], …]`.

Result at the current tolerance: **8,070 → 534 vertices, ~9.93 KB** inlined JSON
(well under the ~60 KB budget), all 12 polygons kept (mainland + major islands).

Re-generate after changing the source or tolerance:

```sh
node tools/build_basemap.mjs
node tools/build_index.js
```

## Attribution (shown in the map UI)

> Singapore boundary © geoBoundaries (gbOpen SGP ADM0), ODbL 1.0; boundary
> source Urban Redevelopment Authority, derived from data.gov.sg Master Plan
> 2014 Subzone Boundary (No Sea). Simplified for offline display; coarse
> outline, not a survey boundary.

The attribution string is carried inside `sg_basemap.json` and appended to the
simulator's attribution line alongside the existing LTA DataMall / BoCharge
charger-data attribution.

## Honesty

This is a **coarse display outline** for orientation only, not a survey-grade
boundary. Route legs drawn on it are **great-circle (straight-line)** distances,
not turn-by-turn driving distance, and the charger data is a **dated snapshot**.
