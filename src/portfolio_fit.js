/*
 * Portfolio fit-rules module (Stage 2)
 * ====================================
 * Pure, deterministic, dependency-free ES module. No DOM, no network, no
 * third-party imports, no LLM/API calls. Runs identically in a browser and in
 * Node (import { rankModels, scoreModelFit } from './portfolio_fit.js').
 *
 * WHAT THIS IS (and is NOT)
 * -------------------------
 * This is an ADDITIVE comparison layer that sits ON TOP of the frozen TCO
 * engine (src/engine.js). It does NOT import, call, or alter computeFleet and
 * it changes NO economic number. Its only job is to compare a customer's duty
 * (taken from the fleet register) against each catalogue EV model's published
 * attributes and emit a per-model VERDICT with human-readable reasons and a
 * deterministic ranking. It is deliberately a coarse feasibility screen, not a
 * route/charging scheduler.
 *
 * Two layers live here:
 *   (1) FIT VERDICTS - deriveDuty / scoreModelFit / rankModels: feasibility
 *       screen (payload / range / charge) with honesty caveats.
 *   (2) COST-EFFECTIVENESS MATCHER (Fix 2) - rankModelsByCost / matchBestModel
 *       / matchFleetToPortfolio: given ONE ICE truck's duty, rank the FEASIBLE
 *       EV models by an INDICATIVE catalogue-only cost score so the UI can
 *       recommend a sensible default EV per truck. This is a RECOMMENDATION,
 *       NOT an engine TCO; it reuses the fit verdicts above, excludes
 *       'Does not fit' models, and keeps the Unconfirmed body-fit caveat. The
 *       authoritative economics still come only from computeFleet, and this new
 *       'most cost-effective' logic carries its own validation requirement.
 *
 * HONESTY DISCIPLINE (mandatory)
 * ------------------------------
 * The source product data carries an explicit payload/body-fit status column
 * (product col L) that is 'Unconfirmed' for every catalogue model today. Where
 * a verdict would depend on an attribute that is 'Unconfirmed', OR where a
 * required duty input is blank / 'n.a.', this module NEVER invents a clean
 * pass. It emits an 'insufficient data' caveat instead. 'n.a.' is never treated
 * as a fit. A model can only earn 'Best fit' when every checked attribute
 * clears its threshold with margin AND no honesty caveat applies.
 *
 * INPUTS
 * ------
 * Per model (from demo_case.json inputs.products.rows -> one row):
 *   B  payload / MLW kg
 *   C  second weight kg (not used in the verdict; carried for reference)
 *   D  usable battery kWh
 *   E  battery kWh/km           -> achievable range = D / E (km)
 *   G  AC charge power kW        (null for the two Farizon H9E rows)
 *   H  DC charge power kW
 *   J  quoted range km
 *   L  payload / body-fit status ('Unconfirmed' for all models today)
 *   P  service S$/km
 *
 * Customer duty (derived from the fleet register, included rows where col B===1):
 *   peakCargoKg   = max over included rows of fleet col H (peak cargo)
 *   routeKm       = max over included rows of fleet col G (demanding-day route)
 *   workKmPerDay  = max over included rows of fleet col E (work km/day)
 *   plus optional available charge power (kW) and the charging window (hours)
 *   from the energy_and_charging sheet where present.
 *
 * VERDICT TIERS (exact wording the UI shows)
 *   'Best fit'               every checked attribute clears with margin, no caveat
 *   'Fits with caveats'      clears the hard gates but marginal on >=1 attribute
 *   'Does not fit'           fails a hard gate (payload under, range under)
 * Plus an honesty flag that turns the verdict label into
 *   'Fits with caveats - insufficient data'  when a used attribute is Unconfirmed
 *                                             or a required duty input is blank.
 *
 * DOCUMENTED THRESHOLDS (see docs/portfolio-fit-rules.md)
 *   RANGE_BUFFER   = 1.15  achievable range must be >= 1.15 x required km to be
 *                          a clean pass; between 1.00x and 1.15x is 'marginal'
 *                          (caveat); below 1.00x is 'Does not fit'.
 *   PAYLOAD_MARGIN = 1.10  payload must be >= 1.10 x peak cargo for a clean pass;
 *                          between 1.00x and 1.10x is 'marginal' (caveat);
 *                          below 1.00x is 'Does not fit'.
 *   CHARGE_MARGIN  = 1.10  available charge power must be >= 1.10 x the power the
 *                          duty needs to refill the day's energy inside the
 *                          charging window for a clean pass; 1.00x..1.10x is
 *                          marginal (caveat); below 1.00x is a caveat (a slow
 *                          charge is an operational nuisance, not an outright
 *                          veto like payload/range), unless no power at all is
 *                          available, which is 'Does not fit'.
 */

