"""Employee leave / absence API (roadmap Phase 4d).

Who can do what:

  * admin, hr   — see everything, create, edit, approve, deny, cancel.
  * supervisor  — may file a request on an employee's behalf (it lands in
                  `pending`) and sees scheduling-level detail. Approving is an HR
                  decision, so it is refused here rather than hidden in the UI.
  * dispatcher  — read-only, scheduling level: who is away and when.

"Scheduling level" is a smaller payload, not a redacted one: reason, private
notes and the review trail are never serialized for those roles, and the
sensitive types (sick / medical / bereavement) report as plain "unavailable".
See EmployeeLeaveRequest.to_dict.
"""

from datetime import datetime

from flask import Blueprint, jsonify, request

from models import db, Employee, EmployeeLeaveRequest, DailyCrewUnit
from utils.auth_utils import require_role, get_request_role, get_request_user_id, get_request_user_name
from utils import pto
from utils.validation_utils import is_valid_date, is_valid_time, check_length
from utils.taxonomy import (
    normalize_leave_type, normalize_leave_status,
    LEAVE_TYPES, LEAVE_STATUSES,
)


leave_bp = Blueprint("leave", __name__, url_prefix="/api/leave-requests")

# Roles that may see and manage the HR detail of a request.
HR_ROLES = ("admin", "hr")
# Roles that may file a request. Supervisors can, but cannot approve their own.
CREATE_ROLES = ("admin", "hr", "supervisor")
# Roles that may read the scheduling view.
VIEW_ROLES = ("admin", "hr", "supervisor", "dispatcher")


def _visibility_for(role):
    return "hr" if role in HR_ROLES else "scheduling"


def _now():
    return datetime.now().isoformat(timespec="seconds")


def _overlapping(employee_id, start_date, end_date, exclude_id=None):
    """Requests for this employee whose range overlaps [start, end].

    Denied and cancelled leave is ignored: it no longer reserves the time. Two
    inclusive ranges overlap when each starts on or before the other ends.
    """
    query = EmployeeLeaveRequest.query.filter(
        EmployeeLeaveRequest.employee_id == employee_id,
        EmployeeLeaveRequest.status.notin_(["denied", "cancelled"]),
        EmployeeLeaveRequest.start_date <= end_date,
        EmployeeLeaveRequest.end_date >= start_date,
    )
    if exclude_id:
        query = query.filter(EmployeeLeaveRequest.id != exclude_id)
    return query.all()


def _validate_payload(data, partial=False):
    """Return (cleaned, error). `partial` allows an edit to omit fields."""
    cleaned = {}

    if not partial or "employeeId" in data:
        employee_id = data.get("employeeId")
        if not employee_id:
            return None, "employeeId is required"
        if not Employee.query.get(employee_id):
            return None, "Employee not found"
        cleaned["employee_id"] = employee_id

    if not partial or "leaveType" in data:
        leave_type = normalize_leave_type(data.get("leaveType"))
        if not leave_type:
            return None, f"leaveType must be one of: {', '.join(LEAVE_TYPES)}"
        cleaned["leave_type"] = leave_type

    if not partial or "startDate" in data or "endDate" in data:
        start_date = (data.get("startDate") or "").strip()
        end_date = (data.get("endDate") or "").strip() or start_date
        if not is_valid_date(start_date):
            return None, "startDate must be a real date (YYYY-MM-DD)"
        if not is_valid_date(end_date):
            return None, "endDate must be a real date (YYYY-MM-DD)"
        if end_date < start_date:
            return None, "endDate must not be before startDate"
        cleaned["start_date"] = start_date
        cleaned["end_date"] = end_date

    start_time = (data.get("startTime") or "").strip()
    end_time = (data.get("endTime") or "").strip()
    if start_time or end_time:
        if not start_time or not end_time:
            return None, "A partial day needs both startTime and endTime"
        if not is_valid_time(start_time) or not is_valid_time(end_time):
            return None, "startTime and endTime must be HH:MM"
        if end_time <= start_time:
            return None, "endTime must be after startTime"
        # A partial day only means something on a one-day request; across a
        # range it would be ambiguous (every day? the first? the last?).
        span_start = cleaned.get("start_date")
        span_end = cleaned.get("end_date")
        if span_start and span_end and span_start != span_end:
            return None, "A partial day applies to a single-day request only"
    cleaned["start_time"] = start_time or None
    cleaned["end_time"] = end_time or None

    try:
        check_length(data.get("reason"), 2000, "reason")
        check_length(data.get("privateNotes"), 2000, "privateNotes")
        check_length(data.get("reviewNote"), 1000, "reviewNote")
    except ValueError as e:
        return None, str(e)

    return cleaned, None


