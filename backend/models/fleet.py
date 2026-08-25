"""Vehicles and fleet records."""

import json
from .base import db


class Vehicle(db.Model):
    id = db.Column(db.Integer, primary_key=True)

    unit_name = db.Column(db.String(50), nullable=False)     # "Ambu-1"
    unit_number = db.Column(db.String(50), nullable=False, unique=True)   # "214"
    # Primary/legacy type. Real multi-capability support lives in `capabilities`;
    # this stays as the headline classification (canonical taxonomy value).
    unit_type = db.Column(db.String(50), nullable=False)
    is_active = db.Column(db.Boolean, default=True)
    notes = db.Column(db.Text)

    # What this physical vehicle can actually do — JSON array of canonical
    # capability values. A vehicle is often more than one thing (a stretcher van
    # that is also wheelchair capable), which a single unit_type cannot express.
    # Stored as JSON rather than a join table: the fleet is small and always read
    # whole, so a table would add joins without buying a query we need.
    capabilities = db.Column(db.Text)

    # Identity.
    vin = db.Column(db.String(32))
    license_plate = db.Column(db.String(20))
    plate_state = db.Column(db.String(10))
    model_year = db.Column(db.Integer)
    make = db.Column(db.String(50))
    model = db.Column(db.String(50))
    color = db.Column(db.String(30))
    ownership_type = db.Column(db.String(20))  # owned | leased | rented

    # Operational state. `is_active` is the administrative flag (in the fleet at
    # all); operational_status is what dispatch cares about today.
    operational_status = db.Column(db.String(30), default="in_service")  # in_service | out_of_service | maintenance
    out_of_service_reason = db.Column(db.Text)

    # Retire instead of delete: historical shifts and maintenance must keep a
    # valid vehicle reference.
    is_retired = db.Column(db.Boolean, default=False, nullable=False)
    retired_at = db.Column(db.String(50))
    retired_reason = db.Column(db.Text)

    # Compliance / maintenance dates (YYYY-MM-DD) — drive vehicle calendar events.
    inspection_expiry = db.Column(db.String(20))
    registration_expiry = db.Column(db.String(20))
    insurance_expiry = db.Column(db.String(20))
    next_maintenance_date = db.Column(db.String(20))

    # Mileage. The current reading is a cached convenience — the source of truth
    # is VehicleOdometerEntry (never store one mutable number without history).
    current_odometer = db.Column(db.Integer)
    odometer_unit = db.Column(db.String(5), default="mi")  # mi | km
    last_odometer_update = db.Column(db.String(50))

    # Maintenance summary (records live in VehicleMaintenanceRecord).
    last_service_date = db.Column(db.String(20))
    last_service_mileage = db.Column(db.Integer)
    next_service_mileage = db.Column(db.Integer)
    maintenance_notes = db.Column(db.Text)

    created_at = db.Column(db.String(50))
    updated_at = db.Column(db.String(50))

    def parsed_capabilities(self):
        """Capabilities as a list. Falls back to the headline unit_type so a
        vehicle that predates the field is still classified, not blank."""
        if self.capabilities:
            try:
                data = json.loads(self.capabilities)
                if isinstance(data, list):
                    return [str(c) for c in data]
            except (ValueError, TypeError):
                pass
        return [self.unit_type] if self.unit_type else []

    def is_available_for_service(self):
        """True when this vehicle may be put on a shift today."""
        return bool(self.is_active) and not self.is_retired and self.operational_status == "in_service"

    # Multi-tenancy foundation.
    org_id = db.Column(db.Integer, db.ForeignKey("organization.id"), nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "unitName": self.unit_name,
            "unitNumber": self.unit_number,
            "unitType": self.unit_type,
            "capabilities": self.parsed_capabilities(),
            "isActive": self.is_active,
            "notes": self.notes or "",

            "vin": self.vin or "",
            "licensePlate": self.license_plate or "",
            "plateState": self.plate_state or "",
            "modelYear": self.model_year,
            "make": self.make or "",
            "model": self.model or "",
            "color": self.color or "",
            "ownershipType": self.ownership_type or "",

            "operationalStatus": self.operational_status or "in_service",
            "outOfServiceReason": self.out_of_service_reason or "",
            "availableForService": self.is_available_for_service(),

            "isRetired": bool(self.is_retired),
            "retiredAt": self.retired_at or "",
            "retiredReason": self.retired_reason or "",

            "inspectionExpiry": self.inspection_expiry or "",
            "registrationExpiry": self.registration_expiry or "",
            "insuranceExpiry": self.insurance_expiry or "",
            "nextMaintenanceDate": self.next_maintenance_date or "",

            "currentOdometer": self.current_odometer,
            "odometerUnit": self.odometer_unit or "mi",
            "lastOdometerUpdate": self.last_odometer_update or "",

            "lastServiceDate": self.last_service_date or "",
            "lastServiceMileage": self.last_service_mileage,
            "nextServiceMileage": self.next_service_mileage,
            "maintenanceNotes": self.maintenance_notes or "",

            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
        }


