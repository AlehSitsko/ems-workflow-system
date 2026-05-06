import React, { useState } from 'react';

// Temporary mock patient data for frontend testing.
// This replaces backend requests until the real API is ready.
const mockPatients = [
  {
    id: 1,
    first_name: 'John',
    last_name: 'Carter',
    dob: '1980-05-12',
    phone: '555-111-2222',
    insurance: 'Aetna',
  },
  {
    id: 2,
    first_name: 'Mary',
    last_name: 'Carter',
    dob: '1975-11-03',
    phone: '555-333-4444',
    insurance: 'United Healthcare',
  },
  {
    id: 3,
    first_name: 'James',
    last_name: 'Wilson',
    dob: '1990-01-20',
    phone: '555-555-6666',
    insurance: 'Blue Cross',
  },
  {
    id: 4,
    first_name: 'Anna',
    last_name: 'Lee',
    dob: '1968-09-14',
    phone: '555-777-8888',
    insurance: 'Medicare',
  },
  {
    id: 5,
    first_name: 'Michael',
    last_name: 'Brown',
    dob: '1987-04-09',
    phone: '555-999-0000',
    insurance: '',
  },
];

// Main patient search component.
// This version uses local mock data instead of backend fetch requests.
// Useful for testing UI, search logic, and future patient selection flow.
const PatientsPage = () => {
  // Search field for patient name
  const [searchName, setSearchName] = useState('');

  // Search field for patient date of birth
  const [searchDob, setSearchDob] = useState('');

  // Filtered patient results shown in the table
  const [patients, setPatients] = useState([]);

  // Loading state for search simulation
  const [loading, setLoading] = useState(false);

  // Error message state
  const [error, setError] = useState('');

  // Tracks whether a search-related action has already been performed
  const [hasSearched, setHasSearched] = useState(false);

  // Stores the currently selected patient from the result table
  const [selectedPatient, setSelectedPatient] = useState(null);

  // Handle patient search form submission
  const handleSearch = (e) => {
    e.preventDefault();

    // Reset previous messages and states
    setError('');
    setHasSearched(true);
    setLoading(true);

    try {
      // Prevent empty search from returning the full list automatically
      if (!searchName.trim() && !searchDob.trim()) {
        setError('Please enter a patient name or date of birth.');
        setPatients([]);
        setSelectedPatient(null);
        setLoading(false);
        return;
      }

      // Normalize input values for comparison
      const normalizedName = searchName.trim().toLowerCase();
      const normalizedDob = searchDob.trim();

      // Filter mock patients by name and/or DOB
      const filteredPatients = mockPatients.filter((patient) => {
        // Full name used for broad matching
        const fullName =
          `${patient.first_name} ${patient.last_name}`.toLowerCase();

        // Last name used for more direct matching
        const lastName = patient.last_name.toLowerCase();

        // Match by full name or last name
        const matchesName =
          !normalizedName ||
          fullName.includes(normalizedName) ||
          lastName.includes(normalizedName);

        // Match exact DOB
        const matchesDob = !normalizedDob || patient.dob === normalizedDob;

        // Both conditions must pass
        return matchesName && matchesDob;
      });

      // Save filtered results
      setPatients(filteredPatients);

      // Reset selected patient after a new search
      setSelectedPatient(null);
    } catch (err) {
      console.error('Search error:', err);
      setError('Failed to search patients.');
      setPatients([]);
      setSelectedPatient(null);
    } finally {
      // End loading state
      setLoading(false);
    }
  };

  // Show all mock patients without requiring search criteria
  const handleShowAll = () => {
    setError('');
    setHasSearched(true);
    setLoading(false);
    setPatients(mockPatients);
    setSelectedPatient(null);
  };

  // Clear search form, results, errors, and selected patient
  const handleClear = () => {
    setSearchName('');
    setSearchDob('');
    setPatients([]);
    setError('');
    setHasSearched(false);
    setSelectedPatient(null);
  };

  // Handle row selection from the search result table
  const handleSelectPatient = (patient) => {
    setSelectedPatient(patient);

    // Placeholder for future integration.
    // Later this can send patient data to CallForm or shared state.
    console.log('Selected patient:', patient);
  };

  return (
    <div className="container mt-4">
      {/* Informational block for users */}
      <div className="alert alert-info mb-4">
        <h5 className="mb-2">Patients Page</h5>
        <p className="mb-2">
          This page is used to search and review patient records before future
          integration with the Call Taking Form and backend database.
        </p>
        <p className="mb-2">
          At the current stage, this section works with temporary mock patient
          records for frontend testing only. No real backend connection is active yet.
        </p>
        <ul className="mb-0">
          <li>Search by patient name, date of birth, or both.</li>
          <li>Use Show All to display all temporary test patients.</li>
          <li>Select a patient from the table to preview their information.</li>
          <li>
            Later this page will connect to the real patient database and support
            linking a selected patient to the Call Taking Form.
          </li>
        </ul>
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
          >
            Show All
          </button>

          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={handleClear}
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

      {/* Empty state before first action */}
      {!hasSearched && !loading && (
        <div className="alert alert-info">
          Enter a patient name, date of birth, or both, then click Search. You can also use Show All.
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
              <strong>Insurance:</strong> {selectedPatient.insurance || '—'}
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
                    <th>Insurance</th>
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
                        <td>{p.insurance || '—'}</td>
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