import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { FaPen, FaArchive, FaTrashRestore, FaTachometerAlt, FaWrench, FaClipboardCheck, FaPlus } from "react-icons/fa";

import EntityWorkspace from "../../components/workspace/EntityWorkspace";
import { PageSection } from "../../components/ui/Page";
import { EntityField, ActivityTimeline, OverflowMenu } from "../../components/ui/Entity";
import { EmptyState, ErrorState, LoadingSkeleton } from "../../components/ui/States";
import StatusBadge, { OperationalStatusBadge } from "../../components/ui/StatusBadge";
import { VehicleTypeBadge } from "../../components/taxonomy/TaxonomyBadges";
import VehicleThumb from "../../components/fleet/VehicleThumb";
import { useToast } from "../../components/ui/useToast";
import { useConfirm } from "../../components/ui/useConfirm";
import { useUserSettings } from "../../context/useUserSettings";
import { hasFleetAccess, hasFleetEditAccess } from "../../api/authApi";
import {
  getVehicle, getOdometerHistory, addOdometerReading,
  getMaintenanceRecords, getVehicleShifts, retireVehicle, unretireVehicle,
} from "../../api/vehiclesApi";
import { getAuditLog } from "../../api/auditApi";
import { formatDate, formatDateTime, describeDueDate } from "../../utils/dateDisplay";

const EXPIRY_FIELDS = [
  ["inspectionExpiry", "Inspection"],
  ["registrationExpiry", "Registration"],
  ["insuranceExpiry", "Insurance"],
  ["nextMaintenanceDate", "Next maintenance"],
];

const MAINTENANCE_TONE = {
  completed: "success", scheduled: "info", in_progress: "warning", cancelled: "neutral",
};

const AUDIT_TONE = {
  "vehicle.odometer_recorded": "info",
  "vehicle.maintenance_created": "info",
  "vehicle.maintenance_updated": "success",
  "vehicle.retired": "warning",
  "vehicle.created": "success",
};

// Audit actions are machine names; the timeline needs human sentences.
const AUDIT_LABEL = {
  "vehicle.created": "Vehicle added to the fleet",
  "vehicle.updated": "Vehicle details updated",
  "vehicle.odometer_recorded": "Odometer reading recorded",
  "vehicle.maintenance_created": "Maintenance scheduled",
  "vehicle.maintenance_updated": "Maintenance updated",
  "vehicle.activated": "Vehicle activated",
  "vehicle.deactivated": "Vehicle deactivated",
  "vehicle.retired": "Vehicle retired",
  "vehicle.unretired": "Vehicle restored",
};

function ExpiryValue({ iso }) {
  if (!iso) return <span className="text-muted">Not set</span>;
  const due = describeDueDate(iso, { warnWithinDays: 30 });
  return (
    <span className="expiry-value">
      {formatDate(iso)}
      <span className={`expiry-note tone-${due.tone}`}>{due.label}</span>
    </span>
  );
}

/**
 * Vehicle Workspace — the reference implementation of the Entity Workspace.
 *
 * Every tab here is backed by a real endpoint. Documents is the one exception:
 * there is no vehicle-document API, so it stays honestly disabled rather than
 * showing an empty list that implies the feature exists.
 */
