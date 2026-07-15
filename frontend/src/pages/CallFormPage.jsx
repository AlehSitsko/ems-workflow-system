import React, { useRef, useState } from "react";
import {
  FaArrowLeft,
  FaArrowRight,
  FaCheckCircle,
  FaExclamationTriangle,
  FaHistory,
  FaPhoneAlt,
  FaPlus,
  FaSearch,
  FaTimes,
  FaUserInjured,
} from "react-icons/fa";

import { createCall } from "../api/callsApi";

import {
  createPatient,
  findDuplicatePatient,
  getPatients,
  getPatientAlerts,
  getLastTripTemplate,
} from "../api/patientsApi";

const SEVERITY_COLOR = { info: "#0d6efd", warning: "#f59e0b", critical: "#dc3545" };

// Import the main call intake form component.
import CallForm from "../components/CallForm";

// Import the price calculator component.
import PriceCalculator from "../components/PriceCalculator";

// Import the export/print action buttons component.
import ExportButtons from "../components/ExportButtons";

import { getLoggedDispatcherName, getTodayDate, localIsoNow } from "../utils/callUtils";
import TimeInput from "../components/ui/TimeInput";
import { useUserSettings } from "../context/useUserSettings";
import { formatTimeForDisplay } from "../utils/timeUtils";
import { SERVICE_LEVELS } from "../utils/taxonomy";

// Initial guided call state.
const getInitialGuidedCallData = () => ({
  dispatcherName: getLoggedDispatcherName(),

  patientId: null,
  firstName: "",
  lastName: "",
  dob: "",
  phoneNumber: "",

  callerType: "",
  callerNote: "",

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
});

