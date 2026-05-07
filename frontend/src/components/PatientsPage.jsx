import React, { useState } from "react";
import { getPatients, createPatient, deletePatient } from "../api/patientsApi";

// Main patient management component.
// This component uses the Flask backend as the data source.
// Search filtering is handled by the backend through query parameters.
const PatientsPage = () => {
  // Search input for patient name.
  const [searchName, setSearchName] = useState("");

  // Search input for patient date of birth.
  const [searchDob, setSearchDob] = useState("");

  // New patient form state.
  const [newPatient, setNewPatient] = useState({
    first_name: "",
    last_name: "",
    dob: "",
    phone: "",
    address: "",
  });

  // Patient records returned from the backend.
  const [patients, setPatients] = useState([]);

  // Loading state for API requests.
  const [loading, setLoading] = useState(false);

  // Error message state.
  const [error, setError] = useState("");

  // Tracks whether the user has performed a search or clicked Show All.
  const [hasSearched, setHasSearched] = useState(false);

  // Stores the currently selected patient from the results table.
  const [selectedPatient, setSelectedPatient] = useState(null);

  // Handles changes in the Add New Patient form.
  const handleNewPatientChange = (e) => {
    const { name, value } = e.target;

    setNewPatient((prevPatient) => ({
      ...prevPatient,
      [name]: value,
    }));
  };

  // Creates a new patient record through the backend API.
  const handleCreatePatient = async (e) => {
    e.preventDefault();

    setError("");
    setLoading(true);

    try {
      const createdPatient = await createPatient(newPatient);

      setNewPatient({
        first_name: "",
        last_name: "",
        dob: "",
        phone: "",
        address: "",
      });

      setHasSearched(true);
      setSelectedPatient(createdPatient);

      // Reload patient list after successful creation.
      const updatedPatients = await getPatients();
      setPatients(updatedPatients);
    } catch (err) {
      setError(err.message || "Failed to create patient.");
    } finally {
      setLoading(false);
    }
  };

  // Handles patient search by sending filters to the backend API.
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

  // Loads and displays all patient records from the backend.
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
      setPatients([]);
      setSelectedPatient(null);
    } finally {
      setLoading(false);
    }
  };

  // Deletes a patient record through the backend API.
  const handleDeletePatient = async (id) => {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this patient?"
    );

    if (!confirmDelete) return;

    setError("");
    setLoading(true);

    try {
      await deletePatient(id);

      // Reload patient list after successful deletion.
      const updatedPatients = await getPatients();
      setPatients(updatedPatients);

      // Clear selected patient if the deleted patient was selected.
      if (selectedPatient?.id === id) {
        setSelectedPatient(null);
      }

      setHasSearched(true);
    } catch (err) {
      setError(err.message || "Failed to delete patient.");
    } finally {
      setLoading(false);
    }
  };

  // Clears search fields, results, errors, and selected patient preview.
  const handleClear = () => {
    setSearchName("");
    setSearchDob("");
    setPatients([]);
    setError("");
    setHasSearched(false);
    setSelectedPatient(null);
  };

  // Stores selected patient for preview and future integration with the call form.
  const handleSelectPatient = (patient) => {
    setSelectedPatient(patient);
  };

  return (
    <div className="container mt-4">
      {/* Informational block for users */}
      <div className="alert alert-info mb-4">
        <h5 className="mb-2">Patients Page</h5>
        <p className="mb-2">
          This page is used to create, search, review, and delete patient records
          before future integration with the Call Taking Form.
        </p>
        <p className="mb-0">
          This section is connected to the Flask backend and uses patient records
          from the local database.
        </p>
      </div>

      {/* Create patient form */}
      <div className="card shadow-sm p-3 mb-4">
        <h4 className="mb-3">Add New Patient</h4>

        <form onSubmit={handleCreatePatient}>
          <div className="row">
            <div className="col-md-6 mb-3">
              <label className="form-label">First Name *</label>
              <input
                type="text"
                name="first_name"
                className="form-control"
                value={newPatient.first_name}
                onChange={handleNewPatientChange}
                disabled={loading}
                required
              />
            </div>

            <div className="col-md-6 mb-3">
              <label className="form-label">Last Name *</label>
              <input
                type="text"
                name="last_name"
                className="form-control"
                value={newPatient.last_name}
                onChange={handleNewPatientChange}
                disabled={loading}
                required
              />
            </div>

            <div className="col-md-4 mb-3">
              <label className="form-label">Date of Birth</label>
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
              <label className="form-label">Phone</label>
              <input
                type="text"
                name="phone"
                className="form-control"
                value={newPatient.phone}
                onChange={handleNewPatientChange}
                disabled={loading}
              />
            </div>

            <div className="col-md-4 mb-3">
              <label className="form-label">Address</label>
              <input
                type="text"
                name="address"
                className="form-control"
                value={newPatient.address}
                onChange={handleNewPatientChange}
                disabled={loading}
              />
            </div>
          </div>

          <button type="submit" className="btn btn-success" disabled={loading}>
            {loading ? "Saving..." : "Add Patient"}
          </button>
        </form>
      </div>

      <h2 className="mb-4">Search Patients</h2>

      {/* Search form */}
      <form onSubmit={handleSearch} className="card shadow-sm p-3 mb-4">
        <div className="row">
          <div className="col-md-6 mb-3">
            <label className="form-label">Name</label>
            <input
              type="text"
              placeholder="Enter patient name"
              className="form-control"
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="col-md-6 mb-3">
            <label className="form-label">Date of Birth</label>
            <input
              type="date"
              className="form-control"
              value={searchDob}
              onChange={(e) => setSearchDob(e.target.value)}
              disabled={loading}
            />
          </div>
        </div>

        <div className="d-flex gap-2 flex-wrap">
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? "Searching..." : "Search"}
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
            className="btn btn-outline-secondary"
            onClick={handleClear}
            disabled={loading}
          >
            Clear
          </button>
        </div>
      </form>

      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}

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
        <div className="alert alert-warning">
          No patients found for the given search criteria.
        </div>
      )}

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

      {patients.length > 0 && (
        <div className="card shadow-sm">
          <div className="card-body">
            <h5 className="card-title mb-3">Search Results</h5>

            <div className="table-responsive">
              <table className="table table-bordered table-hover align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Full Name</th>
                    <th>DOB</th>
                    <th>Phone Nr.</th>
                    <th>Address</th>
                    <th style={{ width: "180px" }}>Action</th>
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
                          <div className="d-flex gap-2">
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
                              className="btn btn-sm btn-outline-danger"
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