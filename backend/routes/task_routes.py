from datetime import datetime, date

from flask import Blueprint, jsonify, request

from models import db, Task, TaskComment, TaskActivityLog, User, Employee
from audit_utils import log_action
from notification_utils import notify_user
from utils.validation_utils import check_length, is_valid_date

task_bp = Blueprint("task", __name__, url_prefix="/api")

ALLOWED_TASK_TYPES = {
    "General Task", "Dispatcher Task", "HR Task", "Patient Follow-up",
    "Call Review", "Billing / Insurance", "Crew / Unit Issue",
    "Employee Documentation", "Training", "Compliance",
    "Internal Project", "Maintenance", "Other",
}
ALLOWED_STATUSES = {"New", "Assigned", "In Progress", "Waiting", "Done", "Completed", "Cancelled"}
ALLOWED_PRIORITIES = {"Low", "Normal", "High", "Urgent"}
HR_TASK_TYPES = {"HR Task", "Employee Documentation", "Training", "Compliance"}
CREATE_ROLES = {"admin", "supervisor", "hr"}
KNOWN_ROLES = {"admin", "supervisor", "hr", "dispatcher"}

# Only the task's creator/assigner (or an admin) may move it into a closed
# state. Everyone else — including the assignee doing the work — can only
# mark their own progress up to "Done" and hand it back for review.
CLOSE_STATUSES = {"Completed", "Cancelled"}
WORKER_ALLOWED_STATUSES = {"In Progress", "Waiting", "Done"}


def _can_close_task(task, role, uid):
    return role == "admin" or uid == task.assigned_by_user_id or uid == task.created_by_user_id

TASK_FIELD_LIMITS = {
    "title": 200,
    "description": 5000,
}


def _role_from_request():
    return request.headers.get("X-User-Role", "")


def _user_id_from_request():
    try:
        return int(request.headers.get("X-User-Id", 0)) or None
    except (ValueError, TypeError):
        return None


def _user_name_from_request():
    return request.headers.get("X-User-Name") or None


def _now():
    return datetime.now().isoformat(timespec="seconds")


def _current_employee_id(uid):
    if not uid:
        return None
    user = User.query.get(uid)
    return user.employee_id if user else None


def _notify_assignee(task):
    """Bell notification for whichever user account is linked to the newly
    assigned employee, if any (an employee doesn't necessarily have a login)."""
    if not task.assigned_to_employee_id:
        return
    assignee_user = User.query.filter_by(employee_id=task.assigned_to_employee_id).first()
    if not assignee_user:
        return
    notify_user(
        assignee_user.id, "task_assigned", "info",
        f"New task assigned: {task.title}",
        f"{task.task_type} — priority {task.priority}" + (f", due {task.due_date}" if task.due_date else ""),
        entity_type="task", entity_id=task.id,
    )


def _record_activity(task, action_type, old_value, new_value, uid, uname):
    """Write a TaskActivityLog row (per-task timeline) and mirror a summary
    line into the global AuditLog, so Tasks show up in the system-wide audit
    trail the same way every other module does."""
    entry = TaskActivityLog(
        task_id=task.id,
        user_id=uid,
        user_name=uname or "System",
        action_type=action_type,
        old_value=old_value,
        new_value=new_value,
        created_at=_now(),
    )
    db.session.add(entry)
    if action_type != "commented":
        log_action(f"task.{action_type}", "task", task.id, task.title,
                    {"old": old_value, "new": new_value} if (old_value or new_value) else None,
                    user_id=uid, user_name=uname)


def _visible_tasks_query(query, role, uid, employee_id):
    """Apply role-based visibility scoping to a Task query."""
    if role in ("admin", "supervisor"):
        return query
    if role == "hr":
        conditions = [Task.task_type.in_(HR_TASK_TYPES), Task.created_by_user_id == uid]
        if employee_id:
            conditions.append(Task.assigned_to_employee_id == employee_id)
        return query.filter(db.or_(*conditions))
    if role == "dispatcher":
        if not employee_id:
            return query.filter(db.false())
        return query.filter(Task.assigned_to_employee_id == employee_id)
    return query.filter(db.false())


