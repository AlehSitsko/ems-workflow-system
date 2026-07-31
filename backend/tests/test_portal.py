"""Employee self-service portal — /api/portal.

The whole point is isolation: an `employee` login reaches only the portal, and
only their own record. These pin the role gate, the self-scoping, and that the
existing ops/HR surface stays closed to the new role.
"""

import pytest

from models import (
    db, Employee, User, DailyCrewUnit, Task, EmployeeLeaveRequest,
    TimeEntry, EmployeeDocument,
)
from conftest import make_user, login, TEST_PASSWORD


def mk_employee(first="Jamie", last="Carter"):
    e = Employee(first_name=first, last_name=last, role="EMT", status="active", is_active=True)
    db.session.add(e)
    db.session.commit()
    return e


def portal_client(app, employee=None, username="portaluser"):
    """A signed-in client for an employee-role user, linked to `employee`."""
    emp = employee or mk_employee()
    user = make_user("employee", username=username, employee_id=emp.id)
    c = app.test_client()
    login(c, user.username)
    return c, emp


def mk_task(employee_id, status="Assigned", title="Restock the rig"):
    t = Task(title=title, task_type="General Task", status=status, priority="Normal",
             assigned_to_employee_id=employee_id, created_by_user_id=1,
             created_at="2026-01-01T00:00:00", updated_at="2026-01-01T00:00:00")
    db.session.add(t)
    db.session.commit()
    return t


# ── Role gate / isolation ────────────────────────────────────────────────────

@pytest.mark.parametrize("role", ["admin", "supervisor", "dispatcher", "hr"])
def test_ops_roles_cannot_touch_the_portal(clients, role):
    assert clients[role].get("/api/portal/me").status_code == 403


def test_portal_requires_a_session(anon):
    assert anon.get("/api/portal/me").status_code == 401


def test_employee_is_locked_out_of_ops_endpoints(app):
    c, emp = portal_client(app)
    # A grab-bag of surfaces the employee must never reach.
    assert c.get("/api/employees").status_code == 403                # the full roster (names + DOB)
    assert c.get("/api/employees/%d" % emp.id).status_code == 403   # HR record surface
    assert c.get("/api/tasks").status_code == 403                    # ops task list
    assert c.get("/api/dispatch/board?date=2026-08-01").status_code in (403, 404)
    assert c.get("/api/reports/calls?start=2026-08-01&end=2026-08-31").status_code == 403


def test_unlinked_employee_gets_a_clean_409(app):
    user = make_user("employee", username="orphan")  # no employee_id
    c = app.test_client()
    login(c, user.username)
    resp = c.get("/api/portal/me")
    assert resp.status_code == 409
    assert "not linked" in resp.get_json()["error"].lower()


# ── Profile ──────────────────────────────────────────────────────────────────

def test_me_returns_my_own_profile(app):
    c, emp = portal_client(app, mk_employee("Dana", "Reed"))
    body = c.get("/api/portal/me").get_json()
    assert body["firstName"] == "Dana" and body["lastName"] == "Reed"
    assert "kioskPin" not in body  # never expose the clock-in credential


# ── Schedule ─────────────────────────────────────────────────────────────────

def test_schedule_shows_only_my_shifts(app):
    c, emp = portal_client(app)
    other = mk_employee("Sam", "Poe")
    db.session.add(DailyCrewUnit(shift_date="2026-08-10", unit_type="BLS", truck_number="12",
                                 start_time="08:00", end_time="20:00", driver_id=emp.id))
    db.session.add(DailyCrewUnit(shift_date="2026-08-11", unit_type="BLS", truck_number="7",
                                 start_time="08:00", end_time="20:00", driver_id=other.id))
    db.session.commit()

    shifts = c.get("/api/portal/me/schedule").get_json()
    assert [s["truckNumber"] for s in shifts] == ["12"]
    assert shifts[0]["role"] == "Driver"


# ── Tasks ────────────────────────────────────────────────────────────────────

def test_tasks_lists_only_mine(app):
    c, emp = portal_client(app)
    other = mk_employee("Lee", "Ray")
    mk_task(emp.id, title="Mine")
    mk_task(other.id, title="Not mine")

    titles = [t["title"] for t in c.get("/api/portal/me/tasks").get_json()]
    assert titles == ["Mine"]


def test_i_can_advance_my_task(app):
    c, emp = portal_client(app)
    task = mk_task(emp.id)
    resp = c.patch(f"/api/portal/me/tasks/{task.id}", json={"status": "In Progress"})
    assert resp.status_code == 200
    assert resp.get_json()["status"] == "In Progress"


def test_i_cannot_close_a_task_only_work_it(app):
    # Completed/Cancelled are the creator's to set — a worker gets 400.
    c, emp = portal_client(app)
    task = mk_task(emp.id)
    assert c.patch(f"/api/portal/me/tasks/{task.id}", json={"status": "Completed"}).status_code == 400


def test_i_cannot_touch_someone_elses_task(app):
    c, emp = portal_client(app)
    other = mk_employee("Kim", "Fox")
    task = mk_task(other.id)
    assert c.patch(f"/api/portal/me/tasks/{task.id}", json={"status": "In Progress"}).status_code == 404