export default function VehicleWorkspacePage({ currentUser }) {
  const { vehicleId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const confirm = useConfirm();
  const { settings } = useUserSettings();
  const timeFormat = settings?.ui?.time_format || "12h";

  const canView = hasFleetAccess(currentUser);
  const canEdit = hasFleetEditAccess(currentUser);

  const [vehicle, setVehicle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notFound, setNotFound] = useState(false);

  // Each tab loads on demand — a workspace should not fetch five collections to
  // show one card.
  const [tabData, setTabData] = useState({ odometer: null, maintenance: null, shifts: null, activity: null });
  const [tabState, setTabState] = useState({});

  const loadVehicle = useCallback(() => {
    setLoading(true);
    setError(null);
    setNotFound(false);
    return getVehicle(vehicleId)
      .then(setVehicle)
      .catch((err) => {
        if (err.status === 404) setNotFound(true);
        else setError(err.message || "Failed to load vehicle");
      })
      .finally(() => setLoading(false));
  }, [vehicleId]);

  useEffect(() => {
    if (!canView) { setLoading(false); return; }
    loadVehicle();
  }, [loadVehicle, canView]);

  const loadTab = useCallback((key, loader) => {
    setTabState((s) => (s[key] === "loading" ? s : { ...s, [key]: "loading" }));
    loader()
      .then((data) => {
        setTabData((d) => ({ ...d, [key]: data }));
        setTabState((s) => ({ ...s, [key]: "ready" }));
      })
      .catch((err) => setTabState((s) => ({ ...s, [key]: err.message || "Failed to load" })));
  }, []);

  // Overview shows summaries of odometer/maintenance/assignment, so it needs
  // those collections too.
  useEffect(() => {
    if (!vehicle) return;
    if (tabData.odometer === null && tabState.odometer === undefined) {
      loadTab("odometer", () => getOdometerHistory(vehicleId));
    }
    if (tabData.maintenance === null && tabState.maintenance === undefined) {
      loadTab("maintenance", () => getMaintenanceRecords(vehicleId));
    }
    if (tabData.shifts === null && tabState.shifts === undefined) {
      loadTab("shifts", () => getVehicleShifts(vehicleId));
    }
    if (tabData.activity === null && tabState.activity === undefined) {
      loadTab("activity", () => getAuditLog(
        { entity_type: "vehicle", entity_id: vehicleId, per_page: 50 },
        {},
      ).then((d) => d.entries || d.items || (Array.isArray(d) ? d : [])));
    }
  }, [vehicle, vehicleId, currentUser, loadTab, tabData, tabState]);

  const recordReading = async () => {
    const raw = window.prompt(`Current odometer for ${vehicle.unitName} (${vehicle.odometerUnit || "mi"}):`);
    if (raw === null) return;
    try {
      await addOdometerReading(vehicleId, { reading: Number(raw), unit: vehicle.odometerUnit || "mi" });
      toast.success("Reading recorded");
      loadVehicle();
      loadTab("odometer", () => getOdometerHistory(vehicleId));
      loadTab("activity", () => getAuditLog(
        { entity_type: "vehicle", entity_id: vehicleId, per_page: 50 },
        {},
      ).then((d) => d.entries || d.items || (Array.isArray(d) ? d : [])));
    } catch (err) {
      // The API rejects a backwards reading unless it is flagged a correction.
      toast.error("Could not record reading", err.message);
    }
  };

  const handleRetire = async () => {
    const ok = await confirm({
      title: `Retire ${vehicle.unitName}?`,
      message: "The vehicle leaves service but keeps its shift, maintenance and odometer history.",
      variant: "warning",
      confirmLabel: "Retire",
    });
    if (!ok) return;
    try {
      await retireVehicle(vehicleId, "Retired from the vehicle workspace");
      toast.success("Vehicle retired");
      loadVehicle();
    } catch (err) {
      toast.error("Could not retire vehicle", err.message);
    }
  };

  const handleUnretire = async () => {
    try {
      await unretireVehicle(vehicleId);
      toast.success("Vehicle restored");
      loadVehicle();
    } catch (err) {
      toast.error("Could not restore vehicle", err.message);
    }
  };

  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "compliance", label: "Compliance" },
    { key: "activity", label: "Activity" },
    { key: "odometer", label: "Odometer" },
    { key: "maintenance", label: "Maintenance" },
    {
      key: "documents",
      label: "Documents",
      disabled: true,
      // Honest: there is no vehicle-document endpoint to talk to.
      disabledReason: "Vehicle documents need a backend that does not exist yet",
    },
    { key: "shifts", label: "Shift History" },
  ];

  const overflowItems = canEdit && vehicle
    ? [vehicle.isRetired
        ? { label: "Restore vehicle", icon: <FaTrashRestore />, onClick: handleUnretire }
        : { label: "Retire vehicle", icon: <FaArchive />, danger: true, onClick: handleRetire }]
    : [];

  const odometerLabel = vehicle?.currentOdometer != null
    ? `${vehicle.currentOdometer.toLocaleString()} ${vehicle.odometerUnit || "mi"}`
    : null;

  const currentShift = (tabData.shifts || [])[0] || null;

  const renderTab = (activeTab) => {
    if (!vehicle) return null;

    if (activeTab === "overview") {
      const due = describeDueDate(vehicle.nextMaintenanceDate, { warnWithinDays: 30 });
      return (
        <div className="workspace-grid">
          <PageSection title="Vehicle Identity">
            <EntityField label="Unit name" value={vehicle.unitName} />
            <EntityField label="Unit number" value={vehicle.unitNumber} />
            <EntityField label="VIN" value={vehicle.vin} />
            <EntityField label="License plate" value={vehicle.licensePlate} />
            <EntityField label="Plate state" value={vehicle.plateState} />
            <EntityField label="Make / Model" value={[vehicle.make, vehicle.model].filter(Boolean).join(" ") || null} />
            <EntityField label="Year" value={vehicle.modelYear} />
            <EntityField label="Color" value={vehicle.color} />
            <EntityField label="Ownership" value={vehicle.ownershipType} />
          </PageSection>

          <PageSection title="Operational Status">
            <div className="mb-3">
              <OperationalStatusBadge status={vehicle.operationalStatus} isRetired={vehicle.isRetired} />
            </div>
            {vehicle.outOfServiceReason && (
              <EntityField label="Reason" value={vehicle.outOfServiceReason} />
            )}
            <EntityField label="Available for service" value={vehicle.availableForService ? "Yes" : "No"} />
            <EntityField label="Added" value={formatDateTime(vehicle.createdAt, timeFormat)} />
            <EntityField label="Last updated" value={formatDateTime(vehicle.updatedAt, timeFormat)} />
            {vehicle.isRetired && (
              <>
                <EntityField label="Retired" value={formatDateTime(vehicle.retiredAt, timeFormat)} />
                <EntityField label="Retired reason" value={vehicle.retiredReason} />
              </>
            )}
          </PageSection>

          <PageSection title="Capabilities" description="What this vehicle can be deployed as.">
            <div className="capability-list">
              {(vehicle.capabilities?.length ? vehicle.capabilities : [vehicle.unitType]).map((c) => (
                <VehicleTypeBadge key={c} value={c} />
              ))}
            </div>
          </PageSection>

          <PageSection
            title="Odometer"
            actions={canEdit && (
              <button type="button" className="btn btn-outline-secondary btn-sm" onClick={recordReading}>
                <FaPlus aria-hidden="true" /> Record
              </button>
            )}
          >
            {odometerLabel ? (
              <>
                <p className="metric-value">{odometerLabel}</p>
                <EntityField label="Last update" value={formatDateTime(vehicle.lastOdometerUpdate, timeFormat)} />
              </>
            ) : (
              <p className="text-muted mb-0">No reading recorded yet.</p>
            )}
          </PageSection>

          <PageSection title="Maintenance">
            {vehicle.nextMaintenanceDate ? (
              <>
                <p className="metric-value">{formatDate(vehicle.nextMaintenanceDate)}</p>
                <StatusBadge tone={due.tone} label={due.label} />
              </>
            ) : (
              <p className="text-muted mb-0">No service scheduled.</p>
            )}
            <div className="mt-3">
              <EntityField label="Last service" value={formatDate(vehicle.lastServiceDate, { fallback: null })} />
              <EntityField
                label="Last service mileage"
                value={vehicle.lastServiceMileage != null
                  ? `${vehicle.lastServiceMileage.toLocaleString()} ${vehicle.odometerUnit || "mi"}`
                  : null}
              />
            </div>
          </PageSection>

          <PageSection title="Current Assignment" description="From the vehicle's linked crew units.">
            {currentShift ? (
              <>
                <EntityField label="Shift date" value={formatDate(currentShift.shiftDate)} />
                <EntityField label="Unit type" value={currentShift.unitType} />
                <EntityField label="Shift" value={`${currentShift.startTime}${currentShift.endTime ? `–${currentShift.endTime}` : ""}`} />
                <EntityField label="Driver" value={currentShift.crew.driver} />
                <EntityField label="Medical" value={currentShift.crew.medical} />
              </>
            ) : (
              <p className="text-muted mb-0">
                This vehicle is not linked to any crew unit yet.
              </p>
            )}
          </PageSection>
        </div>
      );
    }

    if (activeTab === "compliance") {
      return (
        <PageSection title="Expiry dates" description="These dates also surface on the Calendar as vehicle events.">
          {EXPIRY_FIELDS.map(([field, label]) => (
            <div className="entity-field" key={field}>
              <span className="entity-field-label">{label}</span>
              <span className="entity-field-value"><ExpiryValue iso={vehicle[field]} /></span>
            </div>
          ))}
        </PageSection>
      );
    }

    if (activeTab === "odometer") {
      const state = tabState.odometer;
      if (state === "loading") return <LoadingSkeleton rows={3} label="Loading odometer history" />;
      if (state && state !== "ready") return <ErrorState message={state} onRetry={() => loadTab("odometer", () => getOdometerHistory(vehicleId))} />;
      const entries = tabData.odometer || [];
      return (
        <PageSection
          title="Mileage history"
          description="Every reading is kept — the vehicle's current mileage is just the newest one."
          actions={canEdit && (
            <button type="button" className="btn btn-primary btn-sm" onClick={recordReading}>
              <FaPlus aria-hidden="true" /> Record reading
            </button>
          )}
        >
          {entries.length === 0 ? (
            <EmptyState variant="empty" title="No readings yet"
                        description={canEdit ? "Record the first odometer reading." : "No mileage recorded for this vehicle."} />
          ) : (
            <ol className="record-list">
              {entries.map((e) => (
                <li className="record-row" key={e.id}>
                  <span className="record-primary">{e.reading.toLocaleString()} {e.unit}</span>
                  <span className="record-meta">{formatDateTime(e.recordedAt, timeFormat)}</span>
                  <StatusBadge tone={e.source === "correction" ? "warning" : "neutral"} label={e.source} dot={false} />
                  <span className="record-meta">{e.recordedByName || "—"}</span>
                </li>
              ))}
            </ol>
          )}
        </PageSection>
      );
    }

    if (activeTab === "maintenance") {
      const state = tabState.maintenance;
      if (state === "loading") return <LoadingSkeleton rows={3} label="Loading maintenance records" />;
      if (state && state !== "ready") return <ErrorState message={state} onRetry={() => loadTab("maintenance", () => getMaintenanceRecords(vehicleId))} />;
      const records = tabData.maintenance || [];
      return (
        <PageSection title="Maintenance records">
          {records.length === 0 ? (
            <EmptyState variant="empty" title="No maintenance recorded"
                        description="Scheduled and completed service will appear here." />
          ) : (
            <ol className="record-list">
              {records.map((r) => (
                <li className="record-row" key={r.id}>
                  <span className="record-primary">{r.maintenanceType.replace(/_/g, " ")}</span>
                  <span className="record-meta">
                    {r.status === "completed"
                      ? `Completed ${formatDate(r.completedDate)}`
                      : `Scheduled ${formatDate(r.scheduledDate, { fallback: "—" })}`}
                  </span>
                  <StatusBadge tone={MAINTENANCE_TONE[r.status] || "neutral"} label={r.status.replace(/_/g, " ")} />
                  <span className="record-meta">{r.vendor || "—"}</span>
                </li>
              ))}
            </ol>
          )}
        </PageSection>
      );
    }

    if (activeTab === "shifts") {
      const state = tabState.shifts;
      if (state === "loading") return <LoadingSkeleton rows={3} label="Loading shift history" />;
      if (state && state !== "ready") return <ErrorState message={state} onRetry={() => loadTab("shifts", () => getVehicleShifts(vehicleId))} />;
      const shifts = tabData.shifts || [];
      return (
        <PageSection
          title="Shift history"
          description="Shifts this vehicle was deployed on, via its crew-unit link."
        >
          {shifts.length === 0 ? (
            <EmptyState
              variant="empty"
              title="No linked shifts"
              description="Crew units are linked to a vehicle when the shift is planned. Legacy shifts that only recorded a truck number are not attributed here, because truck numbers get reused."
            />
          ) : (
            <ol className="record-list">
              {shifts.map((s) => (
                <li className="record-row interactive" key={s.id}
                    role="button" tabIndex={0}
                    onClick={() => navigate(s.link)}
                    onKeyDown={(e) => { if (e.key === "Enter") navigate(s.link); }}>
                  <span className="record-primary">{formatDate(s.shiftDate)}</span>
                  <span className="record-meta">{s.startTime}{s.endTime ? `–${s.endTime}` : ""} · {s.shiftType}</span>
                  <VehicleTypeBadge value={s.unitType} />
                  <span className="record-meta">
                    {[s.crew.driver, s.crew.medical].filter(Boolean).join(", ") || "No crew"}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </PageSection>
      );
    }

    if (activeTab === "activity") {
      const state = tabState.activity;
      if (state === "loading") return <LoadingSkeleton rows={3} label="Loading activity" />;
      const entries = (tabData.activity || []).map((e) => ({
        id: e.id,
        title: AUDIT_LABEL[e.action] || e.action,
        timestamp: formatDateTime(e.timestamp, timeFormat),
        actor: e.user_name,
        tone: AUDIT_TONE[e.action] || "neutral",
        icon: e.action.includes("odometer") ? <FaTachometerAlt />
          : e.action.includes("maintenance") ? <FaWrench />
          : <FaClipboardCheck />,
      }));
      return (
        <PageSection title="Recent activity" description="Recorded changes to this vehicle.">
          <ActivityTimeline entries={entries} emptyLabel="No recorded activity for this vehicle yet." />
        </PageSection>
      );
    }

    return null;
  };

  return (
    <EntityWorkspace
      backTo="/fleet/vehicles"
      backLabel="Vehicles"
      title={vehicle ? vehicle.unitName : "Vehicle"}
      subtitle={vehicle ? `Unit ${vehicle.unitNumber}` : null}
      icon={vehicle && <VehicleThumb capability={vehicle.unitType} size={44} />}
      badges={vehicle && (
        <>
          <VehicleTypeBadge value={vehicle.unitType} />
          <OperationalStatusBadge status={vehicle.operationalStatus} isRetired={vehicle.isRetired} />
        </>
      )}
      actions={vehicle && (
        <>
          {canEdit && (
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              onClick={() => navigate(`/fleet/vehicles/${vehicleId}/edit`, { state: { listSearch: location.state?.listSearch || "" } })}
            >
              <FaPen aria-hidden="true" /> Edit
            </button>
          )}
          <OverflowMenu items={overflowItems} label="Vehicle actions" />
        </>
      )}
      tabs={tabs}
      loading={loading}
      error={error}
      notFound={notFound}
      canView={canView}
    >
      {renderTab}
    </EntityWorkspace>
  );
}
