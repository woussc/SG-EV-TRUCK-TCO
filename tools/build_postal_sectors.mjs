#!/usr/bin/env node
/*
 * tools/build_postal_sectors.mjs
 * ==============================
 * Build-time generator for tools/fixtures/sg_postal_sectors.json, the compact
 * Singapore postal-SECTOR -> approximate-centroid table used by the Charging-tab
 * route simulator's offline postal-code input (FEAT-001, Option C).
 *
 * WHAT THIS IS (and is NOT) - read before trusting a coordinate
 * -------------------------------------------------------------
 * Singapore's 6-digit postal code's FIRST TWO DIGITS are its postal SECTOR
 * (e.g. 01..82), and each sector belongs to one of the 28 General Postal
 * DISTRICTS. This builder hard-codes the PUBLIC sector->district register (the
 * standard SingPost / URA general postal-district table that every Singapore
 * directory reproduces) plus one APPROXIMATE centroid per district (a coarse
 * town/planning-area anchor, decimal degrees, the same calibre of coarse anchor
 * as src/sg_map.js SG_AREAS). A 6-digit code is resolved to its SECTOR's
 * centroid and MUST be labelled "sector-level approximate" in the UI.
 *
 * This is NOT a building-level geocoder and bundles NO full 6-digit address
 * dataset. It is public REFERENCE data (district composition + coarse centroids),
 * not fabricated precise address points. The user can still nudge the dropped
 * marker by clicking/dragging the map for a precise location.
 *
 * NO third-party deps, NO network. Deterministic. Re-run after editing the
 * reference tables below:
 *
 *   node tools/build_postal_sectors.mjs
 *
 * Output shape (consumed by src/sg_map.js resolvePostalCode + window.HSPostalSectors):
 *   {
 *     attribution, note, license,
 *     bounds: { latMin, latMax, lonMin, lonMax },
 *     sectors: { '01': { lat, lon, label }, ... }   // ~80 entries
 *   }
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// SG bounding box the whole app's projection is fit to (matches
// src/sg_map.js SG_BBOX and the bundled basemap/charger bounds). Every emitted
// centroid MUST fall inside this box.
const SG_BBOX = { latMin: 1.15, latMax: 1.50, lonMin: 103.55, lonMax: 104.10 };

/*
 * The 28 Singapore GENERAL POSTAL DISTRICTS, each with an APPROXIMATE centroid
 * (a coarse town / planning-area anchor, decimal degrees) and a human area
 * label. Coordinates are deliberately coarse district anchors (NOT exact
 * addresses); they are the same calibre of planning anchor as SG_AREAS. Every
 * coordinate lies inside SG_BBOX.
 */
const DISTRICTS = {
  1:  { lat: 1.2820, lon: 103.8510, area: 'Raffles Place, Cecil, Marina, People\u2019s Park' },
  2:  { lat: 1.2770, lon: 103.8440, area: 'Anson, Tanjong Pagar' },
  3:  { lat: 1.2870, lon: 103.8300, area: 'Queenstown, Tiong Bahru, Alexandra' },
  4:  { lat: 1.2660, lon: 103.8220, area: 'Telok Blangah, Harbourfront, Sentosa' },
  5:  { lat: 1.2950, lon: 103.7850, area: 'Pasir Panjang, Hong Leong Garden, Clementi New Town' },
  6:  { lat: 1.2900, lon: 103.8520, area: 'High Street, Beach Road (City Hall)' },
  7:  { lat: 1.3010, lon: 103.8560, area: 'Middle Road, Golden Mile, Bugis' },
  8:  { lat: 1.3110, lon: 103.8560, area: 'Little India, Farrer Park' },
  9:  { lat: 1.3060, lon: 103.8300, area: 'Orchard, Cairnhill, River Valley' },
  10: { lat: 1.3080, lon: 103.8080, area: 'Tanglin, Holland, Bukit Timah' },
  11: { lat: 1.3250, lon: 103.8320, area: 'Watten Estate, Novena, Thomson' },
  12: { lat: 1.3270, lon: 103.8620, area: 'Balestier, Toa Payoh, Serangoon' },
  13: { lat: 1.3330, lon: 103.8830, area: 'Macpherson, Braddell' },
  14: { lat: 1.3190, lon: 103.8920, area: 'Geylang, Eunos' },
  15: { lat: 1.3060, lon: 103.9050, area: 'Katong, Joo Chiat, Amber Road' },
  16: { lat: 1.3240, lon: 103.9300, area: 'Bedok, Upper East Coast, Siglap' },
  17: { lat: 1.3480, lon: 103.9810, area: 'Loyang, Changi' },
  18: { lat: 1.3540, lon: 103.9450, area: 'Tampines, Pasir Ris' },
  19: { lat: 1.3700, lon: 103.8970, area: 'Serangoon Garden, Hougang, Punggol' },
  20: { lat: 1.3620, lon: 103.8470, area: 'Bishan, Ang Mo Kio' },
  21: { lat: 1.3400, lon: 103.7760, area: 'Upper Bukit Timah, Clementi Park, Ulu Pandan' },
  22: { lat: 1.3330, lon: 103.7420, area: 'Jurong, Boon Lay, Tuas' },
  23: { lat: 1.3700, lon: 103.7640, area: 'Hillview, Dairy Farm, Bukit Panjang, Choa Chu Kang' },
  24: { lat: 1.3900, lon: 103.7000, area: 'Lim Chu Kang, Tengah' },
  25: { lat: 1.4360, lon: 103.7860, area: 'Kranji, Woodgrove, Woodlands' },
  26: { lat: 1.3900, lon: 103.8150, area: 'Upper Thomson, Springleaf' },
  27: { lat: 1.4420, lon: 103.8250, area: 'Yishun, Sembawang' },
  28: { lat: 1.3960, lon: 103.8720, area: 'Seletar, Punggol' },
};

