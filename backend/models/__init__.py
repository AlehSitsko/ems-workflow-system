"""ORM models for the EMS Workflow System.

Formerly a single models.py; split into this package by domain. Every name the
app imported from ``models`` is re-exported here, so ``from models import X``
keeps working unchanged. Importing this package imports every submodule, which
both registers all tables on ``db.metadata`` (Alembic, create_all) and wires the
model-level event listeners below."""
from sqlalchemy import event as _sa_event

from .base import db, dob_month_day
from .org import (
    Organization, User, UserSession, PasswordHistory, UserInvitation, OrgRecoveryCode,
)
from .employee import (
    Employee, EmploymentEvent, DisciplinaryAction, TimeEntry, EmployeePayConfig,
    PayPeriod, EmployeeDocument, EmployeeLeaveRequest, PtoLedgerEntry, Holiday,
    DOC_TYPES, DOC_CATEGORIES,
)
from .fleet import Vehicle, VehicleOdometerEntry, VehicleMaintenanceRecord
from .dispatch import DailyCrewUnit, CrewPreset, CallAssignment
from .patient import Patient, PatientAlert, PatientContact
from .call import Call, CallNote, RecurringTrip
from .task import Task, TaskParticipant, TaskComment, TaskActivityLog
from .calendar_events import CalendarEvent, CalendarEventParticipant
from .notification import NotificationEvent, UserNotification, UserNotificationPrefs
from .operations import OperationalDayClosure
from .audit import AuditLog

# Org-scoped models: the tenant filter (tenant.py) auto-scopes SELECTs on these
# and stamps org_id on insert. Content and order unchanged from the pre-split tuple.
ORG_SCOPED_MODELS = (
    User, Employee, Vehicle, DailyCrewUnit, CrewPreset, Patient, Call,
    NotificationEvent, PayPeriod, EmployeeLeaveRequest, OperationalDayClosure,
    RecurringTrip, CalendarEvent, Task, AuditLog, PtoLedgerEntry, Holiday,
    UserInvitation, OrgRecoveryCode, CallNote,
)


# Keep the non-identifying dob_month_day ("MM-DD") in sync with dob on *every* write
# path (API, seed, imports, direct construction), not just the route helpers -- the
# birthday calendar depends on it. When dob is ciphertext (an unchanged dob on an
# update), the month/day was already derived when it was first stored, so leave it.
def _sync_dob_month_day(mapper, connection, target):
    from core.security.crypto import is_ciphertext
    dob = target.dob
    if dob and is_ciphertext(dob):
        return
    target.dob_month_day = dob_month_day(dob)


for _dob_model in (Patient, Employee):
    _sa_event.listen(_dob_model, "before_insert", _sync_dob_month_day)
    _sa_event.listen(_dob_model, "before_update", _sync_dob_month_day)