export const FIT_UNCONFIRMED = 'Unconfirmed';

// Verdict rank order for sorting: lower sorts first (better).
export const VERDICT_RANK = {
  'Best fit': 0,
  'Fits with caveats': 1,
  'Does not fit': 2,
};

// Documented deterministic thresholds (see module header + docs).
export const FIT_THRESHOLDS = {
  RANGE_BUFFER: 1.15,
  PAYLOAD_MARGIN: 1.10,
  CHARGE_MARGIN: 1.10,
  // Default charging window (hours) used only when the duty does not supply one.
  // A conservative depot overnight window; documented so it is never a hidden
  // assumption.
  DEFAULT_CHARGE_WINDOW_H: 10,
};

function isNum(v) { return typeof v === 'number' && isFinite(v); }
// A required duty / product figure is "missing" when it is null, undefined, a
// blank string, or the engine's 'n.a.' sentinel. 'n.a.' is NEVER a fit.
function missing(v) {
  if (v == null) return true;
  if (typeof v === 'string') {
    var s = v.trim().toLowerCase();
    return s === '' || s === 'n.a.' || s === 'na';
  }
  return !isNum(v);
}

// Derive the customer duty from a raw inputs object (same shape the engine
// reads). Included fleet rows are col B === 1 (matching the engine's gate).
// We take the MOST DEMANDING value across the included fleet for each duty
// figure, because a model must serve the hardest truck in the cohort.
export function deriveDuty(inputs) {
  var duty = {
    peakCargoKg: null,
    routeKm: null,
    workKmPerDay: null,
    availableChargeKw: null,
    chargeWindowH: null,
    includedCount: 0,
    // honesty flags: which required inputs were blank across the cohort
    blank: {},
  };
  if (!inputs || !inputs.fleet_register || !inputs.fleet_register.rows) return duty;
  var included = inputs.fleet_register.rows.filter(function (r) { return r && r.B === 1; });
  duty.includedCount = included.length;

  function maxCol(col) {
    var any = false, best = null, sawBlank = false;
    included.forEach(function (r) {
      var v = r[col];
      if (missing(v)) { sawBlank = true; return; }
      any = true;
      if (best == null || v > best) best = v;
    });
    return { value: any ? best : null, sawBlank: sawBlank, any: any };
  }

  var cargo = maxCol('H');
  duty.peakCargoKg = cargo.value;
  duty.blank.peakCargoKg = cargo.sawBlank || !cargo.any;

  var route = maxCol('G');
  duty.routeKm = route.value;
  duty.blank.routeKm = route.sawBlank || !route.any;

  var work = maxCol('E');
  duty.workKmPerDay = work.value;
  duty.blank.workKmPerDay = work.sawBlank || !work.any;

  // Available charge power + window from the energy_and_charging sheet where
  // present. Charger type row (15) encodes the kW as the trailing digits of a
  // code like 'DC60' / 'DC120'; the installed-chargers row (16) confirms a site
  // exists. If none is parseable we leave it null (-> insufficient data on the
  // charge-power check), never a fabricated number.
  if (inputs.energy_and_charging && inputs.energy_and_charging.rows) {
    var ec = inputs.energy_and_charging.rows;
    function ecRow(n) {
      for (var i = 0; i < ec.length; i++) { if (ec[i]._row === n) return ec[i]; }
      return null;
    }
    // Available charge power: prefer the explicit per-charger rated input power
    // (row 56, kW/charger) or the net site power (row 50, kW) where present,
    // otherwise parse the trailing kW out of the charger-type code (row 15,
    // e.g. 'DC60' / 'AC22'). The smaller of a parsed type and the net site
    // power is the honest ceiling (a truck cannot pull more than the site can
    // deliver), but we only intersect when both are known.
    var ratedRow = ecRow(56);
    var siteRow = ecRow(50);
    var typeRow = ecRow(15);
    var fromRated = (ratedRow && ratedRow.values && isNum(ratedRow.values.B)) ? ratedRow.values.B : null;
    var fromSite = (siteRow && siteRow.values && isNum(siteRow.values.B)) ? siteRow.values.B : null;
    var fromType = null;
    if (typeRow && typeRow.values && typeof typeRow.values.B === 'string') {
      var m = typeRow.values.B.match(/(\d+(?:\.\d+)?)/);
      if (m) fromType = Number(m[1]);
    }
    var perCharger = (fromRated != null) ? fromRated : fromType;
    if (perCharger != null && fromSite != null) {
      duty.availableChargeKw = Math.min(perCharger, fromSite);
    } else if (perCharger != null) {
      duty.availableChargeKw = perCharger;
    } else if (fromSite != null) {
      duty.availableChargeKw = fromSite;
    }
    // Charging window (row 51, uninterrupted hours).
    var winRow = ecRow(51);
    if (winRow && winRow.values && isNum(winRow.values.B)) duty.chargeWindowH = winRow.values.B;
  }
  if (!isNum(duty.chargeWindowH)) duty.chargeWindowH = FIT_THRESHOLDS.DEFAULT_CHARGE_WINDOW_H;
  return duty;
}

