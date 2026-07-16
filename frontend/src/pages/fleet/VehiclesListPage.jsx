import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { FaPlus, FaEye, FaPen, FaArchive, FaTrashRestore } from "react-icons/fa";

import { getVehicles, retireVehicle, unretireVehicle } from "../../api/vehiclesApi";
import { hasFleetEditAccess } from "../../api/authApi";
import { VEHICLE_CAPABILITIES } from "../../utils/taxonomy";
import { daysUntil } from "../../utils/dateDisplay";
import { PageHeader, PageToolbar, ToolbarField, SearchInput } from "../../components/ui/Page";
import { EntityGrid, Pagination } from "../../components/ui/Entity";
import { EmptyState, ErrorState, LoadingSkeleton } from "../../components/ui/States";
import { useToast } from "../../components/ui/useToast";
import { useConfirm } from "../../components/ui/useConfirm";
import VehicleCard from "../../components/fleet/VehicleCard";

const PER_PAGE = 9;

const SORTS = {
  name: { label: "Name (A–Z)", compare: (a, b) => (a.unitName || "").localeCompare(b.unitName || "") },
  unit: { label: "Unit number", compare: (a, b) => (a.unitNumber || "").localeCompare(b.unitNumber || "", undefined, { numeric: true }) },
  status: { label: "Status", compare: (a, b) => (a.operationalStatus || "").localeCompare(b.operationalStatus || "") },
  maintenance: {
    label: "Maintenance date",
    // Unscheduled sorts last rather than pretending to be urgent.
    compare: (a, b) => (daysUntil(a.nextMaintenanceDate) ?? Infinity) - (daysUntil(b.nextMaintenanceDate) ?? Infinity),
  },
  odometer: { label: "Odometer", compare: (a, b) => (b.currentOdometer ?? -1) - (a.currentOdometer ?? -1) },
  updated: { label: "Recently updated", compare: (a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")) },
};

const MAINTENANCE_FILTERS = {
  all: { label: "All", match: () => true },
  overdue: { label: "Overdue", match: (v) => (daysUntil(v.nextMaintenanceDate) ?? null) < 0 },
  soon: { label: "Due in 30 days", match: (v) => { const d = daysUntil(v.nextMaintenanceDate); return d !== null && d >= 0 && d <= 30; } },
  scheduled: { label: "Scheduled", match: (v) => !!v.nextMaintenanceDate },
  unscheduled: { label: "Not scheduled", match: (v) => !v.nextMaintenanceDate },
};

const STATUS_FILTERS = {
  all: { label: "All", match: () => true },
  in_service: { label: "In Service", match: (v) => !v.isRetired && v.operationalStatus === "in_service" },
  out_of_service: { label: "Out of Service", match: (v) => !v.isRetired && v.operationalStatus === "out_of_service" },
  maintenance: { label: "Maintenance", match: (v) => !v.isRetired && v.operationalStatus === "maintenance" },
  retired: { label: "Retired", match: (v) => !!v.isRetired },
};

/**
 * Fleet vehicle list — the entry point to the Vehicle Workspace.
 *
 * Filters/sort/page live in the URL, so the view is shareable and the workspace
 * can send the user back to exactly what they left.
 */
export default function VehiclesListPage({ currentUser }) {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const confirm = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();

  const search = searchParams.get("search") || "";
  const status = searchParams.get("status") || "all";
  const capability = searchParams.get("capability") || "all";
  const maintenance = searchParams.get("maintenance") || "all";
  const sort = searchParams.get("sort") || "name";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);

  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const canEdit = hasFleetEditAccess(currentUser);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    return getVehicles()
      .then((data) => setVehicles(Array.isArray(data) ? data : []))
      .catch((err) => setError(err.message || "Failed to load vehicles"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const setFilter = (patch) => {
    const next = { search, status, capability, maintenance, sort, page: 1, ...patch };
    const params = {};
    if (next.search) params.search = next.search;
    if (next.status !== "all") params.status = next.status;
    if (next.capability !== "all") params.capability = next.capability;
    if (next.maintenance !== "all") params.maintenance = next.maintenance;
    if (next.sort !== "name") params.sort = next.sort;
    if (next.page > 1) params.page = String(next.page);
    setSearchParams(params, { replace: true });
  };

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const result = vehicles.filter((v) => {
      if (!STATUS_FILTERS[status]?.match(v)) return false;
      if (capability !== "all" && !(v.capabilities || [v.unitType]).includes(capability)) return false;
      if (!MAINTENANCE_FILTERS[maintenance]?.match(v)) return false;
      if (!term) return true;
      return [v.unitName, v.unitNumber, v.unitType, v.make, v.model, v.licensePlate]
        .some((f) => String(f || "").toLowerCase().includes(term));
    });
    return result.sort(SORTS[sort]?.compare || SORTS.name.compare);
  }, [vehicles, search, status, capability, maintenance, sort]);

  const visible = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const hasFilters = !!search || status !== "all" || capability !== "all" || maintenance !== "all";

  const handleRetire = async (vehicle) => {
    const ok = await confirm({
      title: `Retire ${vehicle.unitName}?`,
      message: "The vehicle leaves service but keeps its shift, maintenance and odometer history.",
      variant: "warning",
      confirmLabel: "Retire",
    });
    if (!ok) return;
    try {
      // The API requires a reason; this is the one it records.
      await retireVehicle(vehicle.id, "Retired from the fleet list");
      toast.success(`${vehicle.unitName} retired`);
      load();
    } catch (err) {
      toast.error("Could not retire vehicle", err.message);
    }
  };

  const handleUnretire = async (vehicle) => {
    try {
      await unretireVehicle(vehicle.id);
      toast.success(`${vehicle.unitName} restored`);
      load();
    } catch (err) {
      toast.error("Could not restore vehicle", err.message);
    }
  };

  // Actions mirror the API's permission matrix: a dispatcher may look, not touch.
  const actionsFor = (vehicle) => {
    const items = [{
      label: "View details",
      icon: <FaEye />,
      onClick: () => navigate(`/fleet/vehicles/${vehicle.id}`, { state: { listSearch: location.search } }),
    }];
    if (canEdit) {
      items.push({
        label: "Edit",
        icon: <FaPen />,
        onClick: () => navigate(`/fleet/vehicles/${vehicle.id}/edit`, { state: { listSearch: location.search } }),
      });
      items.push(vehicle.isRetired
        ? { label: "Restore", icon: <FaTrashRestore />, onClick: () => handleUnretire(vehicle) }
        : { label: "Retire", icon: <FaArchive />, danger: true, onClick: () => handleRetire(vehicle) });
    }
    return items;
  };

  const results = () => {
    if (loading) return <LoadingSkeleton variant="grid" rows={6} label="Loading vehicles" />;
    if (error) return <ErrorState message={error} onRetry={load} />;

    if (!vehicles.length) {
      return (
        <EmptyState
          variant="empty"
          title="No vehicles yet"
          description={canEdit
            ? "Add the first vehicle to start tracking compliance, odometer and maintenance."
            : "The fleet has no vehicles recorded yet."}
        />
      );
    }
    if (!filtered.length) {
      return (
        <EmptyState
          variant="no-results"
          title="No vehicles match these filters"
          description="Try a different search or clear the filters."
          action={<button type="button" className="btn btn-outline-secondary btn-sm" onClick={clearFilters}>Clear filters</button>}
        />
      );
    }
    return (
      <>
        <EntityGrid columns={3}>
          {visible.map((v) => <VehicleCard key={v.id} vehicle={v} actions={actionsFor(v)} />)}
        </EntityGrid>
        <Pagination
          page={page}
          perPage={PER_PAGE}
          total={filtered.length}
          onPageChange={(p) => setSearchParams(
            { ...Object.fromEntries(searchParams), page: String(p) }, { replace: true },
          )}
        />
      </>
    );
  };

  function clearFilters() {
    setSearchParams({}, { replace: true });
  }

  return (
    <>
      <PageHeader
        title="Vehicles"
        description="The physical fleet. A vehicle is not a daily crew unit — units are planned per shift on the Crew Planner."
        count={loading ? null : `${filtered.length} of ${vehicles.length} vehicles`}
        actions={canEdit && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => navigate("/fleet/vehicles/new", { state: { listSearch: location.search } })}
          >
            <FaPlus aria-hidden="true" /> Add vehicle
          </button>
        )}
      />

      <PageToolbar onClear={clearFilters} canClear={hasFilters}>
        <ToolbarField label="Search" htmlFor="fleet-search" grow>
          <SearchInput
            id="fleet-search"
            value={search}
            onChange={(v) => setFilter({ search: v })}
            placeholder="Search by name, number, or type…"
            label="Search vehicles"
          />
        </ToolbarField>

        <ToolbarField label="Status" htmlFor="fleet-status">
          <select id="fleet-status" className="form-select" value={status}
                  onChange={(e) => setFilter({ status: e.target.value })}>
            {Object.entries(STATUS_FILTERS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </ToolbarField>

        <ToolbarField label="Capability" htmlFor="fleet-capability">
          <select id="fleet-capability" className="form-select" value={capability}
                  onChange={(e) => setFilter({ capability: e.target.value })}>
            <option value="all">All</option>
            {VEHICLE_CAPABILITIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </ToolbarField>

        <ToolbarField label="Maintenance" htmlFor="fleet-maintenance">
          <select id="fleet-maintenance" className="form-select" value={maintenance}
                  onChange={(e) => setFilter({ maintenance: e.target.value })}>
            {Object.entries(MAINTENANCE_FILTERS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </ToolbarField>

        <ToolbarField label="Sort by" htmlFor="fleet-sort">
          <select id="fleet-sort" className="form-select" value={sort}
                  onChange={(e) => setFilter({ sort: e.target.value })}>
            {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </ToolbarField>
      </PageToolbar>

      {results()}
    </>
  );
}
