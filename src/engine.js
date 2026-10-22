/*
 * Hong Seh EV Truck TCO engine
 * =============================
 * Pure, deterministic, dependency-free ES module. No DOM, no network, no
 * third-party imports, no LLM/API calls. Runs identically in a browser and in
 * Node (import { computeFleet } from './engine.js').
 *
 * It reverse-engineers the authoritative workbook
 *   "Hong Seh - EV TCO Calculator - Fleet, Charging and Service v5.xlsx"
 * reproducing the Paths -> Annual build -> Results -> Review calc chain.
 *
 * PROVENANCE MAP (Excel sheet!cell -> engine output field)
 * --------------------------------------------------------
 *   Results!B9:E9    Truck count                 -> results.truckCount        (Paths!B,C COUNTIFS)
 *   Results!B10:E10  EVs at month 0              -> results.evMonth0
 *   Results!B11:E11  EVs at year 10              -> results.evYear10
 *   Results!B12:E12  Vehicle economic TCO        -> results.vehicleEconomicTco (SUMIFS Annual build!N by plan)
 *   Results!B13:E13  Net site ownership cost     -> results.netSiteCost        (SUM Results!F45:I55 schedule)
 *   Results!B14:E14  Total economic TCO          -> results.totalEconomicTco
 *   Results!B15:E15  Saving vs Keep ICE          -> results.savingVsKeep
 *   Results!B16:E16  Saving percentage           -> results.savingPct
 *   Results!B17:E17  15% fleet saving headroom   -> results.headroom15
 *   Results!B18:E18  Cash less year-10 assets    -> results.cashLessTerminal   (SUM Annual build!O / site cash)
 *   Results!B19:E19  Day-0 funding before loans  -> results.day0Funding        (SUMIFS Annual build!R + site cash yr0)
 *   Results!B20:E20  Incremental day-0 funding   -> results.incrementalDay0
 *   Results!B21:E21  Cost per productive km      -> results.costPerKm          (total / SUMIFS Annual build!S)
 *   Results!B22:E22  Site completeness / access  -> results.siteStatus         (Energy and charging!B67/C67)
 *   Results!B23:E23  Vehicle service / evidence  -> results.vehicleStatus      (Paths!Q cascade)
 *   Results!B24:E24  Saving claim status         -> results.savingClaimStatus
 *   Results!D26:E26  Max site TCO for 15% saving -> results.maxSiteTco15
 *   Energy and charging!B60:C60 Input completeness-> site.completeness
 *   Energy and charging!B61:C61 Gross initial site-> site.grossInitial
 *   Energy and charging!B62:C62 Annual site cost  -> site.annual
 *   Energy and charging!B63:C63 Grant budget ceiling-> site.grantCeiling
 *   Energy and charging!B64:C64 Initial cost less award-> site.initialLessAward
 *   Energy and charging!B65:C65 Peak depot energy -> site.peakDepotEnergy
 *   Energy and charging!B66:C66 Total charging hours-> site.chargingHours
 *   Energy and charging!B67:C67 Access/capacity   -> site.accessCheck
 *   Energy and charging!B68:C68 EVs using arrangement-> site.evCount
 *   Review!B7:D18    Reconciliation checks        -> review.*
 *
 * The four plan codes mirror Paths!B: 0 = Keep ICE (then new ICE),
 * 1 = all-new ICE now, 2 = Plan A, 3 = Plan B.
 *
 * Excel quirks reproduced faithfully: ROUNDUP (public/diesel visit counts),
 * EDATE registration dates, old/new month proration at the replacement month,
 * year-band escalation (1+growth)^max(0,year-1), NPV (1+discount)^-year, the
 * "n.a." propagation guards (status must be "Complete" and the path count must
 * equal the included truck count before a numeric total is produced), and the
 * demonstration defaults (discount = 0, all growth = 0 -> escalation = 1).
 */

export const NA = 'n.a.';

/* ------------------------------------------------------------------ *
 * Excel-compatible primitives
 * ------------------------------------------------------------------ */
