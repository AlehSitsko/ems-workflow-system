import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  useEffect,
} from 'react';

// Main form component for call intake.
// forwardRef is used so the parent page can trigger clearForm() externally.
const CallForm = forwardRef((props, ref) => {
  // Ref for the form element.
  const formRef = useRef(null);

  // Helper function to get today's date in YYYY-MM-DD format.
  const getTodayDate = () => new Date().toISOString().split('T')[0];

  // Initial form state.
  // The entire form is stored in one object to make future backend integration easier.
  const initialFormData = {
    // Caller information
    callerType: '',
    callerNote: '',

    // Patient information
    firstName: '',
    lastName: '',
    dob: '',
    phoneNumber: '',

    // Main trip information
    pickupAddress: '',
    dropoffAddress: '',
    callDate: getTodayDate(),
    tripDate: '',
    pickupTime: '',
    additionalInfo: '',

    // Return ride information
    returnRideOption: 'none',
    returnPickup: '',
    returnDestination: '',
    returnTime: '',

    // Service level
    serviceLevel: '',
  };

  // Main form state.
  const [formData, setFormData] = useState(initialFormData);

  // Stores the previous return ride option.
  // This is used to detect when return ride is turned on or off.
  const previousReturnRideOption = useRef('none');

  // Generic change handler for text, date, time, select, and textarea fields.
  const handleChange = (e) => {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // Dedicated handler for service level radio buttons.
  const handleServiceLevelChange = (value) => {
    setFormData((prev) => ({
      ...prev,
      serviceLevel: value,
    }));
  };

  // Manually sync return addresses from the main trip route.
  // Useful when the dispatcher wants to regenerate the return route.
  const syncReturnAddresses = () => {
    setFormData((prev) => ({
      ...prev,
      returnPickup: prev.dropoffAddress,
      returnDestination: prev.pickupAddress,
    }));
  };

  // Placeholder patient search action.
  // This is the future connection point for searching the patient database.
  const handleFindPatient = () => {
    const trimmedLastName = formData.lastName.trim();
    const trimmedDob = formData.dob.trim();

    // Require at least one search field.
    if (!trimmedLastName && !trimmedDob) {
      window.alert('Please enter Last Name or Date of Birth before searching.');
      return;
    }

    // Placeholder behavior for now.
    // Later this will call the backend API and show search results.
    console.log('Patient search placeholder:', {
      lastName: trimmedLastName,
      dob: trimmedDob,
    });

    window.alert(
      'Patient lookup is not connected yet. This button is ready for future backend integration.'
    );
  };

  // Expose clearForm() to the parent page.
  useImperativeHandle(ref, () => ({
    clearForm() {
      setFormData({
        ...initialFormData,
        callDate: getTodayDate(),
      });

      // Reset tracked previous option too.
      previousReturnRideOption.current = 'none';
    },
  }));

  // Auto-fill return addresses only once when return ride is enabled.
  // This avoids overwriting manual edits every time addresses change.
  useEffect(() => {
    const previousOption = previousReturnRideOption.current;
    const currentOption = formData.returnRideOption;

    const isReturnRideJustEnabled =
      previousOption === 'none' && currentOption !== 'none';

    const isReturnRideDisabled =
      previousOption !== 'none' && currentOption === 'none';

    if (isReturnRideJustEnabled) {
      setFormData((prev) => ({
        ...prev,
        returnPickup: prev.dropoffAddress,
        returnDestination: prev.pickupAddress,
      }));
    }

    if (isReturnRideDisabled) {
      setFormData((prev) => ({
        ...prev,
        returnPickup: '',
        returnDestination: '',
        returnTime: '',
      }));
    }

    // Save current value for the next render.
    previousReturnRideOption.current = currentOption;
  }, [formData.returnRideOption]);

  // Submit handler placeholder.
  // Right now it prevents page refresh and logs form data.
  const handleSubmit = (e) => {
    e.preventDefault();
    console.log('Form submitted:', formData);
  };

  return (
    <div className="container mt-4">
      <div className="card shadow">
        {/* Form header */}
        <div className="card-header bg-primary text-white">
          <h5 className="mb-0">Call Taking Form</h5>
        </div>

        <div className="card-body">
          {/* Main form */}
          <form ref={formRef} onSubmit={handleSubmit}>
            <div className="row">
              {/* =========================================================
                  Caller Information
              ========================================================== */}

              <div className="col-md-6 mb-3">
                <label htmlFor="callerType" className="form-label">
                  Caller Type
                </label>
                <select
                  className="form-select"
                  id="callerType"
                  name="callerType"
                  value={formData.callerType}
                  onChange={handleChange}
                >
                  <option value="">Select...</option>
                  <option value="Broker">Broker</option>
                  <option value="Family">Family</option>
                  <option value="Facility">Facility</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="col-md-6 mb-3">
                <label htmlFor="callerNote" className="form-label">
                  Specify (if needed)
                </label>
                <input
                  type="text"
                  className="form-control"
                  id="callerNote"
                  name="callerNote"
                  placeholder="e.g. Case Manager, Social Worker, Son, etc."
                  value={formData.callerNote}
                  onChange={handleChange}
                />
              </div>

              {/* =========================================================
                  Patient Information
              ========================================================== */}

              <div className="col-md-4 mb-3">
                <label htmlFor="firstName" className="form-label">
                  First Name
                </label>
                <input
                  type="text"
                  className="form-control"
                  id="firstName"
                  name="firstName"
                  placeholder="e.g. John"
                  autoComplete="given-name"
                  value={formData.firstName}
                  onChange={handleChange}
                />
              </div>

              <div className="col-md-4 mb-3">
                <label htmlFor="lastName" className="form-label">
                  Last Name
                </label>
                <input
                  type="text"
                  className="form-control"
                  id="lastName"
                  name="lastName"
                  placeholder="e.g. Doe"
                  autoComplete="family-name"
                  value={formData.lastName}
                  onChange={handleChange}
                />
              </div>

              <div className="col-md-4 mb-3">
                <label htmlFor="dob" className="form-label">
                  Date of Birth
                </label>
                <input
                  type="date"
                  className="form-control"
                  id="dob"
                  name="dob"
                  value={formData.dob}
                  onChange={handleChange}
                />
              </div>

              {/* Patient search action */}
              {/* This is a placeholder for future backend lookup by last name and/or DOB */}
              <div className="col-md-12 mb-3">
                <button
                  type="button"
                  className="btn btn-outline-primary"
                  onClick={handleFindPatient}
                >
                  Find Patient
                </button>
              </div>

              <div className="col-md-6 mb-3">
                <label htmlFor="phoneNumber" className="form-label">
                  Phone Number
                </label>
                <input
                  type="tel"
                  className="form-control"
                  id="phoneNumber"
                  name="phoneNumber"
                  placeholder="e.g. 555-123-4567"
                  autoComplete="tel"
                  value={formData.phoneNumber}
                  onChange={handleChange}
                />
              </div>

              <div className="col-md-6 mb-3">
                <label htmlFor="pickupAddress" className="form-label">
                  Pick Up Address
                </label>
                <input
                  type="text"
                  className="form-control"
                  id="pickupAddress"
                  name="pickupAddress"
                  placeholder="123 Main St"
                  value={formData.pickupAddress}
                  onChange={handleChange}
                />
              </div>

              {/* =========================================================
                  Call and Trip Details
              ========================================================== */}

              <div className="col-md-4 mb-3">
                <label htmlFor="callDate" className="form-label">
                  Date of Call
                </label>
                <input
                  type="date"
                  className="form-control"
                  id="callDate"
                  name="callDate"
                  value={formData.callDate}
                  onChange={handleChange}
                />
              </div>

              <div className="col-md-4 mb-3">
                <label htmlFor="tripDate" className="form-label">
                  Date of Trip
                </label>
                <input
                  type="date"
                  className="form-control"
                  id="tripDate"
                  name="tripDate"
                  value={formData.tripDate}
                  onChange={handleChange}
                />
              </div>

              <div className="col-md-4 mb-3">
                <label htmlFor="pickupTime" className="form-label">
                  Pickup Time
                </label>
                <input
                  type="time"
                  className="form-control"
                  id="pickupTime"
                  name="pickupTime"
                  value={formData.pickupTime}
                  onChange={handleChange}
                />
              </div>

              <div className="col-md-6 mb-3">
                <label htmlFor="dropoffAddress" className="form-label">
                  Drop Off Address
                </label>
                <input
                  type="text"
                  className="form-control"
                  id="dropoffAddress"
                  name="dropoffAddress"
                  placeholder="456 Oak Ave"
                  value={formData.dropoffAddress}
                  onChange={handleChange}
                />
              </div>

              <div className="col-md-6 mb-3">
                <label htmlFor="additionalInfo" className="form-label">
                  Additional Information
                </label>
                <textarea
                  className="form-control"
                  id="additionalInfo"
                  name="additionalInfo"
                  rows="2"
                  placeholder="Any notes or instructions..."
                  value={formData.additionalInfo}
                  onChange={handleChange}
                />
              </div>

              {/* =========================================================
                  Return Ride
              ========================================================== */}

              <div className="col-md-6 mb-3">
                <label htmlFor="returnRideOption" className="form-label">
                  Return Ride
                </label>
                <select
                  className="form-select"
                  id="returnRideOption"
                  name="returnRideOption"
                  value={formData.returnRideOption}
                  onChange={handleChange}
                >
                  <option value="none">No Return</option>
                  <option value="return">Return Ride</option>
                  <option value="will_call">Will Call</option>
                </select>
              </div>

              {/* Manual helper button for rebuilding return addresses */}
              {formData.returnRideOption !== 'none' && (
                <div className="col-md-6 mb-3 d-flex align-items-end">
                  <button
                    type="button"
                    className="btn btn-outline-secondary w-100"
                    onClick={syncReturnAddresses}
                  >
                    Sync Return Addresses
                  </button>
                </div>
              )}

              {(formData.returnRideOption === 'return' ||
                formData.returnRideOption === 'will_call') && (
                <>
                  <div className="col-md-6 mb-3">
                    <label htmlFor="returnPickup" className="form-label">
                      Return Pick Up Address
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      id="returnPickup"
                      name="returnPickup"
                      value={formData.returnPickup}
                      onChange={handleChange}
                    />
                  </div>

                  <div className="col-md-6 mb-3">
                    <label htmlFor="returnDestination" className="form-label">
                      Return Destination Address
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      id="returnDestination"
                      name="returnDestination"
                      value={formData.returnDestination}
                      onChange={handleChange}
                    />
                  </div>

                  {formData.returnRideOption === 'return' && (
                    <div className="col-md-6 mb-3">
                      <label htmlFor="returnTime" className="form-label">
                        Return Pick Up Time
                      </label>
                      <input
                        type="time"
                        className="form-control"
                        id="returnTime"
                        name="returnTime"
                        value={formData.returnTime}
                        onChange={handleChange}
                      />
                    </div>
                  )}
                </>
              )}

              {/* =========================================================
                  Service Level
              ========================================================== */}

              <div className="col-md-12 mb-3">
                <label className="form-label">Service Level</label>

                <div className="d-flex gap-3 flex-wrap">
                  <div
                    className={`form-check p-2 rounded ${
                      formData.serviceLevel === 'stretcher'
                        ? 'bg-info text-white'
                        : 'border'
                    }`}
                  >
                    <input
                      className="form-check-input"
                      type="radio"
                      name="serviceLevel"
                      id="stretcher"
                      value="stretcher"
                      checked={formData.serviceLevel === 'stretcher'}
                      onChange={() => handleServiceLevelChange('stretcher')}
                    />
                    <label className="form-check-label ms-2" htmlFor="stretcher">
                      Stretcher Base
                    </label>
                  </div>

                  <div
                    className={`form-check p-2 rounded ${
                      formData.serviceLevel === 'bls'
                        ? 'bg-success text-white'
                        : 'border'
                    }`}
                  >
                    <input
                      className="form-check-input"
                      type="radio"
                      name="serviceLevel"
                      id="bls"
                      value="bls"
                      checked={formData.serviceLevel === 'bls'}
                      onChange={() => handleServiceLevelChange('bls')}
                    />
                    <label className="form-check-label ms-2" htmlFor="bls">
                      BLS
                    </label>
                  </div>

                  <div
                    className={`form-check p-2 rounded ${
                      formData.serviceLevel === 'als'
                        ? 'bg-danger text-white'
                        : 'border'
                    }`}
                  >
                    <input
                      className="form-check-input"
                      type="radio"
                      name="serviceLevel"
                      id="als"
                      value="als"
                      checked={formData.serviceLevel === 'als'}
                      onChange={() => handleServiceLevelChange('als')}
                    />
                    <label className="form-check-label ms-2" htmlFor="als">
                      ALS
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Form actions */}
            <div className="d-flex justify-content-between mt-4">
              <button type="submit" className="btn btn-success">
                Submit
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
});

export default CallForm;