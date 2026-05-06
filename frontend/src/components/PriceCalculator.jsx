import React, { forwardRef, useImperativeHandle, useState } from 'react';

const PriceCalculator = forwardRef((props, ref) => {
  const [basePrice, setBasePrice] = useState('');
  const [crewSize, setCrewSize] = useState('2');
  const [mileage, setMileage] = useState('');
  const [ratePerMile, setRatePerMile] = useState('');
  const [totalPrice, setTotalPrice] = useState(null);
  const [isRoundTrip, setIsRoundTrip] = useState(false); // ← Новый флаг
  const [tripTotal, setTripTotal] = useState(null); // ← Новый итог

  useImperativeHandle(ref, () => ({
    clearCalculator() {
      setBasePrice('');
      setCrewSize('2');
      setMileage('');
      setRatePerMile('');
      setTotalPrice(null);
      setTripTotal(null);
      setIsRoundTrip(false);
    }
  }));

  const calculatePrice = () => {
    const multiplier = { '2': 1, '4': 2, '6': 3 }[crewSize] || 1;
    const base = parseFloat(basePrice) || 0;
    const miles = parseFloat(mileage) || 0;
    const rate = parseFloat(ratePerMile) || 0;

    const totalCost = base * multiplier + miles * rate;
    setTotalPrice(totalCost.toFixed(2));

    const roundTripCost = isRoundTrip ? totalCost * 2 : totalCost;
    setTripTotal(roundTripCost.toFixed(2));
  };

  return (
    <div className="container mt-4">
      <div className="card shadow">
        <div className="card-header bg-secondary text-white">
          <h5 className="mb-0">Price Calculator</h5>
        </div>
        <div className="card-body">
          <div className="mb-3">
            <label className="form-label">Base Price ($)</label>
            <input
              type="number"
              className="form-control"
              value={basePrice}
              onChange={(e) => setBasePrice(e.target.value)}
            />
          </div>

          <div className="mb-3">
            <label className="form-label">Crew Size</label>
            <select
              className="form-select"
              value={crewSize}
              onChange={(e) => setCrewSize(e.target.value)}
            >
              <option value="2">2</option>
              <option value="4">4</option>
              <option value="6">6</option>
            </select>
          </div>

          <div className="mb-3">
            <label className="form-label">Mileage (miles)</label>
            <input
              type="number"
              className="form-control"
              value={mileage}
              onChange={(e) => setMileage(e.target.value)}
            />
          </div>

          <div className="mb-3">
            <label className="form-label">Rate per Mile ($)</label>
            <input
              type="number"
              className="form-control"
              value={ratePerMile}
              onChange={(e) => setRatePerMile(e.target.value)}
            />
          </div>

          <div className="form-check mb-3">
            <input
              type="checkbox"
              className="form-check-input"
              id="roundTripCheck"
              checked={isRoundTrip}
              onChange={(e) => setIsRoundTrip(e.target.checked)}
            />
            <label className="form-check-label" htmlFor="roundTripCheck">
              Return Ride (Round-Trip)
            </label>
          </div>

          <button className="btn btn-primary me-2" onClick={calculatePrice}>
            Calculate Price
          </button>

          {totalPrice !== null && (
            <div className="mt-3">
              <h6>One-Way Price: ${totalPrice}</h6>
              {isRoundTrip && (
                <h6 className="text-success">Trip Total (Round-Trip): ${tripTotal}</h6>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

export default PriceCalculator;
