import React, { forwardRef, useImperativeHandle, useState } from "react";
import { FaCalculator, FaDollarSign, FaRedo } from "react-icons/fa";

const PriceCalculator = forwardRef((props, ref) => {
  const initialCalculatorData = {
    basePrice: "",
    crewSize: "2",
    mileage: "",
    ratePerMile: "",
    returnRide: false,
    waitingTimeRequested: false,
    waitingFee: "",
  };

  const [calculatorData, setCalculatorData] = useState(initialCalculatorData);
  const [calculatedPrice, setCalculatedPrice] = useState(null);
  const [priceBreakdown, setPriceBreakdown] = useState(null);

  // Handle text, number, select, and checkbox changes.
  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;

    setCalculatorData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  // Clear calculator fields and calculated result.
  const clearCalculator = () => {
    setCalculatorData(initialCalculatorData);
    setCalculatedPrice(null);
    setPriceBreakdown(null);
  };

  // Expose clearCalculator to the parent page.
  useImperativeHandle(ref, () => ({
    clearCalculator() {
      clearCalculator();
    },
  }));

  // Calculate estimated trip price.
  const calculatePrice = () => {
    const basePrice = Number(calculatorData.basePrice) || 0;
    const mileage = Number(calculatorData.mileage) || 0;
    const ratePerMile = Number(calculatorData.ratePerMile) || 0;
    const crewSize = Number(calculatorData.crewSize) || 2;

    const mileageFee = mileage * ratePerMile;

    // Simple crew adjustment placeholder.
    // Larger crews can increase the estimate if needed.
    const crewAdjustment = crewSize > 2 ? (crewSize - 2) * 25 : 0;

    // Waiting fee is added once and is not multiplied by return ride.
    const waitingFee = calculatorData.waitingTimeRequested
      ? Number(calculatorData.waitingFee) || 0
      : 0;

    const oneWayTripTotal = basePrice + mileageFee + crewAdjustment;

    // Return ride is estimated as a round trip for trip-related charges only.
    const tripSubtotal = calculatorData.returnRide
      ? oneWayTripTotal * 2
      : oneWayTripTotal;

    const total = tripSubtotal + waitingFee;

    setCalculatedPrice(total.toFixed(2));

    setPriceBreakdown({
      basePrice: basePrice.toFixed(2),
      mileageFee: mileageFee.toFixed(2),
      crewAdjustment: crewAdjustment.toFixed(2),
      oneWayTripTotal: oneWayTripTotal.toFixed(2),
      tripSubtotal: tripSubtotal.toFixed(2),
      waitingFee: waitingFee.toFixed(2),
      returnRide: calculatorData.returnRide,
      waitingTimeRequested: calculatorData.waitingTimeRequested,
    });
  };

  return (
    <section className="price-calculator-modern">
      <div className="price-calculator-header">
        <span className="price-calculator-icon">
          <FaCalculator />
        </span>

        <div>
          <h5>Price Calculator</h5>
          <p>
            Estimate trip pricing based on base rate, mileage, crew size,
            waiting time, and return ride.
          </p>
        </div>
      </div>

      <div className="row g-3">
        <div className="col-md-6">
          <label htmlFor="basePrice" className="form-label">
            Base Price ($)
          </label>

          <div className="input-group">
            <span className="input-group-text">
              <FaDollarSign />
            </span>

            <input
              id="basePrice"
              name="basePrice"
              type="number"
              min="0"
              step="0.01"
              className="form-control"
              value={calculatorData.basePrice}
              onChange={handleChange}
            />
          </div>
        </div>

        <div className="col-md-6">
          <label htmlFor="crewSize" className="form-label">
            Crew Size
          </label>

          <select
            id="crewSize"
            name="crewSize"
            className="form-select"
            value={calculatorData.crewSize}
            onChange={handleChange}
          >
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4</option>
          </select>
        </div>

        <div className="col-md-6">
          <label htmlFor="mileage" className="form-label">
            Mileage
          </label>

          <input
            id="mileage"
            name="mileage"
            type="number"
            min="0"
            step="0.1"
            className="form-control"
            value={calculatorData.mileage}
            onChange={handleChange}
            placeholder="Trip miles"
          />
        </div>

        <div className="col-md-6">
          <label htmlFor="ratePerMile" className="form-label">
            Rate per Mile ($)
          </label>

          <div className="input-group">
            <span className="input-group-text">
              <FaDollarSign />
            </span>

            <input
              id="ratePerMile"
              name="ratePerMile"
              type="number"
              min="0"
              step="0.01"
              className="form-control"
              value={calculatorData.ratePerMile}
              onChange={handleChange}
            />
          </div>
        </div>

        <div className="col-12">
          <div className="form-check">
            <input
              id="waitingTimeRequested"
              name="waitingTimeRequested"
              type="checkbox"
              className="form-check-input"
              checked={calculatorData.waitingTimeRequested}
              onChange={handleChange}
            />

            <label
              htmlFor="waitingTimeRequested"
              className="form-check-label"
            >
              Waiting Time Requested
            </label>
          </div>
        </div>

        {calculatorData.waitingTimeRequested && (
          <div className="col-md-6">
            <label htmlFor="waitingFee" className="form-label">
              Waiting Time Fee ($)
            </label>

            <div className="input-group">
              <span className="input-group-text">
                <FaDollarSign />
              </span>

              <input
                id="waitingFee"
                name="waitingFee"
                type="number"
                min="0"
                step="0.01"
                className="form-control"
                value={calculatorData.waitingFee}
                onChange={handleChange}
                placeholder="Additional waiting charge"
              />
            </div>
          </div>
        )}

        <div className="col-12">
          <div className="form-check">
            <input
              id="returnRide"
              name="returnRide"
              type="checkbox"
              className="form-check-input"
              checked={calculatorData.returnRide}
              onChange={handleChange}
            />

            <label htmlFor="returnRide" className="form-check-label">
              Return Ride / Round Trip
            </label>
          </div>
        </div>
      </div>

      {calculatedPrice !== null && (
        <div className="price-calculator-result">
          <div>
            <div className="price-calculator-result-label">
              Estimated Price
            </div>

            <div className="price-calculator-result-value">
              ${calculatedPrice}
            </div>

            {priceBreakdown && (
              <div className="price-calculator-breakdown mt-2">
                <div>Base price: ${priceBreakdown.basePrice}</div>
                <div>Mileage fee: ${priceBreakdown.mileageFee}</div>

                {Number(priceBreakdown.crewAdjustment) > 0 && (
                  <div>
                    Crew adjustment: ${priceBreakdown.crewAdjustment}
                  </div>
                )}

                {priceBreakdown.returnRide ? (
                  <div>
                    Round trip subtotal: ${priceBreakdown.tripSubtotal}
                  </div>
                ) : (
                  <div>
                    One-way trip subtotal: ${priceBreakdown.oneWayTripTotal}
                  </div>
                )}

                {priceBreakdown.waitingTimeRequested && (
                  <div>
                    Waiting time fee: ${priceBreakdown.waitingFee}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="price-calculator-actions">
        <button
          type="button"
          className="btn btn-primary d-inline-flex align-items-center gap-2"
          onClick={calculatePrice}
        >
          <FaCalculator />
          Calculate Price
        </button>

        <button
          type="button"
          className="btn btn-outline-secondary d-inline-flex align-items-center gap-2"
          onClick={clearCalculator}
        >
          <FaRedo />
          Clear Calculator
        </button>
      </div>
    </section>
  );
});

export default PriceCalculator;