function CallFormPage() {
  const { settings } = useUserSettings();
  const timeFormat = settings?.ui?.time_format || "12h";

  // Create a ref to access methods exposed by the CallForm component.
  const callFormRef = useRef();

  // Create a ref to access methods exposed by the PriceCalculator component.
  const priceCalculatorRef = useRef();

  // Track the current call intake mode.
  const [intakeMode, setIntakeMode] = useState("guided");

  // Guided intake step: patient, trip, review.
  const [guidedStep, setGuidedStep] = useState("patient");

  // Guided call state.
  const [guidedCallData, setGuidedCallData] = useState(
    getInitialGuidedCallData()
  );

  // Patient lookup drawer state.
  const [showPatientLookupDrawer, setShowPatientLookupDrawer] = useState(false);
  const [guidedPatientResults, setGuidedPatientResults] = useState([]);
  const [guidedLookupLoading, setGuidedLookupLoading] = useState(false);
  const [guidedLookupError, setGuidedLookupError] = useState("");

  // Full record + active alerts for the selected patient, used to render the Risk Card.
  const [selectedPatientDetail, setSelectedPatientDetail] = useState(null);
  const [selectedPatientAlerts, setSelectedPatientAlerts] = useState([]);
  const [lastTripTemplate, setLastTripTemplate] = useState(null);

  // Guided save state.
  const [guidedSaveLoading, setGuidedSaveLoading] = useState(false);
  const [guidedSaveMessage, setGuidedSaveMessage] = useState("");
  const [missingInfoExplanation, setMissingInfoExplanation] = useState("");

  // Service levels come from the canonical taxonomy (utils/taxonomy.js).
  // "Emergency" is intentionally absent: it is a call type, not a level of care.
  // These options previously wrote lowercase values ('bls'), which is why the
  // database holds mixed casing.
  const guidedServiceLevelOptions = SERVICE_LEVELS.map((level) => ({ value: level, label: level }));

  // Clear both the form and the calculator at the same time.
  const handleClearAll = () => {
    if (callFormRef.current) {
      callFormRef.current.clearForm();
    }

    if (priceCalculatorRef.current) {
      priceCalculatorRef.current.clearCalculator();
    }
  };

  // Update guided form fields.
  const handleGuidedChange = (event) => {
    const { name, value } = event.target;

    setGuidedCallData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // Update guided service level.
  const handleGuidedServiceLevelChange = (serviceLevel) => {
    setGuidedCallData((prev) => ({
      ...prev,
      serviceLevel,
    }));
  };

  // Start guided intake from a clean state.
  const handleStartGuidedIntake = () => {
    setIntakeMode("guided");
    setGuidedStep("patient");
    setGuidedCallData(getInitialGuidedCallData());
    setGuidedPatientResults([]);
    setGuidedLookupError("");
    setGuidedSaveMessage("");
    setMissingInfoExplanation("");
    setShowPatientLookupDrawer(false);
  };

  // Switch back to classic call intake mode.
  const handleUseClassicMode = () => {
    setIntakeMode("classic");
    setShowPatientLookupDrawer(false);
  };

  // Search patient records and open the lookup drawer.
  const handleGuidedFindPatient = async () => {
    const trimmedDob = guidedCallData.dob.trim();
    const trimmedLastName = guidedCallData.lastName.trim();
    const trimmedPhone = guidedCallData.phoneNumber.trim();

    if (!trimmedDob && !trimmedLastName && !trimmedPhone) {
      setGuidedLookupError("Enter DOB, last name, or phone before searching.");
      setGuidedPatientResults([]);
      setShowPatientLookupDrawer(true);
      return;
    }

    setGuidedLookupLoading(true);
    setGuidedLookupError("");
    setGuidedPatientResults([]);
    setShowPatientLookupDrawer(true);

    try {
      const data = await getPatients({
        name: trimmedLastName,
        dob: trimmedDob,
      }, 1, 100);
      const results = data.items;

      const filteredResults = trimmedPhone
        ? results.filter((patient) =>
            String(patient.phone || "")
              .toLowerCase()
              .includes(trimmedPhone.toLowerCase())
          )
        : results;

      setGuidedPatientResults(filteredResults);

      if (filteredResults.length === 0) {
        setGuidedLookupError(
          "No matching patients found. Continue as a new patient or adjust search fields."
        );
      }
    } catch (err) {
      console.error("Guided patient search failed:", err);
      setGuidedLookupError(err.message || "Failed to search patients.");
    } finally {
      setGuidedLookupLoading(false);
    }
  };

  // Select an existing patient and move to trip details.
  const handleGuidedSelectPatient = (patient) => {
    setGuidedCallData((prev) => ({
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

    setSelectedPatientDetail(patient);
    setLastTripTemplate(null);
    getPatientAlerts(patient.id).then(setSelectedPatientAlerts).catch(() => setSelectedPatientAlerts([]));
    getLastTripTemplate(patient.id).then((r) => setLastTripTemplate(r.template)).catch(() => setLastTripTemplate(null));

    setGuidedPatientResults([]);
    setGuidedLookupError("");
    setShowPatientLookupDrawer(false);
    setGuidedStep("trip");
  };

  // Continue guided intake without selecting an existing patient.
  // The patient will be created automatically before the call is saved.
  const handleContinueAsNewPatient = () => {
    setGuidedCallData((prev) => ({
      ...prev,
      patientId: null,
    }));

    setSelectedPatientDetail(null);
    setSelectedPatientAlerts([]);
    setLastTripTemplate(null);

    setGuidedPatientResults([]);
    setGuidedLookupError("");
    setShowPatientLookupDrawer(false);
    setGuidedStep("trip");
  };

  // Fill pickup/dropoff/service level from the patient's most recent trip.
  // Date, time, status, and assignment are intentionally left for the dispatcher to set fresh.
  const handleUseLastTripTemplate = () => {
    if (!lastTripTemplate) return;
    setGuidedCallData((prev) => ({
      ...prev,
      pickupAddress: lastTripTemplate.pickup_address || prev.pickupAddress,
      dropoffAddress: lastTripTemplate.dropoff_address || prev.dropoffAddress,
      serviceLevel: lastTripTemplate.service_level?.toLowerCase() || prev.serviceLevel,
    }));
  };

  // Reset guided workflow after save or manual restart.
  const resetGuidedWorkflow = () => {
    setGuidedStep("patient");
    setGuidedCallData(getInitialGuidedCallData());
    setGuidedPatientResults([]);
    setGuidedLookupError("");
    setGuidedSaveMessage("");
    setMissingInfoExplanation("");
    setShowPatientLookupDrawer(false);
    setSelectedPatientDetail(null);
    setSelectedPatientAlerts([]);
    setLastTripTemplate(null);
  };

  // Sync return route from main trip route.
  const handleGuidedSyncReturn = () => {
    setGuidedCallData((prev) => ({
      ...prev,
      returnPickup: prev.dropoffAddress,
      returnDestination: prev.pickupAddress,
    }));
  };

  // Analyze guided call quality.
  const analyzeGuidedCallQuality = () => {
    const criticalMissing = [];
    const nonCriticalMissing = [];

    if (!guidedCallData.firstName.trim()) criticalMissing.push("First Name");
    if (!guidedCallData.lastName.trim()) criticalMissing.push("Last Name");
    if (!guidedCallData.dob.trim()) criticalMissing.push("Date of Birth");

    if (!guidedCallData.pickupAddress.trim()) {
      criticalMissing.push("Pick Up Address");
    }

    if (!guidedCallData.phoneNumber.trim()) {
      nonCriticalMissing.push("Phone Number");
    }

    if (!guidedCallData.dropoffAddress.trim()) {
      nonCriticalMissing.push("Drop Off Address");
    }

    if (!guidedCallData.tripDate.trim()) {
      nonCriticalMissing.push("Date of Trip");
    }

    if (!guidedCallData.pickupTime.trim()) {
      nonCriticalMissing.push("Pickup Time");
    }

    if (!guidedCallData.appointmentTime.trim()) {
      nonCriticalMissing.push("Appointment Time");
    }

    if (!guidedCallData.callerType.trim()) {
      nonCriticalMissing.push("Caller Type");
    }

    if (!guidedCallData.serviceLevel.trim()) {
      nonCriticalMissing.push("Service Level");
    }

    if (!guidedCallData.additionalInfo.trim()) {
      nonCriticalMissing.push("Additional Information");
    }

    const totalCritical = 4;
    const totalOptional = 8;

    const criticalScore =
      ((totalCritical - criticalMissing.length) / totalCritical) * 70;

    const optionalScore =
      ((totalOptional - nonCriticalMissing.length) / totalOptional) * 30;

    return {
      criticalMissing,
      nonCriticalMissing,
      score: Math.round(criticalScore + optionalScore),
    };
  };

  const guidedQualityReport = analyzeGuidedCallQuality();

  const hasGuidedCriticalIssues =
    guidedQualityReport.criticalMissing.length > 0;

  // Move from trip details to review.
  const handleGuidedContinueToReview = () => {
    setGuidedStep("review");
    setGuidedSaveMessage("");
  };

  const buildPatientPayloadFromGuidedData = () => ({
    first_name: guidedCallData.firstName.trim(),
    last_name: guidedCallData.lastName.trim(),
    dob: guidedCallData.dob || null,
    phone: guidedCallData.phoneNumber.trim(),
    address: guidedCallData.pickupAddress.trim(),
    default_service_level: guidedCallData.serviceLevel || null,
    notes: [
      guidedCallData.additionalInfo.trim(),
      guidedCallData.callerNote.trim()
        ? `Caller note from guided intake: ${guidedCallData.callerNote.trim()}`
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
  });

  const shouldCreateGuidedPatient = () => {
    return (
      !guidedCallData.patientId &&
      guidedCallData.firstName.trim() &&
      guidedCallData.lastName.trim()
    );
  };

  const ensureGuidedPatientRecord = async () => {
    if (guidedCallData.patientId) {
      return guidedCallData.patientId;
    }

    if (!shouldCreateGuidedPatient()) {
      return null;
    }

    const patientPayload = buildPatientPayloadFromGuidedData();

    // Prevent duplicate patient creation before saving a guided call.
    const duplicatePatient = await findDuplicatePatient(patientPayload);

    if (duplicatePatient) {
      return duplicatePatient.id;
    }

    const createdPatient = await createPatient(patientPayload);
    return createdPatient.id;
  };

  // Save guided call to backend.
  const handleGuidedSaveCall = async () => {
    const currentQualityReport = analyzeGuidedCallQuality();

    if (
      currentQualityReport.criticalMissing.length > 0 &&
      !missingInfoExplanation.trim()
    ) {
      setGuidedSaveMessage(
        "Critical information is missing. Please provide an explanation before saving."
      );
      return;
    }

    setGuidedSaveLoading(true);
    setGuidedSaveMessage("");

    try {
      const finalPatientId = await ensureGuidedPatientRecord();

      const callPayload = {
        patient_id: finalPatientId,

        dispatcher_name: guidedCallData.dispatcherName,

        received_at: localIsoNow(),
        status: "new",

        date_of_call: guidedCallData.callDate,
        trip_date: guidedCallData.tripDate,
        pickup_time: guidedCallData.pickupTime,
        appointment_time: guidedCallData.appointmentTime,

        pickup_address: guidedCallData.pickupAddress,
        dropoff_address: guidedCallData.dropoffAddress,

        caller_type: guidedCallData.callerType,
        call_type: guidedCallData.returnRideOption !== "none" ? "scheduled" : "none",
        service_level: guidedCallData.serviceLevel,

        caller_phone: guidedCallData.phoneNumber || null,
        caller_note: guidedCallData.callerNote || null,

        quality_score: currentQualityReport.score,
        missing_critical_fields: currentQualityReport.criticalMissing.join(", "),
        missing_optional_fields: currentQualityReport.nonCriticalMissing.join(", "),
        missing_info_explanation: missingInfoExplanation.trim() || null,

        notes: guidedCallData.additionalInfo || null,
      };

      const savedCall = await createCall(callPayload);

      // Create a separate return / will-call leg when requested.
      if (guidedCallData.returnRideOption !== "none" && guidedCallData.returnPickup) {
        const isWillCall = guidedCallData.returnRideOption === "will_call";
        const returnPayload = {
          patient_id: finalPatientId,
          dispatcher_name: guidedCallData.dispatcherName,
          received_at: localIsoNow(),
          status: "new",
          date_of_call: guidedCallData.callDate,
          trip_date: guidedCallData.tripDate,
          // Will Call has no pickup time — it will be set from the Dispatch Board.
          pickup_time: isWillCall ? "" : (guidedCallData.returnTime || ""),
          appointment_time: "",
          pickup_address: guidedCallData.returnPickup,
          dropoff_address: guidedCallData.returnDestination,
          caller_type: guidedCallData.callerType,
          call_type: isWillCall ? "will_call" : "return",
          service_level: guidedCallData.serviceLevel,
          caller_phone: guidedCallData.phoneNumber || null,
          caller_note: null,
          quality_score: 0,
          missing_critical_fields: "",
          missing_optional_fields: "",
          missing_info_explanation: "",
          notes: `${isWillCall ? "Will Call" : "Return"} leg for call #${savedCall.id}`,
        };
        await createCall(returnPayload);
      }

      setGuidedSaveMessage("Guided call and patient record saved successfully.");
      resetGuidedWorkflow();
    } catch (err) {
      console.error("Failed to save guided call:", err);
      setGuidedSaveMessage(err.message || "Failed to save guided call.");
    } finally {
      setGuidedSaveLoading(false);
    }
  };

  // Render guided step indicator.
  const renderGuidedStepper = () => {
    const steps = [
      { key: "patient", label: "Patient" },
      { key: "trip", label: "Trip Details" },
      { key: "review", label: "Review & Save" },
    ];

    return (
      <div className="guided-stepper">
        {steps.map((step, index) => (
          <div
            key={step.key}
            className={`guided-stepper-item ${
              guidedStep === step.key ? "active" : ""
            }`}
          >
            <div className="guided-stepper-number">{index + 1}</div>
            <div className="guided-stepper-label">{step.label}</div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="page-stack">
      {intakeMode === "guided" && (
        <section className="content-panel">
          <div className="content-panel-header">
            <div>
              <h4>Call Intake</h4>
              <p>Complete the call in three steps.</p>
            </div>

            <div className="d-flex align-items-center gap-2">
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1"
                onClick={resetGuidedWorkflow}
              >
                <FaTimes />
                Reset
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={handleUseClassicMode}
              >
                Switch to Classic
              </button>
            </div>
          </div>

          {renderGuidedStepper()}

          {guidedSaveMessage && (
            <div
              className={`alert ${
                guidedSaveMessage.includes("successfully")
                  ? "alert-success"
                  : "alert-warning"
              } mt-3 mb-0`}
            >
              {guidedSaveMessage}
            </div>
          )}

          {guidedStep === "patient" && (
            <div className="guided-step-card active mt-3">
              <div className="guided-step-number">1</div>

              <div>
                <h5>Patient Lookup</h5>

                <p>
                  Search by date of birth, last name, and phone number. Results
                  open in a right-side drawer so you can choose the correct
                  patient without leaving the intake screen.
                </p>

                <div className="row g-3">
                  <div className="col-md-4">
                    <label className="form-label">Date of Birth</label>

                    <input
                      type="date"
                      className="form-control"
                      name="dob"
                      value={guidedCallData.dob}
                      onChange={handleGuidedChange}
                      disabled={guidedLookupLoading}
                    />
                  </div>

                  <div className="col-md-4">
                    <label className="form-label">Last Name</label>

                    <input
                      type="text"
                      className="form-control"
                      name="lastName"
                      placeholder="Patient last name"
                      value={guidedCallData.lastName}
                      onChange={handleGuidedChange}
                      disabled={guidedLookupLoading}
                    />
                  </div>

                  <div className="col-md-4">
                    <label className="form-label">Phone</label>

                    <input
                      type="text"
                      className="form-control"
                      name="phoneNumber"
                      placeholder="Patient phone"
                      value={guidedCallData.phoneNumber}
                      onChange={handleGuidedChange}
                      disabled={guidedLookupLoading}
                    />
                  </div>
                </div>

                <div className="d-flex gap-2 flex-wrap mt-3">
                  <button
                    type="button"
                    className="btn btn-primary d-inline-flex align-items-center gap-2"
                    onClick={handleGuidedFindPatient}
                    disabled={guidedLookupLoading}
                  >
                    <FaSearch />
                    {guidedLookupLoading ? "Searching..." : "Search Patient"}
                  </button>

                  <button
                    type="button"
                    className="btn btn-outline-secondary d-inline-flex align-items-center gap-2"
                    onClick={handleContinueAsNewPatient}
                    disabled={guidedLookupLoading}
                  >
                    <FaPlus />
                    Continue as New Patient
                  </button>
                </div>
              </div>
            </div>
          )}

          {guidedStep === "trip" && (
            <div className="guided-step-card active mt-3">
              <div className="guided-step-number">2</div>

              <div>
                <h5>Caller and Trip Details</h5>

                <p>
                  Complete caller, route, service, schedule, and return ride
                  details.
                </p>

                {selectedPatientDetail && (
                  <div className="alert alert-light border mb-3" style={{ padding: "10px 14px" }}>
                    <div className="d-flex justify-content-between align-items-start flex-wrap gap-2">
                      <div>
                        <strong>
                          <FaUserInjured style={{ marginRight: 6 }} />
                          {selectedPatientDetail.first_name} {selectedPatientDetail.last_name}
                        </strong>
                        <span style={{ color: "var(--ems-text-muted)", marginLeft: 8, fontSize: 12 }}>
                          DOB: {selectedPatientDetail.dob || "—"} · Default: {selectedPatientDetail.default_mobility_level || "—"} / {selectedPatientDetail.default_service_level || "No service"}
                        </span>
                      </div>
                      {lastTripTemplate && (
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-primary d-inline-flex align-items-center gap-1"
                          onClick={handleUseLastTripTemplate}
                        >
                          <FaHistory /> Use last trip as template
                        </button>
                      )}
                    </div>

                    {selectedPatientAlerts.length > 0 && (
                      <div className="d-flex flex-wrap gap-2 mt-2">
                        {selectedPatientAlerts.map((a) => (
                          <span
                            key={a.id}
                            className="badge"
                            style={{ background: `${SEVERITY_COLOR[a.severity]}20`, color: SEVERITY_COLOR[a.severity], border: `1px solid ${SEVERITY_COLOR[a.severity]}50`, fontSize: 11 }}
                          >
                            <FaExclamationTriangle style={{ marginRight: 4 }} />
                            {a.title}
                          </span>
                        ))}
                      </div>
                    )}

                    {selectedPatientDetail.dispatch_comment && (
                      <div className="mt-2" style={{ fontSize: 13 }}>
                        <strong>Dispatch note:</strong> {selectedPatientDetail.dispatch_comment}
                      </div>
                    )}
                  </div>
                )}

                <div className="row g-3">
                  <div className="col-md-4">
                    <label className="form-label">First Name</label>

                    <input
                      className="form-control"
                      name="firstName"
                      value={guidedCallData.firstName}
                      onChange={handleGuidedChange}
                    />
                  </div>

                  <div className="col-md-4">
                    <label className="form-label">Last Name</label>

                    <input
                      className="form-control"
                      name="lastName"
                      value={guidedCallData.lastName}
                      onChange={handleGuidedChange}
                    />
                  </div>

                  <div className="col-md-4">
                    <label className="form-label">Date of Birth</label>

                    <input
                      type="date"
                      className="form-control"
                      name="dob"
                      value={guidedCallData.dob}
                      onChange={handleGuidedChange}
                    />
                  </div>

                  <div className="col-md-4">
                    <label className="form-label">Phone</label>

                    <input
                      className="form-control"
                      name="phoneNumber"
                      value={guidedCallData.phoneNumber}
                      onChange={handleGuidedChange}
                    />
                  </div>

                  <div className="col-md-4">
                    <label className="form-label">Caller Type</label>

                    <select
                      className="form-select"
                      name="callerType"
                      value={guidedCallData.callerType}
                      onChange={handleGuidedChange}
                    >
                      <option value="">Select...</option>
                      <option value="Broker">Broker</option>
                      <option value="Family">Family</option>
                      <option value="Facility">Facility</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div className="col-md-4">
                    <label className="form-label">Caller Note</label>

                    <input
                      className="form-control"
                      name="callerNote"
                      placeholder="Case manager, son, nurse, etc."
                      value={guidedCallData.callerNote}
                      onChange={handleGuidedChange}
                    />
                  </div>

                  <div className="col-md-6">
                    <label className="form-label">Pickup Address</label>

                    <input
                      className="form-control"
                      name="pickupAddress"
                      value={guidedCallData.pickupAddress}
                      onChange={handleGuidedChange}
                    />
                  </div>

                  <div className="col-md-6">
                    <label className="form-label">Dropoff Address</label>

                    <input
                      className="form-control"
                      name="dropoffAddress"
                      value={guidedCallData.dropoffAddress}
                      onChange={handleGuidedChange}
                    />
                  </div>

                  <div className="col-md-3">
                    <label className="form-label">Date of Call</label>

                    <input
                      type="date"
                      className="form-control"
                      name="callDate"
                      value={guidedCallData.callDate}
                      onChange={handleGuidedChange}
                    />
                  </div>

                  <div className="col-md-3">
                    <label className="form-label">Trip Date</label>

                    <input
                      type="date"
                      className="form-control"
                      name="tripDate"
                      value={guidedCallData.tripDate}
                      onChange={handleGuidedChange}
                    />
                  </div>

                  <div className="col-md-3">
                    <label className="form-label">Pickup Time</label>
                    <TimeInput
                      value={guidedCallData.pickupTime}
                      onChange={v => setGuidedCallData(prev => ({ ...prev, pickupTime: v }))}
                    />
                  </div>

                  {guidedCallData.serviceLevel !== "emergency" && (
                    <div className="col-md-3">
                      <label className="form-label">Appointment Time</label>
                      <TimeInput
                        value={guidedCallData.appointmentTime}
                        onChange={v => setGuidedCallData(prev => ({ ...prev, appointmentTime: v }))}
                      />
                    </div>
                  )}

                  <div className="col-md-6">
                    <label className="form-label">Return Ride</label>

                    <select
                      className="form-select"
                      name="returnRideOption"
                      value={guidedCallData.returnRideOption}
                      onChange={handleGuidedChange}
                    >
                      <option value="none">No Return</option>
                      <option value="return">Return Ride</option>
                      <option value="will_call">Will Call</option>
                    </select>
                  </div>

                  {guidedCallData.returnRideOption !== "none" && (
                    <div className="col-md-6 d-flex align-items-end">
                      <button
                        type="button"
                        className="btn btn-outline-secondary w-100"
                        onClick={handleGuidedSyncReturn}
                      >
                        Sync Return Addresses
                      </button>
                    </div>
                  )}

                  {guidedCallData.returnRideOption !== "none" && (
                    <>
                      <div className="col-md-6">
                        <label className="form-label">Return Pickup</label>

                        <input
                          className="form-control"
                          name="returnPickup"
                          value={guidedCallData.returnPickup}
                          onChange={handleGuidedChange}
                        />
                      </div>

                      <div className="col-md-6">
                        <label className="form-label">
                          Return Destination
                        </label>

                        <input
                          className="form-control"
                          name="returnDestination"
                          value={guidedCallData.returnDestination}
                          onChange={handleGuidedChange}
                        />
                      </div>

                      {guidedCallData.returnRideOption === "return" && (
                        <div className="col-md-6">
                          <label className="form-label">Return Time</label>
                          <TimeInput
                            value={guidedCallData.returnTime}
                            onChange={v => setGuidedCallData(prev => ({ ...prev, returnTime: v }))}
                          />
                        </div>
                      )}
                    </>
                  )}

                  <div className="col-12">
                    <label className="form-label">Service Level</label>

                    <div className="d-flex gap-3 flex-wrap">
                      {guidedServiceLevelOptions.map((serviceLevel) => (
                        <button
                          key={serviceLevel.value}
                          type="button"
                          className={`btn ${
                            guidedCallData.serviceLevel === serviceLevel.value
                              ? serviceLevel.value === "emergency"
                                ? "btn-danger"
                                : "btn-primary"
                              : serviceLevel.value === "emergency"
                                ? "btn-outline-danger"
                                : "btn-outline-primary"
                          }`}
                          onClick={() =>
                            handleGuidedServiceLevelChange(serviceLevel.value)
                          }
                        >
                          {serviceLevel.label}
                        </button>
                      ))}
                    </div>

                    {guidedCallData.serviceLevel === "emergency" && (
                      <div className="alert alert-danger mt-3 mb-0">
                        Emergency selected. Confirm dispatch priority, caller
                        details, and operational instructions before saving.
                      </div>
                    )}
                  </div>

                  <div className="col-12">
                    <label className="form-label">Additional Information</label>

                    <textarea
                      className="form-control"
                      rows="3"
                      name="additionalInfo"
                      value={guidedCallData.additionalInfo}
                      onChange={handleGuidedChange}
                    />
                  </div>
                </div>

                <div className="d-flex justify-content-between gap-2 flex-wrap mt-4">
                  <button
                    type="button"
                    className="btn btn-outline-secondary d-inline-flex align-items-center gap-2"
                    onClick={() => setGuidedStep("patient")}
                  >
                    <FaArrowLeft />
                    Back
                  </button>

                  <button
                    type="button"
                    className="btn btn-primary d-inline-flex align-items-center gap-2"
                    onClick={handleGuidedContinueToReview}
                  >
                    Continue to Review
                    <FaArrowRight />
                  </button>
                </div>
              </div>
            </div>
          )}

          {guidedStep === "review" && (
            <div className="guided-step-card active mt-3">
              <div className="guided-step-number">3</div>

              <div>
                <h5>Review and Save</h5>

                <p>
                  Review the guided call before saving. Critical missing fields
                  require dispatcher explanation.
                </p>

                <div className="guided-review-grid">
                  <div className="guided-review-card">
                    <div className="guided-review-label">Patient</div>
                    <div>
                      {guidedCallData.firstName || "—"}{" "}
                      {guidedCallData.lastName || ""}
                    </div>
                    <div className="guided-review-muted">
                      DOB: {guidedCallData.dob || "—"} · Phone:{" "}
                      {guidedCallData.phoneNumber || "—"}
                    </div>
                    <div className="guided-review-muted">
                      Record:{" "}
                      {guidedCallData.patientId
                        ? `Linked #${guidedCallData.patientId}`
                        : "New patient will be created on save"}
                    </div>
                  </div>

                  <div className="guided-review-card">
                    <div className="guided-review-label">Trip</div>
                    <div>
                      {guidedCallData.pickupAddress || "—"} →{" "}
                      {guidedCallData.dropoffAddress || "—"}
                    </div>
                    <div className="guided-review-muted">
                      Trip date: {guidedCallData.tripDate || "—"} · Pickup:{" "}
                      {formatTimeForDisplay(guidedCallData.pickupTime, timeFormat) || "—"} · Appointment:{" "}
                      {formatTimeForDisplay(guidedCallData.appointmentTime, timeFormat) || "—"}
                    </div>
                  </div>

                  <div className="guided-review-card">
                    <div className="guided-review-label">Service</div>
                    <div>
                      {guidedCallData.serviceLevel === "emergency"
                        ? "Emergency"
                        : guidedCallData.serviceLevel || "—"}
                    </div>
                    <div className="guided-review-muted">
                      Caller: {guidedCallData.callerType || "—"}
                    </div>
                  </div>

                  <div className="guided-review-card">
                    <div className="guided-review-label">Quality</div>
                    <div>{guidedQualityReport.score}%</div>
                    <div className="guided-review-muted">
                      Critical missing:{" "}
                      {guidedQualityReport.criticalMissing.length}
                    </div>
                  </div>
                </div>

                {guidedCallData.serviceLevel === "emergency" && (
                  <div className="alert alert-danger mt-3">
                    <strong>Emergency Service Level</strong>
                    <div className="mt-2">
                      Confirm dispatch priority, caller details, pickup
                      information, and operational instructions before saving.
                    </div>
                  </div>
                )}

                <div
                  className={`alert ${
                    hasGuidedCriticalIssues
                      ? "alert-danger"
                      : guidedQualityReport.nonCriticalMissing.length > 0
                        ? "alert-warning"
                        : "alert-success"
                  } mt-3`}
                >
                  <strong>Call Quality Check</strong>

                  <div className="mt-2">
                    <strong>Quality Score:</strong>{" "}
                    {guidedQualityReport.score}%
                  </div>

                  {guidedQualityReport.criticalMissing.length > 0 && (
                    <div className="mt-2">
                      <strong>Missing Critical:</strong>{" "}
                      {guidedQualityReport.criticalMissing.join(", ")}
                    </div>
                  )}

                  {guidedQualityReport.nonCriticalMissing.length > 0 && (
                    <div className="mt-2">
                      <strong>Missing Optional:</strong>{" "}
                      {guidedQualityReport.nonCriticalMissing.join(", ")}
                    </div>
                  )}
                </div>

                {hasGuidedCriticalIssues && (
                  <div className="mb-3">
                    <label className="form-label">
                      Missing Information Explanation
                    </label>

                    <textarea
                      className="form-control"
                      rows="3"
                      value={missingInfoExplanation}
                      onChange={(event) =>
                        setMissingInfoExplanation(event.target.value)
                      }
                      placeholder="Explain why critical information is missing."
                    />
                  </div>
                )}

                <div className="d-flex justify-content-between gap-2 flex-wrap mt-4">
                  <button
                    type="button"
                    className="btn btn-outline-secondary d-inline-flex align-items-center gap-2"
                    onClick={() => setGuidedStep("trip")}
                  >
                    <FaArrowLeft />
                    Back
                  </button>

                  <button
                    type="button"
                    className="btn btn-success d-inline-flex align-items-center gap-2"
                    onClick={handleGuidedSaveCall}
                    disabled={guidedSaveLoading}
                  >
                    <FaCheckCircle />
                    {guidedSaveLoading ? "Saving..." : "Save Guided Call"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {intakeMode === "guided" && (
        <section className="content-panel">
          <div className="content-panel-header">
            <div>
              <h4>Price Calculator</h4>
              <p>Estimate trip pricing based on mileage, crew size, and service details.</p>
            </div>
          </div>
          <PriceCalculator ref={priceCalculatorRef} />
        </section>
      )}

      {intakeMode === "classic" && (
        <section className="content-panel">
          <div className="content-panel-header">
            <div>
              <h4>Classic Call Form</h4>
              <p>Full open-form call intake view.</p>
            </div>

            <button
              type="button"
              className="btn btn-sm btn-outline-primary"
              onClick={handleStartGuidedIntake}
            >
              Switch to Guided
            </button>
          </div>

          <div className="print-wrapper">
            <CallForm ref={callFormRef} />

            <PriceCalculator ref={priceCalculatorRef} />

            <ExportButtons onClearAll={handleClearAll} />
          </div>
        </section>
      )}

      {showPatientLookupDrawer && (
        <div
          className="guided-lookup-drawer-overlay"
          onClick={() => setShowPatientLookupDrawer(false)}
        >
          <aside
            className="guided-lookup-drawer"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="guided-lookup-drawer-header">
              <div>
                <h4>Patient Lookup Results</h4>

                <p>
                  Select the correct patient, continue as a new patient, or
                  adjust search fields.
                </p>
              </div>

              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={() => setShowPatientLookupDrawer(false)}
              >
                <FaTimes />
              </button>
            </div>

            <div className="guided-lookup-drawer-body">
              {guidedLookupLoading ? (
                <div className="empty-state">
                  <FaUserInjured />
                  <h5>Searching patients</h5>
                  <p>Please wait while matching patient records are loaded.</p>
                </div>
              ) : (
                <>
                  {guidedLookupError && (
                    <div className="alert alert-warning">
                      {guidedLookupError}
                    </div>
                  )}

                  {guidedPatientResults.length > 0 ? (
                    <div className="guided-patient-results">
                      {guidedPatientResults.map((patient) => (
                        <div className="guided-patient-card" key={patient.id}>
                          <div>
                            <div className="guided-patient-name">
                              {patient.first_name} {patient.last_name}
                            </div>

                            <div className="guided-patient-muted">
                              DOB: {patient.dob || "—"} · Phone:{" "}
                              {patient.phone || "—"}
                            </div>

                            <div className="guided-patient-muted">
                              Address: {patient.address || "—"}
                            </div>

                            <div className="guided-patient-muted">
                              Service:{" "}
                              {patient.default_service_level || "—"}
                            </div>
                          </div>

                          <button
                            type="button"
                            className="btn btn-sm btn-outline-success"
                            onClick={() => handleGuidedSelectPatient(patient)}
                          >
                            Select Patient
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    !guidedLookupError && (
                      <div className="empty-state">
                        <FaUserInjured />
                        <h5>No search results yet</h5>
                        <p>Run patient search to see matching records here.</p>
                      </div>
                    )
                  )}
                </>
              )}
            </div>

            <div className="guided-lookup-drawer-footer">
              <button
                type="button"
                className="btn btn-primary d-inline-flex align-items-center gap-2"
                onClick={handleContinueAsNewPatient}
              >
                <FaPlus />
                Continue as New Patient
              </button>

              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => setShowPatientLookupDrawer(false)}
              >
                Adjust Search
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

export default CallFormPage;