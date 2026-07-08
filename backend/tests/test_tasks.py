import pytest
from werkzeug.security import generate_password_hash

from models import db, User, Employee


@pytest.fixture()
def employee(app):
    emp = Employee(first_name="Test", last_name="Employee", role="EMT")
    db.session.add(emp)
    db.session.commit()
    return emp


@pytest.fixture()
def roles(app, employee):
    """One User per role. The dispatcher is linked to `employee` so
    assignee-permission checks (view/status) have someone to test against."""
    specs = {
        "admin": None,
        "supervisor": None,
        "dispatcher": employee.id,
        "hr": None,
    }
    headers = {}
    for role, emp_id in specs.items():
        user = User(
            username=f"test_{role}",
            password_hash=generate_password_hash("pw"),
            display_name=f"Test {role.title()}",
            role=role,
            is_active=True,
            employee_id=emp_id,
        )
        db.session.add(user)
        db.session.flush()
        headers[role] = {"X-User-Id": str(user.id), "X-User-Role": role, "X-User-Name": user.display_name}
    db.session.commit()
    return headers


def create_task(client, headers, **overrides):
    payload = {"title": "Test Task", "task_type": "General Task", "priority": "Normal"}
    payload.update(overrides)
    return client.post("/api/tasks", json=payload, headers=headers)


# ── Create — validation + happy path ────────────────────────────────────────

def test_create_task_defaults_to_new_status(client, roles):
    resp = create_task(client, roles["admin"])
    assert resp.status_code == 201
    assert resp.get_json()["status"] == "New"


def test_create_task_missing_title(client, roles):
    resp = client.post("/api/tasks", json={"task_type": "General Task"}, headers=roles["admin"])
    assert resp.status_code == 400


def test_create_task_invalid_task_type(client, roles):
    resp = create_task(client, roles["admin"], task_type="Not A Real Type")
    assert resp.status_code == 400


def test_create_task_invalid_priority(client, roles):
    resp = create_task(client, roles["admin"], priority="Meh")
    assert resp.status_code == 400


# ── Assign + edit + status transitions ──────────────────────────────────────

def test_assign_bumps_status_to_assigned(client, roles, employee):
    task_id = create_task(client, roles["admin"]).get_json()["id"]
    resp = client.patch(f"/api/tasks/{task_id}/assign",
                         json={"assigned_to_employee_id": employee.id}, headers=roles["admin"])
    assert resp.status_code == 200
    assert resp.get_json()["status"] == "Assigned"


def test_edit_task_persists(client, roles):
    task_id = create_task(client, roles["admin"]).get_json()["id"]
    resp = client.put(f"/api/tasks/{task_id}",
                       json={"title": "Edited", "priority": "Urgent"}, headers=roles["admin"])
    assert resp.status_code == 200
    assert resp.get_json()["priority"] == "Urgent"


def test_status_completed_sets_completed_at(client, roles):
    task_id = create_task(client, roles["admin"]).get_json()["id"]
    resp = client.patch(f"/api/tasks/{task_id}/status", json={"status": "Completed"}, headers=roles["admin"])
    assert resp.status_code == 200
    assert resp.get_json()["completed_at"]


def test_status_leaving_completed_clears_completed_at(client, roles):
    task_id = create_task(client, roles["admin"]).get_json()["id"]
    client.patch(f"/api/tasks/{task_id}/status", json={"status": "Completed"}, headers=roles["admin"])
    resp = client.patch(f"/api/tasks/{task_id}/status", json={"status": "In Progress"}, headers=roles["admin"])
    assert resp.status_code == 200
    assert resp.get_json()["completed_at"] is None


def test_status_invalid_value(client, roles):
    task_id = create_task(client, roles["admin"]).get_json()["id"]
    resp = client.patch(f"/api/tasks/{task_id}/status", json={"status": "Bogus"}, headers=roles["admin"])
    assert resp.status_code == 400


# ── Close permission — only creator/assigner (or admin) may close ──────────

@pytest.fixture()
def assigned_task(client, roles, employee):
    """A task created by admin and assigned to the employee the dispatcher
    fixture is linked to, so the dispatcher acts as the task's assignee."""
    task_id = create_task(client, roles["admin"]).get_json()["id"]
    client.patch(f"/api/tasks/{task_id}/assign",
                 json={"assigned_to_employee_id": employee.id}, headers=roles["admin"])
    return task_id


def test_assignee_can_set_in_progress(client, roles, assigned_task):
    resp = client.patch(f"/api/tasks/{assigned_task}/status",
                         json={"status": "In Progress"}, headers=roles["dispatcher"])
    assert resp.status_code == 200


def test_assignee_can_set_done(client, roles, assigned_task):
    resp = client.patch(f"/api/tasks/{assigned_task}/status",
                         json={"status": "Done"}, headers=roles["dispatcher"])
    assert resp.status_code == 200


def test_assignee_cannot_close_task(client, roles, assigned_task):
    resp = client.patch(f"/api/tasks/{assigned_task}/status",
                         json={"status": "Completed"}, headers=roles["dispatcher"])
    assert resp.status_code == 403


def test_creator_can_close_task(client, roles, assigned_task):
    resp = client.patch(f"/api/tasks/{assigned_task}/status",
                         json={"status": "Completed"}, headers=roles["admin"])
    assert resp.status_code == 200
    assert resp.get_json()["status"] == "Completed"


# ── Comments + activity log ─────────────────────────────────────────────────

