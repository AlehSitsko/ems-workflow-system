import { FaCarSide, FaCalendarAlt, FaIdCard, FaTachometerAlt } from "react-icons/fa";

import { EntityCard, EntityField, OverflowMenu } from "../ui/Entity";
import { OperationalStatusBadge } from "../ui/StatusBadge";
import { VehicleTypeBadge } from "../taxonomy/TaxonomyBadges";
import VehicleThumb from "./VehicleThumb";
import { describeDueDate, formatDate } from "../../utils/dateDisplay";

/**
 * One vehicle in the fleet list.
 *
 * Identity, capability and status are deliberately separate elements rather
 * than one run-together string: "Ambu-7" is the name, "Unit 207" is the
 * identifier, Bariatric is a capability and In Service is a status. Gluing them
 * into a title would lose all four meanings.
 *
 * Every value here is real vehicle data — a field the record does not carry
 * shows an em dash rather than an invented placeholder.
 */
export default function VehicleCard({ vehicle, actions = [] }) {
  const due = describeDueDate(vehicle.nextMaintenanceDate);

  const odometer = vehicle.currentOdometer != null
    ? `${vehicle.currentOdometer.toLocaleString()} ${vehicle.odometerUnit || "mi"}`
    : null;

  const makeModel = [vehicle.make, vehicle.model].filter(Boolean).join(" ") || null;

  return (
    <EntityCard
      to={`/fleet/vehicles/${vehicle.id}`}
      className="vehicle-card"
      ariaLabel={`${vehicle.unitName}, unit ${vehicle.unitNumber}`}
    >
      <div className="vehicle-card-head">
        <VehicleThumb capability={vehicle.unitType} />

        <div className="vehicle-card-identity">
          <span className="vehicle-card-name">{vehicle.unitName}</span>
          <span className="vehicle-card-unit">Unit {vehicle.unitNumber}</span>
          <span className="vehicle-card-badges">
            <VehicleTypeBadge value={vehicle.unitType} />
          </span>
        </div>

        <OverflowMenu items={actions} label={`Actions for ${vehicle.unitName}`} />
      </div>

      <div className="vehicle-card-status">
        <OperationalStatusBadge status={vehicle.operationalStatus} isRetired={vehicle.isRetired} />
      </div>

      <div className="vehicle-card-fields">
        <EntityField icon={<FaCarSide />} label="Make / Model" value={makeModel} />
        <EntityField icon={<FaCalendarAlt />} label="Year" value={vehicle.modelYear} />
        <EntityField icon={<FaIdCard />} label="License Plate" value={vehicle.licensePlate} />
        <EntityField icon={<FaTachometerAlt />} label="Odometer" value={odometer} />
      </div>

      <div className="vehicle-card-footer">
        <span className="vehicle-card-footer-label">Next Maintenance</span>
        <span className="vehicle-card-footer-value">
          {formatDate(vehicle.nextMaintenanceDate, { fallback: "Not scheduled" })}
        </span>
        <span className={`vehicle-card-due tone-${due.tone}`}>{due.label}</span>
      </div>
    </EntityCard>
  );
}
