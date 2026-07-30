"""Employee self-service portal — the one surface an `employee` login may reach.

Every route is gated to the `employee` role and resolves "me" from the session's
user → `User.employee_id` → `Employee`. It never accepts an employee id from the
client, so a portal user can only ever see and act on their own record. All other
ops/HR endpoints already fail closed on the `employee` role, so this is the whole
of what a crew member can do: view their schedule, work their tasks, and view or
request leave.
"""

from flask import Blueprint, jsonify, request

from models import db, User, Employee, Task, EmployeeLeaveRequest, TimeEntry, EmployeeDocument
from utils.auth_utils import (
    require_role, get_request_user_id, get_request_user_name,
)
from utils.employee_shifts import employee_shifts
from utils.time_clock import active_clock_entry, clock_in, clock_out
from storage import get_file_response

# Reuse the real leave validation and the worker-facing task statuses so the
# portal cannot drift from the rules the rest of the app enforces.
from routes.leave_routes import _validate_payload, _overlapping, _now
from routes.task_routes import WORKER_ALLOWED_STATUSES, _record_activity


portal_bp = Blueprint("portal", __name__, url_prefix="/api/portal")


def _me():
    """The Employee behind the signed-in portal user.

    Returns (employee, None) or (None, (response, status)) when the account is not
    linked to an employee record — a clean 409 rather than a crash.
    """
    user = User.query.get(get_request_user_id())
    employee = Employee.query.get(user.employee_id) if user and user.employee_id else None
    if employee is None:
        return None, (jsonify({
            "error": "This account is not linked to an employee record. "
                     "Ask an administrator to link it.",
        }), 409)
    return employee, None


@portal_bp.route("/me", methods=["GET"])
@require_role("employee")
def my_profile():
    """The employee's own profile and certifications (no kiosk PIN, no pay)."""
    employee, err = _me()
    if err:
        return err
    return jsonify(employee.to_dict())   # include_pin defaults False


@portal_bp.route("/me/schedule", methods=["GET"])
@require_role("employee")
def my_schedule():
    employee, err = _me()
    if err:
        return err
    try:
        limit = int(request.args.get("limit", 50))
    except (TypeError, ValueError):
        return jsonify({"error": "limit must be an integer"}), 400
    return jsonify(employee_shifts(employee.id, limit))


@portal_bp.route("/me/tasks", methods=["GET"])
@require_role("employee")
def my_tasks():
    employee, err = _me()
    if err:
        return err
    tasks = (
        Task.query
        .filter(Task.assigned_to_employee_id == employee.id, Task.is_archived.is_(False))
        .order_by(Task.due_date.is_(None), Task.due_date.asc(), Task.id.desc())
        .all()
    )
    return jsonify([t.to_dict() for t in tasks])


@portal_bp.route("/me/tasks/<int:task_id>", methods=["PATCH"])
@require_role("employee")
def update_my_task(task_id):
    """Move one of my own tasks along. Workers set In Progress / Waiting / Done;
    closing (Completed / Cancelled) stays with the task's creator."""
    employee, err = _me()
    if err:
        return err

    task = Task.query.get(task_id)
    if not task or task.assigned_to_employee_id != employee.id or task.is_archived:
        return jsonify({"error": "Task not found"}), 404

    new_status = (request.get_json() or {}).get("status", "").strip()
    if new_status not in WORKER_ALLOWED_STATUSES:
        return jsonify({"error": f"Status must be one of: {sorted(WORKER_ALLOWED_STATUSES)}"}), 400

    old_status = task.status
    task.status = new_status
    task.updated_at = _now()
    _record_activity(task, "status_changed", old_status, new_status,
                     get_request_user_id(), get_request_user_name())
    db.session.commit()
    return jsonify(task.to_dict())


@portal_bp.route("/me/leave", methods=["GET"])
@require_role("employee")
def my_leave():
    employee, err = _me()
    if err:
        return err
    requests = (
        EmployeeLeaveRequest.query
        .filter(EmployeeLeaveRequest.employee_id == employee.id)
        .order_by(EmployeeLeaveRequest.start_date.desc())
        .all()
    )
    # "scheduling" visibility: the employee sees their own request but not HR's
    # private review notes.
    return jsonify([r.to_dict("scheduling") for r in requests])