def test_create_comment(client, roles):
    task_id = create_task(client, roles["admin"]).get_json()["id"]
    resp = client.post(f"/api/tasks/{task_id}/comments",
                        json={"comment_text": "A comment"}, headers=roles["admin"])
    assert resp.status_code == 201


def test_create_comment_empty_text(client, roles):
    task_id = create_task(client, roles["admin"]).get_json()["id"]
    resp = client.post(f"/api/tasks/{task_id}/comments", json={"comment_text": ""}, headers=roles["admin"])
    assert resp.status_code == 400


def test_list_comments(client, roles):
    task_id = create_task(client, roles["admin"]).get_json()["id"]
    client.post(f"/api/tasks/{task_id}/comments", json={"comment_text": "A comment"}, headers=roles["admin"])
    resp = client.get(f"/api/tasks/{task_id}/comments", headers=roles["admin"])
    assert resp.status_code == 200
    assert len(resp.get_json()) == 1


def test_activity_log_contains_expected_types(client, roles, employee):
    task_id = create_task(client, roles["admin"]).get_json()["id"]
    client.patch(f"/api/tasks/{task_id}/assign",
                 json={"assigned_to_employee_id": employee.id}, headers=roles["admin"])
    client.patch(f"/api/tasks/{task_id}/status", json={"status": "In Progress"}, headers=roles["admin"])
    client.post(f"/api/tasks/{task_id}/comments", json={"comment_text": "hi"}, headers=roles["admin"])

    resp = client.get(f"/api/tasks/{task_id}/activity", headers=roles["admin"])
    assert resp.status_code == 200
    types = {a["action_type"] for a in resp.get_json()}
    assert {"created", "assigned", "status_changed", "commented"}.issubset(types)


# ── List / filter / summary / my ────────────────────────────────────────────

def test_list_filter_by_priority(client, roles):
    task_id = create_task(client, roles["admin"], priority="Urgent").get_json()["id"]
    resp = client.get("/api/tasks?priority=Urgent", headers=roles["admin"])
    assert resp.status_code == 200
    assert any(t["id"] == task_id for t in resp.get_json()["items"])


def test_summary_includes_admin_only_fields(client, roles):
    create_task(client, roles["admin"])
    resp = client.get("/api/tasks/summary", headers=roles["admin"])
    assert resp.status_code == 200
    assert "total_open" in resp.get_json()


def test_my_tasks_includes_own_created_task(client, roles):
    task_id = create_task(client, roles["admin"]).get_json()["id"]
    resp = client.get("/api/tasks/my", headers=roles["admin"])
    assert resp.status_code == 200
    assert any(t["id"] == task_id for t in resp.get_json()["items"])


# ── Permission matrix — dispatcher ──────────────────────────────────────────

def test_dispatcher_cannot_create(client, roles):
    resp = create_task(client, roles["dispatcher"])
    assert resp.status_code == 403


def test_dispatcher_cannot_assign(client, roles, employee):
    task_id = create_task(client, roles["admin"]).get_json()["id"]
    resp = client.patch(f"/api/tasks/{task_id}/assign",
                         json={"assigned_to_employee_id": employee.id}, headers=roles["dispatcher"])
    assert resp.status_code == 403


def test_dispatcher_cannot_archive(client, roles):
    task_id = create_task(client, roles["admin"]).get_json()["id"]
    resp = client.delete(f"/api/tasks/{task_id}", headers=roles["dispatcher"])
    assert resp.status_code == 403


def test_dispatcher_cannot_view_task_not_theirs(client, roles):
    task_id = create_task(client, roles["admin"]).get_json()["id"]
    resp = client.get(f"/api/tasks/{task_id}", headers=roles["dispatcher"])
    assert resp.status_code == 403


def test_dispatcher_can_view_task_assigned_to_them(client, roles, assigned_task):
    resp = client.get(f"/api/tasks/{assigned_task}", headers=roles["dispatcher"])
    assert resp.status_code == 200


# ── Permission matrix — HR ───────────────────────────────────────────────────

def test_hr_cannot_create_non_hr_task_type(client, roles):
    resp = create_task(client, roles["hr"], task_type="General Task")
    assert resp.status_code == 403


def test_hr_can_create_hr_task_type(client, roles):
    resp = create_task(client, roles["hr"], task_type="HR Task")
    assert resp.status_code == 201


def test_hr_cannot_archive(client, roles):
    task_id = create_task(client, roles["hr"], task_type="HR Task").get_json()["id"]
    resp = client.delete(f"/api/tasks/{task_id}", headers=roles["hr"])
    assert resp.status_code == 403


# ── Archive — admin/supervisor only ─────────────────────────────────────────

def test_supervisor_can_archive(client, roles):
    task_id = create_task(client, roles["admin"]).get_json()["id"]
    resp = client.delete(f"/api/tasks/{task_id}", headers=roles["supervisor"])
    assert resp.status_code == 200
    assert resp.get_json()["task"]["is_archived"] is True


def test_archived_task_excluded_from_default_list(client, roles):
    task_id = create_task(client, roles["admin"]).get_json()["id"]
    client.delete(f"/api/tasks/{task_id}", headers=roles["supervisor"])
    resp = client.get("/api/tasks", headers=roles["admin"])
    assert not any(t["id"] == task_id for t in resp.get_json()["items"])


def test_archived_task_visible_with_flag(client, roles):
    task_id = create_task(client, roles["admin"]).get_json()["id"]
    client.delete(f"/api/tasks/{task_id}", headers=roles["supervisor"])
    resp = client.get("/api/tasks?is_archived=1", headers=roles["admin"])
    assert any(t["id"] == task_id for t in resp.get_json()["items"])