def _can_view_task(task, role, uid, employee_id):
    if role in ("admin", "supervisor"):
        return True
    if role == "hr":
        return (task.task_type in HR_TASK_TYPES
                or (employee_id and task.assigned_to_employee_id == employee_id)
                or task.created_by_user_id == uid)
    if role == "dispatcher":
        return employee_id is not None and task.assigned_to_employee_id == employee_id
    return False


def _validate_task_fields(data):
    for field, max_len in TASK_FIELD_LIMITS.items():
        if field in data:
            check_length(data.get(field), max_len, field)


# ── List / summary ───────────────────────────────────────────────────────────

@task_bp.route("/tasks", methods=["GET"])
def get_tasks():
    role = _role_from_request()
    if role not in KNOWN_ROLES:
        return jsonify({"error": "Insufficient permissions"}), 403
    uid = _user_id_from_request()
    employee_id = _current_employee_id(uid)

    query = Task.query
    if request.args.get("is_archived", "").strip() == "1":
        query = query.filter(Task.is_archived.is_(True))
    else:
        query = query.filter(Task.is_archived.is_(False))

    assigned_to = request.args.get("assigned_to_employee_id", "").strip()
    if assigned_to:
        try:
            query = query.filter(Task.assigned_to_employee_id == int(assigned_to))
        except ValueError:
            return jsonify({"error": "assigned_to_employee_id must be an integer"}), 400

    status = request.args.get("status", "").strip()
    if status:
        query = query.filter(Task.status == status)

    priority = request.args.get("priority", "").strip()
    if priority:
        query = query.filter(Task.priority == priority)

    task_type = request.args.get("task_type", "").strip()
    if task_type:
        query = query.filter(Task.task_type == task_type)

    created_by = request.args.get("created_by_user_id", "").strip()
    if created_by:
        try:
            query = query.filter(Task.created_by_user_id == int(created_by))
        except ValueError:
            return jsonify({"error": "created_by_user_id must be an integer"}), 400

    related_module = request.args.get("related_module", "").strip()
    if related_module:
        query = query.filter(Task.related_module == related_module)

    related_entity_id = request.args.get("related_entity_id", "").strip()
    if related_entity_id:
        try:
            query = query.filter(Task.related_entity_id == int(related_entity_id))
        except ValueError:
            return jsonify({"error": "related_entity_id must be an integer"}), 400

    due_before = request.args.get("due_before", "").strip()
    if due_before:
        query = query.filter(Task.due_date <= due_before)

    due_after = request.args.get("due_after", "").strip()
    if due_after:
        query = query.filter(Task.due_date >= due_after)

    if request.args.get("overdue", "").strip() == "1":
        today = date.today().isoformat()
        query = query.filter(Task.due_date < today, Task.status.notin_(Task.TERMINAL_STATUSES))

    query = _visible_tasks_query(query, role, uid, employee_id)

    page = request.args.get("page", 1, type=int)
    per_page = min(request.args.get("per_page", 25, type=int), 100)

    pagination = query.order_by(Task.id.desc()).paginate(page=page, per_page=per_page, error_out=False)

    return jsonify({
        "items": [t.to_dict() for t in pagination.items],
        "total": pagination.total,
        "page": pagination.page,
        "per_page": pagination.per_page,
        "pages": pagination.pages,
    })


@task_bp.route("/tasks/my", methods=["GET"])
def get_my_tasks():
    role = _role_from_request()
    if role not in KNOWN_ROLES:
        return jsonify({"error": "Insufficient permissions"}), 403
    uid = _user_id_from_request()
    employee_id = _current_employee_id(uid)

    query = Task.query.filter(Task.is_archived.is_(False))

    conditions = []
    if employee_id:
        conditions.append(Task.assigned_to_employee_id == employee_id)
    if role in ("admin", "supervisor", "hr"):
        conditions.append(Task.created_by_user_id == uid)

    if not conditions:
        return jsonify({"items": [], "total": 0, "page": 1, "per_page": 25, "pages": 0})

    query = query.filter(db.or_(*conditions))

    page = request.args.get("page", 1, type=int)
    per_page = min(request.args.get("per_page", 25, type=int), 100)
    pagination = query.order_by(Task.id.desc()).paginate(page=page, per_page=per_page, error_out=False)

    return jsonify({
        "items": [t.to_dict() for t in pagination.items],
        "total": pagination.total,
        "page": pagination.page,
        "per_page": pagination.per_page,
        "pages": pagination.pages,
    })


