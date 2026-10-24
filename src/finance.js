/*
 * Finance / amortisation module (Stage 5 / Proposal) -- ILLUSTRATIVE ONLY
 * =======================================================================
 * Pure, deterministic, dependency-free ES module. No DOM, no network, no
 * third-party imports, no LLM/API calls. Runs identically in a browser and in
 * Node (import { amortise, summarise } from './finance.js').
 *
 * WHAT THIS IS (and is NOT) -- read before trusting a number
 * ----------------------------------------------------------
 * This is a SEPARATE, OPT-IN financing illustration layered ON TOP of the
 * frozen economic-TCO engine (src/engine.js). It is NOT part of the economic
 * TCO. The economic TCO deliberately EXCLUDES loans and interest by design (see
 * README): it is an all-cash ownership cost, so a financing structure (rate,
 * term, deposit) is a presentation-layer illustration only.
 *
 * This module DELIBERATELY:
 *   - does NOT import, call, or reference the frozen fleet-compute engine or
 *     its prospect-scoring function in any way (the isolation harness greps the
 *     source to prove there is no such reference);
 *   - changes NO economic number -- it only amortises a principal the caller
 *     hands it (typically the chosen plan's already-computed Day-0 funding,
 *     read-only), so it can never feed back into the frozen engine;
 *   - produces a standard loan amortisation (annuity) schedule a buyer would
 *     recognise, with every formula + unit documented below.
 *
 * It inherits the proposal's honesty discipline: the caller tags the result as
 * INDICATIVE when the quotation is indicative/diagnostic, and an n.a. / invalid
 * input returns a clearly-flagged n.a.-style result, NEVER a NaN or a
 * fabricated zero.
 *
 * UNITS (documented on every formula below)
 *   principal / deposit / amounts   currency units (S$)
 *   annualRatePct                   nominal APR, percent per year (e.g. 4.5)
 *   r (periodic rate)               fraction per MONTH = annualRatePct/100/12
 *   termMonths / n                  number of monthly instalments (integer > 0)
 *   monthlyInstalment               currency units per MONTH
 */

// A clearly-flagged "not applicable" result. Every numeric output is null (not
// zero, not NaN) so a caller can render n.a. honestly and never show a
// fabricated figure. `ok:false` + `reason` say why the inputs were unusable.
export function naResult(reason) {
  return {
    ok: false,
    reason: reason || 'inputs not valid for an amortisation',
    principal: null,
    annualRatePct: null,
    termMonths: null,
    monthlyRate: null,
    monthlyInstalment: null,
    totalInterest: null,
    totalRepaid: null,
    schedule: [],
  };
}

function isNum(v) { return typeof v === 'number' && isFinite(v); }

/*
 * amortise({ principal, annualRatePct, termMonths }) -> amortisation result.
 * --------------------------------------------------------------------------
 * Standard fixed-rate annuity (equal monthly instalment) loan maths.
 *
 * INPUTS (units above):
 *   principal      the financed amount (currency). MUST be > 0.
 *   annualRatePct  nominal APR in percent per year. MUST be >= 0.
 *   termMonths     number of monthly instalments. MUST be an integer > 0.
 *
 * METHOD:
 *   r = annualRatePct / 100 / 12                 (periodic monthly rate, fraction)
 *
 *   Non-zero rate (r > 0) -- the standard annuity formula:
 *     M = P * r / (1 - (1 + r)^-n)               (equal monthly instalment)
 *   where P = principal, n = termMonths. Interest each month accrues on the
 *   outstanding balance; the instalment pays that interest first and the rest
 *   reduces the balance.
 *
 *   ZERO-RATE edge case (r === 0) -- no interest, so the loan is simply split
 *   evenly across the term:
 *     M = P / n,   totalInterest = 0,   totalRepaid = P
 *   This is handled explicitly because the annuity formula divides by
 *   (1 - (1+r)^-n), which is 0/0 at r = 0 and would otherwise be NaN.
 *
 * OUTPUTS:
 *   monthlyInstalment  equal payment per month (currency)
 *   totalInterest      sum of the interest portions over the term (currency)
 *   totalRepaid        principal + totalInterest = n * monthlyInstalment
 *   schedule[]         per-period { period, openingBalance, interest,
 *                      principalPaid, instalment, closingBalance } (currency).
 *                      The final period's closingBalance is forced to exactly 0
 *                      so floating-point drift never leaves a stray cent.
 *
 * GUARDS: any non-positive / non-finite / non-integer-term input returns
 * naResult(...) (a flagged n.a.-style result), never a NaN or a fabricated
 * zero instalment.
 */
