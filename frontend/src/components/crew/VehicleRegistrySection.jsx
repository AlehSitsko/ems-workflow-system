import { useState } from "react";
import { FaPlus, FaTrash, FaTruck } from "react-icons/fa";
import { VEHICLE_CAPABILITIES } from "../../utils/taxonomy";

// Vehicle types come from the canonical taxonomy (utils/taxonomy.js), which
// mirrors backend/utils/taxonomy.py. Legacy "BARI" normalizes to "Bariatric".
const VEHICLE_TYPES = VEHICLE_CAPABILITIES;

/*
  Inline vehicle registry, embedded in Crew Planner.

  Lets dispatchers maintain a small master list of trucks (name, number, type)
  so the unit form can offer a dropdown instead of free-text truck numbers.
  Loading/save logic stays in CrewPlannerPage — this component is presentational.
*/
function VehicleRegistrySection({
  vehicles,
  vehiclesLoading,
  onAddVehicle,
  onToggleActive,
  onDeleteVehicle,
}) {
  const [expanded, setExpanded] = useState(false);
  const EMPTY_VEHICLE = {
    unitName: "", unitNumber: "", unitType: "BLS", notes: "",
    inspectionExpiry: "", registrationExpiry: "", insuranceExpiry: "", nextMaintenanceDate: "",
  };
  const [form, setForm] = useState(EMPTY_VEHICLE);

  const handleAdd = async () => {
    if (!form.unitName.trim() || !form.unitNumber.trim()) return;
    await onAddVehicle(form);
    setForm(EMPTY_VEHICLE);
  };

  return (
    <div className="col-12">
      <div className="card bg-light border-0">
        <div className="card-body">
          <div
            className="d-flex align-items-center justify-content-between"
            style={{ cursor: "pointer" }}
            onClick={() => setExpanded((e) => !e)}
          >
            <h6 className="mb-0">
              <FaTruck style={{ marginRight: 6 }} />
              Vehicle Registry ({vehicles.length})
            </h6>
            <button type="button" className="btn btn-sm btn-outline-secondary">
              {expanded ? "Hide" : "Manage"}
            </button>
          </div>

          {expanded && (
            <div className="mt-3">
              <div className="row g-2 align-items-end">
                <div className="col-md-3">
                  <label className="form-label fw-semibold small">Unit Name</label>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    placeholder="Ambu-1"
                    value={form.unitName}
                    onChange={(e) => setForm((f) => ({ ...f, unitName: e.target.value }))}
                    disabled={vehiclesLoading}
                  />
                </div>
                <div className="col-md-3">
                  <label className="form-label fw-semibold small">Unit Number</label>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    placeholder="214"
                    value={form.unitNumber}
                    onChange={(e) => setForm((f) => ({ ...f, unitNumber: e.target.value }))}
                    disabled={vehiclesLoading}
                  />
                </div>
                <div className="col-md-2">
                  <label className="form-label fw-semibold small">Type</label>
                  <select
                    className="form-select form-select-sm"
                    value={form.unitType}
                    onChange={(e) => setForm((f) => ({ ...f, unitType: e.target.value }))}
                    disabled={vehiclesLoading}
                  >
                    {VEHICLE_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div className="col-md-3">
                  <label className="form-label fw-semibold small">Notes</label>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    placeholder="Wheelchair capable"
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    disabled={vehiclesLoading}
                  />
                </div>
                <div className="col-md-1">
                  <button
                    type="button"
                    className="btn btn-sm btn-success w-100"
                    onClick={handleAdd}
                    disabled={vehiclesLoading}
                    title="Add vehicle"
                  >
                    <FaPlus />
                  </button>
                </div>
              </div>

              {/* Compliance / maintenance dates — drive vehicle calendar events */}
              <div className="row g-2 mt-1">
                {[
                  ["inspectionExpiry", "Inspection"],
                  ["registrationExpiry", "Registration"],
                  ["insuranceExpiry", "Insurance"],
                  ["nextMaintenanceDate", "Next Maintenance"],
                ].map(([key, label]) => (
                  <div className="col-md-3" key={key}>
                    <label className="form-label fw-semibold small">{label}</label>
                    <input
                      type="date"
                      className="form-control form-control-sm"
                      value={form[key]}
                      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                      disabled={vehiclesLoading}
                    />
                  </div>
                ))}
              </div>

              {vehicles.length > 0 && (
                <div className="mt-3" style={{ maxHeight: 220, overflowY: "auto" }}>
                  {vehicles.map((v) => (
                    <div
                      key={v.id}
                      className="d-flex align-items-center justify-content-between border-bottom py-2"
                      style={{ opacity: v.isActive ? 1 : 0.5 }}
                    >
                      <div>
                        <strong>{v.unitName}</strong>{" "}
                        <span className="text-muted">#{v.unitNumber}</span>{" "}
                        <span className="badge text-bg-secondary">{v.unitType}</span>
                        {v.notes && <span className="text-muted ms-2 small">{v.notes}</span>}
                      </div>
                      <div className="d-flex gap-2">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary"
                          onClick={() => onToggleActive(v.id)}
                        >
                          {v.isActive ? "Deactivate" : "Activate"}
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger"
                          onClick={() => onDeleteVehicle(v.id)}
                        >
                          <FaTrash />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default VehicleRegistrySection;
