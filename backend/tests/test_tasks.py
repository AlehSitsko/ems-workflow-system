from datetime import date, timedelta

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
    """A signed-in client per role. The dispatcher is linked to `employee` so
    assignee-permission checks (view/status) have someone to test against."""
    from conftest import make_user, login

    linked = {"admin": None, "supervisor": None, "dispatcher": employee.id, "hr": None}

    out = {}
    for role, emp_id in linked.items():
        user = make_user(role, username=f"tasks_{role}", employee_id=emp_id)
        c = app.test_client()
        login(c, user.username)
        out[role] = c
    return out


def create_task(api, **overrides):
    payload = {"title": "Test Task", "task_type": "General Task", "priority": "Normal"}
    payload.update(overrides)
    return api.post("/api/tasks", json=payload)


# ── Create — validation + happy path ────────────────────────────────────────

def test_create_task_defaults_to_new_status(client, roles):
    resp = create_task(roles["admin"])
    assert resp.status_code == 201
    assert resp.get_json()["status"] == "New"


def test_create_task_missing_title(client, roles):
    resp = roles["admin"].post("/api/tasks", json={"task_type": "General Task"})
    assert resp.status_code == 400


def test_create_task_invalid_task_type(client, roles):
    resp = create_task(roles["admin"], task_type="Not A Real Type")
    assert resp.status_code == 400


def test_create_task_invalid_priority(client, roles):
    resp = create_task(roles["admin"], priority="Meh")
    assert resp.status_code == 400


# ── Assign + edit + status transitions ──────────────────────────────────────

def test_assign_bumps_status_to_assigned(client, roles, employee):
    task_id = create_task(roles["admin"]).get_json()["id"]
    resp = roles["admin"].patch(f"/api/tasks/{task_id}/assign",
                         json={"assigned_to_employee_id": employee.id})
    assert resp.status_code == 200
    assert resp.get_json()["status"] == "Assigned"


def test_edit_task_persists(client, roles):
    task_id = create_task(roles["admin"]).get_json()["id"]
    resp = roles["admin"].put(f"/api/tasks/{task_id}",
                       json={"title": "Edited", "priority": "Urgent"})
    assert resp.status_code == 200
    assert resp.get_json()["priority"] == "Urgent"


def test_status_completed_sets_completed_at(client, roles):
    task_id = create_task(roles["admin"]).get_json()["id"]
    resp = roles["admin"].patch(f"/api/tasks/{task_id}/status", json={"status": "Completed"})
    assert resp.status_code == 200
    assert resp.get_json()["completed_at"]


def test_status_leaving_completed_clears_completed_at(client, roles):
    task_id = create_task(roles["admin"]).get_json()["id"]
    roles["admin"].patch(f"/api/tasks/{task_id}/status", json={"status": "Completed"})
    resp = roles["admin"].patch(f"/api/tasks/{task_id}/status", json={"status": "In Progress"})
    assert resp.status_code == 200
    assert resp.get_json()["completed_at"] is None


def test_status_invalid_value(client, roles):
    task_id = create_task(roles["admin"]).get_json()["id"]
    resp = roles["admin"].patch(f"/api/tasks/{task_id}/status", json={"status": "Bogus"})
    assert resp.status_code == 400


# ── Close permission — only creator/assigner (or admin) may close ──────────

@pytest.fixture()
def assigned_task(client, roles, employee):
    """A task created by admin and assigned to the employee the dispatcher
    fixture is linked to, so the dispatcher acts as the task's assignee."""
    task_id = create_task(roles["admin"]).get_json()["id"]
    roles["admin"].patch(f"/api/tasks/{task_id}/assign",
                 json={"assigned_to_employee_id": employee.id})
    return task_id


def test_assignee_can_set_in_progress(client, roles, assigned_task):
    resp = roles["dispatcher"].patch(f"/api/tasks/{assigned_task}/status",
                         json={"status": "In Progress"})
    assert resp.status_code == 200


def test_assignee_can_set_done(client, roles, assigned_task):
    resp = roles["dispatcher"].patch(f"/api/tasks/{assigned_task}/status",
                         json={"status": "Done"})
    assert resp.status_code == 200


def test_assignee_cannot_close_task(client, roles, assigned_task):
    resp = roles["dispatcher"].patch(f"/api/tasks/{assigned_task}/status",
                         json={"status": "Completed"})
    assert resp.status_code == 403