// Normalise a single catalogue product row into the attributes the fit rules
// consume, computing achievable range = D / E.
export function productAttributes(product) {
  if (!product) return null;
  var payloadKg = isNum(product.B) ? product.B : null;
  var batteryKwh = isNum(product.D) ? product.D : null;
  var kwhPerKm = isNum(product.E) ? product.E : null;
  var achievableRangeKm = (isNum(batteryKwh) && isNum(kwhPerKm) && kwhPerKm > 0)
    ? batteryKwh / kwhPerKm : null;
  var acKw = isNum(product.G) ? product.G : null;
  var dcKw = isNum(product.H) ? product.H : null;
  // Best available charge power on the truck = the faster of AC / DC.
  var bestChargeKw = null;
  if (isNum(acKw) || isNum(dcKw)) bestChargeKw = Math.max(acKw || 0, dcKw || 0);
  return {
    name: product.A,
    payloadKg: payloadKg,
    batteryKwh: batteryKwh,
    kwhPerKm: kwhPerKm,
    achievableRangeKm: achievableRangeKm,
    quotedRangeKm: isNum(product.J) ? product.J : null,
    acKw: acKw,
    dcKw: dcKw,
    bestChargeKw: bestChargeKw,
    serviceRate: isNum(product.P) ? product.P : null,
    // Payload / body-fit status straight from col L ('Unconfirmed' today).
    fitStatus: (product.L == null ? FIT_UNCONFIRMED : String(product.L)),
  };
}

// One attribute check result: { tier, reason }
//   tier 'pass' | 'caveat' | 'fail' | 'insufficient'
function payloadCheck(attr, duty) {
  if (missing(duty.peakCargoKg) || (duty.blank && duty.blank.peakCargoKg)) {
    return { tier: 'insufficient', reason: 'Peak cargo not entered, so payload fit cannot be confirmed (insufficient data).' };
  }
  if (!isNum(attr.payloadKg)) {
    return { tier: 'insufficient', reason: 'Catalogue payload is not published for this model (insufficient data).' };
  }
  var ratio = attr.payloadKg / duty.peakCargoKg;
  if (ratio < 1.0) {
    return {
      tier: 'fail',
      reason: 'Payload ' + Math.round(attr.payloadKg) + ' kg is below the peak cargo ' +
        Math.round(duty.peakCargoKg) + ' kg (does not fit).',
    };
  }
  if (ratio < FIT_THRESHOLDS.PAYLOAD_MARGIN) {
    return {
      tier: 'caveat',
      reason: 'Payload ' + Math.round(attr.payloadKg) + ' kg only marginally clears the peak cargo ' +
        Math.round(duty.peakCargoKg) + ' kg (under the ' +
        Math.round((FIT_THRESHOLDS.PAYLOAD_MARGIN - 1) * 100) + '% margin).',
    };
  }
  return {
    tier: 'pass',
    reason: 'Payload ' + Math.round(attr.payloadKg) + ' kg clears the peak cargo ' +
      Math.round(duty.peakCargoKg) + ' kg with margin.',
  };
}

