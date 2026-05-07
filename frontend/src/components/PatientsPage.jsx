import React, { useState } from "react";
import {
  getPatients,
  createPatient,
  updatePatient,
  deletePatient,
} from "../api/patientsApi";

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

// Main patient management component.
const PatientsPage = () => {
  const [searchName, setSearchName] = useState("");
  const [searchDob, setSearchDob] = useState("");

  const [newPatient, setNewPatient] = useState(emptyPatient);
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [editingPatientId, setEditingPatientId] = useState(null);

  // Reset the add/edit patient form.
  const resetPatientForm = () => {
    setNewPatient(emptyPatient);
    setEditingPatientId(null);
  };

  // Handle text, select, and checkbox field changes.
  const handleNewPatientChange = (e) => {
    const { name, value, type, checked } = e.target;

    setNewPatient((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
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

      resetPatientForm();
      setSelectedPatient(savedPatient);
      setHasSearched(true);

      const updatedPatients = await getPatients();
      setPatients(updatedPatients);
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
    setLoading(true);

    try {
      if (!searchName.trim() && !searchDob.trim()) {
        setError("Please enter a patient name or date of birth.");
        setPatients([]);
        setSelectedPatient(null);
        return;
      }

      const filteredPatients = await getPatients({
        name: searchName.trim(),
        dob: searchDob.trim(),
      });

      setPatients(filteredPatients);
      setSelectedPatient(null);
    } catch (err) {
      setError(err.message || "Failed to search patients.");
      setPatients([]);
      setSelectedPatient(null);
    } finally {
      setLoading(false);
    }
  };

  // Load all patients from the backend.
  const handleShowAll = async () => {
    setError("");
    setHasSearched(true);
    setLoading(true);

    try {
      const data = await getPatients();
      setPatients(data);
      setSelectedPatient(null);
    } catch (err) {
      setError(err.message || "Failed to load patients.");
    } finally {
      setLoading(false);
    }
  };

  // Delete a patient record.
  const handleDeletePatient = async (id) => {
    if (!window.confirm("Delete this patient?")) return;

    setError("");
    setLoading(true);

    try {
      await deletePatient(id);

      const updatedPatients = await getPatients();
      setPatients(updatedPatients);

      if (selectedPatient?.id === id) {
        setSelectedPatient(null);
      }

      if (editingPatientId === id) {
        resetPatientForm();
      }
    } catch (err) {
      setError(err.message || "Delete failed.");
    } finally {
      setLoading(false);
    }
  };

  // Select a patient for preview and future call form integration.
  const handleSelectPatient = (patient) => {
    setSelectedPatient(patient);
  };

  // Start editing an existing patient.
  const handleEditPatient = (patient) => {
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
  };

  // Clear search, results, selected patient, and editing mode.
  const handleClear = () => {
    setSearchName("");
    setSearchDob("");
    setPatients([]);
    setError("");
    setHasSearched(false);
    setSelectedPatient(null);
    resetPatientForm();
  };

  return (
    <div className="container mt-4">
      <div className="card shadow-sm p-3 mb-4">
        <h4 className="mb-3">
          {editingPatientId ? "Edit Patient" : "Add New Patient"}
        </h4>

        <form onSubmit={handleCreatePatient}>
          <h5>Basic Information</h5>

          <div className="row">
            <div className="col-md-4 mb-3">
              <input
                name="first_name"
                className="form-control"
                placeholder="First Name *"
                value={newPatient.first_name}
                onChange={handleNewPatientChange}
                disabled={loading}
                required
              />
            </div>

            <div className="col-md-4 mb-3">
              <input
                name="last_name"
                className="form-control"
                placeholder="Last Name *"
                value={newPatient.last_name}
                onChange={handleNewPatientChange}
                disabled={loading}
                required
              />
            </div>

            <div className="col-md-2 mb-3">
              <input
                type="date"
                name="dob"
                className="form-control"
                value={newPatient.dob}
                onChange={handleNewPatientChange}
                disabled={loading}
              />
            </div>

            <div className="col-md-2 mb-3">
              <select
                name="gender"
                className="form-select"
                value={newPatient.gender}
                onChange={handleNewPatientChange}
                disabled={loading}
              >
                <option value="">Gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
                <option value="Unknown">Unknown</option>
              </select>
            </div>
          </div>

          <hr />

          <h5>Contact / Address</h5>

          <div className="row">
            <div className="col-md-4 mb-3">
              <input
                name="phone"
                className="form-control"
                placeholder="Primary Phone"
                value={newPatient.phone}
                onChange={handleNewPatientChange}
                disabled={loading}
              />
            </div>

            <div className="col-md-4 mb-3">
              <input
                name="secondary_phone"
                className="form-control"
                placeholder="Secondary Phone"
                value={newPatient.secondary_phone}
                onChange={handleNewPatientChange}
                disabled={loading}
              />
            </div>

            <div className="col-md-4 mb-3">
              <input
                name="address"
                className="form-control"
                placeholder="Street Address"
                value={newPatient.address}
                onChange={handleNewPatientChange}
                disabled={loading}
              />
            </div>

            <div className="col-md-4 mb-3">
              <input
                name="city"
                className="form-control"
                placeholder="City"
                value={newPatient.city}
                onChange={handleNewPatientChange}
                disabled={loading}
              />
            </div>

            <div className="col-md-4 mb-3">
              <input
                name="state"
                className="form-control"
                placeholder="State"
                value={newPatient.state}
                onChange={handleNewPatientChange}
                disabled={loading}
              />
            </div>

            <div className="col-md-4 mb-3">
              <input
                name="zip_code"
                className="form-control"
                placeholder="ZIP Code"
                value={newPatient.zip_code}
                onChange={handleNewPatientChange}
                disabled={loading}
              />
            </div>
          </div>

          <hr />

          <h5>Insurance</h5>

          <div className="row">
            <div className="col-md-4 mb-3">
              <input
                name="insurance"
                className="form-control"
                placeholder="Insurance Company"
                value={newPatient.insurance}
                onChange={handleNewPatientChange}
                disabled={loading}
              />
            </div>

            <div className="col-md-4 mb-3">
              <input
                name="member_id"
                className="form-control"
                placeholder="Member ID"
                value={newPatient.member_id}
                onChange={handleNewPatientChange}
                disabled={loading}
              />
            </div>

            <div className="col-md-4 mb-3">
              <input
                name="policy_number"
                className="form-control"
                placeholder="Policy Number"
                value={newPatient.policy_number}
                onChange={handleNewPatientChange}
                disabled={loading}
              />
            </div>

            <div className="col-md-6 mb-3">
              <textarea
                name="insurance_notes"
                className="form-control"
                placeholder="Insurance Notes"
                value={newPatient.insurance_notes}
                onChange={handleNewPatientChange}
                disabled={loading}
              />
            </div>

            <div className="col-md-6 mb-3">
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

              <div className="form-check mt-2">
                <input
                  type="checkbox"
                  name="copay_required"
                  className="form-check-input"
                  checked={newPatient.copay_required}
                  onChange={handleNewPatientChange}
                  disabled={loading}
                />
                <label className="form-check-label">Copay Required</label>
              </div>
            </div>
          </div>

          <hr />

          <h5>EMS Details</h5>

          <div className="row">
            <div className="col-md-4 mb-3">
              <select
                name="default_service_level"
                className="form-select"
                value={newPatient.default_service_level}
                onChange={handleNewPatientChange}
                disabled={loading}
              >
                <option value="">Default Service Level</option>
                <option value="BLS">BLS</option>
                <option value="ALS">ALS</option>
                <option value="Wheelchair">Wheelchair</option>
                <option value="Stretcher">Stretcher</option>
              </select>
            </div>

            <div className="col-md-4 mb-3">
              <input
                name="weight"
                className="form-control"
                placeholder="Weight"
                value={newPatient.weight}
                onChange={handleNewPatientChange}
                disabled={loading}
              />
            </div>

            <div className="col-md-4 mb-3">
              <div className="form-check">
                <input
                  type="checkbox"
                  name="oxygen_required"
                  className="form-check-input"
                  checked={newPatient.oxygen_required}
                  onChange={handleNewPatientChange}
                  disabled={loading}
                />
                <label className="form-check-label">Oxygen Required</label>
              </div>

              <div className="form-check mt-2">
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

            <div className="col-md-12 mb-3">
              <textarea
                name="special_equipment_notes"
                className="form-control"
                placeholder="Special Equipment Notes"
                value={newPatient.special_equipment_notes}
                onChange={handleNewPatientChange}
                disabled={loading}
              />
            </div>
          </div>

          <hr />

          <h5>Facility / Emergency Contact</h5>

          <div className="row">
            <div className="col-md-3 mb-3">
              <input
                name="facility_name"
                className="form-control"
                placeholder="Facility Name"
                value={newPatient.facility_name}
                onChange={handleNewPatientChange}
                disabled={loading}
              />
            </div>

            <div className="col-md-3 mb-3">
              <input
                name="room_number"
                className="form-control"
                placeholder="Room Number"
                value={newPatient.room_number}
                onChange={handleNewPatientChange}
                disabled={loading}
              />
            </div>

            <div className="col-md-3 mb-3">
              <input
                name="emergency_contact_name"
                className="form-control"
                placeholder="Emergency Contact Name"
                value={newPatient.emergency_contact_name}
                onChange={handleNewPatientChange}
                disabled={loading}
              />
            </div>

            <div className="col-md-3 mb-3">
              <input
                name="emergency_contact_phone"
                className="form-control"
                placeholder="Emergency Contact Phone"
                value={newPatient.emergency_contact_phone}
                onChange={handleNewPatientChange}
                disabled={loading}
              />
            </div>
          </div>

          <hr />

          <h5>General Notes</h5>

          <div className="mb-3">
            <textarea
              name="notes"
              className="form-control"
              placeholder="General patient notes"
              value={newPatient.notes}
              onChange={handleNewPatientChange}
              disabled={loading}
            />
          </div>

          <div className="d-flex gap-2">
            <button type="submit" className="btn btn-success" disabled={loading}>
              {loading
                ? "Saving..."
                : editingPatientId
                ? "Update Patient"
                : "Add Patient"}
            </button>

            {editingPatientId && (
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={resetPatientForm}
                disabled={loading}
              >
                Cancel Edit
              </button>
            )}
          </div>
        </form>
      </div>

      <form onSubmit={handleSearch} className="card shadow-sm p-3 mb-4">
        <div className="row">
          <div className="col-md-6 mb-3 mb-md-0">
            <input
              className="form-control"
              placeholder="Search Name"
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="col-md-6">
            <input
              type="date"
              className="form-control"
              value={searchDob}
              onChange={(e) => setSearchDob(e.target.value)}
              disabled={loading}
            />
          </div>
        </div>

        <div className="mt-3 d-flex gap-2 flex-wrap">
          <button type="submit" className="btn btn-primary" disabled={loading}>
            Search
          </button>

          <button
            type="button"
            className="btn btn-info"
            onClick={handleShowAll}
            disabled={loading}
          >
            Show All
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleClear}
            disabled={loading}
          >
            Clear
          </button>
        </div>
      </form>

      {error && <div className="alert alert-danger">{error}</div>}

      {!hasSearched && !loading && (
        <div className="alert alert-info">
          Enter a patient name, date of birth, or both, then click Search. You
          can also use Show All.
        </div>
      )}

      {loading && (
        <div className="alert alert-secondary">Loading patient records...</div>
      )}

      {hasSearched && !loading && !error && patients.length === 0 && (
        <div className="alert alert-warning">No patients found.</div>
      )}

      {selectedPatient && (
        <div className="card border-success shadow-sm mb-4">
          <div className="card-body">
            <h5 className="card-title text-success mb-3">Selected Patient</h5>

            <p><strong>Name:</strong> {selectedPatient.first_name} {selectedPatient.last_name}</p>
            <p><strong>DOB:</strong> {selectedPatient.dob || "—"}</p>
            <p><strong>Gender:</strong> {selectedPatient.gender || "—"}</p>
            <p><strong>Phone:</strong> {selectedPatient.phone || "—"}</p>
            <p><strong>Secondary Phone:</strong> {selectedPatient.secondary_phone || "—"}</p>
            <p><strong>Address:</strong> {selectedPatient.address || "—"}, {selectedPatient.city || ""} {selectedPatient.state || ""} {selectedPatient.zip_code || ""}</p>
            <hr />
            <p><strong>Insurance:</strong> {selectedPatient.insurance || "—"}</p>
            <p><strong>Member ID:</strong> {selectedPatient.member_id || "—"}</p>
            <p><strong>Policy Number:</strong> {selectedPatient.policy_number || "—"}</p>
            <p><strong>Requires Auth:</strong> {selectedPatient.requires_auth ? "Yes" : "No"}</p>
            <p><strong>Copay Required:</strong> {selectedPatient.copay_required ? "Yes" : "No"}</p>
            <hr />
            <p><strong>Default Service Level:</strong> {selectedPatient.default_service_level || "—"}</p>
            <p><strong>Weight:</strong> {selectedPatient.weight || "—"}</p>
            <p><strong>Oxygen Required:</strong> {selectedPatient.oxygen_required ? "Yes" : "No"}</p>
            <p><strong>Stairs:</strong> {selectedPatient.stairs ? "Yes" : "No"}</p>
            <hr />
            <p><strong>Facility:</strong> {selectedPatient.facility_name || "—"}</p>
            <p><strong>Room:</strong> {selectedPatient.room_number || "—"}</p>
            <p><strong>Emergency Contact:</strong> {selectedPatient.emergency_contact_name || "—"} {selectedPatient.emergency_contact_phone || ""}</p>
            <p><strong>Notes:</strong> {selectedPatient.notes || "—"}</p>
          </div>
        </div>
      )}

      {patients.length > 0 && (
        <div className="card shadow-sm">
          <div className="card-body">
            <h5 className="card-title mb-3">Patient List</h5>

            <div className="table-responsive">
              <table className="table table-bordered table-hover align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Full Name</th>
                    <th>DOB</th>
                    <th>Phone</th>
                    <th>Insurance</th>
                    <th>Service</th>
                    <th style={{ width: "230px" }}>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {patients.map((patient) => {
                    const isSelected = selectedPatient?.id === patient.id;

                    return (
                      <tr key={patient.id}>
                        <td>{patient.first_name} {patient.last_name}</td>
                        <td>{patient.dob || "—"}</td>
                        <td>{patient.phone || "—"}</td>
                        <td>{patient.insurance || "—"}</td>
                        <td>{patient.default_service_level || "—"}</td>
                        <td>
                          <div className="d-flex gap-2 flex-wrap">
                            <button
                              type="button"
                              className={`btn btn-sm ${
                                isSelected
                                  ? "btn-success"
                                  : "btn-outline-primary"
                              }`}
                              onClick={() => handleSelectPatient(patient)}
                              disabled={loading}
                            >
                              {isSelected ? "Selected" : "Select"}
                            </button>

                            <button
                              type="button"
                              className="btn btn-sm btn-warning"
                              onClick={() => handleEditPatient(patient)}
                              disabled={loading}
                            >
                              Edit
                            </button>

                            <button
                              type="button"
                              className="btn btn-sm btn-danger"
                              onClick={() => handleDeletePatient(patient.id)}
                              disabled={loading}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PatientsPage;