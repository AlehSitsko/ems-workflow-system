import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  useEffect,
} from "react";
import { useToast } from "./ui/ToastProvider";

import {
  FaClipboardCheck,
  FaPhoneAlt,
  FaRoute,
  FaSearch,
  FaUndo,
  FaUserInjured,
  FaUserTie,
} from "react-icons/fa";

import { createCall } from "../api/callsApi";

import {
  createPatient,
  findDuplicatePatient,
  getPatients,
} from "../api/patientsApi";

import { getLoggedDispatcherName, getTodayDate } from "../utils/callUtils";

// Main form component for call intake.
// forwardRef is used so the parent page can trigger exposed methods externally.
const CallForm = forwardRef((props, ref) => {
  const toast = useToast();
  const formRef = useRef(null);

  const initialFormData = {
    dispatcherName: getLoggedDispatcherName(),

    callerType: "",
    callerNote: "",

    patientId: null,
    firstName: "",
    lastName: "",
    dob: "",
    phoneNumber: "",

    pickupAddress: "",
    dropoffAddress: "",
    callDate: getTodayDate(),
    tripDate: "",
    pickupTime: "",
    appointmentTime: "",
    additionalInfo: "",

    returnRideOption: "none",
    returnPickup: "",
    returnDestination: "",
    returnTime: "",

    serviceLevel: "",
  };

  const serviceLevelOptions = [
    { value: "stretcher", label: "Stretcher" },
    { value: "bls", label: "BLS" },
    { value: "als", label: "ALS" },
    { value: "emergency", label: "Emergency" },
  ];

  const [formData, setFormData] = useState(initialFormData);
  const [patientSearchResults, setPatientSearchResults] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [missingInfoExplanation, setMissingInfoExplanation] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState("");

  const previousReturnRideOption = useRef("none");
  const lastPrefilledPatientIdRef = useRef(null);

  const handleChange = (e) => {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleServiceLevelChange = (value) => {
    setFormData((prev) => ({
      ...prev,
      serviceLevel: value,
    }));
  };

  const syncReturnAddresses = () => {
    setFormData((prev) => ({
      ...prev,
      returnPickup: prev.dropoffAddress,
      returnDestination: prev.pickupAddress,
    }));
  };

  const analyzeCallQuality = () => {
    const criticalMissing = [];
    const nonCriticalMissing = [];

    if (!formData.firstName.trim()) criticalMissing.push("First Name");
    if (!formData.lastName.trim()) criticalMissing.push("Last Name");
    if (!formData.dob.trim()) criticalMissing.push("Date of Birth");
    if (!formData.pickupAddress.trim()) criticalMissing.push("Pick Up Address");

    if (!formData.phoneNumber.trim()) nonCriticalMissing.push("Phone Number");
    if (!formData.dropoffAddress.trim()) nonCriticalMissing.push("Drop Off Address");
    if (!formData.tripDate.trim()) nonCriticalMissing.push("Date of Trip");
    if (!formData.pickupTime.trim()) nonCriticalMissing.push("Pickup Time");

    if (!formData.appointmentTime.trim()) {
      nonCriticalMissing.push("Appointment Time");
    }

    if (!formData.callerType.trim()) nonCriticalMissing.push("Caller Type");
    if (!formData.serviceLevel.trim()) nonCriticalMissing.push("Service Level");

    if (!formData.additionalInfo.trim()) {
      nonCriticalMissing.push("Additional Information");
    }

    const totalCritical = 4;
    const totalOptional = 8;

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

  const buildPatientPayloadFromForm = () => ({
    first_name: formData.firstName.trim(),
    last_name: formData.lastName.trim(),
    dob: formData.dob || null,
    phone: formData.phoneNumber.trim(),
    address: formData.pickupAddress.trim(),
    default_service_level: formData.serviceLevel || null,
    notes: [
      formData.additionalInfo.trim(),
      formData.callerNote.trim()
        ? `Caller note from intake: ${formData.callerNote.trim()}`
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
  });

  const shouldCreatePatientFromForm = () => {
    return (
      !formData.patientId &&
      formData.firstName.trim() &&
      formData.lastName.trim()
    );
  };

  const ensurePatientRecord = async () => {
    if (formData.patientId) {
      return formData.patientId;
    }

    if (!shouldCreatePatientFromForm()) {
      return null;
    }

    const patientPayload = buildPatientPayloadFromForm();

    // Prevent duplicate patient creation before saving a new call.
    const duplicatePatient = await findDuplicatePatient(patientPayload);

    if (duplicatePatient) {
      return duplicatePatient.id;
    }

    const createdPatient = await createPatient(patientPayload);
    return createdPatient.id;
  };

  const handleFindPatient = async () => {
    const trimmedLastName = formData.lastName.trim();
    const trimmedDob = formData.dob.trim();

    if (!trimmedLastName && !trimmedDob) {
      toast.warning("Search field required", "Enter Last Name or Date of Birth before searching.");
      return;
    }

    try {
      const data = await getPatients({ name: trimmedLastName, dob: trimmedDob }, 1, 100);
      const results = data.items;

      setPatientSearchResults(results);

      if (results.length === 0) {
        toast.info("No patients found", "No matching patients in the system.");
      }
    } catch (err) {
      console.error("Failed to search patient:", err);
      toast.error("Search failed", "Could not search patients.");
    }
  };

  const fillFormFromPatient = (patient) => {
    if (!patient) {
      return;
    }

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

  const handleSelectPatient = (patient) => {
    fillFormFromPatient(patient);
  };

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
    lastPrefilledPatientIdRef.current = null;
  };

  useImperativeHandle(ref, () => ({
    clearForm() {
      clearFormData();
    },

    fillFromPatient(patient) {
      fillFormFromPatient(patient);
    },
  }));

  useEffect(() => {
    if (!props.prefillPatient) {
      return;
    }

    const patientId = props.prefillPatient.id;

    if (String(lastPrefilledPatientIdRef.current) === String(patientId)) {
      return;
    }

    fillFormFromPatient(props.prefillPatient);
    lastPrefilledPatientIdRef.current = patientId;
  }, [props.prefillPatient]);

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

  // Re-sync return addresses when pickup/dropoff change while return ride is active.
  useEffect(() => {
    if (formData.returnRideOption === "none") return;
    setFormData((prev) => ({
      ...prev,
      returnPickup: prev.dropoffAddress,
      returnDestination: prev.pickupAddress,
    }));
  }, [formData.pickupAddress, formData.dropoffAddress]);

  const { criticalMissing, nonCriticalMissing, score } = analyzeCallQuality();

  const hasCriticalIssues = criticalMissing.length > 0;
  const hasAnyQualityIssues =
    criticalMissing.length > 0 || nonCriticalMissing.length > 0;

  const handleSubmit = async (e) => {
    e.preventDefault();

    const currentQualityReport = analyzeCallQuality();

    if (
      currentQualityReport.criticalMissing.length > 0 &&
      !missingInfoExplanation.trim()
    ) {
      toast.warning("Explanation required", "Critical information is missing. Please provide an explanation before saving.");
      return;
    }

    setSubmitMessage("");
    setIsSubmitting(true);

    try {
      const finalPatientId = await ensurePatientRecord();

      const callPayload = {
        patient_id: finalPatientId,

        dispatcher_name: formData.dispatcherName,

        received_at: new Date().toISOString(),
        status: "new",

        date_of_call: formData.callDate,
        trip_date: formData.tripDate,
        pickup_time: formData.pickupTime,
        appointment_time: formData.appointmentTime,

        pickup_address: formData.pickupAddress,
        dropoff_address: formData.dropoffAddress,

        caller_type: formData.callerType,
        call_type: formData.returnRideOption !== "none" ? "scheduled" : "none",
        service_level: formData.serviceLevel,

        caller_phone: formData.phoneNumber || null,
        caller_note: formData.callerNote || null,

        quality_score: currentQualityReport.score,
        missing_critical_fields: currentQualityReport.criticalMissing.join(", "),
        missing_optional_fields: currentQualityReport.nonCriticalMissing.join(", "),
        missing_info_explanation: missingInfoExplanation.trim() || null,

        notes: formData.additionalInfo || null,
      };

      const savedCall = await createCall(callPayload);

      // Create a separate return / will-call leg when requested.
      if (formData.returnRideOption !== "none" && formData.returnPickup) {
        const isWillCall = formData.returnRideOption === "will_call";
        const returnPayload = {
          patient_id: finalPatientId,
          dispatcher_name: formData.dispatcherName,
          received_at: new Date().toISOString(),
          status: "new",
          date_of_call: formData.callDate,
          trip_date: formData.tripDate,
          // Will Call has no pickup time — it will be set from the Dispatch Board.
          pickup_time: isWillCall ? "" : (formData.returnTime || ""),
          appointment_time: "",
          pickup_address: formData.returnPickup,
          dropoff_address: formData.returnDestination,
          caller_type: formData.callerType,
          call_type: isWillCall ? "will_call" : "return",
          service_level: formData.serviceLevel,
          caller_phone: formData.phoneNumber || null,
          caller_note: null,
          quality_score: 0,
          missing_critical_fields: "",
          missing_optional_fields: "",
          missing_info_explanation: "",
          notes: `${isWillCall ? "Will Call" : "Return"} leg for call #${savedCall.id}`,
        };
        await createCall(returnPayload);
      }

      console.log("Call saved:", savedCall);
      setSubmitMessage("Call and patient record saved successfully.");

      clearFormData();
    } catch (err) {
      console.error("Failed to save call:", err);
      setSubmitMessage(err.message || "Failed to save call.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="call-form-modern">
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

      <form ref={formRef} onSubmit={handleSubmit}>
        <section className="call-form-section">
          <div className="call-form-section-header">
            <span className="call-form-section-icon">
              <FaUserTie />
            </span>

            <div>
              <h5>Caller / Dispatcher</h5>
              <p>Identify the dispatcher and caller source.</p>
            </div>
          </div>

          <div className="row g-3">
            <div className="col-md-6">
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

            <div className="col-md-6">
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

            <div className="col-12">
              <label htmlFor="callerNote" className="form-label">
                Specify Caller Details
              </label>

              <input
                type="text"
                className="form-control"
                id="callerNote"
                name="callerNote"
                placeholder="e.g. Case Manager, Social Worker, Son, Nurse, etc."
                value={formData.callerNote}
                onChange={handleChange}
                disabled={isSubmitting}
              />
            </div>
          </div>
        </section>

        <section className="call-form-section">
          <div className="call-form-section-header">
            <span className="call-form-section-icon">
              <FaUserInjured />
            </span>

            <div>
              <h5>Patient Information</h5>
              <p>Search an existing patient or enter patient details manually.</p>
            </div>
          </div>

          <div className="row g-3">
            <div className="col-md-4">
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

            <div className="col-md-4">
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

            <div className="col-md-4">
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

            <div className="col-md-6">
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

            <div className="col-md-6 d-flex align-items-end">
              <button
                type="button"
                className="btn btn-outline-primary d-inline-flex align-items-center gap-2"
                onClick={handleFindPatient}
                disabled={isSubmitting}
              >
                <FaSearch />
                Find Patient
              </button>
            </div>
          </div>

          {patientSearchResults.length > 0 && (
            <div className="call-form-search-results mt-3">
              <div className="call-form-search-title">Patient Search Results</div>

              {patientSearchResults.map((patient) => (
                <div key={patient.id} className="call-form-search-card">
                  <div>
                    <div className="call-form-search-name">
                      {patient.first_name} {patient.last_name}
                    </div>

                    <div className="call-form-search-muted">
                      DOB: {patient.dob || "—"} · Phone: {patient.phone || "—"}
                    </div>
                  </div>

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
          )}

          {selectedPatient && (
            <div className="alert alert-success mt-3 mb-0">
              Selected Patient: {selectedPatient.first_name}{" "}
              {selectedPatient.last_name} — DOB: {selectedPatient.dob || "—"}
            </div>
          )}
        </section>

        <section className="call-form-section">
          <div className="call-form-section-header">
            <span className="call-form-section-icon">
              <FaRoute />
            </span>

            <div>
              <h5>Trip Details</h5>
              <p>Document pickup, drop-off, schedule, and transport details.</p>
            </div>
          </div>

          <div className="row g-3">
            <div className="col-md-6">
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

            <div className="col-md-6">
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

            <div className="col-md-3">
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

            <div className="col-md-3">
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

            <div className="col-md-3">
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

            {formData.serviceLevel !== "emergency" && (
              <div className="col-md-3">
                <label htmlFor="appointmentTime" className="form-label">
                  Appointment Time
                </label>

                <input
                  type="time"
                  className="form-control"
                  id="appointmentTime"
                  name="appointmentTime"
                  value={formData.appointmentTime}
                  onChange={handleChange}
                  disabled={isSubmitting}
                />
              </div>
            )}

            <div className="col-12">
              <label htmlFor="additionalInfo" className="form-label">
                Additional Information
              </label>

              <textarea
                className="form-control"
                id="additionalInfo"
                name="additionalInfo"
                rows="3"
                placeholder="Any notes or instructions..."
                value={formData.additionalInfo}
                onChange={handleChange}
                disabled={isSubmitting}
              />
            </div>
          </div>
        </section>

        <section className="call-form-section">
          <div className="call-form-section-header">
            <span className="call-form-section-icon">
              <FaUndo />
            </span>

            <div>
              <h5>Return Ride</h5>
              <p>Configure return ride or will-call details when needed.</p>
            </div>
          </div>

          <div className="row g-3">
            <div className="col-md-6">
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

            {formData.returnRideOption !== "none" && (
              <div className="col-md-6 d-flex align-items-end">
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
                <div className="col-md-6">
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

                <div className="col-md-6">
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
                  <div className="col-md-6">
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
          </div>
        </section>

        <section className="call-form-section">
          <div className="call-form-section-header">
            <span className="call-form-section-icon">
              <FaPhoneAlt />
            </span>

            <div>
              <h5>Service Level</h5>
              <p>Select the requested transport service level.</p>
            </div>
          </div>

          <div className="call-service-grid">
            {serviceLevelOptions.map((service) => (
              <button
                key={service.value}
                type="button"
                className={`call-service-card ${
                  formData.serviceLevel === service.value ? "active" : ""
                }`}
                onClick={() => handleServiceLevelChange(service.value)}
                disabled={isSubmitting}
              >
                {service.label}
              </button>
            ))}
          </div>

          {formData.serviceLevel === "emergency" && (
            <div className="alert alert-danger mt-3 mb-0">
              Emergency selected. Confirm dispatch priority, caller details,
              and operational instructions before saving.
            </div>
          )}
        </section>

        <section className="call-form-section">
          <div className="call-form-section-header">
            <span className="call-form-section-icon">
              <FaClipboardCheck />
            </span>

            <div>
              <h5>Call Quality Check</h5>
              <p>Review required information before saving the call.</p>
            </div>
          </div>

          <div
            className={`call-quality-panel ${
              hasCriticalIssues
                ? "danger"
                : hasAnyQualityIssues
                  ? "warning"
                  : "success"
            }`}
          >
            <div className="call-quality-score">{score}%</div>

            <div>
              <div className="call-quality-title">Quality Score</div>

              {criticalMissing.length > 0 && (
                <div className="call-quality-line">
                  <strong>Missing Critical:</strong>{" "}
                  {criticalMissing.join(", ")}
                </div>
              )}

              {nonCriticalMissing.length > 0 && (
                <div className="call-quality-line">
                  <strong>Missing Optional:</strong>{" "}
                  {nonCriticalMissing.join(", ")}
                </div>
              )}

              {!hasAnyQualityIssues && (
                <div className="call-quality-line">
                  All tracked fields are completed.
                </div>
              )}
            </div>
          </div>

          {hasCriticalIssues && (
            <div className="mt-3">
              <label htmlFor="missingInfoExplanation" className="form-label">
                Missing Information Explanation
              </label>

              <textarea
                className="form-control"
                id="missingInfoExplanation"
                rows="3"
                placeholder="Explain why critical information is missing, e.g. patient refused, caller did not provide information, call was not accepted, etc."
                value={missingInfoExplanation}
                onChange={(e) => setMissingInfoExplanation(e.target.value)}
                disabled={isSubmitting}
              />
            </div>
          )}
        </section>

        <div className="call-form-actions">
          <button type="submit" className="btn btn-success" disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : "Submit Call"}
          </button>
        </div>
      </form>
    </div>
  );
});

export default CallForm;