@leave_bp.route("", methods=["GET"])
@require_role(*VIEW_ROLES)
def list_leave_requests():
    """Leave requests, optionally filtered by employee, status or date range.

    `start` / `end` select requests that overlap the window, not ones contained
    in it — a two-week absence is relevant to every week it touches.
    """
    role = get_request_role()
    query = EmployeeLeaveRequest.query

    employee_id = request.args.get("employee_id", "").strip()
    if employee_id:
        query = query.filter(EmployeeLeaveRequest.employee_id == employee_id)

    status = request.args.get("status", "").strip()
    if status:
        canonical = normalize_leave_status(status)
        if not canonical:
            return jsonify({"error": f"status must be one of: {', '.join(LEAVE_STATUSES)}"}), 400
        query = query.filter(EmployeeLeaveRequest.status == canonical)

    start = request.args.get("start", "").strip()
    end = request.args.get("end", "").strip()
    if start or end:
        if start and not is_valid_date(start):
            return jsonify({"error": "start must be a real date (YYYY-MM-DD)"}), 400
        if end and not is_valid_date(end):
            return jsonify({"error": "end must be a real date (YYYY-MM-DD)"}), 400
        if start:
            query = query.filter(EmployeeLeaveRequest.end_date >= start)
        if end:
            query = query.filter(EmployeeLeaveRequest.start_date <= end)

    requests_ = query.order_by(
        EmployeeLeaveRequest.start_date.desc(), EmployeeLeaveRequest.id.desc()
    ).all()

    visibility = _visibility_for(role)
    return jsonify([r.to_dict(visibility) for r in requests_])


@leave_bp.route("/unavailable", methods=["GET"])
@require_role(*VIEW_ROLES)
def unavailable_on_date():
    """Who is away on a given day — the crew planner's question, answered without
    disclosing anything else.

    Deliberately minimal: an employee id, whether the leave is approved (a hard
    conflict) or still pending (a warning), and the partial-day window if there
    is one. No type, no reason, for any role — a shift form has no business
    knowing why, only that it should warn.
    """
    date_str = request.args.get("date", "").strip()
    if not is_valid_date(date_str):
        return jsonify({"error": "date must be a real date (YYYY-MM-DD)"}), 400

    rows = EmployeeLeaveRequest.query.filter(
        EmployeeLeaveRequest.status.in_(["approved", "pending"]),
        EmployeeLeaveRequest.start_date <= date_str,
        EmployeeLeaveRequest.end_date >= date_str,
    ).all()

    return jsonify([
        {
            "employeeId": r.employee_id,
            "status": r.status,
            "blocksScheduling": r.blocks_scheduling(),
            "isPartialDay": bool(r.start_time),
            "startTime": r.start_time or "",
            "endTime": r.end_time or "",
        }
        for r in rows
    ])


@leave_bp.route("/<int:id>", methods=["GET"])
@require_role(*VIEW_ROLES)
def get_leave_request(id):
    leave = EmployeeLeaveRequest.query.get(id)
    if not leave:
        return jsonify({"error": "Leave request not found"}), 404
    return jsonify(leave.to_dict(_visibility_for(get_request_role())))


@leave_bp.route("", methods=["POST"])
@require_role(*CREATE_ROLES)
def create_leave_request():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    cleaned, error = _validate_payload(data)
    if error:
        return jsonify({"error": error}), 400

    role = get_request_role()

    # A supervisor files on someone's behalf; the request still needs HR review,
    # so it cannot be created already approved.
    requested_status = normalize_leave_status(data.get("status")) or "pending"
    if requested_status not in ("draft", "pending") and role not in HR_ROLES:
        return jsonify({
            "error": "Only HR or an administrator can create a request in that status. "
                     "File it as pending and have it reviewed."
        }), 403

    conflicts = _overlapping(cleaned["employee_id"], cleaned["start_date"], cleaned["end_date"])
    if conflicts:
        other = conflicts[0]
        return jsonify({
            "error": f"This employee already has leave from {other.start_date} to "
                     f"{other.end_date} ({other.status}). Overlapping requests are not allowed.",
            "conflictingRequestId": other.id,
        }), 409

    now = _now()
    leave = EmployeeLeaveRequest(
        **cleaned,
        status=requested_status,
        reason=(data.get("reason") or "").strip() or None,
        private_notes=(data.get("privateNotes") or "").strip() or None,
        submitted_at=now,
        submitted_by=get_request_user_id(),
        submitted_by_name=get_request_user_name(),
        created_at=now,
        updated_at=now,
    )
    db.session.add(leave)
    db.session.commit()

    return jsonify(leave.to_dict(_visibility_for(role))), 201