export function amortise(params) {
  params = params || {};
  var principal = params.principal;
  var annualRatePct = params.annualRatePct;
  var termMonths = params.termMonths;

  if (!isNum(principal) || principal <= 0) {
    return naResult('financed amount must be a positive number');
  }
  if (!isNum(annualRatePct) || annualRatePct < 0) {
    return naResult('annual rate must be a finite, non-negative percentage');
  }
  if (!isNum(termMonths) || termMonths <= 0 || Math.floor(termMonths) !== termMonths) {
    return naResult('term must be a whole number of months greater than zero');
  }

  var P = principal;
  var n = termMonths;
  var r = annualRatePct / 100 / 12; // periodic monthly rate (fraction)

  var monthlyInstalment;
  if (r === 0) {
    // Zero-rate edge: even split, no interest.
    monthlyInstalment = P / n;
  } else {
    // Standard annuity: M = P*r / (1 - (1+r)^-n).
    monthlyInstalment = (P * r) / (1 - Math.pow(1 + r, -n));
  }

  // Build the schedule month-by-month from the balance so interest/principal
  // split is exact and auditable (rather than a closed-form approximation).
  var schedule = [];
  var balance = P;
  var totalInterest = 0;
  for (var period = 1; period <= n; period++) {
    var interest = r === 0 ? 0 : balance * r;
    var principalPaid = monthlyInstalment - interest;
    var opening = balance;
    balance = balance - principalPaid;
    // On the final period, snap any floating-point residue to exactly 0 so the
    // closing balance is clean and totalRepaid stays consistent.
    if (period === n) {
      principalPaid = opening - 0; // pay off the exact remaining balance
      balance = 0;
    }
    totalInterest += interest;
    schedule.push({
      period: period,
      openingBalance: opening,
      interest: interest,
      principalPaid: principalPaid,
      instalment: interest + principalPaid,
      closingBalance: balance,
    });
  }

  var totalRepaid = P + totalInterest;

  return {
    ok: true,
    reason: null,
    principal: P,
    annualRatePct: annualRatePct,
    termMonths: n,
    monthlyRate: r,
    monthlyInstalment: monthlyInstalment,
    totalInterest: totalInterest,
    totalRepaid: totalRepaid,
    schedule: schedule,
  };
}

/*
 * financedAmount(principal, deposit) -> amount actually financed (currency).
 * --------------------------------------------------------------------------
 * Financed amount = principal - deposit. A deposit of 0 (or none) finances the
 * whole principal. Returns null (flagged) when the inputs are invalid or the
 * deposit meets/exceeds the principal (nothing to finance).
 */
export function financedAmount(principal, deposit) {
  if (!isNum(principal) || principal <= 0) return null;
  var dep = isNum(deposit) ? deposit : 0;
  if (dep < 0) return null;
  var financed = principal - dep;
  if (financed <= 0) return null;
  return financed;
}

/*
 * summarise(result) -> compact headline figures separate from the full
 * schedule, for a UI that wants only the first/last period + totals. Returns an
 * n.a.-style summary (nulls) when the result is itself n.a.
 */
export function summarise(result) {
  if (!result || !result.ok) {
    return {
      ok: false,
      monthlyInstalment: null,
      totalInterest: null,
      totalRepaid: null,
      firstPeriod: null,
      lastPeriod: null,
    };
  }
  var sched = result.schedule || [];
  return {
    ok: true,
    monthlyInstalment: result.monthlyInstalment,
    totalInterest: result.totalInterest,
    totalRepaid: result.totalRepaid,
    firstPeriod: sched.length ? sched[0] : null,
    lastPeriod: sched.length ? sched[sched.length - 1] : null,
  };
}

export default { amortise, financedAmount, summarise, naResult };