def test_creator_can_close_task(client, roles, assigned_task):
    resp = roles["admin"].patch(f"/api/tasks/{assigned_task}/status",
                         json={"status": "Completed"})
    assert resp.status_code == 200
    assert resp.get_json()["status"] == "Completed"


# ── Comments + activity log ─────────────────────────────────────────────────

def test_create_comment(client, roles):
    task_id = create_task(roles["admin"]).get_json()["id"]
    resp = roles["admin"].post(f"/api/tasks/{task_id}/comments",
                        json={"comment_text": "A comment"})
    assert resp.status_code == 201


def test_create_comment_empty_text(client, roles):
    task_id = create_task(roles["admin"]).get_json()["id"]
    resp = roles["admin"].post(f"/api/tasks/{task_id}/comments", json={"comment_text": ""})
    assert resp.status_code == 400


def test_list_comments(client, roles):
    task_id = create_task(roles["admin"]).get_json()["id"]
    roles["admin"].post(f"/api/tasks/{task_id}/comments", json={"comment_text": "A comment"})
    resp = roles["admin"].get(f"/api/tasks/{task_id}/comments")
    assert resp.status_code == 200
    assert len(resp.get_json()) == 1


def test_activity_log_contains_expected_types(client, roles, employee):
    task_id = create_task(roles["admin"]).get_json()["id"]
    roles["admin"].patch(f"/api/tasks/{task_id}/assign",
                 json={"assigned_to_employee_id": employee.id})
    roles["admin"].patch(f"/api/tasks/{task_id}/status", json={"status": "In Progress"})
    roles["admin"].post(f"/api/tasks/{task_id}/comments", json={"comment_text": "hi"})

    resp = roles["admin"].get(f"/api/tasks/{task_id}/activity")
    assert resp.status_code == 200
    types = {a["action_type"] for a in resp.get_json()}
    assert {"created", "assigned", "status_changed", "commented"}.issubset(types)


# ── List / filter / summary / my ────────────────────────────────────────────

def test_list_filter_by_priority(client, roles):
    task_id = create_task(roles["admin"], priority="Urgent").get_json()["id"]
    resp = roles["admin"].get("/api/tasks?priority=Urgent")
    assert resp.status_code == 200
    assert any(t["id"] == task_id for t in resp.get_json()["items"])


def test_summary_includes_admin_only_fields(client, roles):
    create_task(roles["admin"])
    resp = roles["admin"].get("/api/tasks/summary")
    assert resp.status_code == 200
    assert "total_open" in resp.get_json()


def test_my_tasks_includes_own_created_task(client, roles):
    task_id = create_task(roles["admin"]).get_json()["id"]
    resp = roles["admin"].get("/api/tasks/my")
    assert resp.status_code == 200
    assert any(t["id"] == task_id for t in resp.get_json()["items"])


# ── Permission matrix — dispatcher ──────────────────────────────────────────

def test_dispatcher_cannot_create(client, roles):
    resp = create_task(roles["dispatcher"])
    assert resp.status_code == 403


def test_dispatcher_cannot_assign(client, roles, employee):
    task_id = create_task(roles["admin"]).get_json()["id"]
    resp = roles["dispatcher"].patch(f"/api/tasks/{task_id}/assign",
                         json={"assigned_to_employee_id": employee.id})
    assert resp.status_code == 403


def test_dispatcher_cannot_archive(client, roles):
    task_id = create_task(roles["admin"]).get_json()["id"]
    resp = roles["dispatcher"].delete(f"/api/tasks/{task_id}")
    assert resp.status_code == 403


def test_dispatcher_cannot_view_task_not_theirs(client, roles):
    task_id = create_task(roles["admin"]).get_json()["id"]
    resp = roles["dispatcher"].get(f"/api/tasks/{task_id}")
    assert resp.status_code == 403


def test_dispatcher_can_view_task_assigned_to_them(client, roles, assigned_task):
    resp = roles["dispatcher"].get(f"/api/tasks/{assigned_task}")
    assert resp.status_code == 200


# ── Permission matrix — HR ───────────────────────────────────────────────────

def test_hr_cannot_create_non_hr_task_type(client, roles):
    resp = create_task(roles["hr"], task_type="General Task")
    assert resp.status_code == 403


def test_hr_can_create_hr_task_type(client, roles):
    resp = create_task(roles["hr"], task_type="HR Task")
    assert resp.status_code == 201