@portal_bp.route("/me/leave", methods=["POST"])
@require_role("employee")
def request_leave():
    """File a leave request for myself. Always pending; the employee id is forced
    to me, so a crafted payload cannot file on someone else's behalf."""
    employee, err = _me()
    if err:
        return err

    data = {**(request.get_json() or {}), "employeeId": employee.id}
    cleaned, error = _validate_payload(data)
    if error:
        return jsonify({"error": error}), 400
    cleaned["employee_id"] = employee.id  # belt and suspenders — never the client's

    conflicts = _overlapping(employee.id, cleaned["start_date"], cleaned["end_date"])
    if conflicts:
        other = conflicts[0]
        return jsonify({
            "error": f"You already have leave from {other.start_date} to "
                     f"{other.end_date} ({other.status}).",
            "conflictingRequestId": other.id,
        }), 409

    now = _now()
    leave = EmployeeLeaveRequest(
        **cleaned,
        status="pending",
        reason=(data.get("reason") or "").strip() or None,
        submitted_at=now,
        submitted_by=get_request_user_id(),
        submitted_by_name=get_request_user_name(),
        created_at=now,
        updated_at=now,
    )
    db.session.add(leave)
    db.session.commit()
    return jsonify(leave.to_dict("scheduling")), 201


# ── Clock in / out (session, not the shared PIN kiosk) ───────────────────────

@portal_bp.route("/me/clock", methods=["GET"])
@require_role("employee")
def my_clock_status():
    employee, err = _me()
    if err:
        return err
    active = active_clock_entry(employee.id)
    return jsonify({
        "clockedIn": active is not None,
        "since": active.clock_in if active else None,
        "entryId": active.id if active else None,
    })


@portal_bp.route("/me/clock/in", methods=["POST"])
@require_role("employee")
def my_clock_in():
    employee, err = _me()
    if err:
        return err
    entry, active = clock_in(employee.id)
    if active:
        return jsonify({"error": "You are already clocked in.", "entryId": active.id}), 409
    return jsonify(entry.to_dict()), 201


@portal_bp.route("/me/clock/out", methods=["POST"])
@require_role("employee")
def my_clock_out():
    employee, err = _me()
    if err:
        return err
    entry, _unused = clock_out(employee.id)
    if not entry:
        return jsonify({"error": "You are not clocked in."}), 409
    return jsonify(entry.to_dict())


# ── Hours ────────────────────────────────────────────────────────────────────

@portal_bp.route("/me/hours", methods=["GET"])
@require_role("employee")
def my_hours():
    """My recent time entries, plus the total worked minutes across them."""
    employee, err = _me()
    if err:
        return err
    try:
        limit = min(int(request.args.get("limit", 60)), 300)
    except (TypeError, ValueError):
        return jsonify({"error": "limit must be an integer"}), 400

    entries = (
        TimeEntry.query
        .filter(TimeEntry.employee_id == employee.id)
        .order_by(TimeEntry.clock_in.desc())
        .limit(limit)
        .all()
    )
    rows = [e.to_dict() for e in entries]
    total_minutes = sum(r["duration_minutes"] or 0 for r in rows)
    return jsonify({"entries": rows, "totalMinutes": total_minutes})


# ── Documents (own, read-only) ───────────────────────────────────────────────

@portal_bp.route("/me/documents", methods=["GET"])
@require_role("employee")
def my_documents():
    employee, err = _me()
    if err:
        return err
    docs = (
        EmployeeDocument.query
        .filter_by(employee_id=employee.id)
        .order_by(EmployeeDocument.uploaded_at.desc())
        .all()
    )
    return jsonify([d.to_dict() for d in docs])


@portal_bp.route("/me/documents/<int:doc_id>/file", methods=["GET"])
@require_role("employee")
def my_document_file(doc_id):
    """Download one of my own document files. Scoped to me: a document that is not
    mine is a 404, never someone else's file."""
    employee, err = _me()
    if err:
        return err
    doc = EmployeeDocument.query.get(doc_id)
    if not doc or doc.employee_id != employee.id:
        return jsonify({"error": "Document not found"}), 404
    if not doc.file_path:
        return jsonify({"error": "No file attached to this document"}), 404
    return get_file_response(doc.file_path, download_name=doc.file_name)
