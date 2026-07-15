import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import EntityWorkspace from "../../components/workspace/EntityWorkspace";
import DetailItem from "../../components/patients/DetailItem";
import { VehicleTypeBadge } from "../../components/taxonomy/TaxonomyBadges";
import { getVehicle } from "../../api/vehiclesApi";
import { getAuditLog } from "../../api/auditApi";
import { hasFleetAccess } from "../../api/authApi";

// Vehicle Workspace — the reference implementation of the Entity Workspace
// pattern (docs/UI_STANDARD.md).
//
// Tabs backed by data that exists today are live. Odometer, Maintenance,
// Documents and Shift History are disabled rather than faked: they need the
// Fleet schema (VehicleOdometerEntry / VehicleMaintenanceRecord /
// VehicleDocument / DailyCrewUnit.vehicle_id), which is the next block.

const EXPIRY_FIELDS = [
  ["inspectionExpiry", "Inspection"],
  ["registrationExpiry", "Registration"],
  ["insuranceExpiry", "Insurance"],
  ["nextMaintenanceDate", "Next maintenance"],
];

// Days until an ISO date, or null. Parsed from parts to stay timezone-safe.
function daysUntil(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  const target = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

function ExpiryValue({ iso }) {
  if (!iso) return <span className="text-muted">Not set</span>;
  const days = daysUntil(iso);
  const tone = days === null ? "" : days < 0 ? "crit" : days <= 30 ? "warn" : "";
  const note = days === null ? "" : days < 0 ? `expired ${Math.abs(days)}d ago` : `in ${days}d`;
  return (
    <span className={`fleet-expiry ${tone}`}>
      {iso}{note && <span className="fleet-expiry-note"> — {note}</span>}
    </span>
  );
}

export default function VehicleWorkspacePage({ currentUser }) {
  const { vehicleId } = useParams();

  const [vehicle, setVehicle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notFound, setNotFound] = useState(false);

  const [activity, setActivity] = useState([]);
  const [activityLoaded, setActivityLoaded] = useState(false);

  const canView = hasFleetAccess(currentUser);

  useEffect(() => {
    if (!canView) { setLoading(false); return undefined; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setNotFound(false);
    getVehicle(vehicleId)
      .then((data) => { if (!cancelled) setVehicle(data); })
      .catch((err) => {
        if (cancelled) return;
        if (err.status === 404) setNotFound(true);
        else setError(err.message || "Failed to load vehicle");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [vehicleId, canView]);

  // Activity is loaded lazily — only when the tab is actually opened.
  const loadActivity = () => {
    if (activityLoaded) return;
    setActivityLoaded(true);
    getAuditLog(
      { entity_type: "vehicle", entity_id: vehicleId, per_page: 50 },
      { "X-User-Role": currentUser?.role || "", "X-User-Id": String(currentUser?.id || "") },
    )
      .then((data) => setActivity(data.entries || data.items || (Array.isArray(data) ? data : [])))
      .catch(() => setActivity([]));
  };

  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "compliance", label: "Compliance" },
    { key: "activity", label: "Activity" },
    { key: "odometer", label: "Odometer", disabled: true, disabledReason: "Arrives with Fleet Management" },
    { key: "maintenance", label: "Maintenance", disabled: true, disabledReason: "Arrives with Fleet Management" },
    { key: "documents", label: "Documents", disabled: true, disabledReason: "Arrives with Fleet Management" },
    { key: "shifts", label: "Shift History", disabled: true, disabledReason: "Needs the vehicle↔unit link (Fleet Management)" },
  ];

  return (
    <EntityWorkspace
      backTo="/fleet/vehicles"
      backLabel="Vehicles"
      title={vehicle ? vehicle.unitName : "Vehicle"}
      subtitle={vehicle ? `Unit ${vehicle.unitNumber}` : null}
      badges={vehicle && (
        <>
          <VehicleTypeBadge value={vehicle.unitType} />
          <span className={`fleet-status ${vehicle.isActive ? "active" : "inactive"}`}>
            {vehicle.isActive ? "Active" : "Inactive"}
          </span>
        </>
      )}
      tabs={tabs}
      loading={loading}
      error={error}
      notFound={notFound}
      canView={canView}
    >
      {(activeTab) => {
        if (activeTab === "activity") loadActivity();
        if (!vehicle) return null;

        if (activeTab === "overview") {
          return (
            <div className="patient-detail-grid">
              <DetailItem label="Unit name" value={vehicle.unitName} />
              <DetailItem label="Unit number" value={vehicle.unitNumber} />
              <DetailItem label="Type / capability" value={vehicle.unitType} />
              <DetailItem label="Status" value={vehicle.isActive ? "Active" : "Inactive"} />
              <DetailItem label="Added" value={vehicle.createdAt} />
              <DetailItem label="Last updated" value={vehicle.updatedAt} />
              <DetailItem label="Notes" value={vehicle.notes} />
            </div>
          );
        }

        if (activeTab === "compliance") {
          return (
            <>
              <div className="workspace-section-title">Expiry dates</div>
              <div className="patient-detail-grid">
                {EXPIRY_FIELDS.map(([field, label]) => (
                  <div className="patient-detail-item" key={field}>
                    <div className="patient-detail-label">{label}</div>
                    <div className="patient-detail-value">
                      <ExpiryValue iso={vehicle[field]} />
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-muted mt-3 mb-0" style={{ fontSize: 12 }}>
                These dates also surface on the Calendar as vehicle events.
              </p>
            </>
          );
        }

        if (activeTab === "activity") {
          if (!activity.length) {
            return <p className="text-muted mb-0">No recorded activity for this vehicle yet.</p>;
          }
          return (
            <ul className="calendar-day-list">
              {activity.map((entry) => (
                <li key={entry.id} className="calendar-day-row calendar-day-row-static">
                  <div className="calendar-day-row-main">
                    <span className="calendar-day-time">{entry.action}</span>
                    <span className="calendar-day-title">{entry.user_name || "System"}</span>
                  </div>
                  <div className="calendar-day-row-meta">
                    <span className="calendar-tag">{entry.timestamp}</span>
                  </div>
                </li>
              ))}
            </ul>
          );
        }

        return null;
      }}
    </EntityWorkspace>
  );
}