@leave_bp.route("/<int:id>", methods=["PUT"])
@require_role(*HR_ROLES)
def update_leave_request(id):
    """Edit the request itself. HR only — a supervisor files, HR maintains."""
    leave = EmployeeLeaveRequest.query.get(id)
    if not leave:
        return jsonify({"error": "Leave request not found"}), 404

    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    cleaned, error = _validate_payload(data, partial=True)
    if error:
        return jsonify({"error": error}), 400

    start_date = cleaned.get("start_date", leave.start_date)
    end_date = cleaned.get("end_date", leave.end_date)
    employee_id = cleaned.get("employee_id", leave.employee_id)

    conflicts = _overlapping(employee_id, start_date, end_date, exclude_id=leave.id)
    if conflicts:
        other = conflicts[0]
        return jsonify({
            "error": f"This employee already has leave from {other.start_date} to "
                     f"{other.end_date} ({other.status}). Overlapping requests are not allowed.",
            "conflictingRequestId": other.id,
        }), 409

    for field, value in cleaned.items():
        setattr(leave, field, value)
    if "reason" in data:
        leave.reason = (data.get("reason") or "").strip() or None
    if "privateNotes" in data:
        leave.private_notes = (data.get("privateNotes") or "").strip() or None
    leave.updated_at = _now()

    db.session.commit()
    return jsonify(leave.to_dict("hr"))


@leave_bp.route("/<int:id>/decision", methods=["PATCH"])
@require_role(*HR_ROLES)
def decide_leave_request(id):
    """Approve or deny. Deliberately separate from the edit route: approving is
    a decision with staffing consequences, not a field update."""
    leave = EmployeeLeaveRequest.query.get(id)
    if not leave:
        return jsonify({"error": "Leave request not found"}), 404

    data = request.get_json() or {}
    decision = normalize_leave_status(data.get("status"))
    if decision not in ("approved", "denied"):
        return jsonify({"error": "status must be 'approved' or 'denied'"}), 400

    if leave.status == "cancelled":
        return jsonify({"error": "A cancelled request cannot be approved or denied."}), 409

    try:
        check_length(data.get("reviewNote"), 1000, "reviewNote")
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    # Approving means the person is unavailable: say so if they are already
    # rostered, rather than silently creating a staffing hole.
    rostered = []
    if decision == "approved":
        rostered = _rostered_shifts(leave)

    was_approved = leave.status == "approved"
    leave.status = decision
    leave.reviewed_at = _now()
    leave.reviewed_by = get_request_user_id()
    leave.reviewed_by_name = get_request_user_name()
    leave.review_note = (data.get("reviewNote") or "").strip() or None
    leave.updated_at = leave.reviewed_at

    # PTO ledger: approving a vacation/personal leave spends days (advisory — it
    # may take the balance negative); denying one that had been approved gives them
    # back. Non-PTO leave types are untouched.
    spent = None
    if decision == "approved":
        spent = pto.deduct_for_leave(leave, created_by=get_request_user_id())
    elif was_approved:
        pto.reverse_leave(leave)

    db.session.commit()

    body = leave.to_dict("hr")
    if rostered:
        body["rosteredShifts"] = rostered
    if spent:
        balance = pto.pto_balance(leave.employee_id)
        body["ptoSpent"] = spent
        body["ptoBalance"] = balance
        if balance < 0:
            body["balanceWarning"] = (
                f"Approved over budget — PTO balance is now {balance} day(s)."
            )
    return jsonify(body)


@leave_bp.route("/<int:id>/cancel", methods=["PATCH"])
@require_role(*HR_ROLES)
def cancel_leave_request(id):
    leave = EmployeeLeaveRequest.query.get(id)
    if not leave:
        return jsonify({"error": "Leave request not found"}), 404

    # Cancelling an approved PTO leave returns the days it spent.
    if leave.status == "approved":
        pto.reverse_leave(leave)
    leave.status = "cancelled"
    leave.updated_at = _now()
    db.session.commit()
    return jsonify(leave.to_dict("hr"))


@leave_bp.route("/<int:id>", methods=["DELETE"])
@require_role("admin")
def delete_leave_request(id):
    """Hard delete, admin only. Cancelling is the normal path — it keeps the
    record and its review trail."""
    leave = EmployeeLeaveRequest.query.get(id)
    if not leave:
        return jsonify({"error": "Leave request not found"}), 404

    # Remove any PTO ledger entries that reference this leave first (their FK would
    # otherwise block the delete and orphan the balance).
    pto.reverse_leave(leave)
    db.session.delete(leave)
    db.session.commit()
    return jsonify({"message": "Leave request deleted"})


def _rostered_shifts(leave):
    """Shifts the employee is already on inside the leave range."""
    units = DailyCrewUnit.query.filter(
        DailyCrewUnit.shift_date >= leave.start_date,
        DailyCrewUnit.shift_date <= leave.end_date,
        DailyCrewUnit.shift_status.notin_(["cancelled", "completed"]),
        db.or_(
            DailyCrewUnit.driver_id == leave.employee_id,
            DailyCrewUnit.medical_id == leave.employee_id,
            DailyCrewUnit.assist1_id == leave.employee_id,
            DailyCrewUnit.assist2_id == leave.employee_id,
        ),
    ).order_by(DailyCrewUnit.shift_date).all()

    return [
        {
            "unitId": u.id,
            "shiftDate": u.shift_date,
            "truckNumber": u.truck_number,
            "startTime": u.start_time,
        }
        for u in units
    ]