# ── Leave ────────────────────────────────────────────────────────────────────

def test_i_can_file_and_see_my_leave(app):
    c, emp = portal_client(app)
    resp = c.post("/api/portal/me/leave", json={
        "leaveType": "vacation", "startDate": "2026-09-01", "endDate": "2026-09-03",
        "reason": "Family trip",
    })
    assert resp.status_code == 201
    body = resp.get_json()
    assert body["status"] == "pending"

    mine = c.get("/api/portal/me/leave").get_json()
    assert len(mine) == 1 and mine[0]["leaveType"] == "vacation"


def test_a_leave_request_is_always_filed_for_me(app):
    c, emp = portal_client(app)
    other = mk_employee("Val", "Ash")
    # Try to file on someone else's behalf — the portal must ignore employeeId.
    c.post("/api/portal/me/leave", json={
        "employeeId": other.id,
        "leaveType": "sick", "startDate": "2026-09-10", "endDate": "2026-09-10",
    })
    assert EmployeeLeaveRequest.query.filter_by(employee_id=other.id).count() == 0
    assert EmployeeLeaveRequest.query.filter_by(employee_id=emp.id).count() == 1


# ── Account linking (user admin) ─────────────────────────────────────────────

def test_creating_an_employee_login_requires_a_linked_employee(clients):
    resp = clients["admin"].post("/api/auth/users", json={
        "username": "nolinks", "password": "Str0ng-pass-99", "display_name": "No Link",
        "role": "employee",
    })
    assert resp.status_code == 400


def test_creating_a_linked_employee_login_works_and_is_unique(app, clients):
    emp = mk_employee("Rob", "Vega")
    ok = clients["admin"].post("/api/auth/users", json={
        "username": "rvega", "password": "Str0ng-pass-99", "display_name": "Rob Vega",
        "role": "employee", "employee_id": emp.id,
    })
    assert ok.status_code == 201
    assert ok.get_json()["employee_id"] == emp.id

    # A second portal login for the same employee is refused.
    dup = clients["admin"].post("/api/auth/users", json={
        "username": "rvega2", "password": "Str0ng-pass-99", "display_name": "Rob Vega 2",
        "role": "employee", "employee_id": emp.id,
    })
    assert dup.status_code == 409


# ── Phase 2: clock in/out ────────────────────────────────────────────────────

def test_clock_in_out_cycle(app):
    c, emp = portal_client(app)
    assert c.get("/api/portal/me/clock").get_json()["clockedIn"] is False

    assert c.post("/api/portal/me/clock/in").status_code == 201
    status = c.get("/api/portal/me/clock").get_json()
    assert status["clockedIn"] is True and status["since"]

    # A second clock-in while already in is refused.
    assert c.post("/api/portal/me/clock/in").status_code == 409

    assert c.post("/api/portal/me/clock/out").status_code == 200
    assert c.get("/api/portal/me/clock").get_json()["clockedIn"] is False
    # Clocking out when not in is refused.
    assert c.post("/api/portal/me/clock/out").status_code == 409


# ── Phase 2: hours ───────────────────────────────────────────────────────────

def test_hours_returns_my_entries_and_total(app):
    c, emp = portal_client(app)
    other = mk_employee("Pat", "Nunez")
    db.session.add(TimeEntry(employee_id=emp.id, clock_in="2026-08-10T08:00:00",
                             clock_out="2026-08-10T16:00:00", entry_type="clock", status="approved"))
    db.session.add(TimeEntry(employee_id=other.id, clock_in="2026-08-10T08:00:00",
                             clock_out="2026-08-10T12:00:00", entry_type="clock", status="approved"))
    db.session.commit()

    body = c.get("/api/portal/me/hours").get_json()
    assert len(body["entries"]) == 1              # only mine
    assert body["totalMinutes"] == 8 * 60          # 8h, no break


# ── Phase 2: documents (own, read-only) ──────────────────────────────────────

def mk_document(employee_id, title="EMT License", file_path=None):
    d = EmployeeDocument(employee_id=employee_id, doc_type="ems_license", title=title,
                         file_path=file_path, uploaded_at="2026-01-01T00:00:00")
    db.session.add(d)
    db.session.commit()
    return d


def test_documents_lists_only_mine(app):
    c, emp = portal_client(app)
    other = mk_employee("Ivy", "Cole")
    mk_document(emp.id, title="Mine")
    mk_document(other.id, title="Not mine")

    titles = [d["title"] for d in c.get("/api/portal/me/documents").get_json()]
    assert titles == ["Mine"]


def test_cannot_download_another_employees_document(app):
    c, emp = portal_client(app)
    other = mk_employee("Nyla", "Bond")
    doc = mk_document(other.id, file_path="fake/path.pdf")
    assert c.get(f"/api/portal/me/documents/{doc.id}/file").status_code == 404


def test_download_of_a_fileless_document_is_404(app):
    c, emp = portal_client(app)
    doc = mk_document(emp.id, file_path=None)
    assert c.get(f"/api/portal/me/documents/{doc.id}/file").status_code == 404
