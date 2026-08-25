"""Tasks and task collaboration (participants, comments, activity)."""

from .base import db


class Task(db.Model):
    __tablename__ = "task"

    id = db.Column(db.Integer, primary_key=True)

    # Tenant owner. The only top-level tenant entity that lacked org_id; added so
    # tasks are isolated like the other org-owned records (its child tables —
    # participants, comments, activity — inherit the tenant through the task).
    org_id = db.Column(db.Integer, db.ForeignKey("organization.id"), nullable=True, index=True)

    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, nullable=True)

    task_type = db.Column(db.String(50), nullable=False, default="General Task")
    status = db.Column(db.String(30), nullable=False, default="New", index=True)
    priority = db.Column(db.String(20), nullable=False, default="Normal")

    created_by_user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)
    assigned_to_employee_id = db.Column(db.Integer, db.ForeignKey("employee.id"), nullable=True, index=True)
    assigned_by_user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)

    # Polymorphic link to another module's record (call/patient/employee/crew/vehicle).
    # No FK constraint on purpose — related_module determines which table entity_id points to.
    related_module = db.Column(db.String(50), nullable=True)
    related_entity_id = db.Column(db.Integer, nullable=True)

    due_date = db.Column(db.String(20), nullable=True, index=True)  # YYYY-MM-DD, date-only
    completed_at = db.Column(db.String(50), nullable=True)

    created_at = db.Column(db.String(50), nullable=False)
    updated_at = db.Column(db.String(50), nullable=False)

    is_archived = db.Column(db.Boolean, default=False)

    # When true, the task is an announcement visible to every known-role user
    # (in addition to its creator/assignee/participants).
    visible_to_all = db.Column(db.Boolean, default=False, nullable=False)

    assignee = db.relationship("Employee", foreign_keys=[assigned_to_employee_id])
    creator = db.relationship("User", foreign_keys=[created_by_user_id])
    participants = db.relationship(
        "TaskParticipant", back_populates="task", cascade="all, delete-orphan"
    )

    TERMINAL_STATUSES = {"Completed", "Cancelled"}

    def participant_employee_ids(self):
        return [p.employee_id for p in self.participants]

    def is_overdue(self):
        if not self.due_date or self.status in self.TERMINAL_STATUSES:
            return False
        from datetime import date
        try:
            return date.fromisoformat(self.due_date) < date.today()
        except ValueError:
            return False

    def to_dict(self):
        emp = self.assignee
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "task_type": self.task_type,
            "status": self.status,
            "priority": self.priority,
            "created_by_user_id": self.created_by_user_id,
            "created_by_user_name": self.creator.display_name if self.creator else None,
            "assigned_to_employee_id": self.assigned_to_employee_id,
            "assigned_to_employee_name": f"{emp.first_name} {emp.last_name}" if emp else None,
            "assigned_to_employee_active": emp.is_active if emp else None,
            "assigned_by_user_id": self.assigned_by_user_id,
            "related_module": self.related_module,
            "related_entity_id": self.related_entity_id,
            "due_date": self.due_date,
            "completed_at": self.completed_at,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "is_archived": self.is_archived,
            "is_overdue": self.is_overdue(),
            "visible_to_all": bool(self.visible_to_all),
            "participant_employee_ids": self.participant_employee_ids(),
        }


class TaskParticipant(db.Model):
    """Additional employees who can see a task (beyond its creator/assignee).

    Kept employee-scoped to mirror `assigned_to_employee_id` so the same
    logged-in-user → employee_id resolution drives visibility everywhere.
    """
    __tablename__ = "task_participant"
    __table_args__ = (db.UniqueConstraint("task_id", "employee_id", name="uq_task_participant"),)

    id = db.Column(db.Integer, primary_key=True)
    task_id = db.Column(db.Integer, db.ForeignKey("task.id"), nullable=False)
    employee_id = db.Column(db.Integer, db.ForeignKey("employee.id"), nullable=False)

    task = db.relationship("Task", back_populates="participants")
    employee = db.relationship("Employee", foreign_keys=[employee_id])


class TaskComment(db.Model):
    __tablename__ = "task_comment"

    id = db.Column(db.Integer, primary_key=True)
    task_id = db.Column(db.Integer, db.ForeignKey("task.id"), nullable=False, index=True)
    author_user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)
    author_name = db.Column(db.String(150), nullable=True)  # denormalized for display after user deletion

    comment_text = db.Column(db.Text, nullable=False)

    created_at = db.Column(db.String(50), nullable=False)
    updated_at = db.Column(db.String(50), nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "task_id": self.task_id,
            "author_user_id": self.author_user_id,
            "author_name": self.author_name or "System",
            "comment_text": self.comment_text,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


class TaskActivityLog(db.Model):
    __tablename__ = "task_activity_log"

    id = db.Column(db.Integer, primary_key=True)
    task_id = db.Column(db.Integer, db.ForeignKey("task.id"), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)
    user_name = db.Column(db.String(150), nullable=True)  # denormalized for display after user deletion

    # created/assigned/status_changed/priority_changed/due_date_changed/completed/cancelled/commented
    action_type = db.Column(db.String(50), nullable=False)
    old_value = db.Column(db.Text, nullable=True)
    new_value = db.Column(db.Text, nullable=True)

    created_at = db.Column(db.String(50), nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "task_id": self.task_id,
            "user_id": self.user_id,
            "user_name": self.user_name or "System",
            "action_type": self.action_type,
            "old_value": self.old_value,
            "new_value": self.new_value,
            "created_at": self.created_at,
        }


# ── Employee leave / absence (roadmap Phase 4d) ─────────────────────────────
