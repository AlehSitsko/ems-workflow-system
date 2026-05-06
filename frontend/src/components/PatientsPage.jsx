import React, { useState } from 'react';
import { getPatients } from '../api/patientsApi';

// Main patient search component.
// This component now uses the Flask backend instead of temporary mock data.
const PatientsPage = () => {
  // Search input for patient name
  const [searchName, setSearchName] = useState('');

  // Search input for patient date of birth
  const [searchDob, setSearchDob] = useState('');

  // Patient records returned from the backend and filtered by search criteria
  const [patients, setPatients] = useState([]);

  // Loading state for API requests
  const [loading, setLoading] = useState(false);

  // Error message state
  const [error, setError] = useState('');

  // Tracks whether the user has performed a search or clicked Show All
  const [hasSearched, setHasSearched] = useState(false);

  // Stores the currently selected patient from the results table
  const [selectedPatient, setSelectedPatient] = useState(null);

  // Handles patient search by loading records from the backend
  // and filtering them on the frontend by name and/or DOB.
  const handleSearch = async (e) => {
    e.preventDefault();

    setError('');
    setHasSearched(true);
    setLoading(true);

    try {
      // Prevent empty searches from returning all records automatically.
      if (!searchName.trim() && !searchDob.trim()) {
        setError('Please enter a patient name or date of birth.');
        setPatients([]);
        setSelectedPatient(null);
        return;
      }

      // Load all patients from the backend API.
      const allPatients = await getPatients();

      // Normalize search values for comparison.
      const normalizedName = searchName.trim().toLowerCase();
      const normalizedDob = searchDob.trim();

      // Filter backend data by name and/or DOB.
      const filteredPatients = allPatients.filter((patient) => {
        const fullName = `${patient.first_name} ${patient.last_name}`.toLowerCase();
        const lastName = patient.last_name.toLowerCase();

        const matchesName =
          !normalizedName ||
          fullName.includes(normalizedName) ||
          lastName.includes(normalizedName);

        const matchesDob =
          !normalizedDob || patient.dob === normalizedDob;

        return matchesName && matchesDob;
      });

      setPatients(filteredPatients);
      setSelectedPatient(null);
    } catch (err) {
      console.error('Search error:', err);
      setError('Failed to search patients.');
      setPatients([]);
      setSelectedPatient(null);
    } finally {
      setLoading(false);
    }
  };

  // Loads and displays all patient records from the backend.
  const handleShowAll = async () => {
    setError('');
    setHasSearched(true);
    setLoading(true);

    try {
      const data = await getPatients();
      setPatients(data);
      setSelectedPatient(null);
    } catch (err) {
      console.error('Load patients error:', err);
      setError('Failed to load patients.');
      setPatients([]);
      setSelectedPatient(null);
    } finally {
      setLoading(false);
    }
  };

  // Clears search fields, results, errors, and selected patient preview.
  const handleClear = () => {
    setSearchName('');
    setSearchDob('');
    setPatients([]);
    setError('');
    setHasSearched(false);
    setSelectedPatient(null);
  };

  // Stores selected patient for preview and future integration with the call form.
  const handleSelectPatient = (patient) => {
    setSelectedPatient(patient);
    console.log('Selected patient:', patient);
  };

  return (
    <div className="container mt-4">
      {/* Informational block for users */}
      <div className="alert alert-info mb-4">
        <h5 className="mb-2">Patients Page</h5>
        <p className="mb-2">
          This page is used to search and review patient records before future
          integration with the Call Taking Form.
        </p>
        <p className="mb-0">
          This section is now connected to the Flask backend and uses real patient
          records from the local database.
        </p>
      </div>

      {/* Page title */}
      <h2 className="mb-4">Search Patients</h2>

      {/* Search form */}
      <form onSubmit={handleSearch} className="card shadow-sm p-3 mb-4">
        <div className="row">
          {/* Patient name search field */}
          <div className="col-md-6 mb-3">
            <label className="form-label">Name</label>
            <input
              type="text"
              placeholder="Enter patient name"
              className="form-control"
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
            />
          </div>

          {/* Patient DOB search field */}
          <div className="col-md-6 mb-3">
            <label className="form-label">Date of Birth</label>
            <input
              type="date"
              className="form-control"
              value={searchDob}
              onChange={(e) => setSearchDob(e.target.value)}
            />
          </div>
        </div>

        {/* Form action buttons */}
        <div className="d-flex gap-2 flex-wrap">
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Searching...' : 'Search'}
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

      {/* Error message */}
      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}

      {/* Empty state before first search or Show All action */}
      {!hasSearched && !loading && (
        <div className="alert alert-info">
          Enter a patient name, date of birth, or both, then click Search.
          You can also use Show All.
        </div>
      )}

      {/* Empty state after search with no results */}
      {hasSearched && !loading && !error && patients.length === 0 && (
        <div className="alert alert-warning">
          No patients found for the given search criteria.
        </div>
      )}

      {/* Selected patient preview */}
      {selectedPatient && (
        <div className="card border-success shadow-sm mb-4">
          <div className="card-body">
            <h5 className="card-title text-success mb-3">Selected Patient</h5>

            <p className="mb-1">
              <strong>Name:</strong> {selectedPatient.first_name}{' '}
              {selectedPatient.last_name}
            </p>

            <p className="mb-1">
              <strong>DOB:</strong> {selectedPatient.dob || '—'}
            </p>

            <p className="mb-1">
              <strong>Phone:</strong> {selectedPatient.phone || '—'}
            </p>

            <p className="mb-0">
              <strong>Address:</strong> {selectedPatient.address || '—'}
            </p>
          </div>
        </div>
      )}

      {/* Results table */}
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
                    <th style={{ width: '120px' }}>Action</th>
                  </tr>
                </thead>

                <tbody>
                  {patients.map((p) => {
                    const isSelected = selectedPatient?.id === p.id;

                    return (
                      <tr key={p.id}>
                        <td>
                          {p.first_name} {p.last_name}
                        </td>

                        <td>{p.dob || '—'}</td>
                        <td>{p.phone || '—'}</td>
                        <td>{p.address || '—'}</td>

                        <td>
                          <button
                            type="button"
                            className={`btn btn-sm ${
                              isSelected ? 'btn-success' : 'btn-outline-primary'
                            }`}
                            onClick={() => handleSelectPatient(p)}
                          >
                            {isSelected ? 'Selected' : 'Select'}
                          </button>
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