import React, { useRef, useState } from "react";
import {
  FaArrowLeft,
  FaArrowRight,
  FaCheckCircle,
  FaClipboardList,
  FaPhoneAlt,
  FaPlus,
  FaRoute,
  FaSearch,
  FaTimes,
  FaUserInjured,
} from "react-icons/fa";

import { createCall } from "../api/callsApi";

import {
  createPatient,
  findDuplicatePatient,
  getPatients,
} from "../api/patientsApi";

// Import the main call intake form component.
import CallForm from "../components/CallForm";

// Import the price calculator component.
import PriceCalculator from "../components/PriceCalculator";

// Import the export/print action buttons component.
import ExportButtons from "../components/ExportButtons";

// Read logged-in user from localStorage.
// This mirrors the MVP auth behavior used by CallForm.
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

// Return today's date in YYYY-MM-DD format.
const getTodayDate = () => new Date().toISOString().split("T")[0];

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
  // Create a ref to access methods exposed by the CallForm component.
  const callFormRef = useRef();

  // Create a ref to access methods exposed by the PriceCalculator component.
  const priceCalculatorRef = useRef();

  // Track the current call intake mode.
  const [intakeMode, setIntakeMode] = useState("classic");

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

  // Guided save state.
  const [guidedSaveLoading, setGuidedSaveLoading] = useState(false);
  const [guidedSaveMessage, setGuidedSaveMessage] = useState("");
  const [missingInfoExplanation, setMissingInfoExplanation] = useState("");

  const guidedServiceLevelOptions = [
    { value: "stretcher", label: "STRETCHER" },
    { value: "bls", label: "BLS" },
    { value: "als", label: "ALS" },
    { value: "emergency", label: "EMERGENCY" },
  ];

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
      const results = await getPatients({
        name: trimmedLastName,
        dob: trimmedDob,
      });

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

    setGuidedPatientResults([]);
    setGuidedLookupError("");
    setShowPatientLookupDrawer(false);
    setGuidedStep("trip");
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

        received_at: new Date().toISOString(),
        status: "new",

        date_of_call: guidedCallData.callDate,
        trip_date: guidedCallData.tripDate,
        pickup_time: guidedCallData.pickupTime,
        appointment_time: guidedCallData.appointmentTime,

        pickup_address: guidedCallData.pickupAddress,
        dropoff_address: guidedCallData.dropoffAddress,

        caller_type: guidedCallData.callerType,
        call_type: guidedCallData.returnRideOption,
        service_level: guidedCallData.serviceLevel,

        quality_score: currentQualityReport.score,
        missing_critical_fields:
          currentQualityReport.criticalMissing.join(", "),
        missing_optional_fields:
          currentQualityReport.nonCriticalMissing.join(", "),
        missing_info_explanation: missingInfoExplanation.trim(),

        notes: [
          guidedCallData.additionalInfo,
          guidedCallData.callerNote
            ? `Caller note: ${guidedCallData.callerNote}`
            : "",
          guidedCallData.dispatcherName
            ? `Dispatcher: ${guidedCallData.dispatcherName}`
            : "",
          guidedCallData.firstName || guidedCallData.lastName
            ? `Patient: ${guidedCallData.firstName} ${guidedCallData.lastName}`
            : "",
          finalPatientId
            ? `Linked Patient ID: ${finalPatientId}`
            : "Patient record was not created because required patient name fields were incomplete.",
          guidedCallData.dob ? `DOB: ${guidedCallData.dob}` : "",
          guidedCallData.phoneNumber
            ? `Phone: ${guidedCallData.phoneNumber}`
            : "",
          guidedCallData.pickupTime
            ? `Pickup Time: ${guidedCallData.pickupTime}`
            : "",
          guidedCallData.appointmentTime
            ? `Appointment Time: ${guidedCallData.appointmentTime}`
            : "",
          guidedCallData.serviceLevel === "emergency"
            ? "Emergency service level selected."
            : "",
          guidedCallData.returnRideOption !== "none"
            ? `Return pickup: ${guidedCallData.returnPickup}; Return destination: ${guidedCallData.returnDestination}; Return time: ${
                guidedCallData.returnTime || "Will Call"
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

      await createCall(callPayload);
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
      <div className="page-summary-grid">
        <div className="page-summary-card">
          <div className="page-summary-icon">
            <FaPhoneAlt />
          </div>

          <div>
            <div className="page-summary-value">Call</div>
            <div className="page-summary-label">Intake Module</div>
          </div>
        </div>

        <div className="page-summary-card">
          <div className="page-summary-icon">
            <FaUserInjured />
          </div>

          <div>
            <div className="page-summary-value">
              {guidedCallData.patientId ? "Linked" : "Patient"}
            </div>
            <div className="page-summary-label">Patient Record</div>
          </div>
        </div>

        <div className="page-summary-card">
          <div className="page-summary-icon warning">
            <FaClipboardList />
          </div>

          <div>
            <div className="page-summary-value">
              {intakeMode === "classic" ? "Classic" : "Guided"}
            </div>
            <div className="page-summary-label">Current Mode</div>
          </div>
        </div>
      </div>

      <section className="content-panel">
        <div className="content-panel-header">
          <div>
            <h4>Call Intake</h4>
            <p>
              Start a new EMS call record using the classic full form or the
              guided step-by-step workflow.
            </p>
          </div>

          <div className="d-flex align-items-center gap-2 flex-wrap">
            <button
              type="button"
              className={`btn btn-sm ${
                intakeMode === "classic" ? "btn-primary" : "btn-outline-primary"
              }`}
              onClick={handleUseClassicMode}
            >
              Classic Form
            </button>

            <button
              type="button"
              className={`btn btn-sm ${
                intakeMode === "guided" ? "btn-primary" : "btn-outline-primary"
              }`}
              onClick={handleStartGuidedIntake}
            >
              Guided Intake
            </button>
          </div>
        </div>

        <div className="row g-3">
          <div className="col-lg-8">
            <div className="call-intake-start-card">
              <div>
                <h5>Start Taking Call</h5>

                <p>
                  Use this shortcut when a dispatcher needs to begin call intake
                  immediately. Guided intake starts with patient lookup and then
                  continues through trip details and review.
                </p>
              </div>

              <button
                type="button"
                className="btn btn-danger d-inline-flex align-items-center gap-2"
                onClick={handleStartGuidedIntake}
              >
                <FaPhoneAlt />
                Start Taking Call
              </button>
            </div>
          </div>

          <div className="col-lg-4">
            <div className="call-intake-note-card">
              <div className="call-intake-note-icon">
                <FaRoute />
              </div>

              <div>
                <h6>Recommended workflow</h6>

                <p>
                  Search patient first, verify caller type, confirm pickup and
                  drop-off, then complete service and scheduling details.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {intakeMode === "guided" && (
        <section className="content-panel">
          <div className="content-panel-header">
            <div>
              <h4>Guided Call Intake</h4>
              <p>
                Complete the call in three steps without leaving the guided
                workflow.
              </p>
            </div>

            <button
              type="button"
              className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1"
              onClick={resetGuidedWorkflow}
            >
              <FaTimes />
              Reset Guided
            </button>
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

                    <input
                      type="time"
                      className="form-control"
                      name="pickupTime"
                      value={guidedCallData.pickupTime}
                      onChange={handleGuidedChange}
                    />
                  </div>

                  <div className="col-md-3">
                    <label className="form-label">Appointment Time</label>

                    <input
                      type="time"
                      className="form-control"
                      name="appointmentTime"
                      value={guidedCallData.appointmentTime}
                      onChange={handleGuidedChange}
                    />
                  </div>

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

                          <input
                            type="time"
                            className="form-control"
                            name="returnTime"
                            value={guidedCallData.returnTime}
                            onChange={handleGuidedChange}
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
                      {guidedCallData.pickupTime || "—"} · Appointment:{" "}
                      {guidedCallData.appointmentTime || "—"}
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

      {intakeMode === "classic" && (
        <section className="content-panel">
          <div className="content-panel-header">
            <div>
              <h4>Classic Call Form</h4>
              <p>
                Full open-form call intake view. This keeps the current working
                call form available as a separate mode.
              </p>
            </div>

            <span className="badge text-bg-primary">Classic</span>
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