@task_bp.route("/tasks/summary", methods=["GET"])
def get_tasks_summary():
    role = _role_from_request()
    if role not in KNOWN_ROLES:
        return jsonify({"error": "Insufficient permissions"}), 403
    uid = _user_id_from_request()
    employee_id = _current_employee_id(uid)
    today = date.today().isoformat()

    my_conditions = []
    if employee_id:
        my_conditions.append(Task.assigned_to_employee_id == employee_id)
    if role in ("admin", "supervisor", "hr"):
        my_conditions.append(Task.created_by_user_id == uid)

    base = Task.query.filter(Task.is_archived.is_(False))
    if my_conditions:
        my_query = base.filter(db.or_(*my_conditions))
        my_open = my_query.filter(Task.status.notin_(Task.TERMINAL_STATUSES)).count()
        my_overdue = my_query.filter(
            Task.due_date < today, Task.status.notin_(Task.TERMINAL_STATUSES)
        ).count()
        due_today = my_query.filter(
            Task.due_date == today, Task.status.notin_(Task.TERMINAL_STATUSES)
        ).count()
    else:
        my_open = my_overdue = due_today = 0

    summary = {"my_open": my_open, "my_overdue": my_overdue, "due_today": due_today}

    if role in ("admin", "supervisor"):
        summary["total_open"] = base.filter(Task.status.notin_(Task.TERMINAL_STATUSES)).count()
        summary["total_overdue"] = base.filter(
            Task.due_date < today, Task.status.notin_(Task.TERMINAL_STATUSES)
        ).count()
        summary["unassigned_count"] = base.filter(
            Task.assigned_to_employee_id.is_(None), Task.status.notin_(Task.TERMINAL_STATUSES)
        ).count()

    return jsonify(summary)


# ── Single task CRUD ─────────────────────────────────────────────────────────

@task_bp.route("/tasks/<int:id>", methods=["GET"])
def get_task(id):
    role = _role_from_request()
    if role not in KNOWN_ROLES:
        return jsonify({"error": "Insufficient permissions"}), 403
    task = Task.query.get_or_404(id)
    uid = _user_id_from_request()
    employee_id = _current_employee_id(uid)
    if not _can_view_task(task, role, uid, employee_id):
        return jsonify({"error": "Insufficient permissions"}), 403
    return jsonify(task.to_dict())


@task_bp.route("/tasks", methods=["POST"])
def create_task():
    role = _role_from_request()
    if role not in CREATE_ROLES:
        return jsonify({"error": "Insufficient permissions"}), 403

    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    title = (data.get("title") or "").strip()
    if not title:
        return jsonify({"error": "title is required"}), 400

    task_type = (data.get("task_type") or "General Task").strip()
    if task_type not in ALLOWED_TASK_TYPES:
        return jsonify({"error": f"Invalid task_type. Must be one of: {sorted(ALLOWED_TASK_TYPES)}"}), 400
    if role == "hr" and task_type not in HR_TASK_TYPES:
        return jsonify({"error": "HR can only create HR-related task types"}), 403

    priority = (data.get("priority") or "Normal").strip()
    if priority not in ALLOWED_PRIORITIES:
        return jsonify({"error": f"Invalid priority. Must be one of: {sorted(ALLOWED_PRIORITIES)}"}), 400

    due_date = (data.get("due_date") or "").strip() or None
    if due_date and not is_valid_date(due_date):
        return jsonify({"error": "Invalid due_date. Expected YYYY-MM-DD."}), 400

    assigned_to_employee_id = data.get("assigned_to_employee_id")
    if assigned_to_employee_id:
        try:
            assigned_to_employee_id = int(assigned_to_employee_id)
        except (TypeError, ValueError):
            return jsonify({"error": "assigned_to_employee_id must be an integer"}), 400
        Employee.query.get_or_404(assigned_to_employee_id)
    else:
        assigned_to_employee_id = None

    try:
        _validate_task_fields(data)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    uid, uname = _user_id_from_request(), _user_name_from_request()
    now = _now()
    task = Task(
        title=title,
        description=data.get("description"),
        task_type=task_type,
        status="Assigned" if assigned_to_employee_id else "New",
        priority=priority,
        created_by_user_id=uid,
        assigned_to_employee_id=assigned_to_employee_id,
        assigned_by_user_id=uid if assigned_to_employee_id else None,
        related_module=(data.get("related_module") or "").strip() or None,
        related_entity_id=data.get("related_entity_id") or None,
        due_date=due_date,
        created_at=now,
        updated_at=now,
    )
    db.session.add(task)
    db.session.flush()

    _record_activity(task, "created", None, title, uid, uname)
    db.session.commit()
    _notify_assignee(task)

    return jsonify(task.to_dict()), 201


