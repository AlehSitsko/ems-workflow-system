import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { FaSearch, FaTimes } from "react-icons/fa";

import { getVehicles } from "../../api/vehiclesApi";
import { VehicleTypeBadge } from "../../components/taxonomy/TaxonomyBadges";
import { hasFleetEditAccess } from "../../api/authApi";

// Fleet vehicle list — the entry point to the Vehicle Workspace.
//
// Search/filter state lives in the URL, so the list is shareable and the
// workspace can send the user back to exactly the view they left
// (EntityWorkspace restores it from location state).
export default function VehiclesListPage({ currentUser }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const search = searchParams.get("search") || "";
  const status = searchParams.get("status") || "all"; // all | active | inactive

  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const canEdit = hasFleetEditAccess(currentUser);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    getVehicles()
      .then((data) => { if (!cancelled) setVehicles(Array.isArray(data) ? data : []); })
      .catch((err) => { if (!cancelled) setError(err.message || "Failed to load vehicles"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const setFilter = (patch) => {
    const next = { search, status, ...patch };
    const params = {};
    if (next.search) params.search = next.search;
    if (next.status && next.status !== "all") params.status = next.status;
    setSearchParams(params, { replace: true });
  };

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return vehicles.filter((v) => {
      if (status === "active" && !v.isActive) return false;
      if (status === "inactive" && v.isActive) return false;
      if (!term) return true;
      return [v.unitName, v.unitNumber, v.unitType]
        .some((field) => String(field || "").toLowerCase().includes(term));
    });
  }, [vehicles, search, status]);

  // Hand the current list query string to the workspace so its back link
  // returns here with the same filters applied.
  const openVehicle = (id) =>
    navigate(`/fleet/vehicles/${id}`, { state: { listSearch: location.search } });

  return (
    <div className="page-stack">
      <section className="content-panel">
        <div className="content-panel-header">
          <div>
            <h4>Vehicles</h4>
            <p>
              The physical fleet. A vehicle is not the same thing as a daily crew
              unit — units are planned per shift on the Crew Planner.
            </p>
          </div>
        </div>

        <div className="row g-3">
          <div className="col-md-6">
            <label className="form-label">Search</label>
            <input
              className="form-control"
              placeholder="Unit name, number, or type"
              value={search}
              onChange={(e) => setFilter({ search: e.target.value })}
            />
          </div>
          <div className="col-md-4">
            <label className="form-label">Status</label>
            <select
              className="form-select"
              value={status}
              onChange={(e) => setFilter({ status: e.target.value })}
            >
              <option value="all">All</option>
              <option value="active">Active only</option>
              <option value="inactive">Inactive only</option>
            </select>
          </div>
          <div className="col-md-2 d-flex align-items-end">
            {(search || status !== "all") && (
              <button
                type="button"
                className="btn btn-outline-secondary d-inline-flex align-items-center gap-2"
                onClick={() => setSearchParams({}, { replace: true })}
              >
                <FaTimes /> Clear
              </button>
            )}
          </div>
        </div>

        {error && <div className="alert alert-danger mt-3 mb-0" role="alert">{error}</div>}
        {loading && <p className="text-muted mt-3 mb-0">Loading vehicles…</p>}
      </section>

      {!loading && !error && (
        <section className="content-panel">
          <div className="content-panel-header">
            <div>
              <h4>{visible.length} of {vehicles.length} vehicles</h4>
              {!canEdit && <p>Read-only — fleet changes require a supervisor.</p>}
            </div>
          </div>

          {visible.length === 0 ? (
            <div className="empty-state">
              <FaSearch />
              <h5>No vehicles found</h5>
              <p>Try a different search or status filter.</p>
            </div>
          ) : (
            <div className="fleet-list">
              {visible.map((v) => (
                <div
                  key={v.id}
                  className="fleet-list-card"
                  role="button"
                  tabIndex={0}
                  aria-label={`Unit ${v.unitNumber} ${v.unitName}, ${v.unitType}, ${v.isActive ? "active" : "inactive"}`}
                  onClick={() => openVehicle(v.id)}
                  onKeyDown={(e) => { if (e.key === "Enter") openVehicle(v.id); }}
                >
                  <div>
                    <div className="fleet-list-name">{v.unitName}</div>
                    <div className="fleet-list-muted">Unit {v.unitNumber}</div>
                  </div>
                  <VehicleTypeBadge value={v.unitType} />
                  <span className={`fleet-status ${v.isActive ? "active" : "inactive"}`}>
                    {v.isActive ? "Active" : "Inactive"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