function rangeCheck(attr, duty) {
  // Required range is the most demanding of the demanding-day route and the
  // daily work distance (a truck must cover the harder of the two on one
  // charge for a clean pass).
  var requiredKm = null;
  var routeBlank = missing(duty.routeKm) || (duty.blank && duty.blank.routeKm);
  var workBlank = missing(duty.workKmPerDay) || (duty.blank && duty.blank.workKmPerDay);
  if (isNum(duty.routeKm)) requiredKm = duty.routeKm;
  if (isNum(duty.workKmPerDay)) requiredKm = (requiredKm == null) ? duty.workKmPerDay : Math.max(requiredKm, duty.workKmPerDay);
  if (requiredKm == null || (routeBlank && workBlank)) {
    return { tier: 'insufficient', reason: 'Route / daily distance not entered, so range fit cannot be confirmed (insufficient data).' };
  }
  if (!isNum(attr.achievableRangeKm)) {
    return { tier: 'insufficient', reason: 'Battery kWh or kWh/km missing, so achievable range cannot be computed (insufficient data).' };
  }
  var ratio = attr.achievableRangeKm / requiredKm;
  var rng = Math.round(attr.achievableRangeKm);
  if (ratio < 1.0) {
    return {
      tier: 'fail',
      reason: 'Achievable range ~' + rng + ' km is below the required ' + Math.round(requiredKm) +
        ' km/day (does not fit).',
    };
  }
  if (ratio < FIT_THRESHOLDS.RANGE_BUFFER) {
    return {
      tier: 'caveat',
      reason: 'Achievable range ~' + rng + ' km only marginally clears the required ' +
        Math.round(requiredKm) + ' km/day (under the ' +
        Math.round((FIT_THRESHOLDS.RANGE_BUFFER - 1) * 100) + '% reserve buffer).',
    };
  }
  return {
    tier: 'pass',
    reason: 'Achievable range ~' + rng + ' km clears the required ' + Math.round(requiredKm) +
      ' km/day with reserve.',
  };
}

function chargeCheck(attr, duty) {
  if (!isNum(attr.bestChargeKw) || attr.bestChargeKw <= 0) {
    return { tier: 'insufficient', reason: 'Charge power not published for this model (insufficient data).' };
  }
  // Power the duty needs to refill the day's energy within the charging window.
  // Needs battery kWh/km and daily km and a window; if any is missing we flag
  // insufficient data rather than inventing a number.
  var dailyKm = isNum(duty.workKmPerDay) ? duty.workKmPerDay
    : (isNum(duty.routeKm) ? duty.routeKm : null);
  if (!isNum(dailyKm) || !isNum(attr.kwhPerKm) || !isNum(duty.chargeWindowH) || duty.chargeWindowH <= 0) {
    // We still know the truck's charge power exists; report it as a caveat
    // because we cannot confirm it meets the (unknown) duty window.
    return {
      tier: 'caveat',
      reason: 'Charge power ' + attr.bestChargeKw + ' kW published, but the daily energy or charging window is not entered, so adequacy cannot be confirmed (insufficient data).',
    };
  }
  var dailyEnergyKwh = dailyKm * attr.kwhPerKm;
  var neededKw = dailyEnergyKwh / duty.chargeWindowH;
  var ratio = attr.bestChargeKw / neededKw;
  if (ratio < 1.0) {
    return {
      tier: 'caveat',
      reason: 'Charge power ' + attr.bestChargeKw + ' kW is below the ~' + neededKw.toFixed(1) +
        ' kW needed to refill ~' + Math.round(dailyEnergyKwh) + ' kWh within a ' +
        duty.chargeWindowH + ' h window (slow charge caveat).',
    };
  }
  if (ratio < FIT_THRESHOLDS.CHARGE_MARGIN) {
    return {
      tier: 'caveat',
      reason: 'Charge power ' + attr.bestChargeKw + ' kW only marginally meets the ~' +
        neededKw.toFixed(1) + ' kW needed within a ' + duty.chargeWindowH + ' h window.',
    };
  }
  return {
    tier: 'pass',
    reason: 'Charge power ' + attr.bestChargeKw + ' kW comfortably refills ~' +
      Math.round(dailyEnergyKwh) + ' kWh within a ' + duty.chargeWindowH + ' h window.',
  };
}

