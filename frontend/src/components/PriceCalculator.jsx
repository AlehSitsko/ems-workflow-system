import React, { forwardRef, useImperativeHandle, useState } from "react";
import { FaCalculator, FaDollarSign, FaRedo } from "react-icons/fa";

const PriceCalculator = forwardRef((props, ref) => {
  const initialCalculatorData = {
    basePrice: "",
    crewSize: "2",
    mileage: "",
    ratePerMile: "",
    returnRide: false,
  };

  const [calculatorData, setCalculatorData] = useState(initialCalculatorData);
  const [calculatedPrice, setCalculatedPrice] = useState(null);

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

    let total = basePrice + mileage * ratePerMile;

    // Simple crew adjustment placeholder.
    // Larger crews can increase the estimate if needed.
    if (crewSize > 2) {
      total += (crewSize - 2) * 25;
    }

    // Return ride is estimated as a round trip.
    if (calculatorData.returnRide) {
      total *= 2;
    }

    setCalculatedPrice(total.toFixed(2));
  };

  return (
    <section className="price-calculator-modern">
      <div className="price-calculator-header">
        <span className="price-calculator-icon">
          <FaCalculator />
        </span>

        <div>
          <h5>Price Calculator</h5>
          <p>Estimate trip pricing based on base rate, mileage, crew size, and return ride.</p>
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
            <div className="price-calculator-result-label">Estimated Price</div>
            <div className="price-calculator-result-value">
              ${calculatedPrice}
            </div>
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