import { FaPlus, FaSearch } from "react-icons/fa";

import { PageHeader, PageToolbar, ToolbarField } from "../ui/Page";
import { EmptyState, ErrorState } from "../ui/States";

// Patient search panel: page header + Add button, the search form (name / DOB /
// show-archived), and the search-state messages. Presentational — all state and
// handlers come from the usePatients hook via props.
//
// This is a search band, not a filter band: Search and Show All are distinct
// actions (a targeted query vs "load everything"), so they stay as explicit
// buttons rather than filters that apply on change.
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
  <>
    <PageHeader
      title="Patients"
      description="Find patient records by name, date of birth, or load all records."
      actions={(
        <button
          type="button"
          className="btn btn-primary"
          onClick={onShowAddForm}
          disabled={loading}
        >
          <FaPlus aria-hidden="true" /> Add Patient
        </button>
      )}
    />

    <form onSubmit={onSearch}>
      <PageToolbar onClear={onClear} canClear={!!(searchName || searchDob || hasSearched)}>
        <ToolbarField label="Patient name" grow>
          <input
            className="form-control"
            placeholder="Search by first or last name"
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            disabled={loading}
          />
        </ToolbarField>

        <ToolbarField label="Date of birth">
          <input
            type="date"
            className="form-control"
            value={searchDob}
            onChange={(e) => setSearchDob(e.target.value)}
            disabled={loading}
          />
        </ToolbarField>

        <ToolbarField label="&nbsp;">
          <div className="d-flex gap-2">
            <button type="submit" className="btn btn-primary" disabled={loading}>
              <FaSearch aria-hidden="true" /> Search
            </button>
            <button type="button" className="btn btn-outline-secondary" onClick={onShowAll} disabled={loading}>
              Show All
            </button>
          </div>
        </ToolbarField>

        <ToolbarField label="Archived">
          <div className="form-check form-switch toolbar-switch">
            <input
              type="checkbox"
              className="form-check-input"
              role="switch"
              id="show-archived-toggle"
              checked={showArchived}
              onChange={onToggleShowArchived}
              disabled={loading}
            />
            <label className="form-check-label" htmlFor="show-archived-toggle">
              Show archived
            </label>
          </div>
        </ToolbarField>
      </PageToolbar>
    </form>

    {error && <div className="mb-3"><ErrorState message={error} /></div>}

    {loading && <p className="text-muted">Loading patient records…</p>}

    {!hasSearched && !loading && !error && (
      <EmptyState
        variant="empty"
        title="Search for a patient"
        description="Enter a name, a date of birth, or both — or use Show All to load every record."
      />
    )}

    {hasSearched && !loading && !error && patientsCount === 0 && (
      <EmptyState
        variant="no-results"
        title="No patients found"
        description="No records match this search. Try a different name or date of birth."
      />
    )}
  </>
);

export default PatientToolbar;