// Score one model against the duty. Returns a structured verdict with per-
// attribute cells + reasons and an honest overall verdict label.
export function scoreModelFit(duty, product) {
  var attr = productAttributes(product);
  if (!attr) return null;

  var payload = payloadCheck(attr, duty);
  var range = rangeCheck(attr, duty);
  var charge = chargeCheck(attr, duty);

  // The payload/body-fit STATUS (col L) is an honesty gate of its own: it is
  // 'Unconfirmed' for every catalogue model today, so a payload "pass" on the
  // number can never become a clean confirmed fit while the status is
  // Unconfirmed. This is the core honesty rule.
  var statusUnconfirmed = (attr.fitStatus == null) ||
    String(attr.fitStatus).toLowerCase() !== 'confirmed';

  var checks = [payload, range, charge];
  var hasFail = checks.some(function (c) { return c.tier === 'fail'; });
  var hasInsufficient = checks.some(function (c) { return c.tier === 'insufficient'; });
  var hasCaveat = checks.some(function (c) { return c.tier === 'caveat'; });

  var reasons = [];
  reasons.push('Payload: ' + payload.reason);
  reasons.push('Range/energy: ' + range.reason);
  reasons.push('Charge power: ' + charge.reason);

  var verdict, insufficientData = false;
  if (hasFail) {
    verdict = 'Does not fit';
  } else if (hasInsufficient) {
    // A hard gate could not be evaluated -> never a fabricated pass.
    verdict = 'Fits with caveats';
    insufficientData = true;
  } else {
    // All hard gates clear numerically. The Unconfirmed payload/body-fit status
    // (used in the payload verdict) forces at least a caveat; it can never be a
    // clean 'Best fit' while the status is Unconfirmed.
    if (statusUnconfirmed) {
      verdict = 'Fits with caveats';
      insufficientData = true;
      reasons.push('Payload/body-fit status is "' + attr.fitStatus +
        '" in the catalogue, so this fit is not yet confirmed for this duty (insufficient data).');
    } else if (hasCaveat) {
      verdict = 'Fits with caveats';
    } else {
      verdict = 'Best fit';
    }
  }

  var label = verdict;
  if (insufficientData && verdict === 'Fits with caveats') {
    label = 'Fits with caveats - insufficient data';
  }

  // Per-attribute display cells (short tokens for the table columns).
  function cell(c) {
    if (c.tier === 'pass') return 'ok';
    if (c.tier === 'caveat') return 'caveat';
    if (c.tier === 'fail') return 'under';
    return 'insufficient data';
  }

  return {
    name: attr.name,
    verdict: verdict,           // one of the three tiers
    label: label,               // tier, plus '- insufficient data' when applicable
    insufficientData: insufficientData,
    fitStatus: attr.fitStatus,  // 'Unconfirmed' today
    attributes: attr,
    cells: {
      payload: cell(payload),
      range: cell(range),
      charge: cell(charge),
    },
    checks: { payload: payload, range: range, charge: charge },
    reasons: reasons,
  };
}

// Deterministic sort key. Lower sorts first (better).
// Primary: verdict tier (Best fit < Fits with caveats < Does not fit).
// Secondary: a clean 'Fits with caveats' ranks above an 'insufficient data'
//            one (more is known).
// Tertiary: larger payload-over-cargo headroom, then longer achievable range,
//           then model name for a stable, fully deterministic order.
function sortKey(v, duty) {
  var tier = VERDICT_RANK[v.verdict];
  var insuff = v.insufficientData ? 1 : 0;
  var attr = v.attributes || {};
  var payloadHeadroom = (isNum(attr.payloadKg) && isNum(duty.peakCargoKg) && duty.peakCargoKg > 0)
    ? attr.payloadKg / duty.peakCargoKg : 0;
  var range = isNum(attr.achievableRangeKm) ? attr.achievableRangeKm : 0;
  return { tier: tier, insuff: insuff, payloadHeadroom: payloadHeadroom, range: range, name: attr.name || '' };
}

// Rank every catalogue model against the duty. Returns an array of verdicts,
// best-fit first, with does-not-fit and insufficient-data cases ordered below.
export function rankModels(duty, products) {
  var rows = (products || []).filter(function (p) { return p && p.A != null; });
  var scored = rows.map(function (p) { return scoreModelFit(duty, p); }).filter(Boolean);
  scored.sort(function (a, b) {
    var ka = sortKey(a, duty), kb = sortKey(b, duty);
    if (ka.tier !== kb.tier) return ka.tier - kb.tier;
    if (ka.insuff !== kb.insuff) return ka.insuff - kb.insuff;
    if (kb.payloadHeadroom !== ka.payloadHeadroom) return kb.payloadHeadroom - ka.payloadHeadroom;
    if (kb.range !== ka.range) return kb.range - ka.range;
    return ka.name < kb.name ? -1 : (ka.name > kb.name ? 1 : 0);
  });
  return scored;
}

// Convenience: derive the duty from raw engine inputs, then rank.
export function rankModelsForInputs(inputs) {
  var duty = deriveDuty(inputs);
  var products = (inputs && inputs.products && inputs.products.rows) ? inputs.products.rows : [];
  return { duty: duty, verdicts: rankModels(duty, products) };
}