@task_bp.route("/tasks/<int:id>", methods=["PUT"])
def update_task(id):
    role = _role_from_request()
    if role not in CREATE_ROLES:
        return jsonify({"error": "Insufficient permissions"}), 403

    task = Task.query.get_or_404(id)
    if role == "hr" and task.task_type not in HR_TASK_TYPES:
        return jsonify({"error": "Insufficient permissions"}), 403

    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    title = (data.get("title") or "").strip()
    if not title:
        return jsonify({"error": "title is required"}), 400

    task_type = (data.get("task_type") or task.task_type).strip()
    if task_type not in ALLOWED_TASK_TYPES:
        return jsonify({"error": f"Invalid task_type. Must be one of: {sorted(ALLOWED_TASK_TYPES)}"}), 400
    if role == "hr" and task_type not in HR_TASK_TYPES:
        return jsonify({"error": "HR can only set HR-related task types"}), 403

    priority = (data.get("priority") or task.priority).strip()
    if priority not in ALLOWED_PRIORITIES:
        return jsonify({"error": f"Invalid priority. Must be one of: {sorted(ALLOWED_PRIORITIES)}"}), 400

    due_date = data.get("due_date", task.due_date)
    due_date = (due_date or "").strip() or None
    if due_date and not is_valid_date(due_date):
        return jsonify({"error": "Invalid due_date. Expected YYYY-MM-DD."}), 400

    try:
        _validate_task_fields(data)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    uid, uname = _user_id_from_request(), _user_name_from_request()

    if task.priority != priority:
        _record_activity(task, "priority_changed", task.priority, priority, uid, uname)
    if task.due_date != due_date:
        _record_activity(task, "due_date_changed", task.due_date, due_date, uid, uname)

    task.title = title
    task.description = data.get("description", task.description)
    task.task_type = task_type
    task.priority = priority
    task.due_date = due_date
    task.related_module = (data.get("related_module") or task.related_module or "").strip() or None
    task.related_entity_id = data.get("related_entity_id", task.related_entity_id)
    task.updated_at = _now()

    db.session.commit()
    return jsonify(task.to_dict())


@task_bp.route("/tasks/<int:id>/status", methods=["PATCH"])
def update_task_status(id):
    role = _role_from_request()
    if role not in KNOWN_ROLES:
        return jsonify({"error": "Insufficient permissions"}), 403

    task = Task.query.get_or_404(id)
    uid = _user_id_from_request()
    employee_id = _current_employee_id(uid)
    if not _can_view_task(task, role, uid, employee_id):
        return jsonify({"error": "Insufficient permissions"}), 403

    data = request.get_json() or {}
    new_status = (data.get("status") or "").strip()
    if new_status not in ALLOWED_STATUSES:
        return jsonify({"error": f"Invalid status. Must be one of: {sorted(ALLOWED_STATUSES)}"}), 400

    if new_status in CLOSE_STATUSES and not _can_close_task(task, role, uid):
        return jsonify({"error": "Only the task's creator or assigner can close this task"}), 403
    if role not in CREATE_ROLES and new_status not in WORKER_ALLOWED_STATUSES and new_status not in CLOSE_STATUSES:
        return jsonify({"error": f"You can only set status to one of: {sorted(WORKER_ALLOWED_STATUSES)}"}), 403

    uname = _user_name_from_request()
    old_status = task.status
    task.status = new_status
    task.updated_at = _now()
    if new_status == "Completed":
        task.completed_at = _now()
    elif old_status == "Completed":
        task.completed_at = None

    _record_activity(task, "status_changed", old_status, new_status, uid, uname)
    db.session.commit()
    return jsonify(task.to_dict())


