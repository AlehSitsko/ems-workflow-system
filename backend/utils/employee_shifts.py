"""Shifts an employee has been rostered on.

Shared by the HR Employee Workspace "Schedule" tab and the employee self-service
portal, so a crew member and their supervisor see the same roster for the same
person. An employee can hold any of the four crew slots, so each shift also
reports which role they worked.
"""

from models import db, DailyCrewUnit


_SLOT_ROLES = {
    "driver_id": "Driver",
    "medical_id": "Medical",
    "assist1_id": "Assist",
    "assist2_id": "Assist",
}


def employee_shifts(employee_id, limit=50):
    """The employee's shifts, newest first, as a list of plain dicts."""
    limit = min(max(int(limit), 1), 200)
    units = (
        DailyCrewUnit.query
        .filter(db.or_(
            DailyCrewUnit.driver_id == employee_id,
            DailyCrewUnit.medical_id == employee_id,
            DailyCrewUnit.assist1_id == employee_id,
            DailyCrewUnit.assist2_id == employee_id,
        ))
        .order_by(DailyCrewUnit.shift_date.desc(), DailyCrewUnit.start_time.desc())
        .limit(limit)
        .all()
    )

    def role_on(unit):
        for slot, label in _SLOT_ROLES.items():
            if getattr(unit, slot) == employee_id:
                return label
        return None

    return [{
        "id": u.id,
        "shiftDate": u.shift_date,
        "unitType": u.unit_type,
        "truckNumber": u.truck_number,
        "startTime": u.start_time,
        "endTime": u.end_time or "",
        "endDate": u.end_date or "",
        "shiftType": u.shift_type or "day",
        "shiftStatus": u.shift_status or "scheduled",
        "role": role_on(u),
    } for u in units]