/* ===========================================================================
 * COST-EFFECTIVENESS MATCHER (additive, Fix 2 logic layer)
 * ===========================================================================
 * GOAL: given ONE ICE truck's duty (how far it drives, how many days, how much
 * it carries) and the product catalogue, recommend the MOST COST-EFFECTIVE EV
 * model that can plausibly do the job.
 *
 * WHAT THIS IS (and is NOT) - read this before trusting a number
 * --------------------------------------------------------------
 * This is a NEW COMPARISON HEURISTIC layered on the catalogue attributes. It is
 * NOT an engine output. It does NOT import, call, or alter computeFleet and it
 * changes NO frozen economic number. The authoritative TCO still comes only
 * from src/engine.js. The ranking here is a quick per-truck shortlist to steer
 * the UI's side-by-side comparison toward a sensible default EV; the user can
 * always override the EV choice, and the real TCO is what decides adoption.
 *
 * Because it is new logic, 'most cost-effective' here needs its OWN validation
 * (tools/check_portfolio_fit.mjs) before it is ever presented as authoritative.
 * It deliberately uses only published catalogue figures, never a fabricated
 * quote or grant.
 *
 * HONESTY DISCIPLINE (same rules as the fit verdicts above)
 * ---------------------------------------------------------
 *  - A model that 'Does not fit' the duty is EXCLUDED from the recommendation
 *    outright (it cannot be cost-effective if it cannot do the work).
 *  - Every surviving candidate still carries its fit verdict and its
 *    Unconfirmed body-fit caveat: a cheap model whose body fit is Unconfirmed
 *    is flagged, not silently crowned.
 *  - When a required figure (list price, service rate, energy) is missing the
 *    candidate is still shown but marked with an insufficient-data cost caveat;
 *    it can never outrank a fully-costed candidate on a fabricated figure.
 *
 * COST MODEL (coarse, catalogue-only, documented)
 * -----------------------------------------------
 * For each feasible model we build an INDICATIVE relative cost score over the
 * truck's own duty, NOT an engine TCO:
 *   capex      = list price prod.I (catalogue, pre-COE; the UI separately shows
 *                the vehicle price vs the COE adder, which is engine business).
 *   energyCost = annualKm * (prod.E kWh/km) * energyPricePerKwh
 *   serviceCost= annualKm * (prod.P service S$/km)
 * annualKm = workKmPerDay * daysPerYear (falls back to a documented default
 * when days are not entered). The relative score over a HORIZON_YEARS horizon:
 *   score = capex + HORIZON_YEARS * (energyCost + serviceCost)
 * This is purely for RANKING feasible models against each other on the SAME
 * duty; it is not a customer TCO and is never summed across the fleet.
 * ========================================================================= */

export const MATCH_DEFAULTS = {
  // Horizon used only to weigh running cost against capex when ranking. The
  // engine's real horizon is 120 months; this is a comparison weighting, not a
  // forecast.
  HORIZON_YEARS: 10,
  // Fallback annual distance when days/year is not entered (conservative SG
  // light-commercial duty). Documented so it is never a hidden assumption.
  DEFAULT_DAYS_PER_YEAR: 300,
  // Fallback depot energy price (S$/kWh) when the duty carries none. A typical
  // SG commercial depot tariff; used ONLY for relative ranking.
  DEFAULT_ENERGY_PRICE: 0.30,
};

// Normalise one ICE truck's duty from a fleet_register row (+ optional energy
// context) into the shape the matcher consumes. A fleet row uses:
//   E work km/day, F days/year, G demanding-day route km, H peak cargo kg.
export function truckDutyFromRow(row, energyContext) {
  if (!row) return null;
  var workKmPerDay = isNum(row.E) ? row.E : null;
  var daysPerYear = isNum(row.F) ? row.F : null;
  var routeKm = isNum(row.G) ? row.G : null;
  var peakCargoKg = isNum(row.H) ? row.H : null;
  var energyPrice = (energyContext && isNum(energyContext.energyPricePerKwh))
    ? energyContext.energyPricePerKwh : null;
  var chargeWindowH = (energyContext && isNum(energyContext.chargeWindowH))
    ? energyContext.chargeWindowH : null;
  return {
    id: row.A != null ? String(row.A) : null,
    peakCargoKg: peakCargoKg,
    routeKm: routeKm,
    workKmPerDay: workKmPerDay,
    daysPerYear: daysPerYear,
    energyPricePerKwh: energyPrice,
    chargeWindowH: isNum(chargeWindowH) ? chargeWindowH : FIT_THRESHOLDS.DEFAULT_CHARGE_WINDOW_H,
    availableChargeKw: null,
    blank: {
      peakCargoKg: missing(peakCargoKg),
      routeKm: missing(routeKm),
      workKmPerDay: missing(workKmPerDay),
      daysPerYear: missing(daysPerYear),
    },
  };
}

