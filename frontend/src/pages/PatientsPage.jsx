import React, { useRef, useState } from "react";
import { useConfirm } from "../components/ui/useConfirm";
import { useToast } from "../components/ui/useToast";
import EntityDrawer from "../components/ui/EntityDrawer";
import {
  FaAddressCard,
  FaAddressBook,
  FaAmbulance,
  FaArchive,
  FaEdit,
  FaExclamationTriangle,
  FaFileMedical,
  FaHistory,
  FaIdCard,
  FaPlus,
  FaSearch,
  FaTimes,
  FaTrash,
  FaTrashRestore,
  FaUserInjured,
  FaUserSecret,
  FaUsers,
} from "react-icons/fa";

import {
  createPatient,
  updatePatient,
  archivePatient,
  restorePatient,
} from "../api/patientsApi";

import { getPatientCalls } from "../api/callsApi";
import { useUserSettings } from "../context/useUserSettings";
import { formatTimeForDisplay } from "../utils/timeUtils";

import DetailItem from "../components/patients/DetailItem";
import PatientFormSection from "../components/patients/PatientFormSection";
import {
  emptyPatient,
  emptyContact,
  ALERT_CATEGORIES,
  ALERT_SEVERITIES,
  SEVERITY_COLOR,
} from "../components/patients/patientConstants";
import { usePatients } from "../hooks/usePatients";
import { usePatientAlerts } from "../hooks/usePatientAlerts";
import { usePatientContacts } from "../hooks/usePatientContacts";