function isNum(v) {
  return typeof v === 'number' && isFinite(v);
}
function roundUp(x) {
  // Excel ROUNDUP(x,0): away-from-zero to the next integer.
  if (x >= 0) return Math.ceil(x - 1e-9);
  return -Math.ceil(-x - 1e-9);
}
// EDATE(startDate, months): add whole months, clamped to month end.
function edate(startDate, months) {
  const d = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
  const targetMonthIndex = d.getUTCMonth() + months;
  const y = d.getUTCFullYear() + Math.floor(targetMonthIndex / 12);
  const m = ((targetMonthIndex % 12) + 12) % 12;
  const day = d.getUTCDate();
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(day, lastDay)));
}
function parseDate(v) {
  if (v instanceof Date) return v;
  if (typeof v === 'string') {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Input normalisation
 * ------------------------------------------------------------------ *
 * Accepts the fixture shape (tools/fixtures/demo_case.json -> .inputs):
 *   fleet_register.rows   : [{_row, A..S}]           keyed by column letter
 *   replacement_plan.rows : [{_row, A..AI}]
 *   operating_costs.rows  : [{_row, label, values:{B,C,D}}]
 *   energy_and_charging.rows: [{_row, label, values:{B,C,D,E}}]
 *   products.rows         : [{_row, A..Q}]
 *   service_costs.rows    : [{_row, A..Z}]
 */
function buildModel(inputs) {
  // Operating costs: row -> B value.
  const oc = {};
  for (const r of inputs.operating_costs.rows) {
    oc[r._row] = r.values ? r.values.B : r.B;
  }

  // Energy and charging input rows: row -> {B,C}.
  const ec = {};
  for (const r of inputs.energy_and_charging.rows) {
    const v = r.values || r;
    ec[r._row] = { B: v.B, C: v.C };
  }

  // Products by model name (col A).
  const products = {};
  for (const r of inputs.products.rows) {
    if (r.A != null) products[r.A] = r;
  }

  // Fleet register by truck ID (col A), only rows with an ID.
  const fleet = {};
  const fleetRows = [];
  for (const r of inputs.fleet_register.rows) {
    if (r.A != null) {
      fleet[r.A] = r;
      fleetRows.push(r);
    }
  }

  // Replacement plan by truck ID (col A).
  const repl = {};
  for (const r of inputs.replacement_plan.rows) {
    if (r.A != null) repl[r.A] = r;
  }

  const analysisStart = parseDate(oc[63]) || new Date(Date.UTC(2026, 9, 3));

  return { oc, ec, products, fleet, fleetRows, repl, analysisStart };
}

// VLOOKUP into Fleet register A7:S106, column index (1-based) 2..19 -> B..S.
const FR_COL = ['', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S'];
function frLookup(model, id, colIdx) {
  const row = model.fleet[id];
  if (!row) return undefined;
  return row[FR_COL[colIdx]];
}

// Blank test mirroring Excel's "" / empty cell.
function blank(v) {
  return v === '' || v == null;
}

/* ------------------------------------------------------------------ *
 * Paths layer: for a truck + plan code produce the Paths! row object.
 * ------------------------------------------------------------------ */
const PLAN_TYPE = { 0: 'Keep ICE', 1: 'New ICE', 2: 'Plan A', 3: 'Plan B' };

function buildPath(model, truckId, planCode) {
  const { oc, ec, products, repl } = model;
  const rp = repl[truckId] || {};
  const B7 = rp.B; // EV model
  const prod = products[B7] || {};

  // C: Included
  const C = frLookup(model, truckId, 2) === 1 ? 1 : 0;

  // D: New type per plan code.
  let planLabel; // "Keep ICE" / "New ICE" / "EV"
  if (planCode === 0) planLabel = 'Keep ICE';
  else if (planCode === 1) planLabel = 'New ICE';
  else if (planCode === 2) planLabel = rp.O === 'EV' ? 'EV' : 'ICE';
  else planLabel = rp.R === 'EV' ? 'EV' : 'ICE';
  const D = planLabel === 'EV' ? 'EV' : 'ICE';

  // E: Replace month.
  const coeMonths = frLookup(model, truckId, 10); // Fleet col J
  let E;
  if (C === 0) {
    E = 0;
  } else if (planCode === 0) {
    E = blank(rp.M) ? coeMonths : rp.M;
  } else if (planCode === 1) {
    E = 0;
  } else if (planCode === 2) {
    if (!blank(rp.P)) E = rp.P;
    else if (rp.O === 'Keep ICE') E = blank(rp.M) ? coeMonths : rp.M;
    else E = 0;
  } else {
    if (!blank(rp.S)) E = rp.S;
    else if (rp.R === 'Keep ICE') E = blank(rp.M) ? coeMonths : rp.M;
    else E = 0;
  }

  // R: Days/year, S: Work km/day, T: public share.
  const R = C === 0 ? 0 : frLookup(model, truckId, 6);
  const S = C === 0 ? 0 : frLookup(model, truckId, 5);
  const T = D === 'EV' ? ec[12].B /* B12 public electricity share */ : 0;

  // F: Current value.
  let F;
  if (C === 0) F = 0;
  else if (planCode === 0) F = frLookup(model, truckId, 11);
  else if (planCode === 1) F = frLookup(model, truckId, 11);
  else F = frLookup(model, truckId, 11);

  // U: EV grid kWh/km (battery basis).
  let U;
  if (C === 0) U = 0;
  else if (D === 'EV') {
    const base = blank(rp.F) ? prod.E : rp.F; // Products col E proxy
    const denom = rp.G === 'Battery' ? 1 - oc[44] : 1;
    U = base / denom;
  } else U = 0;

  // V: Usable battery.
  let V;
  if (C === 0) V = 0;
  else if (D === 'EV') V = blank(rp.E) ? prod.D : rp.E; // Products col D listed battery
  else V = 0;

  // AD: EV model name, AE: peak load kg, AF: approved payload.
  const AD = rp.B;
  const AE = C === 0 ? 0 : frLookup(model, truckId, 8);
  const AF = blank(rp.H) ? NA : rp.H;

  // AG: depot average kW, AH: accepted depot kW.
  const AG = rp.J;
  let AH;
  if (D === 'EV') {
    if (rp.K === 'AC') AH = isNum(prod.G) ? prod.G : NA;
    else AH = isNum(prod.H) ? prod.H : NA;
  } else AH = 0;

  // AB: EV years.
  const AB = D === 'EV' ? (120 - E) / 12 : 0;

  // AL: EV MLW kg (Products col B).
  const AL = D === 'EV' ? (isNum(prod.B) ? prod.B : 0) : 0;

  // AK: registration date = EDATE(start, E).
  const AK = edate(model.analysisStart, E);

  // AM: depot mode.
  const AM = rp.K;

  // Input status P (the gate). Reproduce the key cascade; demo inputs are
  // Complete. We check the essential numeric-presence and validity conditions.
  const P = inputStatus(model, truckId, planCode, { C, D, E, F, U, V });

  // W: Public visits/year, X: EV grid kWh/year.
  let W = 0, X = 0;
  if (C !== 0 && P === 'Complete' && D === 'EV' && E < 120) {
    if (T === 0) {
      W = 0;
    } else {
      W = roundUp(
        (T * (R - oc[41]) * (S * U + oc[48] / (1 - oc[44]))) /
          (V * oc[47] / (1 - oc[44]) - T * oc[12] * U)
      );
    }
    X = (R - oc[41]) * (S * U + oc[48] / (1 - oc[44])) + W * oc[12] * U;
  }

  // AA: Fuel litres/year (ICE basis, uses new-ICE unavailable days B40).
  let AA = NA;
  if (C === 0) AA = 0;
  else if (P === 'Complete') {
    const lkm = blank(rp.AH) ? oc[7] : rp.AH;
    AA = (S * (R - oc[40])) +
      roundUp((S * (R - oc[40]) * lkm) / (oc[8] - oc[9] * lkm)) * oc[9];
    AA *= lkm;
  }

  // AC: Peak public minutes.
  let AC = 0;
  if (C === 1 && D === 'EV' && E < 120 && T > 0) {
    AC = oc[12] / oc[11] * 60 + oc[13] + oc[14] +
      (V * oc[47] / (1 - oc[44])) / rp.L * 60;
  }

  // AI: Peak battery kWh.
  let AI = 0;
  if (C === 1 && D === 'EV' && E < 120) {
    const peakRouteKm = frLookup(model, truckId, 7); // Fleet col G
    AI = (peakRouteKm + (T > 0 ? oc[12] : 0)) * U * (1 - oc[44]) + oc[49];
  }

  // Y: Peak depot kWh, Z: peak depot hours.
  let Y = 0, Z = 0;
  if (C === 1 && D === 'EV' && E < 120) {
    Y = AI / (1 - oc[44]) * (1 - T);
    if (T < 1 && AG > 0) Z = Y / AG;
  }

  // AO: EV odometer km/year, AP: EV servicing/year, AQ: basis.
  let AO = 0, AP = 0;
  if (C === 1 && D === 'EV' && E < 120) {
    AO = (R - oc[41]) * S + W * oc[12];
    if (oc[68] === 'Hong Seh 200k average') {
      const rate = isNum(prod.P) ? prod.P : NA;
      AP = isNum(rate) ? AO * rate : NA;
    } else {
      AP = oc[26];
    }
  }
  const AQ = D === 'EV' ? oc[68] : 'Not applicable';

  // G: Purchase.
  let G;
  if (C === 0) G = 0;
  else if (E === 120) G = 0;
  else {
    let baseG;
    if (D === 'ICE') baseG = rp.C; // New ICE all-in quote
    else baseG = blank(rp.D)
      ? (isNum(prod.I) ? prod.I + oc[57] : NaN)
      : rp.D;
    G = baseG * Math.pow(1 + oc[50], E / 12);
    if (!isFinite(G)) G = NA;
  }

  // H: Gross disposal.
  let H;
  if (C === 0) H = 0;
  else if (E === 0) H = F;
  else {
    // H7 = L + M * MAX(0, J - E) / N  (Fleet cols L=12 scrap, M=13 straight-line,
    // J=10 COE months left, N=14 COE term months).
    const coeLeft = frLookup(model, truckId, 10);
    const L = frLookup(model, truckId, 12);
    const M = frLookup(model, truckId, 13);
    const N = frLookup(model, truckId, 14);
    H = L + M * Math.max(0, coeLeft - E) / N;
    if (!isFinite(H)) H = NA;
  }

  // I: Year-10 asset.
  let I;
  if (C === 0) I = 0;
  else if (E === 120) I = 0;
  else if (planCode === 0) I = rp.N; // Keep terminal at year 10
  else if (planCode === 1) I = blank(rp.AI) ? oc[56] : rp.AI; // New ICE terminal
  else if (planCode === 2) I = rp.Q; // A year-10 value
  else I = rp.T; // B year-10 value

  // J: Old energy/year, K: Old other/year, L: New energy/year, M: New other/year.
  const dieselPrice = ec[9].B * ec[7].B + (1 - ec[9].B) * ec[8].B; // commercial/public blend
  let J = NA, K = NA, Lnrg = NA, Mother = NA;
  if (C === 0) { J = 0; K = 0; Lnrg = 0; Mother = 0; }
  else if (P === 'Complete') {
    // J7 = ((S*(R-B39)) + ROUNDUP(S*(R-B39)*lkm/(B8-B9*lkm),0)*B9) * lkm * dieselPrice * B23
    const lkmOld = blank(rp.AG) ? oc[7] : rp.AG;
    const detourVisits = roundUp((S * (R - oc[39]) * lkmOld) / (oc[8] - oc[9] * lkmOld));
    const litresOldTotal = ((S * (R - oc[39])) + detourVisits * oc[9]) * lkmOld;
    J = litresOldTotal * dieselPrice * oc[23];

    // K: Old other/year.
    const avoidOld = detourVisits * (oc[9] / oc[11] + oc[10] / 60) * oc[19] * oc[21];
    K = (oc[24] + oc[27] + oc[29] + oc[31] + oc[33] + oc[34] + oc[37] + (rp.W || 0)) +
      oc[39] * oc[42] + avoidOld;

    // L: New energy/year.
    if (D === 'EV') {
      Lnrg = X * ((1 - T) * ec[10].B + T * ec[11].B) * oc[22];
    } else {
      Lnrg = AA * dieselPrice * oc[23];
    }

    // M: New other/year.
    if (D === 'ICE') {
      const lkmNew = blank(rp.AH) ? oc[7] : rp.AH;
      const detourNew = roundUp((S * (R - oc[40]) * lkmNew) / (oc[8] - oc[9] * lkmNew));
      const avoidNew = detourNew * (oc[9] / oc[11] + oc[10] / 60) * oc[19] * oc[21];
      Mother = (oc[25] + oc[27] + oc[29] + oc[31] + oc[33] + oc[35] + oc[37] + (rp.X || 0)) +
        oc[40] * oc[42] + avoidNew;
    } else {
      const evPaidTime =
        (T * X / rp.L +
          W * (oc[12] / oc[11] + (oc[13] + oc[14]) / 60) +
          (R - oc[41]) * ((T < 1 ? oc[16] : 0) + oc[17]) / 60) * oc[19] * oc[20];
      Mother = (AP + oc[28] + oc[30] + oc[32] + oc[33] + oc[36] + oc[38] + (rp.Y || 0)) +
        oc[41] * oc[43] + W * oc[15] + evPaidTime;
    }
  }

  // N: Grant, O: Grant month.
  const AA_offset = rp.AA || 0;
  let Ngrant = 0;
  if (planCode === 1 && D === 'EV' && E < 120 && E + AA_offset <= 120) {
    Ngrant = rp.Z || 0;
  }
  const Omonth = E + AA_offset;

  // Q: Service status.
  const Q = serviceStatus(model, truckId, planCode, {
    C, D, E, P, AF, AE, AI, V, AB, AC, AG, AH, T,
  });

  return {
    truckId, planCode, C, D, E, F, G, H, I,
    J, K, L: Lnrg, M: Mother, N: Ngrant, O: Omonth,
    P, Q, R, S, T, U, V, W, X, Y, Z, AA, AB, AC, AD, AE, AF, AG, AH, AI,
    AK, AL, AM, AO, AP, AQ,
  };
}

/* Input status P cascade (Paths!P). The demonstration data is Complete; this
 * reproduces the material guards so missing/invalid inputs propagate "n.a.". */
function inputStatus(model, truckId, planCode, d) {
  const { oc } = model;
  const { C, D, E } = d;
  if (C === 0) return 'Excluded';
  // Essential numeric presence from Fleet register (cols 5,6,10,11,12,13,14).
  const needed = [5, 6, 10, 11, 12, 13, 14].map((c) => frLookup(model, truckId, c));
  if (needed.some((x) => !isNum(x))) return 'Missing vehicle input';
  if (!(frLookup(model, truckId, 14) > 0)) return 'Missing vehicle input';
  if (!isNum(E)) return 'Missing vehicle input';
  // Validity.
  const daysYear = frLookup(model, truckId, 6);
  if (
    E < 0 || E > frLookup(model, truckId, 10) || E > 120 || E !== Math.trunc(E) ||
    daysYear <= 0 || daysYear > 366 ||
    frLookup(model, truckId, 5) < 0 || frLookup(model, truckId, 11) < 0 ||
    oc[8] <= oc[7] * oc[9] || oc[11] <= 0 ||
    oc[39] > daysYear || oc[40] > daysYear || oc[41] > daysYear
  ) return 'Invalid vehicle input';
  // EV-specific validity.
  if (D === 'EV' && E < 120) {
    if (
      !isNum(d.U) || !isNum(d.V) || d.V <= 0 || d.T < 0 || d.T > 1 ||
      oc[44] < 0 || oc[44] >= 1 || oc[47] <= 0 || oc[47] > 1
    ) return 'Invalid EV input';
  }
  return 'Complete';
}

/* Service status Q cascade (Paths!Q). */
function serviceStatus(model, truckId, planCode, d) {
  const { oc, repl, products } = model;
  const rp = repl[truckId] || {};
  const prod = products[rp.B] || {};
  const { C, D, E, P } = d;
  if (C === 0) return 'Excluded';
  if (P !== 'Complete') return P;

  const AD = rp.AD; // ICE life months (Replacement plan col AD)
  const iceLife = rp.AD;
  const evLife = rp.AC;
  const bodyFits = rp.I;

  const fails =
    (isNum(iceLife) && iceLife < 120 - E) ||
    (D === 'EV' && E < 120 && (
      (isNum(evLife) && evLife < 120 - E) ||
      bodyFits === 'No' ||
      (isNum(d.AF) && d.AE > d.AF) ||
      d.AI > d.V * Math.pow(1 - oc[46], Math.max(0, d.AB - 1)) * (1 - oc[45]) ||
      d.AC > oc[18] ||
      (d.T < 1 && (d.AG <= 0 || (isNum(d.AH) && d.AG > d.AH))) ||
      (isNum(prod.H) && rp.L > prod.H)
    ));
  if (fails) return 'Fails entered limits';

  if (D === 'EV' && E < 120) {
    const unverified =
      !isNum(frLookup(model, truckId, 7)) ||
      !isNum(frLookup(model, truckId, 8)) ||
      !isNum(d.AF) ||
      bodyFits !== 'Yes' ||
      !isNum(d.AH) ||
      oc[59] !== 'Yes' ||
      oc[58] !== 'Yes';
    if (unverified) return 'Unverified';
  }
  return 'Within entered limits';
}

/* ------------------------------------------------------------------ *
 * Annual build layer: one path -> 11 yearly records (years 0..10).
 * ------------------------------------------------------------------ */
function buildAnnual(model, path) {
  const { oc } = model;
  const rows = [];
  const included = path.C === 1;
  const complete = path.P === 'Complete';
  const feeWhenSold = frLookup(model, path.truckId, 16); // Fleet col P
  const debtIfSold = frLookup(model, path.truckId, 15); // Fleet col O

  for (let year = 0; year <= 10; year++) {
    const rec = { year, path };
    // E: Old months, F: New months.
    let Emo, Fmo;
    if (!included || year === 0) { Emo = 0; }
    else Emo = Math.max(0, Math.min(year * 12, path.E) - (year - 1) * 12);
    if (!included || year === 0) { Fmo = 0; }
    else Fmo = 12 - Emo;
    rec.oldMonths = Emo;
    rec.newMonths = Fmo;

    // Columns G..T gated: if NOT Paths!C=1 -> 0; elif P!=Complete -> n.a.
    if (!included) {
      Object.assign(rec, zeroYear());
      rows.push(rec);
      continue;
    }
    if (!complete) {
      Object.assign(rec, naYear());
      rows.push(rec);
      continue;
    }

    const replacedThisYear = inPeriod(path.E, year);
    const grantThisYear = inPeriod(path.O, year);

    // G: Old operating (prorated by old months, year-band escalation).
    const G = Emo / 12 * (
      path.J * Math.pow(1 + oc[51], Math.max(0, year - 1)) +
      path.K * Math.pow(1 + oc[53], Math.max(0, year - 1))
    );
    // H: New operating.
    const newEnergyGrowth = path.D === 'EV' ? oc[52] : oc[51];
    const H = Fmo / 12 * (
      path.L * Math.pow(1 + newEnergyGrowth, Math.max(0, year - 1)) +
      path.M * Math.pow(1 + oc[53], Math.max(0, year - 1))
    );
    // I: Purchase (at replacement year).
    const I = replacedThisYear ? numOr0(path.G) : 0;
    // J: Disposal.
    const Jd = replacedThisYear ? numOr0(path.H) : 0;
    // K: Grant.
    const Kg = grantThisYear ? numOr0(path.N) : 0;
    // L: Terminal asset (year 10).
    const Lt = year === 10 ? numOr0(path.I) : 0;
    // M: Scheduled repair.
    let Mr = 0;
    const evRepairMonth = path.E + oc[65];
    if (path.D === 'EV' && path.E < 120 && evRepairMonth > path.E && evRepairMonth <= 120 &&
      inPeriod(evRepairMonth, year)) {
      Mr += oc[64];
    }
    if (oc[67] > 0 && oc[67] <= 120 &&
      (path.D === 'ICE' || oc[67] <= path.E) &&
      inPeriod(oc[67], year)) {
      Mr += oc[66];
    }
    // N: Economic cost.
    const currentValY0 = year === 0 ? path.F : 0;
    const feeAtReplace = replacedThisYear ? numOr0(feeWhenSold) : 0;
    const N = (G + H + I) - Jd - Kg - Lt + Mr + currentValY0 + feeAtReplace;
    // O: Cash less terminal assets.
    const O = N - currentValY0;
    // P: Cash before terminal assets.
    const Pc = O + Lt;
    // Q: NPV economic.
    const Qnpv = N * Math.pow(1 + oc[54], -year);
    // R: Replacement funding at year 0 (only year 0 & replace-now).
    let Rf = 0;
    if (year === 0 && path.E === 0) {
      Rf = I - Jd - Kg + numOr0(debtIfSold) + numOr0(feeWhenSold);
    }
    // S: Work km, T: Jobs.
    const Sk = year === 0 ? 0 : path.S * path.R;
    const jobsPerDay = frLookup(model, path.truckId, 9); // Fleet col I
    const Tj = year === 0 ? 0 : jobsPerDay * path.R;

    Object.assign(rec, {
      G, H, I, J: Jd, K: Kg, L: Lt, M: Mr, N, O, P: Pc, Q: Qnpv, R: Rf, S: Sk, T: Tj,
    });
    rows.push(rec);
  }
  return rows;
}
function inPeriod(month, year) {
  if (month === 0) return year === 0;
  return year > 0 && month > (year - 1) * 12 && month <= year * 12;
}
function numOr0(v) { return isNum(v) ? v : 0; }
function zeroYear() {
  return { G: 0, H: 0, I: 0, J: 0, K: 0, L: 0, M: 0, N: 0, O: 0, P: 0, Q: 0, R: 0, S: 0, T: 0 };
}
function naYear() {
  return { G: NA, H: NA, I: NA, J: NA, K: NA, L: NA, M: NA, N: NA, O: NA, P: NA, Q: NA, R: NA, S: NA, T: NA };
}

/* ------------------------------------------------------------------ *
 * Energy and charging site build-up and gates (Energy and charging!59-68).
 * ------------------------------------------------------------------ */
function siteColumn(model, allPaths, planCode, col /* 'B' or 'C' */) {
  const { ec, oc } = model;
  const v = (row) => ec[row][col];
  const completeness = siteCompleteness(model, allPaths, planCode, col);

  // Gross initial site cost (row 61).
  let grossInitial;
  if (completeness === 'No EV site') grossInitial = 0;
  else if (completeness === 'Public only') grossInitial = v(27);
  else if (completeness === 'Complete') {
    grossInitial = v(16) * (v(18) + v(19) + v(20) + v(21) + v(22)) +
      (v(23) + v(24) + v(25) + v(26) + v(27));
  } else grossInitial = NA;

  // Annual site cost (row 62).
  let annual;
  if (completeness === 'No EV site') annual = 0;
  else if (completeness === 'Public only') annual = v(29);
  else if (completeness === 'Complete') {
    annual = 12 * v(28) + (v(29) + v(30) + v(31)) + v(16) * v(32);
  } else annual = NA;

  // Grant budget ceiling (row 63).
  let grantCeiling;
  if (v(47) === 0) grantCeiling = 0;
  else if (isNum(v(48))) grantCeiling = Math.min(30000, 0.5 * v(48)) * Math.min(3, v(47));
  else grantCeiling = NA;

  // Initial cost less award (row 64).
  let initialLessAward;
  if (isNum(grossInitial)) {
    initialLessAward = grossInitial - (completeness === 'Complete' ? v(44) : 0);
  } else initialLessAward = NA;

  // Peak depot energy (row 65) and charging hours (row 66): SUMIFS over paths.
  let peakDepotEnergy = 0, chargingHours = 0;
  for (const p of allPaths) {
    if (p.planCode === planCode && p.C === 1) {
      peakDepotEnergy += p.Y;
      chargingHours += p.Z;
    }
  }

  // EVs using arrangement (row 68).
  let evCount = 0;
  for (const p of allPaths) {
    if (p.planCode === planCode && p.C === 1 && p.D === 'EV' && p.E < 120) evCount++;
  }

  const accessCheck = siteAccessCheck(model, allPaths, planCode, col, {
    completeness, peakDepotEnergy, chargingHours,
  });

  return {
    completeness, grossInitial, annual, grantCeiling, initialLessAward,
    peakDepotEnergy, chargingHours, accessCheck, evCount,
  };
}

function siteCompleteness(model, allPaths, planCode, col) {
  const { ec } = model;
  const v = (row) => ec[row][col];
  // B68/C68 (row 68) is the site arrangement switch "charger rated input power"
  // but the completeness formula reads B68 ("=0" => No EV site). In the sheet
  // B68 refers to EVs-using count only via COUNTIFS; the completeness uses the
  // computed EV count. Here we mirror: No EV site when no EV paths use it.
  let evCount = 0;
  for (const p of allPaths) {
    if (p.planCode === planCode && p.C === 1 && p.D === 'EV' && p.E < 120) evCount++;
  }
  if (evCount === 0) return 'No EV site';
  if (v(12) === 1) {
    // Public only branch.
    if (isNum(v(27)) && v(27) >= 0 && isNum(v(29)) && v(29) >= 0 &&
      isNum(v(33)) && v(33) >= 0 && v(33) <= 120 && v(33) === Math.trunc(v(33))) {
      return 'Public only';
    }
    return 'Missing public fixed cost';
  }
  // Complete branch requires all site-quote numerics present.
  const quoteRows = [18, 16, 17, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32,
    33, 34, 35, 36, 37, 38, 40, 41, 42, 43, 44, 45, 47, 50, 51];
  const allPresent = quoteRows.every((r) => isNum(v(r)));
  if (!allPresent) return 'Missing site quote';
  // Review-site-inputs guards (subset).
  if (
    quoteRows.some((r) => v(r) < 0) ||
    v(16) < 1 || v(17) < 1 || v(33) > 120 || v(33) !== Math.trunc(v(33)) ||
    v(34) <= 0 || v(51) <= 0 || v(12) < 0 || v(12) > 1
  ) return 'Review site inputs';
  if (
    !isNum(v(56)) || v(56) <= 0 ||
    v(16) !== Math.trunc(v(16)) || v(17) !== Math.trunc(v(17)) ||
    v(34) !== Math.trunc(v(34)) ||
    v(43) < v(33) || v(38) < v(33) || v(41) < v(33)
  ) return 'Review site inputs';
  return 'Complete';
}

function siteAccessCheck(model, allPaths, planCode, col, s) {
  const { ec } = model;
  const v = (row) => ec[row][col];
  let evCount = 0;
  for (const p of allPaths) {
    if (p.planCode === planCode && p.C === 1 && p.D === 'EV' && p.E < 120) evCount++;
  }
  if (evCount === 0) return 'No EV';
  if (v(12) === 1) {
    return v(55) === 'Yes' ? 'Public access entered' : 'Public access unconfirmed';
  }
  if (s.completeness !== 'Complete') return s.completeness;
  const powerLimit = Math.min(v(50), v(16) * v(56)) * v(51);
  const hoursLimit = v(17) * v(51);
  if (s.peakDepotEnergy > powerLimit || s.chargingHours > hoursLimit) return 'Site timing/power fails';
  if (v(52) !== 'Yes' || v(53) !== 'Yes' || v(54) !== 'Verified') return 'Site unverified';
  return 'Within entered site limits';
}

/* Per-year site economic/cash schedule (Results!F45:I55). */
function siteYearSchedule(model, site, planCode, col) {
  const { ec, oc } = model;
  const v = (row) => ec[row][col];
  const econ = [];
  const cash = [];
  for (let y = 0; y <= 10; y++) {
    let e;
    if (site.completeness === 'No EV site') {
      e = 0;
    } else if (site.completeness === 'Public only') {
      const install = inPeriod(v(33), y) ? v(27) : 0;
      const recurring = recurringFraction(v(33), y) * v(29) * Math.pow(1 + oc[53], Math.max(0, y - 1));
      e = install + recurring;
    } else if (site.completeness === 'Complete') {
      const install = inPeriod(v(33), y) ? site.grossInitial : 0;
      const recurring = recurringFraction(v(33), y) * site.annual * Math.pow(1 + oc[53], Math.max(0, y - 1));
      const grant = inPeriod(v(45), y) ? v(44) : 0;
      const replSite = inPeriod(v(38), y) ? v(37) : 0;
      const chargerRepl = inPeriod(v(41), y) ? v(16) * v(40) : 0;
      const restoration = inPeriod(v(33) + v(34), y) ? v(36) : 0;
      const recovery = y === 10 ? v(35) : 0;
      e = install + recurring - grant + replSite + chargerRepl + restoration - recovery;
    } else {
      e = NA;
    }
    econ.push(e);
    // Cash adds refundable deposit effect.
    if (isNum(e)) {
      let c = e;
      if (site.completeness === 'Complete') {
        if (inPeriod(v(33), y)) c += v(42);
        if (inPeriod(v(43), y)) c -= v(42);
      }
      cash.push(c);
    } else {
      cash.push(NA);
    }
  }
  return { econ, cash };
}
// Recurring annual fraction of the site operating cost in a given year, based
// on the install month (Results!F46.. pattern: MAX(0,MIN(y*12,120)-MAX((y-1)*12,install))/12).
function recurringFraction(installMonth, year) {
  if (year === 0) return 0;
  const start = Math.max((year - 1) * 12, installMonth);
  const end = Math.min(year * 12, 120);
  return Math.max(0, end - start) / 12;
}

/* ------------------------------------------------------------------ *
 * Results aggregation.
 * ------------------------------------------------------------------ */
function aggregate(model, allPaths, annualByPlan, sites, siteSchedules) {
  const includedTruckCount = model.fleetRows.reduce((a, r) => a + (r.B === 1 ? 1 : 0), 0);

  const perPlan = {};
  for (const code of [0, 1, 2, 3]) {
    const paths = allPaths.filter((p) => p.planCode === code);
    const annual = annualByPlan[code];

    const truckCount = paths.filter((p) => p.C === 1).length;
    const evMonth0 = paths.filter((p) => p.C === 1 && p.D === 'EV' && p.E === 0).length;
    const evYear10 = paths.filter((p) => p.C === 1 && p.D === 'EV' && p.E < 120).length;

    // Gate: all included paths Complete AND path count == included truck count.
    const allComplete = paths.filter((p) => p.C === 1 && p.P !== 'Complete').length === 0;
    const countMatch = truckCount === includedTruckCount;
    const gate = allComplete && countMatch;

    // Vehicle economic TCO = SUMIFS Annual build!N by plan.
    let vehicleEconomicTco = NA;
    if (gate) vehicleEconomicTco = sumAnnual(annual, 'N');

    // Net site ownership cost (Keep ICE / New ICE = 0).
    let netSiteCost;
    if (code === 0 || code === 1) netSiteCost = 0;
    else {
      const sched = siteSchedules[code];
      netSiteCost = sched.econ.every(isNum) ? sched.econ.reduce((a, b) => a + b, 0) : NA;
    }

    // Total economic TCO.
    const totalEconomicTco = (isNum(vehicleEconomicTco) && isNum(netSiteCost))
      ? vehicleEconomicTco + netSiteCost : NA;

    // Cash less year-10 assets (SUM Annual build!O + site cash schedule).
    let cashLessTerminal;
    if (code === 0 || code === 1) {
      cashLessTerminal = annual.every((r) => isNum(r.O)) ? sumAnnual(annual, 'O') : NA;
    } else {
      const sched = siteSchedules[code];
      const vehOk = annual.every((r) => isNum(r.O));
      cashLessTerminal = (vehOk && sched.cash.every(isNum))
        ? sumAnnual(annual, 'O') + sched.cash.reduce((a, b) => a + b, 0) : NA;
    }

    // Day-0 funding before loans.
    let day0Funding = NA;
    if (code === 0 || code === 1) {
      if (gate) day0Funding = sumAnnual(annual, 'R');
    } else {
      const sched = siteSchedules[code];
      if (gate && isNum(sched.cash[0])) day0Funding = sumAnnual(annual, 'R') + sched.cash[0];
    }

    // Cost per productive km.
    const workKm = sumAnnual(annual, 'S');
    const costPerKm = (isNum(totalEconomicTco) && workKm > 0) ? totalEconomicTco / workKm : NA;

    // Status strings.
    let siteStatus;
    if (code === 0 || code === 1) siteStatus = 'Not applicable';
    else siteStatus = sites[code].accessCheck;

    const vehicleStatus = vehicleServiceStatus(paths, allComplete && countMatch);

    perPlan[code] = {
      truckCount, evMonth0, evYear10,
      vehicleEconomicTco, netSiteCost, totalEconomicTco,
      cashLessTerminal, day0Funding, costPerKm,
      siteStatus, vehicleStatus,
    };
  }

  // Derived cross-plan metrics (relative to Keep ICE = code 0).
  const keepTotal = perPlan[0].totalEconomicTco;
  const keepDay0 = perPlan[0].day0Funding;
  for (const code of [0, 1, 2, 3]) {
    const pp = perPlan[code];
    pp.savingVsKeep = (isNum(keepTotal) && isNum(pp.totalEconomicTco)) ? keepTotal - pp.totalEconomicTco : NA;
    pp.savingPct = (isNum(pp.savingVsKeep) && isNum(keepTotal) && keepTotal > 0) ? pp.savingVsKeep / keepTotal : NA;
    pp.headroom15 = (isNum(keepTotal) && isNum(pp.totalEconomicTco)) ? 0.85 * keepTotal - pp.totalEconomicTco : NA;
    pp.incrementalDay0 = (isNum(pp.day0Funding) && isNum(keepDay0)) ? pp.day0Funding - keepDay0 : NA;
    pp.maxSiteTco15 = (isNum(keepTotal) && isNum(pp.vehicleEconomicTco)) ? 0.85 * keepTotal - pp.vehicleEconomicTco : NA;
    pp.savingClaimStatus = savingClaimStatus(model, pp, code);
  }

  return { perPlan, includedTruckCount };
}

function sumAnnual(annual, field) {
  let s = 0;
  for (const r of annual) if (isNum(r[field])) s += r[field];
  return s;
}

function vehicleServiceStatus(paths, gate) {
  if (!gate) return 'Missing/invalid vehicle inputs';
  const inc = paths.filter((p) => p.C === 1);
  if (inc.some((p) => p.Q === 'Fails entered limits')) return 'Fails entered limits';
  if (inc.some((p) => p.Q === 'Unverified')) return 'Vehicle evidence open';
  return 'Within entered limits';
}

function savingClaimStatus(model, pp, code) {
  const { oc } = model;
  if (!isNum(pp.totalEconomicTco)) return 'Total incomplete';
  const customerMode = oc[61] === 'Customer';
  const energyConfirmed = oc[60] === 'Yes';
  const diagnostic =
    pp.truckCount <= 0 || !isNum(pp.savingPct) ||
    pp.vehicleStatus !== 'Within entered limits' ||
    !customerMode || !energyConfirmed;
  if (diagnostic) return 'Diagnostic only';
  return pp.savingPct >= 0.15 ? 'Meets entered 15% target' : 'Below entered 15% target';
}

/* ------------------------------------------------------------------ *
 * Review reconciliation (Review!B7:D18).
 * ------------------------------------------------------------------ */
function buildReview(model, allPaths, annualByPlan, perPlan, sites, includedTruckCount) {
  const check = (actual, expected) =>
    (isNum(actual) && isNum(expected)) ? (Math.abs(actual - expected) < 0.005 ? 'PASS' : 'FAIL') : 'Not available';

  // Fixed ten-year duty coverage: sum old+new months across plan code 0.
  let dutyCoverage = 0;
  for (const r of annualByPlan[0]) {
    dutyCoverage += (isNum(r.oldMonths) ? r.oldMonths : 0) + (isNum(r.newMonths) ? r.newMonths : 0);
  }
  const dutyExpected = includedTruckCount * 120;

  // Economic/cash bridge = Total - Cash-less-terminal - SUMPRODUCT(include, market value now).
  // Fleet register col K (index 11) = "Market value now".
  const feeSum = model.fleetRows.reduce(
    (a, r) => a + (r.B === 1 ? numOr0(frLookup(model, r.A, 11)) : 0), 0
  );
  const keepBridge = (isNum(perPlan[0].totalEconomicTco) && isNum(perPlan[0].cashLessTerminal))
    ? perPlan[0].totalEconomicTco - perPlan[0].cashLessTerminal - feeSum : NA;
  const newBridge = (isNum(perPlan[1].totalEconomicTco) && isNum(perPlan[1].cashLessTerminal))
    ? perPlan[1].totalEconomicTco - perPlan[1].cashLessTerminal - feeSum : NA;
  const planABridge = isNum(perPlan[2].totalEconomicTco)
    ? perPlan[2].totalEconomicTco - perPlan[2].cashLessTerminal - feeSum : NA;
  const planBBridge = isNum(perPlan[3].totalEconomicTco)
    ? perPlan[3].totalEconomicTco - perPlan[3].cashLessTerminal - feeSum : NA;

  const review = {
    dutyCoverage: { actual: dutyCoverage, expected: dutyExpected, status: check(dutyCoverage, dutyExpected) },
    includedTrucks: { actual: includedTruckCount, expected: perPlan[0].truckCount, status: check(includedTruckCount, perPlan[0].truckCount) },
    keepBridge: { actual: keepBridge, expected: 0, status: check(keepBridge, 0) },
    newBridge: { actual: newBridge, expected: 0, status: check(newBridge, 0) },
    planABridge: { actual: planABridge, expected: 0, status: isNum(planABridge) ? check(planABridge, 0) : 'Not available' },
    planBBridge: { actual: planBBridge, expected: 0, status: isNum(planBBridge) ? check(planBBridge, 0) : 'Not available' },
    planAEvCount: { actual: perPlan[2].evYear10, expected: sites[2].evCount, status: check(perPlan[2].evYear10, sites[2].evCount) },
    planBEvCount: { actual: perPlan[3].evYear10, expected: sites[3].evCount, status: check(perPlan[3].evYear10, sites[3].evCount) },
    vehiclePathServiceFormulas: { actual: allPaths.length, expected: 400, status: check(allPaths.length, 400) },
  };
  return review;
}

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */
export function computeFleet(inputs) {
  const model = buildModel(inputs);

  // Paths: for every truck row (up to 100) x 4 plan codes = 400 rows.
  const allPaths = [];
  for (const fr of model.fleetRows) {
    const truckId = fr.A;
    for (const planCode of [0, 1, 2, 3]) {
      allPaths.push(buildPath(model, truckId, planCode));
    }
  }

  // Annual build grouped by plan code.
  const annualByPlan = { 0: [], 1: [], 2: [], 3: [] };
  for (const p of allPaths) {
    const rows = buildAnnual(model, p);
    for (const r of rows) annualByPlan[p.planCode].push(r);
  }

  // Site build-up for Plan A (col B) and Plan B (col C).
  const sites = {
    0: null, 1: null,
    2: siteColumn(model, allPaths, 2, 'B'),
    3: siteColumn(model, allPaths, 3, 'C'),
  };
  const siteSchedules = {
    2: siteYearSchedule(model, sites[2], 2, 'B'),
    3: siteYearSchedule(model, sites[3], 3, 'C'),
  };

  const { perPlan, includedTruckCount } = aggregate(model, allPaths, annualByPlan, sites, siteSchedules);
  const review = buildReview(model, allPaths, annualByPlan, perPlan, sites, includedTruckCount);

  // Shape the headline results into the canonical structure.
  const results = shapeResults(perPlan, sites);

  return { results, review, sites, perPlan, pathCount: allPaths.length, includedTruckCount };
}

function shapeResults(perPlan, sites) {
  const planKey = { 0: 'keep_ice', 1: 'all_new_ice', 2: 'plan_a', 3: 'plan_b' };
  const metric = (field) => {
    const o = {};
    for (const code of [0, 1, 2, 3]) o[planKey[code]] = perPlan[code][field];
    return o;
  };
  return {
    truckCount: metric('truckCount'),
    evMonth0: metric('evMonth0'),
    evYear10: metric('evYear10'),
    vehicleEconomicTco: metric('vehicleEconomicTco'),
    netSiteCost: metric('netSiteCost'),
    totalEconomicTco: metric('totalEconomicTco'),
    savingVsKeep: metric('savingVsKeep'),
    savingPct: metric('savingPct'),
    headroom15: metric('headroom15'),
    cashLessTerminal: metric('cashLessTerminal'),
    day0Funding: metric('day0Funding'),
    incrementalDay0: metric('incrementalDay0'),
    costPerKm: metric('costPerKm'),
    siteStatus: metric('siteStatus'),
    vehicleStatus: metric('vehicleStatus'),
    savingClaimStatus: metric('savingClaimStatus'),
    maxSiteTco15: { plan_a: perPlan[2].maxSiteTco15, plan_b: perPlan[3].maxSiteTco15 },
  };
}

/* ------------------------------------------------------------------ *
 * Prospect scoring (deterministic, model-grounded, auditable).
 * ------------------------------------------------------------------ *
 * scoreProspect(result) turns one computeFleet(...) result into the two
 * economics-grounded rankings the business asked for. It invents NO weights
 * and no probabilities: every component is a figure the model already
 * produced (Results!B12:E26 semantics). The function only
 *   (a) picks the "best EV plan". An EV plan is Plan A or Plan B that actually
 *       deploys EVs (Results!B11:E11 EVs at year 10 > 0). Among EV plans with
 *       a numeric Total economic TCO (a confirmed win), it takes the larger
 *       Saving vs Keep ICE (Results!B15:E15); ties resolve to Plan A. If every
 *       EV plan lacks a numeric Total (e.g. the charging-site quote is missing
 *       so site cost stays n.a., or the route-energy screen fails), it still
 *       reports the EV plan with the larger vehicle-only economic TCO benefit
 *       and flags the case "Diagnostic only"/"Fails entered limits" so it is
 *       NOT presented as a confirmed win. If no plan deploys EVs at all, the
 *       case is reported at Keep-ICE account scale only.
 *   (b) copies that plan's model outputs into a flat, sortable component set.
 *
 * Ranking keys (both are plain model outputs, sorted descending; the UI sorts,
 * scoreProspect only exposes the keys so the ordering is auditable):
 *
 *   benefitKey   = best EV-plan Saving % vs Keep ICE        (Results!B16:E16)
 *                  Secondary audit components (shown, not blended):
 *                    headroom15      = 0.85*KeepICE_total - plan_total  (Results!B17)
 *                    maxSiteTco15    = 0.85*KeepICE_total - plan_vehTCO (Results!D26:E26)
 *                    gatePass        = plan passes service/capacity/evidence
 *                  A case whose best plan "Fails entered limits" or is
 *                  "Diagnostic only" gets benefitKey = -Infinity so it sinks
 *                  to the bottom of the benefit ranking (flagged, not ranked
 *                  as a confirmed win).
 *
 *   accountKey   = absolute 10-yr Saving vs Keep ICE in S$  (Results!B15:E15)
 *                  Secondary audit components (shown, not blended):
 *                    totalEconomicTco (account size, Results!B14:E14)
 *                    truckCount       (included trucks, Results!B9:E9)
 *                    day0Funding      (Day-0 funding need, Results!B19:E19)
 *                  accountKey uses absolute saving so a large fleet with a
 *                  modest % still surfaces as a big opportunity; when the best
 *                  EV plan has no numeric saving (missing site quote etc.) the
 *                  key falls back to the vehicle-only benefit, then to the
 *                  Keep-ICE account size, so the account is still ranked by
 *                  scale with gatePass=false flagging the caveat.
 *
 * "fifteenTargetMet" mirrors Results!B24:E24 ("Saving claim status"); it is a
 * conditional-on-inputs label, NOT an adoption probability.
 */
function num(v) { return isNum(v) ? v : null; }

export function scoreProspect(result) {
  const r = result.results;
  const keepTotal = num(r.totalEconomicTco.keep_ice);

  // EV plans = Plan A / Plan B that actually deploy EVs by year 10.
  const evPlans = [];
  for (const key of ['plan_a', 'plan_b']) {
    if (isNum(r.evYear10[key]) && r.evYear10[key] > 0) {
      evPlans.push({
        key,
        label: key === 'plan_a' ? 'Plan A' : 'Plan B',
        total: num(r.totalEconomicTco[key]),
        saving: num(r.savingVsKeep[key]),
        // Vehicle-only benefit, usable when the site quote is missing so the
        // full Total stays n.a. (Keep ICE has no site cost, so comparing
        // vehicle economic TCO is apples-to-apples for the fleet itself).
        vehBenefit: (isNum(r.vehicleEconomicTco.keep_ice) && isNum(r.vehicleEconomicTco[key]))
          ? r.vehicleEconomicTco.keep_ice - r.vehicleEconomicTco[key] : null,
      });
    }
  }

  // No EV plan at all -> report at Keep-ICE account scale only.
  if (evPlans.length === 0) {
    const accountSize = keepTotal;
    return {
      bestPlanKey: null,
      bestPlanLabel: 'n.a.',
      truckCount: num(r.truckCount.keep_ice) == null ? NA : num(r.truckCount.keep_ice),
      savingPct: NA,
      savingAbs: NA,
      totalEconomicTco: accountSize == null ? NA : accountSize,
      day0Funding: NA,
      headroom15: NA,
      maxSiteTco15: NA,
      gatePass: false,
      gateStatus: 'No EV plan',
      fifteenTargetMet: 'Diagnostic only',
      benefitKey: -Infinity,
      accountKey: accountSize == null ? -Infinity : accountSize,
      components: {
        note: 'No plan deploys EVs; ranked by Keep-ICE account size only.',
      },
    };
  }

  // Prefer EV plans with a numeric (confirmed) Total; among them take the
  // larger Saving vs Keep ICE. If none is numeric, fall back to the larger
  // vehicle-only benefit so the EV plan is still surfaced (and flagged).
  const confirmed = evPlans.filter((p) => isNum(p.total) && isNum(p.saving));
  let best;
  if (confirmed.length > 0) {
    best = confirmed[0];
    for (const p of confirmed) if (p.saving > best.saving) best = p; // ties keep Plan A (first)
  } else {
    best = evPlans[0];
    for (const p of evPlans) {
      const pv = isNum(p.vehBenefit) ? p.vehBenefit : -Infinity;
      const bv = isNum(best.vehBenefit) ? best.vehBenefit : -Infinity;
      if (pv > bv) best = p;
    }
  }

  const bestKey = best.key;

  const savingPct = num(r.savingPct[bestKey]);
  const savingAbs = num(r.savingVsKeep[bestKey]);
  const headroom15 = num(r.headroom15[bestKey]);
  const maxSiteTco15 = num(r.maxSiteTco15[bestKey]);
  const total = num(r.totalEconomicTco[bestKey]);
  const day0 = num(r.day0Funding[bestKey]);
  const truckCount = num(r.truckCount[bestKey]);

  const vehicleStatus = r.vehicleStatus[bestKey];
  const siteStatus = r.siteStatus[bestKey];
  const claimStatus = r.savingClaimStatus[bestKey];

  // Gate status: a case that fails entered limits or is diagnostic-only is
  // flagged, not presented as a confirmed win.
  const failsVehicle = vehicleStatus === 'Fails entered limits';
  const siteFails =
    siteStatus === 'Site timing/power fails' ||
    siteStatus === 'Missing site quote' ||
    siteStatus === 'Missing public fixed cost' ||
    siteStatus === 'Review site inputs';
  const diagnostic = claimStatus === 'Diagnostic only' || claimStatus === 'Total incomplete';
  const gatePass = !failsVehicle && !diagnostic && !siteFails;

  let gateStatus;
  if (failsVehicle) gateStatus = 'Fails entered limits';
  else if (diagnostic) gateStatus = 'Diagnostic only';
  else if (siteFails) gateStatus = 'Site inputs incomplete';
  else if (vehicleStatus === 'Vehicle evidence open') gateStatus = 'Vehicle evidence open';
  else gateStatus = 'Within entered limits';

  // Benefit ranking key: Saving % of best plan; confirmed-win cases only.
  // Flagged cases (fail/diagnostic) sink to the bottom.
  const benefitKey = (gatePass && isNum(savingPct)) ? savingPct : -Infinity;

  // Account ranking key: absolute 10-yr saving vs Keep ICE.
  //  - confirmed plan with numeric saving -> that saving.
  //  - plan whose Total is n.a. (missing site quote etc.) -> fall back to the
  //    vehicle-only benefit so the account still ranks by indicative scale.
  //  - otherwise fall back to Keep-ICE account size.
  let accountKey;
  if (isNum(savingAbs)) accountKey = savingAbs;
  else if (isNum(best.vehBenefit)) accountKey = best.vehBenefit;
  else if (keepTotal != null) accountKey = keepTotal;
  else accountKey = -Infinity;

  return {
    bestPlanKey: bestKey,
    bestPlanLabel: best.label,
    truckCount: truckCount == null ? NA : truckCount,
    savingPct: savingPct == null ? NA : savingPct,
    savingAbs: savingAbs == null ? NA : savingAbs,
    totalEconomicTco: total == null ? NA : total,
    day0Funding: day0 == null ? NA : day0,
    headroom15: headroom15 == null ? NA : headroom15,
    maxSiteTco15: maxSiteTco15 == null ? NA : maxSiteTco15,
    gatePass,
    gateStatus,
    fifteenTargetMet: claimStatus,
    benefitKey,
    accountKey,
    // Vehicle-only EV benefit vs Keep ICE (Results!B12:E12 difference). Shown
    // when the full Total is n.a. so the indicative fleet benefit is auditable.
    vehicleBenefit: isNum(best.vehBenefit) ? best.vehBenefit : NA,
    // Audit components for the UI: the exact numbers that drove each rank.
    components: {
      benefit: {
        savingPct: savingPct == null ? NA : savingPct,
        headroom15: headroom15 == null ? NA : headroom15,
        maxSiteTco15: maxSiteTco15 == null ? NA : maxSiteTco15,
        gatePass,
      },
      account: {
        savingAbs: savingAbs == null ? NA : savingAbs,
        vehicleBenefit: isNum(best.vehBenefit) ? best.vehBenefit : NA,
        totalEconomicTco: total == null ? NA : total,
        truckCount: truckCount == null ? NA : truckCount,
        day0Funding: day0 == null ? NA : day0,
      },
    },
  };
}

export default { computeFleet, NA, scoreProspect };
