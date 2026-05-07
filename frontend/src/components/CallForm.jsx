import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  useEffect,
} from "react";

import { createCall } from "../api/callsApi";
import { getPatients } from "../api/patientsApi";

// Read logged-in user from localStorage.
// This is MVP-level auth state until backend sessions or tokens are added.
const getLoggedDispatcherName = () => {
  const storedUser = localStorage.getItem("ems_current_user");

  if (!storedUser) {
    return "";
  }

  try {
    const user = JSON.parse(storedUser);
    return user.display_name || user.username || "";
  } catch (err) {
    console.error("Failed to read logged dispatcher:", err);
    return "";
  }
};

// Main form component for call intake.
// forwardRef is used so the parent page can trigger clearForm() externally.
const CallForm = forwardRef((props, ref) => {
  // Ref for the form element.
  const formRef = useRef(null);

  // Helper function to get today's date in YYYY-MM-DD format.
  const getTodayDate = () => new Date().toISOString().split("T")[0];

  // Initial form state.
  // The entire form is stored in one object to make backend integration easier.
  const initialFormData = {
    // Dispatcher information is now pulled from the logged-in user.
    dispatcherName: getLoggedDispatcherName(),

    // Caller information.
    callerType: "",
    callerNote: "",

    // Patient information.
    patientId: null,
    firstName: "",
    lastName: "",
    dob: "",
    phoneNumber: "",

    // Main trip information.
    pickupAddress: "",
    dropoffAddress: "",
    callDate: getTodayDate(),
    tripDate: "",
    pickupTime: "",
    additionalInfo: "",

    // Return ride information.
    returnRideOption: "none",
    returnPickup: "",
    returnDestination: "",
    returnTime: "",

    // Service level.
    serviceLevel: "",
  };

  // Main form state.
  const [formData, setFormData] = useState(initialFormData);

  // Patient search state.
  const [patientSearchResults, setPatientSearchResults] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);

  // Explanation required when critical information is missing.
  const [missingInfoExplanation, setMissingInfoExplanation] = useState("");

  // Submit state.
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState("");

  // Stores the previous return ride option.
  // This is used to detect when return ride is turned on or off.
  const previousReturnRideOption = useRef("none");

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

  // Analyze form completeness, split missing fields by severity,
  // and calculate a call quality score.
  const analyzeCallQuality = () => {
    const criticalMissing = [];
    const nonCriticalMissing = [];

    // Critical fields needed to identify the patient and pickup location.
    if (!formData.firstName.trim()) criticalMissing.push("First Name");
    if (!formData.lastName.trim()) criticalMissing.push("Last Name");
    if (!formData.dob.trim()) criticalMissing.push("Date of Birth");
    if (!formData.pickupAddress.trim()) criticalMissing.push("Pick Up Address");

    // Non-critical fields improve call quality but should not always block saving.
    if (!formData.phoneNumber.trim()) nonCriticalMissing.push("Phone Number");
    if (!formData.dropoffAddress.trim()) nonCriticalMissing.push("Drop Off Address");
    if (!formData.tripDate.trim()) nonCriticalMissing.push("Date of Trip");
    if (!formData.pickupTime.trim()) nonCriticalMissing.push("Pickup Time");
    if (!formData.callerType.trim()) nonCriticalMissing.push("Caller Type");
    if (!formData.serviceLevel.trim()) nonCriticalMissing.push("Service Level");
    if (!formData.additionalInfo.trim()) {
      nonCriticalMissing.push("Additional Information");
    }

    // Score weights:
    // Critical fields represent 70% of total score.
    // Optional fields represent 30% of total score.
    const totalCritical = 4;
    const totalOptional = 7;

    const criticalScore =
      ((totalCritical - criticalMissing.length) / totalCritical) * 70;

    const optionalScore =
      ((totalOptional - nonCriticalMissing.length) / totalOptional) * 30;

    const score = Math.round(criticalScore + optionalScore);

    return {
      criticalMissing,
      nonCriticalMissing,
      score,
    };
  };

  // Search patients through the backend by last name and/or DOB.
  const handleFindPatient = async () => {
    const trimmedLastName = formData.lastName.trim();
    const trimmedDob = formData.dob.trim();

    if (!trimmedLastName && !trimmedDob) {
      window.alert("Please enter Last Name or Date of Birth before searching.");
      return;
    }

    try {
      const results = await getPatients({
        name: trimmedLastName,
        dob: trimmedDob,
      });

      setPatientSearchResults(results);

      if (results.length === 0) {
        window.alert("No matching patients found.");
      }
    } catch (err) {
      console.error("Failed to search patient:", err);
      window.alert("Failed to search patient.");
    }
  };

  // Select a patient from search results and bind patient_id to the call form.
  const handleSelectPatient = (patient) => {
    setSelectedPatient(patient);

    setFormData((prev) => ({
      ...prev,
      patientId: patient.id,
      firstName: patient.first_name || "",
      lastName: patient.last_name || "",
      dob: patient.dob || "",
      phoneNumber: patient.phone || "",
      pickupAddress: patient.address || "",
      serviceLevel:
        patient.default_service_level?.toLowerCase() || prev.serviceLevel,
    }));

    setPatientSearchResults([]);
  };

  // Clear all form data and patient selection.
  const clearFormData = () => {
    setFormData({
      ...initialFormData,
      dispatcherName: getLoggedDispatcherName(),
      callDate: getTodayDate(),
    });

    setSelectedPatient(null);
    setPatientSearchResults([]);
    setMissingInfoExplanation("");
    setSubmitMessage("");

    previousReturnRideOption.current = "none";
  };

  // Expose clearForm() to the parent page.
  useImperativeHandle(ref, () => ({
    clearForm() {
      clearFormData();
    },
  }));

  // Auto-fill return addresses only once when return ride is enabled.
  // This avoids overwriting manual edits every time addresses change.
  useEffect(() => {
    const previousOption = previousReturnRideOption.current;
    const currentOption = formData.returnRideOption;

    const isReturnRideJustEnabled =
      previousOption === "none" && currentOption !== "none";

    const isReturnRideDisabled =
      previousOption !== "none" && currentOption === "none";

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
        returnPickup: "",
        returnDestination: "",
        returnTime: "",
      }));
    }

    previousReturnRideOption.current = currentOption;
  }, [formData.returnRideOption]);

  const { criticalMissing, nonCriticalMissing, score } = analyzeCallQuality();

  const hasCriticalIssues = criticalMissing.length > 0;
  const hasAnyQualityIssues =
    criticalMissing.length > 0 || nonCriticalMissing.length > 0;

  // Submit the call intake form to the backend.
  const handleSubmit = async (e) => {
    e.preventDefault();

    const currentQualityReport = analyzeCallQuality();

    if (
      currentQualityReport.criticalMissing.length > 0 &&
      !missingInfoExplanation.trim()
    ) {
      window.alert(
        "Critical information is missing. Please provide an explanation before saving."
      );
      return;
    }

    setSubmitMessage("");
    setIsSubmitting(true);

    // Map frontend field names to backend Call model field names.
    const callPayload = {
      // Patient link.
      patient_id: formData.patientId,

      // Dispatcher information.
      dispatcher_name: formData.dispatcherName,

      // Call metadata.
      date_of_call: formData.callDate,
      trip_date: formData.tripDate,
      pickup_time: formData.pickupTime,

      // Trip details.
      pickup_address: formData.pickupAddress,
      dropoff_address: formData.dropoffAddress,

      // Operational fields.
      caller_type: formData.callerType,
      call_type: formData.returnRideOption,
      service_level: formData.serviceLevel,

      // Structured quality tracking.
      quality_score: currentQualityReport.score,
      missing_critical_fields: currentQualityReport.criticalMissing.join(", "),
      missing_optional_fields: currentQualityReport.nonCriticalMissing.join(", "),
      missing_info_explanation: missingInfoExplanation.trim(),

      // General notes.
      notes: [
        formData.additionalInfo,
        formData.callerNote ? `Caller note: ${formData.callerNote}` : "",
        formData.dispatcherName
          ? `Dispatcher: ${formData.dispatcherName}`
          : "",
        formData.firstName || formData.lastName
          ? `Patient: ${formData.firstName} ${formData.lastName}`
          : "",
        formData.dob ? `DOB: ${formData.dob}` : "",
        formData.phoneNumber ? `Phone: ${formData.phoneNumber}` : "",
        formData.returnRideOption !== "none"
          ? `Return pickup: ${formData.returnPickup}; Return destination: ${formData.returnDestination}; Return time: ${
              formData.returnTime || "Will Call"
            }`
          : "",
        `Call Quality Score: ${currentQualityReport.score}%`,
        currentQualityReport.criticalMissing.length > 0
          ? `Missing Critical Fields: ${currentQualityReport.criticalMissing.join(
              ", "
            )}`
          : "",
        currentQualityReport.nonCriticalMissing.length > 0
          ? `Missing Optional Fields: ${currentQualityReport.nonCriticalMissing.join(
              ", "
            )}`
          : "",
        missingInfoExplanation.trim()
          ? `Missing Information Explanation: ${missingInfoExplanation.trim()}`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
    };

    try {
      const savedCall = await createCall(callPayload);

      console.log("Call saved:", savedCall);
      setSubmitMessage("Call saved successfully.");

      clearFormData();
    } catch (err) {
      console.error("Failed to save call:", err);
      setSubmitMessage(err.message || "Failed to save call.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container mt-4">
      <div className="card shadow">
        {/* Form header */}
        <div className="card-header bg-primary text-white">
          <h5 className="mb-0">Call Taking Form</h5>
        </div>

        <div className="card-body">
          {submitMessage && (
            <div
              className={`alert ${
                submitMessage.includes("successfully")
                  ? "alert-success"
                  : "alert-danger"
              }`}
            >
              {submitMessage}
            </div>
          )}

          {/* Main form */}
          <form ref={formRef} onSubmit={handleSubmit}>
            <div className="row">
              {/* =========================================================
                  Dispatcher Information
              ========================================================== */}

              <div className="col-md-6 mb-3">
                <label htmlFor="dispatcherName" className="form-label">
                  Dispatcher Name
                </label>

                <input
                  type="text"
                  className="form-control"
                  id="dispatcherName"
                  name="dispatcherName"
                  value={formData.dispatcherName}
                  readOnly
                  disabled={isSubmitting}
                />

                <div className="form-text">
                  Dispatcher identity is taken from the logged-in user.
                </div>
              </div>

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
                  disabled={isSubmitting}
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
                  disabled={isSubmitting}
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
                  className={`form-control ${
                    !formData.firstName.trim() ? "border-danger" : ""
                  }`}
                  id="firstName"
                  name="firstName"
                  placeholder="e.g. John"
                  autoComplete="given-name"
                  value={formData.firstName}
                  onChange={handleChange}
                  disabled={isSubmitting}
                />
              </div>

              <div className="col-md-4 mb-3">
                <label htmlFor="lastName" className="form-label">
                  Last Name
                </label>
                <input
                  type="text"
                  className={`form-control ${
                    !formData.lastName.trim() ? "border-danger" : ""
                  }`}
                  id="lastName"
                  name="lastName"
                  placeholder="e.g. Doe"
                  autoComplete="family-name"
                  value={formData.lastName}
                  onChange={handleChange}
                  disabled={isSubmitting}
                />
              </div>

              <div className="col-md-4 mb-3">
                <label htmlFor="dob" className="form-label">
                  Date of Birth
                </label>
                <input
                  type="date"
                  className={`form-control ${
                    !formData.dob.trim() ? "border-danger" : ""
                  }`}
                  id="dob"
                  name="dob"
                  value={formData.dob}
                  onChange={handleChange}
                  disabled={isSubmitting}
                />
              </div>

              {/* Patient search action */}
              <div className="col-md-12 mb-3">
                <button
                  type="button"
                  className="btn btn-outline-primary"
                  onClick={handleFindPatient}
                  disabled={isSubmitting}
                >
                  Find Patient
                </button>
              </div>

              {/* Patient search results */}
              {patientSearchResults.length > 0 && (
                <div className="col-md-12 mb-3">
                  <div className="card border-primary">
                    <div className="card-body">
                      <h6 className="card-title mb-3">
                        Patient Search Results
                      </h6>

                      {patientSearchResults.map((patient) => (
                        <div
                          key={patient.id}
                          className="d-flex justify-content-between align-items-center border-bottom py-2"
                        >
                          <span>
                            {patient.first_name} {patient.last_name} — DOB:{" "}
                            {patient.dob || "—"} — Phone:{" "}
                            {patient.phone || "—"}
                          </span>

                          <button
                            type="button"
                            className="btn btn-sm btn-outline-success"
                            onClick={() => handleSelectPatient(patient)}
                            disabled={isSubmitting}
                          >
                            Select
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Selected patient indicator */}
              {selectedPatient && (
                <div className="col-md-12 mb-3">
                  <div className="alert alert-success mb-0">
                    Selected Patient: {selectedPatient.first_name}{" "}
                    {selectedPatient.last_name} — DOB:{" "}
                    {selectedPatient.dob || "—"}
                  </div>
                </div>
              )}

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
                  disabled={isSubmitting}
                />
              </div>

              <div className="col-md-6 mb-3">
                <label htmlFor="pickupAddress" className="form-label">
                  Pick Up Address
                </label>
                <input
                  type="text"
                  className={`form-control ${
                    !formData.pickupAddress.trim() ? "border-danger" : ""
                  }`}
                  id="pickupAddress"
                  name="pickupAddress"
                  placeholder="123 Main St"
                  value={formData.pickupAddress}
                  onChange={handleChange}
                  disabled={isSubmitting}
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
                  disabled={isSubmitting}
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
                  disabled={isSubmitting}
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
                  disabled={isSubmitting}
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
                  disabled={isSubmitting}
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
                  disabled={isSubmitting}
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
                  disabled={isSubmitting}
                >
                  <option value="none">No Return</option>
                  <option value="return">Return Ride</option>
                  <option value="will_call">Will Call</option>
                </select>
              </div>

              {/* Manual helper button for rebuilding return addresses */}
              {formData.returnRideOption !== "none" && (
                <div className="col-md-6 mb-3 d-flex align-items-end">
                  <button
                    type="button"
                    className="btn btn-outline-secondary w-100"
                    onClick={syncReturnAddresses}
                    disabled={isSubmitting}
                  >
                    Sync Return Addresses
                  </button>
                </div>
              )}

              {(formData.returnRideOption === "return" ||
                formData.returnRideOption === "will_call") && (
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
                      disabled={isSubmitting}
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
                      disabled={isSubmitting}
                    />
                  </div>

                  {formData.returnRideOption === "return" && (
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
                        disabled={isSubmitting}
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
                      formData.serviceLevel === "stretcher"
                        ? "bg-info text-white"
                        : "border"
                    }`}
                  >
                    <input
                      className="form-check-input"
                      type="radio"
                      name="serviceLevel"
                      id="stretcher"
                      value="stretcher"
                      checked={formData.serviceLevel === "stretcher"}
                      onChange={() => handleServiceLevelChange("stretcher")}
                      disabled={isSubmitting}
                    />
                    <label className="form-check-label ms-2" htmlFor="stretcher">
                      Stretcher Base
                    </label>
                  </div>

                  <div
                    className={`form-check p-2 rounded ${
                      formData.serviceLevel === "bls"
                        ? "bg-success text-white"
                        : "border"
                    }`}
                  >
                    <input
                      className="form-check-input"
                      type="radio"
                      name="serviceLevel"
                      id="bls"
                      value="bls"
                      checked={formData.serviceLevel === "bls"}
                      onChange={() => handleServiceLevelChange("bls")}
                      disabled={isSubmitting}
                    />
                    <label className="form-check-label ms-2" htmlFor="bls">
                      BLS
                    </label>
                  </div>

                  <div
                    className={`form-check p-2 rounded ${
                      formData.serviceLevel === "als"
                        ? "bg-danger text-white"
                        : "border"
                    }`}
                  >
                    <input
                      className="form-check-input"
                      type="radio"
                      name="serviceLevel"
                      id="als"
                      value="als"
                      checked={formData.serviceLevel === "als"}
                      onChange={() => handleServiceLevelChange("als")}
                      disabled={isSubmitting}
                    />
                    <label className="form-check-label ms-2" htmlFor="als">
                      ALS
                    </label>
                  </div>
                </div>
              </div>

              {/* =========================================================
                  Call Quality Report
              ========================================================== */}

              <div className="col-md-12 mb-3">
                <div
                  className={`alert ${
                    hasCriticalIssues
                      ? "alert-danger"
                      : hasAnyQualityIssues
                        ? "alert-warning"
                        : "alert-success"
                  }`}
                >
                  <strong>Call Quality Check</strong>

                  <div className="mt-2">
                    <strong>Quality Score:</strong> {score}%
                  </div>

                  {criticalMissing.length > 0 && (
                    <div className="mt-2">
                      <strong>Missing Critical:</strong>{" "}
                      {criticalMissing.join(", ")}
                    </div>
                  )}

                  {nonCriticalMissing.length > 0 && (
                    <div className="mt-2">
                      <strong>Missing Optional:</strong>{" "}
                      {nonCriticalMissing.join(", ")}
                    </div>
                  )}

                  {!hasAnyQualityIssues && (
                    <div className="mt-2">All tracked fields are completed.</div>
                  )}
                </div>
              </div>

              {hasCriticalIssues && (
                <div className="col-md-12 mb-3">
                  <label htmlFor="missingInfoExplanation" className="form-label">
                    Missing Information Explanation (Required)
                  </label>
                  <textarea
                    className="form-control"
                    id="missingInfoExplanation"
                    rows="2"
                    placeholder="Explain why critical information is missing, e.g. patient refused, caller did not provide information, call was not accepted, etc."
                    value={missingInfoExplanation}
                    onChange={(e) => setMissingInfoExplanation(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
              )}
            </div>

            {/* Form actions */}
            <div className="d-flex justify-content-between mt-4">
              <button
                type="submit"
                className="btn btn-success"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Saving..." : "Submit"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
});

export default CallForm;