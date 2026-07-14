import { FaPlus, FaSearch, FaTimes } from "react-icons/fa";

// Patient search panel: header + Add button, the search form (name / DOB /
// show-archived), and the status alerts. Extracted from PatientsPage.jsx
// (decomposition phase 3). Presentational — all state and handlers come from
// the usePatients hook via props.
const PatientToolbar = ({
  loading,
  error,
  hasSearched,
  patientsCount,
  searchName,
  setSearchName,
  searchDob,
  setSearchDob,
  showArchived,
  onShowAddForm,
  onSearch,
  onShowAll,
  onClear,
  onToggleShowArchived,
}) => (
  <section className="content-panel">
    <div className="content-panel-header">
      <div>
        <h4>Patient Search</h4>
        <p>Find patient records by name, date of birth, or load all records.</p>
      </div>

      <button
        type="button"
        className="btn btn-sm btn-primary d-inline-flex align-items-center gap-1"
        onClick={onShowAddForm}
        disabled={loading}
      >
        <FaPlus />
        Add Patient
      </button>
    </div>

    <form onSubmit={onSearch}>
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
            onClick={onShowAll}
            disabled={loading}
          >
            Show All
          </button>

          <button
            type="button"
            className="btn btn-outline-secondary d-inline-flex align-items-center gap-2"
            onClick={onClear}
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
              onChange={onToggleShowArchived}
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

    {hasSearched && !loading && !error && patientsCount === 0 && (
      <div className="alert alert-warning mt-3 mb-0">
        No patients found.
      </div>
    )}
  </section>
);

export default PatientToolbar;
