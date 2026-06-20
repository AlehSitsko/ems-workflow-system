import React, { useState } from "react";
import { useConfirm } from "./ui/ConfirmDialog";
import { useToast } from "./ui/ToastProvider";
import EntityDrawer from "./ui/EntityDrawer";
import {
  FaAddressCard,
  FaAmbulance,
  FaEdit,
  FaFileMedical,
  FaHistory,
  FaIdCard,
  FaPlus,
  FaSearch,
  FaTimes,
  FaTrash,
  FaUserInjured,
  FaUsers,
} from "react-icons/fa";

import {
  getPatients,
  createPatient,
  updatePatient,
  deletePatient,
} from "../api/patientsApi";

import { getPatientCalls } from "../api/callsApi";

// Empty patient template used for create, reset, and cancel edit.
const emptyPatient = {
  first_name: "",
  last_name: "",
  dob: "",
  gender: "",

  phone: "",
  secondary_phone: "",
  address: "",
  city: "",
  state: "",
  zip_code: "",

  insurance: "",
  member_id: "",
  policy_number: "",
  requires_auth: false,
  copay_required: false,
  insurance_notes: "",

  default_service_level: "",
  weight: "",
  oxygen_required: false,
  stairs: false,
  special_equipment_notes: "",

  facility_name: "",
  room_number: "",
  emergency_contact_name: "",
  emergency_contact_phone: "",

  notes: "",
};

const DetailItem = ({ label, value }) => (
  <div className="patient-detail-item">
    <div className="patient-detail-label">{label}</div>
    <div className="patient-detail-value">{value || "—"}</div>
  </div>
);

// eslint-disable-next-line no-unused-vars
const PatientFormSection = ({ title, icon: Icon, children }) => (
  <div className="patient-form-section">
    <div className="patient-form-section-header">
      <span className="patient-form-section-icon">
        <Icon />
      </span>

      <h5>{title}</h5>
    </div>

    {children}
  </div>
);