/*
 * SECTOR -> DISTRICT map: the standard public SG general postal-district
 * register. Keys are the two-digit postal SECTORS (first two digits of the
 * 6-digit code); values are the district number above. This is the composition
 * every Singapore postal-code directory reproduces (sectors 01..82; 74 is not
 * assigned in the general register, matching the official table).
 */
const SECTOR_DISTRICT = {
  '01': 1, '02': 1, '03': 1, '04': 1, '05': 1, '06': 1,
  '07': 2, '08': 2,
  '14': 3, '15': 3, '16': 3,
  '09': 4, '10': 4,
  '11': 5, '12': 5, '13': 5,
  '17': 6,
  '18': 7, '19': 7,
  '20': 8, '21': 8,
  '22': 9, '23': 9,
  '24': 10, '25': 10, '26': 10, '27': 10,
  '28': 11, '29': 11, '30': 11,
  '31': 12, '32': 12, '33': 12,
  '34': 13, '35': 13, '36': 13, '37': 13,
  '38': 14, '39': 14, '40': 14, '41': 14,
  '42': 15, '43': 15, '44': 15, '45': 15,
  '46': 16, '47': 16, '48': 16,
  '49': 17, '50': 17, '81': 17,
  '51': 18, '52': 18,
  '53': 19, '54': 19, '55': 19, '82': 19,
  '56': 20, '57': 20,
  '58': 21, '59': 21,
  '60': 22, '61': 22, '62': 22, '63': 22, '64': 22,
  '65': 23, '66': 23, '67': 23, '68': 23,
  '69': 24, '70': 24, '71': 24,
  '72': 25, '73': 25,
  '77': 26, '78': 26,
  '75': 27, '76': 27,
  '79': 28, '80': 28,
};

function inBbox(lat, lon) {
  return lat >= SG_BBOX.latMin && lat <= SG_BBOX.latMax &&
    lon >= SG_BBOX.lonMin && lon <= SG_BBOX.lonMax;
}

const sectors = {};
const bounds = { latMin: Infinity, latMax: -Infinity, lonMin: Infinity, lonMax: -Infinity };
for (const sector of Object.keys(SECTOR_DISTRICT).sort()) {
  const dist = SECTOR_DISTRICT[sector];
  const d = DISTRICTS[dist];
  if (!d) throw new Error('sector ' + sector + ' maps to unknown district ' + dist);
  const lat = Math.round(d.lat * 10000) / 10000;
  const lon = Math.round(d.lon * 10000) / 10000;
  if (!inBbox(lat, lon)) {
    throw new Error('district ' + dist + ' centroid (' + lat + ',' + lon + ') is outside SG_BBOX');
  }
  sectors[sector] = {
    lat, lon,
    label: 'District ' + dist + ' \u00b7 ' + d.area,
  };
  if (lat < bounds.latMin) bounds.latMin = lat;
  if (lat > bounds.latMax) bounds.latMax = lat;
  if (lon < bounds.lonMin) bounds.lonMin = lon;
  if (lon > bounds.lonMax) bounds.lonMax = lon;
}

const doc = {
  schemaVersion: 1,
  attribution: 'Singapore general postal-district register (public reference: SingPost / URA postal districts). Centroids are coarse district anchors, not exact addresses.',
  license: 'Public reference data (postal-district composition).',
  note: 'sector-level approximate centroids; first two digits of the SG 6-digit postal code',
  bounds: {
    latMin: Math.round(bounds.latMin * 10000) / 10000,
    latMax: Math.round(bounds.latMax * 10000) / 10000,
    lonMin: Math.round(bounds.lonMin * 10000) / 10000,
    lonMax: Math.round(bounds.lonMax * 10000) / 10000,
  },
  sectors,
};

const here = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(here, 'fixtures/sg_postal_sectors.json');
writeFileSync(outPath, JSON.stringify(doc, null, 2) + '\n');

const n = Object.keys(sectors).length;
console.log('sg_postal_sectors.json written: ' + n + ' sectors over ' +
  Object.keys(DISTRICTS).length + ' districts.');
console.log('  bounds: lat ' + doc.bounds.latMin + '..' + doc.bounds.latMax +
  ', lon ' + doc.bounds.lonMin + '..' + doc.bounds.lonMax);
console.log('  bytes : ' + Buffer.byteLength(JSON.stringify(doc)));
