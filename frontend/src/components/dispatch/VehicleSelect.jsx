import { getSelectableVehicles, describeVehicleOption } from "../../utils/vehicleAssignment";

// Picks the fleet vehicle a crew shift runs on. A shift must point at a real
// Vehicle record — that FK is what Fleet reporting (a vehicle's shift history,
// its utilisation) is built on; a typed-in number cannot be joined on.
//
// Two legacy shapes still have to render honestly:
//  - shifts saved before the link exists carry a free-text truck number with no
//    vehicle. It stays visible and selected, marked as not in the fleet, so
//    editing such a shift does not quietly rewrite its truck.
//  - an empty fleet gets an explicit empty state rather than a text box that
//    would let a dispatcher invent a truck that does not exist.

const LEGACY_VALUE = "__legacy__";

export default function VehicleSelect({
  id = "vehicleId",
  vehicles,
  vehicleId,
  truckNumber = "",
  onChange,
  disabled = false,
}) {
  const options = getSelectableVehicles(vehicles, vehicleId);
  const hasLegacyNumber = !vehicleId && truckNumber.trim() !== "";

  if (!options.length && !hasLegacyNumber) {
    return (
      <div className="form-text text-danger" id={id}>
        No vehicles are available for service. Add one in Fleet → Vehicles, or
        return one to service, before planning a shift.
      </div>
    );
  }

  const handleChange = (e) => {
    const value = e.target.value;
    if (value === "" || value === LEGACY_VALUE) {
      // Keep the legacy number when that option is re-picked; clear it otherwise.
      onChange({ vehicleId: null, truckNumber: value === LEGACY_VALUE ? truckNumber : "" });
      return;
    }
    const picked = options.find((v) => String(v.id) === value);
    onChange({ vehicleId: picked ? picked.id : null, truckNumber: picked ? picked.unitNumber : "" });
  };

  return (
    <select
      id={id}
      name="vehicleId"
      className="form-select"
      value={vehicleId ? String(vehicleId) : (hasLegacyNumber ? LEGACY_VALUE : "")}
      onChange={handleChange}
      disabled={disabled}
    >
      <option value="">Select vehicle…</option>
      {options.map((v) => (
        <option key={v.id} value={String(v.id)}>{describeVehicleOption(v)}</option>
      ))}
      {hasLegacyNumber && (
        <option value={LEGACY_VALUE}>{truckNumber} — not in fleet</option>
      )}
    </select>
  );
}