// Indicative relative cost figures for one model over one truck's duty. Returns
// { capex, energyCost, serviceCost, score, annualKm, insufficient, reasons }.
export function indicativeCost(attr, duty, opts) {
  opts = opts || {};
  var horizon = isNum(opts.horizonYears) ? opts.horizonYears : MATCH_DEFAULTS.HORIZON_YEARS;
  var reasons = [];
  var insufficient = false;

  var daysPerYear = (duty && isNum(duty.daysPerYear)) ? duty.daysPerYear : null;
  if (daysPerYear == null) {
    daysPerYear = MATCH_DEFAULTS.DEFAULT_DAYS_PER_YEAR;
    insufficient = true;
    reasons.push('Days/year not entered; used a default of ' + daysPerYear +
      ' days for the cost comparison only (insufficient data).');
  }
  var workKmPerDay = (duty && isNum(duty.workKmPerDay)) ? duty.workKmPerDay
    : ((duty && isNum(duty.routeKm)) ? duty.routeKm : null);
  var annualKm = null;
  if (isNum(workKmPerDay)) {
    annualKm = workKmPerDay * daysPerYear;
  } else {
    insufficient = true;
    reasons.push('Work km/day not entered; running cost cannot be estimated (insufficient data).');
  }

  var energyPrice = (duty && isNum(duty.energyPricePerKwh)) ? duty.energyPricePerKwh : null;
  if (energyPrice == null) {
    energyPrice = MATCH_DEFAULTS.DEFAULT_ENERGY_PRICE;
    insufficient = true;
    reasons.push('Depot energy price not entered; used S$' + energyPrice.toFixed(2) +
      '/kWh for the comparison only (insufficient data).');
  }

  var capex = isNum(attr.listPrice) ? attr.listPrice : null;
  if (capex == null) {
    insufficient = true;
    reasons.push('Catalogue list price missing; capex excluded from the score (insufficient data).');
  }

  var energyCost = null;
  if (isNum(annualKm) && isNum(attr.kwhPerKm)) {
    energyCost = annualKm * attr.kwhPerKm * energyPrice;
  } else if (isNum(annualKm)) {
    insufficient = true;
    reasons.push('Model kWh/km missing; energy cost excluded (insufficient data).');
  }

  var serviceCost = null;
  if (isNum(annualKm) && isNum(attr.serviceRate)) {
    serviceCost = annualKm * attr.serviceRate;
  } else if (isNum(annualKm)) {
    insufficient = true;
    reasons.push('Model service S$/km missing; service cost excluded (insufficient data).');
  }

  // Score = whatever we can defensibly add. Missing legs are simply not added
  // (never a fabricated figure); an insufficient-data flag keeps such a
  // candidate from outranking a fully-costed one via the sort tie-break.
  var score = 0, anyLeg = false;
  if (isNum(capex)) { score += capex; anyLeg = true; }
  if (isNum(energyCost)) { score += horizon * energyCost; anyLeg = true; }
  if (isNum(serviceCost)) { score += horizon * serviceCost; anyLeg = true; }
  if (!anyLeg) score = null;

  return {
    capex: capex,
    energyCost: energyCost,
    serviceCost: serviceCost,
    annualKm: annualKm,
    energyPricePerKwh: energyPrice,
    daysPerYear: daysPerYear,
    horizonYears: horizon,
    score: score,
    insufficient: insufficient,
    reasons: reasons,
  };
}