def test_hr_cannot_archive(client, roles):
    task_id = create_task(roles["hr"], task_type="HR Task").get_json()["id"]
    resp = roles["hr"].delete(f"/api/tasks/{task_id}")
    assert resp.status_code == 403


# ── Archive — admin/supervisor only ─────────────────────────────────────────

def test_supervisor_can_archive(client, roles):
    task_id = create_task(roles["admin"]).get_json()["id"]
    resp = roles["supervisor"].delete(f"/api/tasks/{task_id}")
    assert resp.status_code == 200
    assert resp.get_json()["task"]["is_archived"] is True


def test_archived_task_excluded_from_default_list(client, roles):
    task_id = create_task(roles["admin"]).get_json()["id"]
    roles["supervisor"].delete(f"/api/tasks/{task_id}")
    resp = roles["admin"].get("/api/tasks")
    assert not any(t["id"] == task_id for t in resp.get_json()["items"])


def test_archived_task_visible_with_flag(client, roles):
    task_id = create_task(roles["admin"]).get_json()["id"]
    roles["supervisor"].delete(f"/api/tasks/{task_id}")
    resp = roles["admin"].get("/api/tasks?is_archived=1")
    assert any(t["id"] == task_id for t in resp.get_json()["items"])


# ── Participants + assign-to-all visibility ──────────────────────────────────

def test_create_task_with_participants_and_visible_to_all(client, roles, employee):
    resp = create_task(roles["admin"],
                       participant_employee_ids=[employee.id], visible_to_all=True)
    assert resp.status_code == 201
    body = resp.get_json()
    assert body["participant_employee_ids"] == [employee.id]
    assert body["visible_to_all"] is True


def test_participant_dispatcher_can_view_unassigned_task(client, roles, employee):
    # Admin creates a task that is NOT assigned to the dispatcher's employee,
    # but lists them as a participant.
    task_id = create_task(roles["admin"], participant_employee_ids=[employee.id]).get_json()["id"]
    # The dispatcher fixture is linked to `employee`.
    assert roles["dispatcher"].get(f"/api/tasks/{task_id}").status_code == 200


def test_visible_to_all_task_seen_by_dispatcher(client, roles):
    task_id = create_task(roles["admin"], visible_to_all=True).get_json()["id"]
    assert roles["dispatcher"].get(f"/api/tasks/{task_id}").status_code == 200


def test_plain_task_hidden_from_unrelated_dispatcher(client, roles):
    # No assignee, no participant, not visible_to_all → dispatcher cannot view.
    task_id = create_task(roles["admin"]).get_json()["id"]
    assert roles["dispatcher"].get(f"/api/tasks/{task_id}").status_code == 403


def test_update_sets_participants_and_visible_to_all(client, roles, employee):
    task_id = create_task(roles["admin"]).get_json()["id"]
    resp = roles["admin"].put(f"/api/tasks/{task_id}",  json={
        "title": "Updated", "participant_employee_ids": [employee.id], "visible_to_all": True,
    })
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["participant_employee_ids"] == [employee.id]
    assert body["visible_to_all"] is True
    # Clearing participants on a later update.
    resp2 = roles["admin"].put(f"/api/tasks/{task_id}",  json={
        "title": "Updated", "participant_employee_ids": [],
    })
    assert resp2.get_json()["participant_employee_ids"] == []


def test_invalid_participant_id_rejected(client, roles):
    resp = create_task(roles["admin"], participant_employee_ids=[999999])
    assert resp.status_code == 400


# ── Dashboard KPI filters (mine / open / unassigned / overdue) ───────────────

def _yesterday():
    return (date.today() - timedelta(days=1)).isoformat()


def test_open_filter_excludes_terminal_tasks(client, roles):
    done_id = create_task(roles["admin"], title="Closed one").get_json()["id"]
    roles["admin"].patch(f"/api/tasks/{done_id}/status", json={"status": "Completed"})
    open_id = create_task(roles["admin"], title="Open one").get_json()["id"]

    ids = [t["id"] for t in roles["admin"].get("/api/tasks?open=1").get_json()["items"]]
    assert open_id in ids
    assert done_id not in ids


def test_unassigned_filter_excludes_assigned_tasks(client, roles, employee):
    unassigned_id = create_task(roles["admin"]).get_json()["id"]
    assigned_id = create_task(roles["admin"]).get_json()["id"]
    roles["admin"].patch(f"/api/tasks/{assigned_id}/assign",
                 json={"assigned_to_employee_id": employee.id})

    ids = [t["id"] for t in roles["admin"].get("/api/tasks?unassigned=1").get_json()["items"]]
    assert unassigned_id in ids
    assert assigned_id not in ids