// Main patient management component.
const PatientsPage = () => {
  const confirm = useConfirm();
  const toast = useToast();
  const { settings } = useUserSettings();
  const timeFormat = settings?.ui?.time_format || "12h";

  const [newPatient, setNewPatient] = useState(emptyPatient);
  // Snapshot of the form's values when the drawer was opened, used to detect real edits
  // (comparing against emptyPatient would falsely flag an untouched existing patient as dirty).
  const formBaselineRef = useRef(emptyPatient);
  const [patientCalls, setPatientCalls] = useState([]);

  const [editingPatientId, setEditingPatientId] = useState(null);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [drawerTab, setDrawerTab] = useState("overview"); // "overview" | "edit" | "history" | "alerts" | "contacts"
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Clear the open patient + its loaded call history (shared by search/show-all).
  const clearSelection = () => {
    setSelectedPatient(null);
    setPatientCalls([]);
  };

  const {
    searchName,
    setSearchName,
    searchDob,
    setSearchDob,
    patients,
    setPatients,
    paginationMeta,
    currentFilters,
    loadingMore,
    showArchived,
    hasSearched,
    setHasSearched,
    loadPatients,
    handleToggleShowArchived,
    handleSearch,
    handleShowAll,
  } = usePatients({ setLoading, setError, clearSelection });

  const {
    patientAlerts,
    showResolvedAlerts,
    setShowResolvedAlerts,
    newAlert,
    setNewAlert,
    loadPatientAlerts,
    handleAddAlert,
    handleResolveAlert,
    resetAlerts,
  } = usePatientAlerts({ selectedPatient, toast });

  const {
    patientContacts,
    newContact,
    setNewContact,
    editingContactId,
    setEditingContactId,
    loadPatientContacts,
    handleAddContact,
    handleEditContact,
    handleDeleteContact,
    resetContacts,
  } = usePatientContacts({ selectedPatient, toast, confirm });

  // Reset the add/edit patient form and close the drawer.
  const resetPatientForm = () => {
    setNewPatient(emptyPatient);
    setEditingPatientId(null);
    setDrawerOpen(false);
    setSelectedPatient(null);
    setPatientCalls([]);
    resetAlerts();
    resetContacts();
    setDrawerTab("overview");
  };

  // Open the drawer in add mode.
  const handleShowAddForm = () => {
    setNewPatient(emptyPatient);
    formBaselineRef.current = emptyPatient;
    setEditingPatientId(null);
    setSelectedPatient(null);
    setError("");
    setDrawerTab("edit");
    setDrawerOpen(true);
  };

  // Handle text, select, and checkbox field changes.
  const handleNewPatientChange = (e) => {
    const { name, value, type, checked } = e.target;

    setNewPatient((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  // Check whether the add/edit patient form has unsaved changes, relative to the
  // values it was opened with (an untouched existing patient's form is never dirty).
  const isPatientFormDirty = () => {
    const baseline = formBaselineRef.current;
    return Object.keys(emptyPatient).some((key) => {
      return newPatient[key] !== baseline[key];
    });
  };

  // Close the patient drawer only after confirming unsaved changes.
  const closePatientFormSafely = async () => {
    if (loading) return;

    if (isPatientFormDirty()) {
      const shouldClose = await confirm({
        title: "Discard unsaved changes?",
        message: "All entered patient information will be lost.",
        variant: "warning",
        confirmLabel: "Discard",
      });
      if (!shouldClose) return;
    }

    resetPatientForm();
  };

  // Load call history for a selected patient.
  const loadPatientCalls = async (patientId) => {
    try {
      const calls = await getPatientCalls(patientId);
      setPatientCalls(calls);
    } catch (err) {
      console.error("Failed to load patient call history:", err);
      setPatientCalls([]);
    }
  };

  // Create a new patient or update an existing patient.
  const handleCreatePatient = async (e) => {
    e.preventDefault();

    setError("");
    setLoading(true);

    try {
      let savedPatient;

      if (editingPatientId) {
        savedPatient = await updatePatient(editingPatientId, newPatient);
      } else {
        savedPatient = await createPatient(newPatient);
      }

      setNewPatient(emptyPatient);
      setEditingPatientId(null);
      setSelectedPatient(savedPatient);
      setHasSearched(true);

      await loadPatients(currentFilters, 1, false);
      await loadPatientCalls(savedPatient.id);
      await loadPatientAlerts(savedPatient.id);
      await loadPatientContacts(savedPatient.id);
    } catch (err) {
      // Offer to restore instead of creating a new record when the duplicate is archived.
      if (err.existingPatient?.is_archived) {
        const shouldRestore = await confirm({
          title: "Patient already exists (archived)",
          message: `${err.existingPatient.first_name} ${err.existingPatient.last_name} matches this name and DOB but is archived. Restore the existing record instead of creating a new one?`,
          variant: "warning",
          confirmLabel: "Restore existing patient",
        });
        if (shouldRestore) {
          try {
            const { patient } = await restorePatient(err.existingPatient.id);
            setNewPatient(emptyPatient);
            setEditingPatientId(null);
            setSelectedPatient(patient);
            setDrawerTab("overview");
            setHasSearched(true);
            await loadPatients(currentFilters, 1, false);
            await loadPatientCalls(patient.id);
            await loadPatientAlerts(patient.id);
            await loadPatientContacts(patient.id);
            toast.success("Patient restored");
          } catch (restoreErr) {
            setError(restoreErr.message || "Restore failed.");
          }
          return;
        }
      }
      setError(err.message || "Operation failed.");
    } finally {
      setLoading(false);
    }
  };

  // Archive a patient record (soft delete — history is preserved).
  const handleArchivePatient = async (id) => {
    const ok = await confirm({
      title: "Archive patient?",
      message: "The patient will be hidden from active search but call history stays intact. You can restore them later.",
      variant: "danger",
      confirmLabel: "Archive",
    });
    if (!ok) return;

    setError("");

    try {
      const { patient } = await archivePatient(id);
      await loadPatients(currentFilters, 1, false);

      if (selectedPatient?.id === id) {
        setSelectedPatient(patient);
      }

      if (editingPatientId === id) {
        resetPatientForm();
      }
      toast.success("Patient archived");
    } catch (err) {
      setError(err.message || "Archive failed.");
    }
  };

  // Restore a previously archived patient.
  const handleRestorePatient = async (id) => {
    setError("");
    try {
      const { patient } = await restorePatient(id);
      await loadPatients(currentFilters, 1, false);
      if (selectedPatient?.id === id) {
        setSelectedPatient(patient);
      }
      toast.success("Patient restored");
    } catch (err) {
      setError(err.message || "Restore failed.");
    }
  };

  // Open drawer in view mode for a patient.
  const handleSelectPatient = async (patient) => {
    setSelectedPatient(patient);
    setDrawerTab("overview");
    setDrawerOpen(true);
    await loadPatientCalls(patient.id);
    await loadPatientAlerts(patient.id);
    await loadPatientContacts(patient.id);
  };

  // Open drawer in edit mode for a patient.
  const handleEditPatient = async (patient) => {
    setEditingPatientId(patient.id);
    const loadedPatient = {
      first_name: patient.first_name || "",
      last_name: patient.last_name || "",
      dob: patient.dob || "",
      gender: patient.gender || "",
      phone: patient.phone || "",
      secondary_phone: patient.secondary_phone || "",
      address: patient.address || "",
      city: patient.city || "",
      state: patient.state || "",
      zip_code: patient.zip_code || "",
      insurance: patient.insurance || "",
      member_id: patient.member_id || "",
      policy_number: patient.policy_number || "",
      requires_auth: patient.requires_auth || false,
      copay_required: patient.copay_required || false,
      insurance_notes: patient.insurance_notes || "",
      default_service_level: patient.default_service_level || "",
      weight: patient.weight || "",
      oxygen_required: patient.oxygen_required || false,
      stairs: patient.stairs || false,
      special_equipment_notes: patient.special_equipment_notes || "",
      facility_name: patient.facility_name || "",
      room_number: patient.room_number || "",
      emergency_contact_name: patient.emergency_contact_name || "",
      emergency_contact_phone: patient.emergency_contact_phone || "",
      notes: patient.notes || "",
      dispatch_comment: patient.dispatch_comment || "",
      default_mobility_level: patient.default_mobility_level || "",
      transport_instructions: patient.transport_instructions || "",
      access_instructions: patient.access_instructions || "",
      preferred_language: patient.preferred_language || "",
      requires_interpreter: patient.requires_interpreter || false,
      is_sensitive: patient.is_sensitive || false,
    };
    setNewPatient(loadedPatient);
    formBaselineRef.current = loadedPatient;
    setSelectedPatient(patient);
    setDrawerTab("edit");
    setDrawerOpen(true);
    await loadPatientCalls(patient.id);
    await loadPatientAlerts(patient.id);
    await loadPatientContacts(patient.id);
  };

  // Clear search, results, selected patient, call history, and editing mode.
  const handleClear = () => {
    setSearchName("");
    setSearchDob("");
    setPatients([]);
    setPatientCalls([]);
    setError("");
    setHasSearched(false);
    setSelectedPatient(null);
    resetPatientForm();
  };

  return (
    <div className="page-stack">
      <section className="content-panel">
        <div className="content-panel-header">
          <div>
            <h4>Patient Search</h4>
            <p>Find patient records by name, date of birth, or load all records.</p>
          </div>

          <button
            type="button"
            className="btn btn-sm btn-primary d-inline-flex align-items-center gap-1"
            onClick={handleShowAddForm}
            disabled={loading}
          >
            <FaPlus />
            Add Patient
          </button>
        </div>

        <form onSubmit={handleSearch}>
          <div className="row g-3">
            <div className="col-md-5">
              <label className="form-label">Patient Name</label>

              <input
                className="form-control"
                placeholder="Search by first or last name"
                value={searchName}
                onChange={(e) => setSearchName(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="col-md-3">
              <label className="form-label">Date of Birth</label>

              <input
                type="date"
                className="form-control"
                value={searchDob}
                onChange={(e) => setSearchDob(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="col-md-4 d-flex align-items-end gap-2 flex-wrap">
              <button
                type="submit"
                className="btn btn-primary d-inline-flex align-items-center gap-2"
                disabled={loading}
              >
                <FaSearch />
                Search
              </button>

              <button
                type="button"
                className="btn btn-outline-info"
                onClick={handleShowAll}
                disabled={loading}
              >
                Show All
              </button>

              <button
                type="button"
                className="btn btn-outline-secondary d-inline-flex align-items-center gap-2"
                onClick={handleClear}
                disabled={loading}
              >
                <FaTimes />
                Clear
              </button>

              <div className="form-check form-switch mb-0 ms-2">
                <input
                  type="checkbox"
                  className="form-check-input"
                  role="switch"
                  id="show-archived-toggle"
                  checked={showArchived}
                  onChange={handleToggleShowArchived}
                  disabled={loading}
                />
                <label className="form-check-label" htmlFor="show-archived-toggle" style={{ fontSize: 13 }}>
                  Show archived
                </label>
              </div>
            </div>
          </div>
        </form>

        {error && <div className="alert alert-danger mt-3 mb-0">{error}</div>}

        {!hasSearched && !loading && !error && (
          <div className="alert alert-info mt-3 mb-0">
            Enter a patient name, date of birth, or both. You can also use Show
            All.
          </div>
        )}

        {loading && (
          <div className="alert alert-secondary mt-3 mb-0">
            Loading patient records...
          </div>
        )}

        {hasSearched && !loading && !error && patients.length === 0 && (
          <div className="alert alert-warning mt-3 mb-0">
            No patients found.
          </div>
        )}
      </section>

      {patients.length > 0 && (
        <section className="content-panel">
          <div className="content-panel-header">
            <div>
              <h4>Patient List</h4>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                {[
                  { label: "Total", value: paginationMeta.total || patients.length, color: "#0d6efd" },
                  { label: "Loaded", value: patients.length, color: "#198754" },
                  ...(patientCalls.length > 0 ? [{ label: "Calls", value: patientCalls.length, color: "#6f42c1" }] : []),
                ].map(s => (
                  <span key={s.label} style={{
                    fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 20,
                    background: `${s.color}14`, color: s.color, border: `1px solid ${s.color}30`,
                  }}>
                    {s.label}: {s.value}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="patient-list">
            {patients.map((patient) => {
              const isSelected = selectedPatient?.id === patient.id;

              return (
                <div
                  className={`patient-list-card ${isSelected ? "selected" : ""}`}
                  key={patient.id}
                  style={{ cursor: "pointer", opacity: patient.is_archived ? 0.6 : 1 }}
                  onClick={() => handleSelectPatient(patient)}
                >
                  {/* Name + avatar */}
                  <div className="patient-list-main">
                    <div className="patient-list-avatar">
                      {(patient.first_name?.[0] || "P").toUpperCase()}
                    </div>
                    <div>
                      <div className="patient-list-name d-flex align-items-center gap-2">
                        {patient.first_name} {patient.last_name}
                        {patient.is_sensitive && <FaUserSecret title="Sensitive patient" style={{ color: "#f59e0b", fontSize: 12 }} />}
                        {patient.is_archived && <span className="badge text-bg-secondary" style={{ fontSize: 10 }}>Archived</span>}
                      </div>
                      <div className="patient-list-muted" style={{ fontSize: 11 }}>
                        {patient.dob || "No DOB"}
                      </div>
                    </div>
                  </div>

                  {/* Phone */}
                  <div>
                    <div className="compact-call-label">Phone</div>
                    <div style={{ fontSize: 13, color: "var(--ems-text-primary)" }}>{patient.phone || "—"}</div>
                    {patient.secondary_phone && (
                      <div style={{ fontSize: 11, color: "var(--ems-text-muted)" }}>{patient.secondary_phone}</div>
                    )}
                  </div>

                  {/* Insurance */}
                  <div>
                    <div className="compact-call-label">Insurance</div>
                    <div style={{ fontSize: 12, color: "var(--ems-text-secondary)" }}>{patient.insurance || "—"}</div>
                  </div>

                  {/* Home address */}
                  <div>
                    <div className="compact-call-label">Home Address</div>
                    <div style={{ fontSize: 12, color: "var(--ems-text-secondary)" }}>
                      {patient.address
                        ? <>
                            {patient.address}
                            {(patient.city || patient.state) && (
                              <span style={{ color: "var(--ems-text-muted)" }}>
                                {", "}{[patient.city, patient.state].filter(Boolean).join(", ")}
                              </span>
                            )}
                          </>
                        : "—"}
                    </div>
                  </div>

                  {/* Default service — inline select */}
                  <div onClick={e => e.stopPropagation()}>
                    <div className="compact-call-label">Default Service</div>
                    <select
                      className="form-select form-select-sm"
                      style={{ fontSize: 11, padding: "2px 6px", width: 120, borderRadius: 6 }}
                      value={patient.default_service_level || ""}
                      onChange={async (e) => {
                        const newLevel = e.target.value;
                        try {
                          const updated = await updatePatient(patient.id, { ...patient, default_service_level: newLevel });
                          setPatients(prev => prev.map(p => p.id === patient.id ? updated : p));
                          toast.success("Service level updated");
                        } catch {
                          toast.error("Failed to update service level");
                        }
                      }}
                    >
                      <option value="">— Not set —</option>
                      <option value="bls">BLS</option>
                      <option value="als">ALS</option>
                      <option value="emergency">Emergency</option>
                      <option value="stretcher">Stretcher</option>
                      <option value="wheelchair">Wheelchair</option>
                    </select>
                  </div>

                  {/* Actions */}
                  <div className="patient-list-actions" onClick={(e) => e.stopPropagation()}>
                    {patient.is_archived ? (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-success d-inline-flex align-items-center gap-1"
                        onClick={() => handleRestorePatient(patient.id)}
                        disabled={loading}
                      >
                        <FaTrashRestore /> Restore
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-warning d-inline-flex align-items-center gap-1"
                          onClick={() => handleEditPatient(patient)}
                          disabled={loading}
                        >
                          <FaEdit /> Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger d-inline-flex align-items-center gap-1"
                          onClick={() => handleArchivePatient(patient.id)}
                          disabled={loading}
                        >
                          <FaArchive /> Archive
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {patients.length < paginationMeta.total && (
            <div className="text-center mt-3">
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => loadPatients(currentFilters, paginationMeta.page + 1, true)}
                disabled={loadingMore}
              >
                {loadingMore ? "Loading..." : `Load more (${patients.length} of ${paginationMeta.total})`}
              </button>
            </div>
          )}
        </section>
      )}

      <EntityDrawer
        open={drawerOpen}
        onClose={closePatientFormSafely}
        title={
          selectedPatient
            ? `${selectedPatient.first_name} ${selectedPatient.last_name}`
            : "Add Patient"
        }
        subtitle={
          selectedPatient
            ? `DOB: ${selectedPatient.dob || "—"} · ${selectedPatient.default_service_level || "No Service"}`
            : "New patient record"
        }
        width="50vw"
        tabs={
          selectedPatient
            ? [
                { key: "overview", label: "Overview" },
                { key: "alerts", label: `Alerts${patientAlerts.filter(a => a.status === "active").length ? ` (${patientAlerts.filter(a => a.status === "active").length})` : ""}` },
                { key: "contacts", label: "Contacts" },
                { key: "edit", label: "Edit" },
                { key: "history", label: "Call History" },
              ]
            : undefined
        }
        activeTab={drawerTab}
        onTabChange={setDrawerTab}
        footer={
          drawerTab === "edit" ? (
            <>
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={closePatientFormSafely}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                form="patient-drawer-form"
                className="btn btn-primary d-inline-flex align-items-center gap-2"
                disabled={loading}
              >
                <FaPlus />
                {loading ? "Saving..." : editingPatientId ? "Update Patient" : "Add Patient"}
              </button>
            </>
          ) : null
        }
      >
        {drawerTab === "overview" && selectedPatient && (
          <div>
            {selectedPatient.is_archived && (
              <div className="alert alert-secondary d-flex justify-content-between align-items-center mb-3">
                <span>
                  <FaArchive style={{ marginRight: 6 }} />
                  Archived{selectedPatient.archived_at ? ` on ${selectedPatient.archived_at.slice(0, 10)}` : ""}
                  {selectedPatient.archived_reason ? ` — ${selectedPatient.archived_reason}` : ""}
                </span>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-success"
                  onClick={() => handleRestorePatient(selectedPatient.id)}
                >
                  <FaTrashRestore style={{ marginRight: 4 }} /> Restore
                </button>
              </div>
            )}

            {patientAlerts.filter(a => a.status === "active").length > 0 && (
              <div className="mb-3 d-flex flex-wrap gap-2">
                {patientAlerts.filter(a => a.status === "active").map((a) => (
                  <span
                    key={a.id}
                    className="badge"
                    style={{ background: `${SEVERITY_COLOR[a.severity]}20`, color: SEVERITY_COLOR[a.severity], border: `1px solid ${SEVERITY_COLOR[a.severity]}50`, fontSize: 12, padding: "6px 10px" }}
                  >
                    <FaExclamationTriangle style={{ marginRight: 4 }} />
                    {a.title}
                  </span>
                ))}
              </div>
            )}

            {selectedPatient.dispatch_comment && (
              <div className="alert alert-info mb-3">
                <strong>Dispatch note:</strong> {selectedPatient.dispatch_comment}
              </div>
            )}

            <div className="patient-detail-grid">
              <DetailItem label="Name" value={`${selectedPatient.first_name || ""} ${selectedPatient.last_name || ""}`.trim()} />
              <DetailItem label="DOB" value={selectedPatient.dob} />
              <DetailItem label="Gender" value={selectedPatient.gender} />
              <DetailItem label="Phone" value={selectedPatient.phone} />
              <DetailItem label="Secondary Phone" value={selectedPatient.secondary_phone} />
              <DetailItem label="Address" value={`${selectedPatient.address || ""}, ${selectedPatient.city || ""} ${selectedPatient.state || ""} ${selectedPatient.zip_code || ""}`.trim()} />
              <DetailItem label="Insurance" value={selectedPatient.insurance} />
              <DetailItem label="Member ID" value={selectedPatient.member_id} />
              <DetailItem label="Policy Number" value={selectedPatient.policy_number} />
              <DetailItem label="Requires Auth" value={selectedPatient.requires_auth ? "Yes" : "No"} />
              <DetailItem label="Copay Required" value={selectedPatient.copay_required ? "Yes" : "No"} />
              <DetailItem label="Default Service" value={selectedPatient.default_service_level} />
              <DetailItem label="Default Mobility" value={selectedPatient.default_mobility_level} />
              <DetailItem label="Weight" value={selectedPatient.weight} />
              <DetailItem label="Oxygen Required" value={selectedPatient.oxygen_required ? "Yes" : "No"} />
              <DetailItem label="Stairs" value={selectedPatient.stairs ? "Yes" : "No"} />
              <DetailItem label="Preferred Language" value={selectedPatient.preferred_language} />
              <DetailItem label="Requires Interpreter" value={selectedPatient.requires_interpreter ? "Yes" : "No"} />
              <DetailItem label="Facility" value={selectedPatient.facility_name} />
              <DetailItem label="Room" value={selectedPatient.room_number} />
              <DetailItem label="Emergency Contact" value={`${selectedPatient.emergency_contact_name || ""} ${selectedPatient.emergency_contact_phone || ""}`.trim()} />
              <DetailItem label="Transport Instructions" value={selectedPatient.transport_instructions} />
              <DetailItem label="Access Instructions" value={selectedPatient.access_instructions} />
              <DetailItem label="Notes" value={selectedPatient.notes} />
              <div style={{ gridColumn: "1 / -1", marginTop: 8, display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-warning"
                  onClick={() => handleEditPatient(selectedPatient)}
                >
                  <FaEdit style={{ marginRight: 4 }} /> Edit Patient
                </button>
                {!selectedPatient.is_archived && (
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-danger"
                    onClick={() => handleArchivePatient(selectedPatient.id)}
                  >
                    <FaArchive style={{ marginRight: 4 }} /> Archive
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {drawerTab === "history" && (
          patientCalls.length === 0 ? (
            <div className="empty-state">
              <FaHistory />
              <h5>No calls found</h5>
              <p>No call records are currently linked to this patient.</p>
            </div>
          ) : (
            <div className="patient-call-list">
              {patientCalls.map((call) => (
                <div className="patient-call-card" key={call.id}>
                  <div>
                    <div className="patient-call-date">{call.date_of_call || "—"}</div>
                    <div className="patient-call-muted">Trip: {call.trip_date || "—"} {call.pickup_time ? `at ${formatTimeForDisplay(call.pickup_time, timeFormat)}` : ""}</div>
                  </div>
                  <div>
                    <div className="patient-call-label">Route</div>
                    <div>{call.pickup_address || "—"} → {call.dropoff_address || "—"}</div>
                  </div>
                  <div>
                    <div className="patient-call-label">Service</div>
                    <div>{call.service_level || "—"}</div>
                  </div>
                  <div>
                    <div className="patient-call-label">Notes</div>
                    <div>{call.notes || "—"}</div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {drawerTab === "alerts" && selectedPatient && (
          <div>
            <form onSubmit={handleAddAlert} className="mb-4 patient-form-section">
              <div className="patient-form-section-header">
                <span className="patient-form-section-icon"><FaExclamationTriangle /></span>
                <h5>Add Alert</h5>
              </div>
              <div className="row g-3">
                <div className="col-md-3">
                  <label className="form-label">Category</label>
                  <select
                    className="form-select"
                    value={newAlert.category}
                    onChange={(e) => setNewAlert(p => ({ ...p, category: e.target.value }))}
                  >
                    {ALERT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="col-md-3">
                  <label className="form-label">Severity</label>
                  <select
                    className="form-select"
                    value={newAlert.severity}
                    onChange={(e) => setNewAlert(p => ({ ...p, severity: e.target.value }))}
                  >
                    {ALERT_SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="col-md-6">
                  <label className="form-label">Title *</label>
                  <input
                    className="form-control"
                    value={newAlert.title}
                    onChange={(e) => setNewAlert(p => ({ ...p, title: e.target.value }))}
                    placeholder="e.g. Requires stretcher"
                    required
                  />
                </div>
                <div className="col-md-8">
                  <label className="form-label">Description</label>
                  <input
                    className="form-control"
                    value={newAlert.description}
                    onChange={(e) => setNewAlert(p => ({ ...p, description: e.target.value }))}
                    placeholder="Optional details"
                  />
                </div>
                <div className="col-md-4">
                  <label className="form-label">Expires</label>
                  <input
                    type="date"
                    className="form-control"
                    value={newAlert.expires_at}
                    onChange={(e) => setNewAlert(p => ({ ...p, expires_at: e.target.value }))}
                  />
                </div>
              </div>
              <button type="submit" className="btn btn-sm btn-primary mt-3">
                <FaPlus style={{ marginRight: 4 }} /> Add Alert
              </button>
            </form>

            <div className="d-flex justify-content-between align-items-center mb-2">
              <h5 className="mb-0">Alerts</h5>
              <div className="form-check form-switch mb-0">
                <input
                  type="checkbox"
                  className="form-check-input"
                  role="switch"
                  id="show-resolved-alerts"
                  checked={showResolvedAlerts}
                  onChange={(e) => setShowResolvedAlerts(e.target.checked)}
                />
                <label className="form-check-label" htmlFor="show-resolved-alerts" style={{ fontSize: 13 }}>
                  Show resolved
                </label>
              </div>
            </div>

            {(() => {
              const visible = showResolvedAlerts ? patientAlerts : patientAlerts.filter(a => a.status !== "resolved");
              if (visible.length === 0) {
                return (
                  <div className="empty-state">
                    <FaExclamationTriangle />
                    <h5>No alerts</h5>
                    <p>No active alerts for this patient.</p>
                  </div>
                );
              }
              return (
                <div className="patient-call-list">
                  {visible.map((a) => (
                    <div className="patient-call-card" key={a.id}>
                      <div>
                        <span
                          className="badge"
                          style={{ background: `${SEVERITY_COLOR[a.severity]}20`, color: SEVERITY_COLOR[a.severity], border: `1px solid ${SEVERITY_COLOR[a.severity]}50` }}
                        >
                          {a.severity}
                        </span>
                        <div className="patient-call-muted" style={{ marginTop: 4 }}>{a.category} · {a.status}</div>
                      </div>
                      <div>
                        <div className="patient-call-label">Title</div>
                        <div>{a.title}</div>
                      </div>
                      <div>
                        <div className="patient-call-label">Description</div>
                        <div>{a.description || "—"}</div>
                      </div>
                      <div>
                        <div className="patient-call-label">Expires</div>
                        <div>{a.expires_at || "No expiration"}</div>
                      </div>
                      {a.status === "active" && (
                        <div>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary"
                            onClick={() => handleResolveAlert(a.id)}
                          >
                            Resolve
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}

        {drawerTab === "contacts" && selectedPatient && (
          <div>
            <form onSubmit={handleAddContact} className="mb-4 patient-form-section">
              <div className="patient-form-section-header">
                <span className="patient-form-section-icon"><FaAddressBook /></span>
                <h5>{editingContactId ? "Edit Contact" : "Add Contact"}</h5>
              </div>
              <div className="row g-3">
                <div className="col-md-4">
                  <label className="form-label">Name *</label>
                  <input
                    className="form-control"
                    value={newContact.name}
                    onChange={(e) => setNewContact(p => ({ ...p, name: e.target.value }))}
                    required
                  />
                </div>
                <div className="col-md-4">
                  <label className="form-label">Relationship</label>
                  <input
                    className="form-control"
                    value={newContact.relationship}
                    onChange={(e) => setNewContact(p => ({ ...p, relationship: e.target.value }))}
                    placeholder="Daughter, Case manager..."
                  />
                </div>
                <div className="col-md-4">
                  <label className="form-label">Phone</label>
                  <input
                    className="form-control"
                    value={newContact.phone}
                    onChange={(e) => setNewContact(p => ({ ...p, phone: e.target.value }))}
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label">Email</label>
                  <input
                    type="email"
                    className="form-control"
                    value={newContact.email}
                    onChange={(e) => setNewContact(p => ({ ...p, email: e.target.value }))}
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label">Notes</label>
                  <input
                    className="form-control"
                    value={newContact.notes}
                    onChange={(e) => setNewContact(p => ({ ...p, notes: e.target.value }))}
                    placeholder="Call before pickup..."
                  />
                </div>
                <div className="col-md-6">
                  <div className="form-check">
                    <input
                      type="checkbox"
                      className="form-check-input"
                      id="contact-primary"
                      checked={newContact.is_primary}
                      onChange={(e) => setNewContact(p => ({ ...p, is_primary: e.target.checked }))}
                    />
                    <label className="form-check-label" htmlFor="contact-primary">Primary contact</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-check">
                    <input
                      type="checkbox"
                      className="form-check-input"
                      id="contact-authorize"
                      checked={newContact.can_authorize_transport}
                      onChange={(e) => setNewContact(p => ({ ...p, can_authorize_transport: e.target.checked }))}
                    />
                    <label className="form-check-label" htmlFor="contact-authorize">Can authorize transport</label>
                  </div>
                </div>
              </div>
              <div className="d-flex gap-2 mt-3">
                <button type="submit" className="btn btn-sm btn-primary">
                  <FaPlus style={{ marginRight: 4 }} /> {editingContactId ? "Update Contact" : "Add Contact"}
                </button>
                {editingContactId && (
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={() => { setEditingContactId(null); setNewContact(emptyContact); }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>

            {patientContacts.length === 0 ? (
              <div className="empty-state">
                <FaAddressBook />
                <h5>No contacts</h5>
                <p>No contacts saved for this patient.</p>
              </div>
            ) : (
              <div className="patient-call-list">
                {patientContacts.map((c) => (
                  <div className="patient-call-card" key={c.id}>
                    <div>
                      <div className="patient-call-date">
                        {c.name} {c.is_primary && <span className="badge text-bg-primary" style={{ fontSize: 10 }}>Primary</span>}
                      </div>
                      <div className="patient-call-muted">{c.relationship || "—"}</div>
                    </div>
                    <div>
                      <div className="patient-call-label">Phone</div>
                      <div>{c.phone || "—"}</div>
                    </div>
                    <div>
                      <div className="patient-call-label">Email</div>
                      <div>{c.email || "—"}</div>
                    </div>
                    <div>
                      <div className="patient-call-label">Can authorize</div>
                      <div>{c.can_authorize_transport ? "Yes" : "No"}</div>
                    </div>
                    <div className="d-flex gap-2">
                      <button type="button" className="btn btn-sm btn-outline-warning" onClick={() => handleEditContact(c)}>
                        <FaEdit />
                      </button>
                      <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => handleDeleteContact(c.id)}>
                        <FaTrash />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {drawerTab === "edit" && (
          <form id="patient-drawer-form" onSubmit={handleCreatePatient}>
                {error && <div className="alert alert-danger">{error}</div>}
                <PatientFormSection title="Basic Information" icon={FaIdCard}>
                  <div className="row g-3">
                    <div className="col-md-6">
                      <label className="form-label">First Name *</label>

                      <input
                        name="first_name"
                        className="form-control"
                        value={newPatient.first_name}
                        onChange={handleNewPatientChange}
                        disabled={loading}
                        required
                      />
                    </div>

                    <div className="col-md-6">
                      <label className="form-label">Last Name *</label>

                      <input
                        name="last_name"
                        className="form-control"
                        value={newPatient.last_name}
                        onChange={handleNewPatientChange}
                        disabled={loading}
                        required
                      />
                    </div>

                    <div className="col-md-6">
                      <label className="form-label">DOB</label>

                      <input
                        type="date"
                        name="dob"
                        className="form-control"
                        value={newPatient.dob}
                        onChange={handleNewPatientChange}
                        disabled={loading}
                      />
                    </div>

                    <div className="col-md-6">
                      <label className="form-label">Gender</label>

                      <select
                        name="gender"
                        className="form-select"
                        value={newPatient.gender}
                        onChange={handleNewPatientChange}
                        disabled={loading}
                      >
                        <option value="">Select</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                        <option value="Unknown">Unknown</option>
                      </select>
                    </div>
                  </div>
                </PatientFormSection>

                <PatientFormSection title="Contact / Address" icon={FaAddressCard}>
                  <div className="row g-3">
                    <div className="col-md-6">
                      <label className="form-label">Primary Phone</label>

                      <input
                        name="phone"
                        className="form-control"
                        value={newPatient.phone}
                        onChange={handleNewPatientChange}
                        disabled={loading}
                      />
                    </div>

                    <div className="col-md-6">
                      <label className="form-label">Secondary Phone</label>

                      <input
                        name="secondary_phone"
                        className="form-control"
                        value={newPatient.secondary_phone}
                        onChange={handleNewPatientChange}
                        disabled={loading}
                      />
                    </div>

                    <div className="col-12">
                      <label className="form-label">Street Address</label>

                      <input
                        name="address"
                        className="form-control"
                        value={newPatient.address}
                        onChange={handleNewPatientChange}
                        disabled={loading}
                      />
                    </div>

                    <div className="col-md-4">
                      <label className="form-label">City</label>

                      <input
                        name="city"
                        className="form-control"
                        value={newPatient.city}
                        onChange={handleNewPatientChange}
                        disabled={loading}
                      />
                    </div>

                    <div className="col-md-4">
                      <label className="form-label">State</label>

                      <input
                        name="state"
                        className="form-control"
                        value={newPatient.state}
                        onChange={handleNewPatientChange}
                        disabled={loading}
                      />
                    </div>

                    <div className="col-md-4">
                      <label className="form-label">ZIP Code</label>

                      <input
                        name="zip_code"
                        className="form-control"
                        value={newPatient.zip_code}
                        onChange={handleNewPatientChange}
                        disabled={loading}
                      />
                    </div>
                  </div>
                </PatientFormSection>

                <PatientFormSection title="Insurance" icon={FaFileMedical}>
                  <div className="row g-3">
                    <div className="col-md-6">
                      <label className="form-label">Insurance Company</label>

                      <input
                        name="insurance"
                        className="form-control"
                        value={newPatient.insurance}
                        onChange={handleNewPatientChange}
                        disabled={loading}
                      />
                    </div>

                    <div className="col-md-6">
                      <label className="form-label">Member ID</label>

                      <input
                        name="member_id"
                        className="form-control"
                        value={newPatient.member_id}
                        onChange={handleNewPatientChange}
                        disabled={loading}
                      />
                    </div>

                    <div className="col-md-6">
                      <label className="form-label">Policy Number</label>

                      <input
                        name="policy_number"
                        className="form-control"
                        value={newPatient.policy_number}
                        onChange={handleNewPatientChange}
                        disabled={loading}
                      />
                    </div>

                    <div className="col-md-6 d-flex flex-column justify-content-end gap-2">
                      <div className="form-check">
                        <input
                          type="checkbox"
                          name="requires_auth"
                          className="form-check-input"
                          checked={newPatient.requires_auth}
                          onChange={handleNewPatientChange}
                          disabled={loading}
                        />

                        <label className="form-check-label">
                          Requires Authorization
                        </label>
                      </div>

                      <div className="form-check">
                        <input
                          type="checkbox"
                          name="copay_required"
                          className="form-check-input"
                          checked={newPatient.copay_required}
                          onChange={handleNewPatientChange}
                          disabled={loading}
                        />

                        <label className="form-check-label">
                          Copay Required
                        </label>
                      </div>
                    </div>

                    <div className="col-12">
                      <label className="form-label">Insurance Notes</label>

                      <textarea
                        name="insurance_notes"
                        className="form-control"
                        value={newPatient.insurance_notes}
                        onChange={handleNewPatientChange}
                        disabled={loading}
                      />
                    </div>
                  </div>
                </PatientFormSection>

                <PatientFormSection title="EMS Details" icon={FaAmbulance}>
                  <div className="row g-3">
                    <div className="col-md-6">
                      <label className="form-label">Default Service Level</label>

                      <select
                        name="default_service_level"
                        className="form-select"
                        value={newPatient.default_service_level}
                        onChange={handleNewPatientChange}
                        disabled={loading}
                      >
                        <option value="">Select</option>
                        <option value="BLS">BLS</option>
                        <option value="ALS">ALS</option>
                        <option value="Wheelchair">Wheelchair</option>
                        <option value="Stretcher">Stretcher</option>
                      </select>
                    </div>

                    <div className="col-md-6">
                      <label className="form-label">Weight</label>

                      <input
                        name="weight"
                        className="form-control"
                        value={newPatient.weight}
                        onChange={handleNewPatientChange}
                        disabled={loading}
                      />
                    </div>

                    <div className="col-12 d-flex flex-wrap gap-3">
                      <div className="form-check">
                        <input
                          type="checkbox"
                          name="oxygen_required"
                          className="form-check-input"
                          checked={newPatient.oxygen_required}
                          onChange={handleNewPatientChange}
                          disabled={loading}
                        />

                        <label className="form-check-label">
                          Oxygen Required
                        </label>
                      </div>

                      <div className="form-check">
                        <input
                          type="checkbox"
                          name="stairs"
                          className="form-check-input"
                          checked={newPatient.stairs}
                          onChange={handleNewPatientChange}
                          disabled={loading}
                        />

                        <label className="form-check-label">Stairs</label>
                      </div>
                    </div>

                    <div className="col-12">
                      <label className="form-label">Special Equipment Notes</label>

                      <textarea
                        name="special_equipment_notes"
                        className="form-control"
                        value={newPatient.special_equipment_notes}
                        onChange={handleNewPatientChange}
                        disabled={loading}
                      />
                    </div>
                  </div>
                </PatientFormSection>

                <PatientFormSection
                  title="Facility / Emergency Contact"
                  icon={FaAddressCard}
                >
                  <div className="row g-3">
                    <div className="col-md-6">
                      <label className="form-label">Facility Name</label>

                      <input
                        name="facility_name"
                        className="form-control"
                        value={newPatient.facility_name}
                        onChange={handleNewPatientChange}
                        disabled={loading}
                      />
                    </div>

                    <div className="col-md-6">
                      <label className="form-label">Room Number</label>

                      <input
                        name="room_number"
                        className="form-control"
                        value={newPatient.room_number}
                        onChange={handleNewPatientChange}
                        disabled={loading}
                      />
                    </div>

                    <div className="col-md-6">
                      <label className="form-label">
                        Emergency Contact Name
                      </label>

                      <input
                        name="emergency_contact_name"
                        className="form-control"
                        value={newPatient.emergency_contact_name}
                        onChange={handleNewPatientChange}
                        disabled={loading}
                      />
                    </div>

                    <div className="col-md-6">
                      <label className="form-label">
                        Emergency Contact Phone
                      </label>

                      <input
                        name="emergency_contact_phone"
                        className="form-control"
                        value={newPatient.emergency_contact_phone}
                        onChange={handleNewPatientChange}
                        disabled={loading}
                      />
                    </div>
                  </div>
                </PatientFormSection>

                <PatientFormSection title="Dispatch & Transport" icon={FaAmbulance}>
                  <div className="row g-3">
                    <div className="col-12">
                      <label className="form-label">Dispatch Note</label>
                      <textarea
                        name="dispatch_comment"
                        className="form-control"
                        value={newPatient.dispatch_comment}
                        onChange={handleNewPatientChange}
                        disabled={loading}
                        placeholder="Short, practical note for dispatch — e.g. 'Call daughter before pickup. Use side entrance.'"
                        rows={2}
                      />
                    </div>

                    <div className="col-md-6">
                      <label className="form-label">Default Mobility Level</label>
                      <input
                        name="default_mobility_level"
                        className="form-control"
                        value={newPatient.default_mobility_level}
                        onChange={handleNewPatientChange}
                        disabled={loading}
                        placeholder="Ambulatory, Wheelchair, Stretcher..."
                      />
                    </div>

                    <div className="col-md-6">
                      <label className="form-label">Preferred Language</label>
                      <input
                        name="preferred_language"
                        className="form-control"
                        value={newPatient.preferred_language}
                        onChange={handleNewPatientChange}
                        disabled={loading}
                      />
                    </div>

                    <div className="col-12">
                      <label className="form-label">Transport Instructions</label>
                      <textarea
                        name="transport_instructions"
                        className="form-control"
                        value={newPatient.transport_instructions}
                        onChange={handleNewPatientChange}
                        disabled={loading}
                        rows={2}
                      />
                    </div>

                    <div className="col-12">
                      <label className="form-label">Access Instructions</label>
                      <textarea
                        name="access_instructions"
                        className="form-control"
                        value={newPatient.access_instructions}
                        onChange={handleNewPatientChange}
                        disabled={loading}
                        placeholder="Gate code, elevator status, parking..."
                        rows={2}
                      />
                    </div>

                    <div className="col-md-6">
                      <div className="form-check">
                        <input
                          type="checkbox"
                          className="form-check-input"
                          id="requires_interpreter"
                          name="requires_interpreter"
                          checked={newPatient.requires_interpreter}
                          onChange={handleNewPatientChange}
                          disabled={loading}
                        />
                        <label className="form-check-label" htmlFor="requires_interpreter">Requires interpreter</label>
                      </div>
                    </div>

                    <div className="col-md-6">
                      <div className="form-check">
                        <input
                          type="checkbox"
                          className="form-check-input"
                          id="is_sensitive"
                          name="is_sensitive"
                          checked={newPatient.is_sensitive}
                          onChange={handleNewPatientChange}
                          disabled={loading}
                        />
                        <label className="form-check-label" htmlFor="is_sensitive">
                          <FaUserSecret style={{ marginRight: 4 }} />
                          Sensitive patient
                        </label>
                      </div>
                    </div>
                  </div>
                </PatientFormSection>

                <PatientFormSection title="General Notes" icon={FaEdit}>
                  <textarea
                    name="notes"
                    className="form-control"
                    value={newPatient.notes}
                    onChange={handleNewPatientChange}
                    disabled={loading}
                  />
                </PatientFormSection>
          </form>
        )}
      </EntityDrawer>
    </div>
  );
};

export default PatientsPage;
