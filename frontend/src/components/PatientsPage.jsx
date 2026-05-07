import React, { useState } from "react";
import {
  getPatients,
  createPatient,
  updatePatient,
  deletePatient,
} from "../api/patientsApi";

// Main patient management component.
const PatientsPage = () => {
  const [searchName, setSearchName] = useState("");
  const [searchDob, setSearchDob] = useState("");

  const [newPatient, setNewPatient] = useState({
    first_name: "",
    last_name: "",
    dob: "",
    phone: "",
    address: "",
  });

  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [editingPatientId, setEditingPatientId] = useState(null);

  // Reset the add/edit patient form.
  const resetPatientForm = () => {
    setNewPatient({
      first_name: "",
      last_name: "",
      dob: "",
      phone: "",
      address: "",
    });

    setEditingPatientId(null);
  };

  // Handle form changes.
  const handleNewPatientChange = (e) => {
    const { name, value } = e.target;

    setNewPatient((prev) => ({
      ...prev,
      [name]: value,
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
      phone: patient.phone || "",
      address: patient.address || "",
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
      {/* Add / edit patient form */}
      <div className="card shadow-sm p-3 mb-4">
        <h4 className="mb-3">
          {editingPatientId ? "Edit Patient" : "Add New Patient"}
        </h4>

        <form onSubmit={handleCreatePatient}>
          <div className="row">
            <div className="col-md-6 mb-3">
              <input
                name="first_name"
                className="form-control"
                placeholder="First Name"
                value={newPatient.first_name}
                onChange={handleNewPatientChange}
                disabled={loading}
                required
              />
            </div>

            <div className="col-md-6 mb-3">
              <input
                name="last_name"
                className="form-control"
                placeholder="Last Name"
                value={newPatient.last_name}
                onChange={handleNewPatientChange}
                disabled={loading}
                required
              />
            </div>

            <div className="col-md-4 mb-3">
              <input
                type="date"
                name="dob"
                className="form-control"
                value={newPatient.dob}
                onChange={handleNewPatientChange}
                disabled={loading}
              />
            </div>

            <div className="col-md-4 mb-3">
              <input
                name="phone"
                className="form-control"
                placeholder="Phone"
                value={newPatient.phone}
                onChange={handleNewPatientChange}
                disabled={loading}
              />
            </div>

            <div className="col-md-4 mb-3">
              <input
                name="address"
                className="form-control"
                placeholder="Address"
                value={newPatient.address}
                onChange={handleNewPatientChange}
                disabled={loading}
              />
            </div>
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

      {/* Search block */}
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

      {/* Selected patient preview */}
      {selectedPatient && (
        <div className="card border-success shadow-sm mb-4">
          <div className="card-body">
            <h5 className="card-title text-success mb-3">Selected Patient</h5>

            <p className="mb-1">
              <strong>Name:</strong> {selectedPatient.first_name}{" "}
              {selectedPatient.last_name}
            </p>

            <p className="mb-1">
              <strong>DOB:</strong> {selectedPatient.dob || "—"}
            </p>

            <p className="mb-1">
              <strong>Phone:</strong> {selectedPatient.phone || "—"}
            </p>

            <p className="mb-0">
              <strong>Address:</strong> {selectedPatient.address || "—"}
            </p>
          </div>
        </div>
      )}

      {/* Results table */}
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
                    <th>Address</th>
                    <th style={{ width: "230px" }}>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {patients.map((patient) => {
                    const isSelected = selectedPatient?.id === patient.id;

                    return (
                      <tr key={patient.id}>
                        <td>
                          {patient.first_name} {patient.last_name}
                        </td>
                        <td>{patient.dob || "—"}</td>
                        <td>{patient.phone || "—"}</td>
                        <td>{patient.address || "—"}</td>
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