// Main patient management component.
const PatientsPage = () => {
  const confirm = useConfirm();
  const toast = useToast();
  const [searchName, setSearchName] = useState("");
  const [searchDob, setSearchDob] = useState("");

  const [newPatient, setNewPatient] = useState(emptyPatient);
  const [patients, setPatients] = useState([]);
  const [patientCalls, setPatientCalls] = useState([]);
  const [paginationMeta, setPaginationMeta] = useState({ page: 1, total: 0, pages: 0 });
  const [currentFilters, setCurrentFilters] = useState({});
  const [loadingMore, setLoadingMore] = useState(false);

  const [showPatientForm, setShowPatientForm] = useState(false);
  const [editingPatientId, setEditingPatientId] = useState(null);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [drawerTab, setDrawerTab] = useState("overview"); // "overview" | "edit" | "history"
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasSearched, setHasSearched] = useState(false);

  const PER_PAGE = 25;

  const loadPatients = async (filters, pageNum = 1, append = false) => {
    setCurrentFilters(filters);
    if (append) setLoadingMore(true);
    else setLoading(true);

    try {
      const data = await getPatients(filters, pageNum, PER_PAGE);
      setPatients((prev) => append ? [...prev, ...data.items] : data.items);
      setPaginationMeta({ page: data.page, total: data.total, pages: data.pages });
    } catch (err) {
      setError(err.message || "Failed to load patients.");
      if (!append) setPatients([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  // Reset the add/edit patient form and close the drawer.
  const resetPatientForm = () => {
    setNewPatient(emptyPatient);
    setEditingPatientId(null);
    setShowPatientForm(false);
    setDrawerOpen(false);
    setSelectedPatient(null);
    setPatientCalls([]);
    setDrawerTab("overview");
  };

  // Open the drawer in add mode.
  const handleShowAddForm = () => {
    setNewPatient(emptyPatient);
    setEditingPatientId(null);
    setSelectedPatient(null);
    setError("");
    setShowPatientForm(true);
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

  // Check whether the add/edit patient form has unsaved changes.
  const isPatientFormDirty = () => {
    return Object.keys(emptyPatient).some((key) => {
      return newPatient[key] !== emptyPatient[key];
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

  // Prevent accidental data loss when the user clicks outside the drawer.
  const handlePatientDrawerOverlayClick = () => {
    closePatientFormSafely();
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
      setShowPatientForm(false);
      setSelectedPatient(savedPatient);
      setHasSearched(true);

      await loadPatients(currentFilters, 1, false);
      await loadPatientCalls(savedPatient.id);
    } catch (err) {
      setError(err.message || "Operation failed.");
    } finally {
      setLoading(false);
    }
  };

  // Search patients by name, date of birth, or both.
  const handleSearch = async (e) => {
    e.preventDefault();

    setError("");
    setHasSearched(true);

    try {
      if (!searchName.trim() && !searchDob.trim()) {
        setError("Please enter a patient name or date of birth.");
        setPatients([]);
        setSelectedPatient(null);
        setPatientCalls([]);
        return;
      }

      const filters = { name: searchName.trim(), dob: searchDob.trim() };
      await loadPatients(filters, 1, false);
      setSelectedPatient(null);
      setPatientCalls([]);
    } catch (err) {
      setError(err.message || "Failed to search patients.");
      setPatients([]);
      setSelectedPatient(null);
      setPatientCalls([]);
    }
  };

  // Load all patients from the backend.
  const handleShowAll = async () => {
    setError("");
    setHasSearched(true);
    setSelectedPatient(null);
    setPatientCalls([]);
    await loadPatients({}, 1, false);
  };

  // Delete a patient record.
  const handleDeletePatient = async (id) => {
    const ok = await confirm({
      title: "Delete patient?",
      message: "This will permanently remove the patient record.",
      variant: "danger",
      confirmLabel: "Delete",
    });
    if (!ok) return;

    setError("");

    try {
      await deletePatient(id);
      await loadPatients(currentFilters, 1, false);

      if (selectedPatient?.id === id) {
        setSelectedPatient(null);
        setPatientCalls([]);
      }

      if (editingPatientId === id) {
        resetPatientForm();
      }
    } catch (err) {
      setError(err.message || "Delete failed.");
    }
  };

  // Open drawer in view mode for a patient.
  const handleSelectPatient = async (patient) => {
    setSelectedPatient(patient);
    setDrawerTab("overview");
    setDrawerOpen(true);
    await loadPatientCalls(patient.id);
  };

  // Open drawer in edit mode for a patient.
  const handleEditPatient = async (patient) => {
    setEditingPatientId(patient.id);
    setNewPatient({
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
    });
    setSelectedPatient(patient);
    setDrawerTab("edit");
    setDrawerOpen(true);
    await loadPatientCalls(patient.id);
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
                  style={{ cursor: "pointer" }}
                  onClick={() => handleSelectPatient(patient)}
                >
                  {/* Name + avatar */}
                  <div className="patient-list-main">
                    <div className="patient-list-avatar">
                      {(patient.first_name?.[0] || "P").toUpperCase()}
                    </div>
                    <div>
                      <div className="patient-list-name">
                        {patient.first_name} {patient.last_name}
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
                      onClick={() => handleDeletePatient(patient.id)}
                      disabled={loading}
                    >
                      <FaTrash /> Delete
                    </button>
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

      {false && selectedPatient && (
        <section className="content-panel">
          <div className="content-panel-header">
            <div>
              <h4>Selected Patient</h4>
              <p>Quick view of the currently selected patient record.</p>
            </div>

            <span className="badge text-bg-success">Selected</span>
          </div>

          <div className="patient-detail-grid">
            <DetailItem
              label="Name"
              value={`${selectedPatient.first_name || ""} ${
                selectedPatient.last_name || ""
              }`.trim()}
            />

            <DetailItem label="DOB" value={selectedPatient.dob} />
            <DetailItem label="Gender" value={selectedPatient.gender} />
            <DetailItem label="Phone" value={selectedPatient.phone} />
            <DetailItem
              label="Secondary Phone"
              value={selectedPatient.secondary_phone}
            />

            <DetailItem
              label="Address"
              value={`${selectedPatient.address || ""}, ${
                selectedPatient.city || ""
              } ${selectedPatient.state || ""} ${
                selectedPatient.zip_code || ""
              }`.trim()}
            />

            <DetailItem label="Insurance" value={selectedPatient.insurance} />
            <DetailItem label="Member ID" value={selectedPatient.member_id} />
            <DetailItem
              label="Policy Number"
              value={selectedPatient.policy_number}
            />

            <DetailItem
              label="Requires Auth"
              value={selectedPatient.requires_auth ? "Yes" : "No"}
            />

            <DetailItem
              label="Copay Required"
              value={selectedPatient.copay_required ? "Yes" : "No"}
            />

            <DetailItem
              label="Default Service"
              value={selectedPatient.default_service_level}
            />

            <DetailItem label="Weight" value={selectedPatient.weight} />

            <DetailItem
              label="Oxygen Required"
              value={selectedPatient.oxygen_required ? "Yes" : "No"}
            />

            <DetailItem
              label="Stairs"
              value={selectedPatient.stairs ? "Yes" : "No"}
            />

            <DetailItem label="Facility" value={selectedPatient.facility_name} />
            <DetailItem label="Room" value={selectedPatient.room_number} />

            <DetailItem
              label="Emergency Contact"
              value={`${selectedPatient.emergency_contact_name || ""} ${
                selectedPatient.emergency_contact_phone || ""
              }`.trim()}
            />

            <DetailItem label="Notes" value={selectedPatient.notes} />
          </div>
        </section>
      )}

      {false && selectedPatient && (
        <section className="content-panel">
          <div className="content-panel-header">
            <div>
              <h4>Patient Call History</h4>
              <p>Previous calls linked to the selected patient.</p>
            </div>

            <span className="badge text-bg-secondary">
              {patientCalls.length}
            </span>
          </div>

          {patientCalls.length === 0 ? (
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
                    <div className="patient-call-date">
                      {call.date_of_call || "—"}
                    </div>

                    <div className="patient-call-muted">
                      Trip: {call.trip_date || "—"} {" "}
                      {call.pickup_time ? `at ${call.pickup_time}` : ""}
                    </div>
                  </div>

                  <div>
                    <div className="patient-call-label">Route</div>
                    <div>
                      {call.pickup_address || "—"} → {call.dropoff_address || "—"}
                    </div>
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
            <DetailItem label="Weight" value={selectedPatient.weight} />
            <DetailItem label="Oxygen Required" value={selectedPatient.oxygen_required ? "Yes" : "No"} />
            <DetailItem label="Stairs" value={selectedPatient.stairs ? "Yes" : "No"} />
            <DetailItem label="Facility" value={selectedPatient.facility_name} />
            <DetailItem label="Room" value={selectedPatient.room_number} />
            <DetailItem label="Emergency Contact" value={`${selectedPatient.emergency_contact_name || ""} ${selectedPatient.emergency_contact_phone || ""}`.trim()} />
            <DetailItem label="Notes" value={selectedPatient.notes} />
            <div style={{ gridColumn: "1 / -1", marginTop: 8, display: "flex", gap: 8 }}>
              <button
                type="button"
                className="btn btn-sm btn-outline-warning"
                onClick={() => { setEditingPatientId(selectedPatient.id); setNewPatient({ first_name: selectedPatient.first_name || "", last_name: selectedPatient.last_name || "", dob: selectedPatient.dob || "", gender: selectedPatient.gender || "", phone: selectedPatient.phone || "", secondary_phone: selectedPatient.secondary_phone || "", address: selectedPatient.address || "", city: selectedPatient.city || "", state: selectedPatient.state || "", zip_code: selectedPatient.zip_code || "", insurance: selectedPatient.insurance || "", member_id: selectedPatient.member_id || "", policy_number: selectedPatient.policy_number || "", requires_auth: selectedPatient.requires_auth || false, copay_required: selectedPatient.copay_required || false, insurance_notes: selectedPatient.insurance_notes || "", default_service_level: selectedPatient.default_service_level || "", weight: selectedPatient.weight || "", oxygen_required: selectedPatient.oxygen_required || false, stairs: selectedPatient.stairs || false, special_equipment_notes: selectedPatient.special_equipment_notes || "", facility_name: selectedPatient.facility_name || "", room_number: selectedPatient.room_number || "", emergency_contact_name: selectedPatient.emergency_contact_name || "", emergency_contact_phone: selectedPatient.emergency_contact_phone || "", notes: selectedPatient.notes || "" }); setShowPatientForm(true); setDrawerTab("edit"); }}
              >
                <FaEdit style={{ marginRight: 4 }} /> Edit Patient
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline-danger"
                onClick={() => handleDeletePatient(selectedPatient.id)}
              >
                <FaTrash style={{ marginRight: 4 }} /> Delete
              </button>
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
                    <div className="patient-call-muted">Trip: {call.trip_date || "—"} {call.pickup_time ? `at ${call.pickup_time}` : ""}</div>
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

        {drawerTab === "edit" && (
          <form id="patient-drawer-form" onSubmit={handleCreatePatient}>
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