def test_mine_filter_excludes_other_peoples_tasks(client, roles):
    mine_id = create_task(roles["admin"]).get_json()["id"]
    theirs_id = create_task(roles["supervisor"]).get_json()["id"]

    ids = [t["id"] for t in roles["admin"].get("/api/tasks?mine=1").get_json()["items"]]
    assert mine_id in ids
    assert theirs_id not in ids


def test_mine_filter_includes_tasks_assigned_to_me(client, roles, employee):
    """The dispatcher cannot raise tasks, so assignment is its only route to
    ownership."""
    task_id = create_task(roles["admin"]).get_json()["id"]
    roles["admin"].patch(f"/api/tasks/{task_id}/assign",
                 json={"assigned_to_employee_id": employee.id})

    ids = [t["id"] for t in roles["dispatcher"].get("/api/tasks?mine=1").get_json()["items"]]
    assert task_id in ids


def test_overdue_filter_ignores_completed_overdue_tasks(client, roles):
    stale_id = create_task(roles["admin"], due_date=_yesterday()).get_json()["id"]
    closed_id = create_task(roles["admin"], due_date=_yesterday()).get_json()["id"]
    roles["admin"].patch(f"/api/tasks/{closed_id}/status", json={"status": "Completed"})

    ids = [t["id"] for t in roles["admin"].get("/api/tasks?overdue=1").get_json()["items"]]
    assert stale_id in ids
    assert closed_id not in ids


def test_my_overdue_kpi_matches_the_list_it_links_to(client, roles):
    """The dashboard KPI links to ?mine=1&overdue=1; the count and the list must
    agree, or the number is a lie about the page it opens."""
    create_task(roles["admin"], due_date=_yesterday())
    create_task(roles["admin"], due_date=_yesterday())
    create_task(roles["supervisor"], due_date=_yesterday())   # not mine
    create_task(roles["admin"])                               # mine, not overdue

    kpi = roles["admin"].get("/api/tasks/summary").get_json()["my_overdue"]
    listed = roles["admin"].get("/api/tasks?mine=1&overdue=1").get_json()["total"]
    assert kpi == listed == 2


def test_unassigned_kpi_matches_the_list_it_links_to(client, roles, employee):
    create_task(roles["admin"])
    create_task(roles["admin"])
    assigned_id = create_task(roles["admin"]).get_json()["id"]
    roles["admin"].patch(f"/api/tasks/{assigned_id}/assign",
                 json={"assigned_to_employee_id": employee.id})

    kpi = roles["admin"].get("/api/tasks/summary").get_json()["unassigned_count"]
    listed = roles["admin"].get("/api/tasks?unassigned=1&open=1").get_json()["total"]
    assert kpi == listed == 2


# ── Performance regression: the task list must not be N+1 ────────────────────

def test_task_list_query_count_is_bounded_not_per_row(client, roles, employee):
    """Serializing the task list eager-loads assignee/creator/participants, so
    the SELECT count stays near-constant as rows grow. Before that fix each row
    lazily loaded its participants (and assignee/creator), so a page fired ~1
    query per task. This guards the fix: adding 10 tasks must not add ~10 queries.
    """
    from contextlib import contextmanager
    from sqlalchemy import event

    @contextmanager
    def count_selects():
        seen = {"n": 0}
        engine = db.engine

        def _cb(conn, cursor, statement, params, context, executemany):
            if statement.lstrip()[:6].upper() == "SELECT":
                seen["n"] += 1

        event.listen(engine, "before_cursor_execute", _cb)
        try:
            yield seen
        finally:
            event.remove(engine, "before_cursor_execute", _cb)

    api = roles["admin"]
    for i in range(3):
        create_task(api, title=f"Base {i}", assigned_to_employee_id=employee.id)
    with count_selects() as base:
        assert api.get("/api/tasks?per_page=100").status_code == 200

    for i in range(10):
        create_task(api, title=f"More {i}", assigned_to_employee_id=employee.id)
    with count_selects() as grown:
        assert api.get("/api/tasks?per_page=100").status_code == 200

    # 10x more rows must add at most a couple of queries, never ~10 (one per row).
    assert grown["n"] - base["n"] <= 3, (
        f"task list scales per-row ({base['n']} -> {grown['n']} SELECTs for +10 "
        "tasks): the N+1 eager-load regressed"
    )