@task_bp.route("/tasks/<int:id>/assign", methods=["PATCH"])
def assign_task(id):
    role = _role_from_request()
    if role not in CREATE_ROLES:
        return jsonify({"error": "Insufficient permissions"}), 403

    task = Task.query.get_or_404(id)
    if role == "hr" and task.task_type not in HR_TASK_TYPES:
        return jsonify({"error": "Insufficient permissions"}), 403

    data = request.get_json() or {}
    assigned_to_employee_id = data.get("assigned_to_employee_id")
    if assigned_to_employee_id:
        try:
            assigned_to_employee_id = int(assigned_to_employee_id)
        except (TypeError, ValueError):
            return jsonify({"error": "assigned_to_employee_id must be an integer"}), 400
        Employee.query.get_or_404(assigned_to_employee_id)
    else:
        assigned_to_employee_id = None

    uid, uname = _user_id_from_request(), _user_name_from_request()
    old_assignee = task.assigned_to_employee_id
    task.assigned_to_employee_id = assigned_to_employee_id
    task.assigned_by_user_id = uid
    if assigned_to_employee_id and task.status == "New":
        task.status = "Assigned"
    task.updated_at = _now()

    _record_activity(task, "assigned", str(old_assignee) if old_assignee else None,
                      str(assigned_to_employee_id) if assigned_to_employee_id else None, uid, uname)
    db.session.commit()
    if assigned_to_employee_id and assigned_to_employee_id != old_assignee:
        _notify_assignee(task)
    return jsonify(task.to_dict())


@task_bp.route("/tasks/<int:id>", methods=["DELETE"])
def archive_task(id):
    role = _role_from_request()
    if role not in ("admin", "supervisor"):
        return jsonify({"error": "Insufficient permissions"}), 403

    task = Task.query.get_or_404(id)
    uid, uname = _user_id_from_request(), _user_name_from_request()
    task.is_archived = True
    task.updated_at = _now()

    _record_activity(task, "archived", None, None, uid, uname)
    db.session.commit()
    return jsonify({"message": "Task archived successfully", "task": task.to_dict()})


# ── Comments ─────────────────────────────────────────────────────────────────

@task_bp.route("/tasks/<int:id>/comments", methods=["GET"])
def get_task_comments(id):
    role = _role_from_request()
    if role not in KNOWN_ROLES:
        return jsonify({"error": "Insufficient permissions"}), 403
    task = Task.query.get_or_404(id)
    uid = _user_id_from_request()
    employee_id = _current_employee_id(uid)
    if not _can_view_task(task, role, uid, employee_id):
        return jsonify({"error": "Insufficient permissions"}), 403

    comments = TaskComment.query.filter_by(task_id=id).order_by(TaskComment.id.asc()).all()
    return jsonify([c.to_dict() for c in comments])


@task_bp.route("/tasks/<int:id>/comments", methods=["POST"])
def create_task_comment(id):
    role = _role_from_request()
    if role not in KNOWN_ROLES:
        return jsonify({"error": "Insufficient permissions"}), 403
    task = Task.query.get_or_404(id)
    uid = _user_id_from_request()
    employee_id = _current_employee_id(uid)
    if not _can_view_task(task, role, uid, employee_id):
        return jsonify({"error": "Insufficient permissions"}), 403

    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    comment_text = (data.get("comment_text") or "").strip()
    if not comment_text:
        return jsonify({"error": "comment_text is required"}), 400
    try:
        check_length(comment_text, 2000, "comment_text")
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    uname = _user_name_from_request()
    now = _now()
    comment = TaskComment(
        task_id=id,
        author_user_id=uid,
        author_name=uname or "System",
        comment_text=comment_text,
        created_at=now,
        updated_at=now,
    )
    db.session.add(comment)
    db.session.flush()

    _record_activity(task, "commented", None, comment_text[:200], uid, uname)
    db.session.commit()

    return jsonify(comment.to_dict()), 201


# ── Activity ─────────────────────────────────────────────────────────────────

@task_bp.route("/tasks/<int:id>/activity", methods=["GET"])
def get_task_activity(id):
    role = _role_from_request()
    if role not in KNOWN_ROLES:
        return jsonify({"error": "Insufficient permissions"}), 403
    task = Task.query.get_or_404(id)
    uid = _user_id_from_request()
    employee_id = _current_employee_id(uid)
    if not _can_view_task(task, role, uid, employee_id):
        return jsonify({"error": "Insufficient permissions"}), 403

    entries = TaskActivityLog.query.filter_by(task_id=id).order_by(TaskActivityLog.id.asc()).all()
    return jsonify([e.to_dict() for e in entries])