// Rank the feasible models for one truck's duty by cost-effectiveness. Returns
// an array of candidates, cheapest-feasible first, each carrying its fit
// verdict and cost breakdown. 'Does not fit' models are excluded; Unconfirmed
// body-fit candidates remain but keep their caveat.
export function rankModelsByCost(duty, products, opts) {
  var verdicts = rankModels(duty, products);
  var candidates = verdicts
    .filter(function (v) { return v.verdict !== 'Does not fit'; })
    .map(function (v) {
      var attr = v.attributes || {};
      // Attach list price (col I) which the base fit attributes do not carry.
      var listPrice = null;
      var prod = (products || []).find(function (p) { return p && p.A === attr.name; });
      if (prod && isNum(prod.I)) listPrice = prod.I;
      var attrWithPrice = {};
      for (var k in attr) { if (Object.prototype.hasOwnProperty.call(attr, k)) attrWithPrice[k] = attr[k]; }
      attrWithPrice.listPrice = listPrice;
      var cost = indicativeCost(attrWithPrice, duty, opts);
      return {
        name: v.name,
        verdict: v.verdict,
        label: v.label,
        insufficientData: v.insufficientData,
        fitStatus: v.fitStatus,
        attributes: attrWithPrice,
        cost: cost,
        reasons: v.reasons.concat(cost.reasons),
      };
    });

  // Sort: fully-scored candidates (score known, not insufficient) first, then
  // by ascending indicative score (cheaper = better), then a clean fit verdict
  // ahead of a caveated one, then by name for determinism.
  candidates.sort(function (a, b) {
    var aScore = (a.cost && isNum(a.cost.score)) ? a.cost.score : Infinity;
    var bScore = (b.cost && isNum(b.cost.score)) ? b.cost.score : Infinity;
    var aIns = (a.cost && a.cost.insufficient) ? 1 : 0;
    var bIns = (b.cost && b.cost.insufficient) ? 1 : 0;
    if (aIns !== bIns) return aIns - bIns;        // fully-costed ahead of partial
    if (aScore !== bScore) return aScore - bScore; // cheaper ahead
    var aV = VERDICT_RANK[a.verdict], bV = VERDICT_RANK[b.verdict];
    if (aV !== bV) return aV - bV;
    return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0);
  });
  return candidates;
}

// Top-level helper: given ONE truck's duty and the catalogue, return the most
// cost-effective feasible model plus the ranked shortlist. Returns null match
// when nothing is feasible (honest 'no EV in the portfolio fits this duty').
export function matchBestModel(duty, products, opts) {
  var ranked = rankModelsByCost(duty, products, opts);
  var best = ranked.length ? ranked[0] : null;
  return {
    duty: duty,
    best: best,
    shortlist: ranked,
    feasibleCount: ranked.length,
    // Honest note the UI can surface verbatim.
    note: best == null
      ? 'No catalogue EV model can do this truck\u2019s duty on the entered figures (honest no-fit, not an error).'
      : 'Recommendation is a catalogue-attribute comparison, not an engine TCO. Confirm body fit and get a real quote before presenting.',
  };
}

// Per-truck wrapper over a whole ICE fleet register: for each INCLUDED ICE
// truck row (col B === 1), derive its duty and recommend the best EV model.
// Pure; reads inputs the same way the engine does. Returns one entry per
// included truck, in register order.
export function matchFleetToPortfolio(inputs, opts) {
  var out = [];
  if (!inputs || !inputs.fleet_register || !inputs.fleet_register.rows) return out;
  var products = (inputs.products && inputs.products.rows) ? inputs.products.rows : [];
  // Shared energy context: depot electricity price (row 10) + charging window
  // (row 51) from Plan A (col B) where present, for the cost comparison only.
  var energyContext = { energyPricePerKwh: null, chargeWindowH: null };
  if (inputs.energy_and_charging && inputs.energy_and_charging.rows) {
    var ec = inputs.energy_and_charging.rows;
    function ecVal(n) {
      for (var i = 0; i < ec.length; i++) {
        if (ec[i]._row === n && ec[i].values && isNum(ec[i].values.B)) return ec[i].values.B;
      }
      return null;
    }
    energyContext.energyPricePerKwh = ecVal(10);
    energyContext.chargeWindowH = ecVal(51);
  }
  inputs.fleet_register.rows.forEach(function (row) {
    if (!row || row.B !== 1) return;
    var duty = truckDutyFromRow(row, energyContext);
    var match = matchBestModel(duty, products, opts);
    out.push({ truckId: duty.id, duty: duty, match: match });
  });
  return out;
}

export default {
  FIT_UNCONFIRMED: FIT_UNCONFIRMED,
  VERDICT_RANK: VERDICT_RANK,
  FIT_THRESHOLDS: FIT_THRESHOLDS,
  deriveDuty: deriveDuty,
  productAttributes: productAttributes,
  scoreModelFit: scoreModelFit,
  rankModels: rankModels,
  rankModelsForInputs: rankModelsForInputs,
  MATCH_DEFAULTS: MATCH_DEFAULTS,
  truckDutyFromRow: truckDutyFromRow,
  indicativeCost: indicativeCost,
  rankModelsByCost: rankModelsByCost,
  matchBestModel: matchBestModel,
  matchFleetToPortfolio: matchFleetToPortfolio,
};
