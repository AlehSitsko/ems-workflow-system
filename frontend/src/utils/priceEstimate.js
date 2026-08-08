/**
 * Trip price estimate used by the Call Intake Price Calculator.
 *
 * This is a client-side *estimate helper only* — it is not persisted to a call
 * and there is no backend pricing engine yet. The estimate is deliberately made
 * of confirmed, user-entered components only:
 *
 *   base price + (mileage × rate per mile), optionally doubled for a return ride,
 *   plus a one-time waiting fee.
 *
 * Crew size is captured as **operational information and does not affect the
 * price** — the previous per-extra-crew-member charge was a hardcoded placeholder
 * ($25), not a real, configured rate, so it was removed. A configurable
 * per-organization staffing rate is future work (see ROADMAP → rate engine).
 */

const _num = (v) => (v === "" || v === null || v === undefined ? 0 : Number(v));

/**
 * @returns {{error:string}} when inputs are invalid, otherwise
 *   {{ total:string, breakdown:object }} with amounts as 2-dp strings.
 */
export function computeEstimate(data = {}) {
  const basePrice = _num(data.basePrice);
  const mileage = _num(data.mileage);
  const ratePerMile = _num(data.ratePerMile);
  const waitingRequested = !!data.waitingTimeRequested;
  const waitingFee = waitingRequested ? _num(data.waitingFee) : 0;

  // Reject non-numeric and negative inputs with a clear message.
  const checks = { "Base price": basePrice, Mileage: mileage, "Rate per mile": ratePerMile, "Waiting fee": waitingFee };
  for (const [label, value] of Object.entries(checks)) {
    if (Number.isNaN(value)) return { error: `${label} must be a number.` };
    if (value < 0) return { error: `${label} cannot be negative.` };
  }

  const mileageFee = mileage * ratePerMile;
  const oneWayTripTotal = basePrice + mileageFee;
  // Return ride doubles trip-related charges only; the waiting fee is added once.
  const tripSubtotal = data.returnRide ? oneWayTripTotal * 2 : oneWayTripTotal;
  const total = tripSubtotal + waitingFee;

  return {
    total: total.toFixed(2),
    breakdown: {
      basePrice: basePrice.toFixed(2),
      mileageFee: mileageFee.toFixed(2),
      oneWayTripTotal: oneWayTripTotal.toFixed(2),
      tripSubtotal: tripSubtotal.toFixed(2),
      waitingFee: waitingFee.toFixed(2),
      returnRide: !!data.returnRide,
      waitingTimeRequested: waitingRequested,
      crewSize: _num(data.crewSize) || 2, // shown as info, not priced
    },
  };
}