class VehicleOdometerEntry(db.Model):
    """A mileage reading. The odometer is a history, not one mutable number —
    `Vehicle.current_odometer` is only a cache of the latest entry."""
    __tablename__ = "vehicle_odometer_entry"

    id = db.Column(db.Integer, primary_key=True)
    vehicle_id = db.Column(db.Integer, db.ForeignKey("vehicle.id"), nullable=False, index=True)

    reading = db.Column(db.Integer, nullable=False)
    unit = db.Column(db.String(5), default="mi")          # mi | km
    recorded_at = db.Column(db.String(50), nullable=False)
    recorded_by = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)
    recorded_by_name = db.Column(db.String(150))          # denormalized for display
    source = db.Column(db.String(20), default="manual")   # manual | service | import
    notes = db.Column(db.Text)

    vehicle = db.relationship("Vehicle", foreign_keys=[vehicle_id])

    def to_dict(self):
        return {
            "id": self.id,
            "vehicleId": self.vehicle_id,
            "reading": self.reading,
            "unit": self.unit or "mi",
            "recordedAt": self.recorded_at,
            "recordedBy": self.recorded_by,
            "recordedByName": self.recorded_by_name or "System",
            "source": self.source or "manual",
            "notes": self.notes or "",
        }


class VehicleMaintenanceRecord(db.Model):
    """Scheduled or completed work on a vehicle."""
    __tablename__ = "vehicle_maintenance_record"

    id = db.Column(db.Integer, primary_key=True)
    vehicle_id = db.Column(db.Integer, db.ForeignKey("vehicle.id"), nullable=False, index=True)

    maintenance_type = db.Column(db.String(50), nullable=False)   # oil_change | inspection | tires | repair | other
    status = db.Column(db.String(20), nullable=False, default="scheduled")  # scheduled | in_progress | completed | cancelled

    scheduled_date = db.Column(db.String(20), index=True)
    completed_date = db.Column(db.String(20))
    odometer_at_service = db.Column(db.Integer)

    vendor = db.Column(db.String(150))
    cost = db.Column(db.Float)
    description = db.Column(db.Text)
    notes = db.Column(db.Text)

    created_by = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)
    created_at = db.Column(db.String(50))
    updated_by = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)
    updated_at = db.Column(db.String(50))

    vehicle = db.relationship("Vehicle", foreign_keys=[vehicle_id])

    def to_dict(self):
        return {
            "id": self.id,
            "vehicleId": self.vehicle_id,
            "maintenanceType": self.maintenance_type,
            "status": self.status,
            "scheduledDate": self.scheduled_date or "",
            "completedDate": self.completed_date or "",
            "odometerAtService": self.odometer_at_service,
            "vendor": self.vendor or "",
            "cost": self.cost,
            "description": self.description or "",
            "notes": self.notes or "",
            "createdBy": self.created_by,
            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
        }
