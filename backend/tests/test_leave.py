"""Employee leave / absence: permissions, privacy, and overlap validation.

The privacy rule is the point of this feature, so most of these tests are about
what each role does *not* receive. A dispatcher looking at staffing must not be
able to learn that a colleague is on medical leave — not by reading a field, and
not by noticing that a field is present but blank.
"""

import pytest
from werkzeug.security import generate_password_hash

from models import db, User, Employee, EmployeeLeaveRequest, DailyCrewUnit


@pytest.fixture()
def roles(app):
    headers = {}
    for role in ("admin", "supervisor", "dispatcher", "hr"):
        user = User(
            username=f"leave_{role}",
            password_hash=generate_password_hash("pw"),
            display_name=f"Leave {role.title()}",
            role=role,
            is_active=True,
        )
        db.session.add(user)
        db.session.flush()
        headers[role] = {"X-User-Id": str(user.id), "X-User-Role": role, "X-User-Name": user.display_name}
    db.session.commit()
    return headers


@pytest.fixture()
def employee(app):
    e = Employee(first_name="Nina", last_name="Brooks", role="EMT")
    db.session.add(e)
    db.session.commit()
    return e


def payload(employee_id, **overrides):
    data = {
        "employeeId": employee_id,
        "leaveType": "vacation",
        "startDate": "2099-03-02",
        "endDate": "2099-03-06",
    }
    data.update(overrides)
    return data


def create(client, headers, employee_id, **overrides):
    return client.post("/api/leave-requests", headers=headers, json=payload(employee_id, **overrides))


# ── Permissions ─────────────────────────────────────────────────────────────

@pytest.mark.parametrize("role", ["admin", "hr", "supervisor"])
def test_hr_admin_and_supervisor_can_file_a_request(client, roles, employee, role):
    assert create(client, roles[role], employee.id).status_code == 201


def test_dispatcher_cannot_file_a_request(client, roles, employee):
    assert create(client, roles["dispatcher"], employee.id).status_code == 403


def test_supervisor_cannot_file_a_pre_approved_request(client, roles, employee):
    """Approving is an HR decision; filing must not be a way around it."""
    resp = create(client, roles["supervisor"], employee.id, status="approved")
    assert resp.status_code == 403
    assert "Only HR or an administrator" in resp.get_json()["error"]


def test_supervisor_cannot_approve(client, roles, employee):
    leave = create(client, roles["supervisor"], employee.id).get_json()
    resp = client.patch(f"/api/leave-requests/{leave['id']}/decision",
                        headers=roles["supervisor"], json={"status": "approved"})
    assert resp.status_code == 403


def test_supervisor_cannot_edit(client, roles, employee):
    leave = create(client, roles["hr"], employee.id).get_json()
    resp = client.put(f"/api/leave-requests/{leave['id']}",
                      headers=roles["supervisor"], json={"leaveType": "training"})
    assert resp.status_code == 403


def test_only_an_admin_can_hard_delete(client, roles, employee):
    leave = create(client, roles["hr"], employee.id).get_json()
    assert client.delete(f"/api/leave-requests/{leave['id']}", headers=roles["hr"]).status_code == 403
    assert client.delete(f"/api/leave-requests/{leave['id']}", headers=roles["admin"]).status_code == 200


def test_anonymous_requests_are_rejected(client, employee):
    assert client.get("/api/leave-requests").status_code in (401, 403)


# ── Privacy ─────────────────────────────────────────────────────────────────

_HR_ONLY_FIELDS = ["reason", "privateNotes", "reviewNote", "reviewedByName", "submittedByName"]


@pytest.mark.parametrize("sensitive_type", ["sick", "medical", "bereavement"])
def test_scheduling_roles_never_learn_a_sensitive_leave_type(client, roles, employee, sensitive_type):
    create(client, roles["hr"], employee.id, leaveType=sensitive_type,
           reason="Surgery scheduled", privateNotes="Cardiology follow-up")

    for role in ("supervisor", "dispatcher"):
        entry = client.get("/api/leave-requests", headers=roles[role]).get_json()[0]
        assert entry["leaveType"] == "unavailable"
        # Absent entirely, not blanked: a present-but-empty field still leaks
        # that there was something to hide.
        for field in _HR_ONLY_FIELDS:
            assert field not in entry
        assert "Surgery" not in str(entry) and "Cardiology" not in str(entry)


def test_a_non_sensitive_type_is_still_named_for_scheduling(client, roles, employee):
    """Knowing someone is on vacation helps planning and reveals nothing."""
    create(client, roles["hr"], employee.id, leaveType="vacation")
    entry = client.get("/api/leave-requests", headers=roles["dispatcher"]).get_json()[0]
    assert entry["leaveType"] == "vacation"
    assert "reason" not in entry


def test_hr_and_admin_see_the_full_record(client, roles, employee):
    create(client, roles["hr"], employee.id, leaveType="sick",
           reason="Flu", privateNotes="Called in Monday")

    for role in ("hr", "admin"):
        entry = client.get("/api/leave-requests", headers=roles[role]).get_json()[0]
        assert entry["leaveType"] == "sick"
        assert entry["reason"] == "Flu"
        assert entry["privateNotes"] == "Called in Monday"


def test_the_single_record_endpoint_applies_the_same_rule(client, roles, employee):
    """A privacy rule that only covers the list view is not a privacy rule."""
    leave = create(client, roles["hr"], employee.id, leaveType="medical", reason="Treatment").get_json()

    entry = client.get(f"/api/leave-requests/{leave['id']}", headers=roles["dispatcher"]).get_json()
    assert entry["leaveType"] == "unavailable"
    assert "reason" not in entry


def test_scheduling_roles_still_learn_when_and_whether_it_blocks(client, roles, employee):
    """Withholding the reason must not withhold the staffing fact."""
    leave = create(client, roles["hr"], employee.id, leaveType="sick").get_json()
    client.patch(f"/api/leave-requests/{leave['id']}/decision",
                 headers=roles["hr"], json={"status": "approved"})

    entry = client.get("/api/leave-requests", headers=roles["dispatcher"]).get_json()[0]
    assert entry["startDate"] == "2099-03-02"
    assert entry["endDate"] == "2099-03-06"
    assert entry["status"] == "approved"
    assert entry["blocksScheduling"] is True


# ── Validation ──────────────────────────────────────────────────────────────

def test_overlapping_requests_are_refused(client, roles, employee):
    create(client, roles["hr"], employee.id)
    resp = create(client, roles["hr"], employee.id, startDate="2099-03-05", endDate="2099-03-09")
    assert resp.status_code == 409
    assert "already has leave" in resp.get_json()["error"]


def test_a_denied_request_frees_the_dates(client, roles, employee):
    first = create(client, roles["hr"], employee.id).get_json()
    client.patch(f"/api/leave-requests/{first['id']}/decision",
                 headers=roles["hr"], json={"status": "denied"})

    assert create(client, roles["hr"], employee.id).status_code == 201


def test_adjacent_ranges_do_not_overlap(client, roles, employee):
    create(client, roles["hr"], employee.id, startDate="2099-03-02", endDate="2099-03-06")
    resp = create(client, roles["hr"], employee.id, startDate="2099-03-07", endDate="2099-03-10")
    assert resp.status_code == 201


def test_end_before_start_is_rejected(client, roles, employee):
    resp = create(client, roles["hr"], employee.id, startDate="2099-03-06", endDate="2099-03-02")
    assert resp.status_code == 400
    assert "endDate must not be before startDate" in resp.get_json()["error"]


def test_an_impossible_date_is_rejected(client, roles, employee):
    assert create(client, roles["hr"], employee.id, startDate="2099-02-30").status_code == 400


def test_an_unknown_leave_type_is_rejected(client, roles, employee):
    assert create(client, roles["hr"], employee.id, leaveType="sabbatical").status_code == 400


def test_a_leave_type_alias_is_normalized(client, roles, employee):
    leave = create(client, roles["hr"], employee.id, leaveType="PTO").get_json()
    assert leave["leaveType"] == "vacation"


def test_a_partial_day_needs_both_times(client, roles, employee):
    resp = create(client, roles["hr"], employee.id,
                  startDate="2099-03-02", endDate="2099-03-02", startTime="09:00")
    assert resp.status_code == 400
    assert "both startTime and endTime" in resp.get_json()["error"]


def test_a_partial_day_across_a_range_is_rejected(client, roles, employee):
    resp = create(client, roles["hr"], employee.id, startTime="09:00", endTime="13:00")
    assert resp.status_code == 400
    assert "single-day request only" in resp.get_json()["error"]


def test_a_single_day_partial_request_is_accepted(client, roles, employee):
    leave = create(client, roles["hr"], employee.id,
                   startDate="2099-03-02", endDate="2099-03-02",
                   startTime="09:00", endTime="13:00").get_json()
    assert leave["isPartialDay"] is True


def test_omitting_the_end_date_makes_it_a_single_day(client, roles, employee):
    resp = client.post("/api/leave-requests", headers=roles["hr"], json={
        "employeeId": employee.id, "leaveType": "personal", "startDate": "2099-04-01",
    })
    assert resp.status_code == 201
    assert resp.get_json()["endDate"] == "2099-04-01"


# ── Decisions ───────────────────────────────────────────────────────────────

def test_approving_reports_shifts_the_employee_is_already_on(client, roles, employee):
    """Approving creates a staffing hole — say so instead of leaving it to be
    discovered on the day."""
    db.session.add(DailyCrewUnit(
        shift_date="2099-03-03", unit_type="BLS", truck_number="101",
        start_time="08:00", end_time="20:00", driver_id=employee.id,
    ))
    db.session.commit()

    leave = create(client, roles["hr"], employee.id).get_json()
    resp = client.patch(f"/api/leave-requests/{leave['id']}/decision",
                        headers=roles["hr"], json={"status": "approved"})

    assert resp.status_code == 200
    rostered = resp.get_json()["rosteredShifts"]
    assert len(rostered) == 1
    assert rostered[0]["shiftDate"] == "2099-03-03"
    assert rostered[0]["truckNumber"] == "101"


def test_approving_with_no_rostered_shifts_says_nothing_extra(client, roles, employee):
    leave = create(client, roles["hr"], employee.id).get_json()
    body = client.patch(f"/api/leave-requests/{leave['id']}/decision",
                        headers=roles["hr"], json={"status": "approved"}).get_json()
    assert "rosteredShifts" not in body


def test_a_decision_records_who_made_it(client, roles, employee):
    leave = create(client, roles["hr"], employee.id).get_json()
    body = client.patch(f"/api/leave-requests/{leave['id']}/decision", headers=roles["hr"],
                        json={"status": "denied", "reviewNote": "Peak season"}).get_json()

    assert body["status"] == "denied"
    assert body["reviewedByName"] == "Leave Hr"
    assert body["reviewNote"] == "Peak season"
    assert body["reviewedAt"]


def test_a_cancelled_request_cannot_be_decided(client, roles, employee):
    leave = create(client, roles["hr"], employee.id).get_json()
    client.patch(f"/api/leave-requests/{leave['id']}/cancel", headers=roles["hr"])

    resp = client.patch(f"/api/leave-requests/{leave['id']}/decision",
                        headers=roles["hr"], json={"status": "approved"})
    assert resp.status_code == 409


def test_only_approved_or_denied_are_valid_decisions(client, roles, employee):
    leave = create(client, roles["hr"], employee.id).get_json()
    resp = client.patch(f"/api/leave-requests/{leave['id']}/decision",
                        headers=roles["hr"], json={"status": "pending"})
    assert resp.status_code == 400


# ── Filtering ───────────────────────────────────────────────────────────────

def test_the_range_filter_returns_overlapping_leave_not_only_contained_leave(client, roles, employee):
    """A two-week absence is relevant to every week it touches."""
    create(client, roles["hr"], employee.id, startDate="2099-03-02", endDate="2099-03-16")

    found = client.get("/api/leave-requests?start=2099-03-09&end=2099-03-10",
                       headers=roles["hr"]).get_json()
    assert len(found) == 1


def test_filtering_by_employee_and_status(client, roles, employee):
    other = Employee(first_name="Ethan", last_name="Reed", role="EMT")
    db.session.add(other)
    db.session.commit()

    create(client, roles["hr"], employee.id)
    create(client, roles["hr"], other.id, startDate="2099-05-01", endDate="2099-05-03")

    mine = client.get(f"/api/leave-requests?employee_id={employee.id}", headers=roles["hr"]).get_json()
    assert len(mine) == 1 and mine[0]["employeeId"] == employee.id

    pending = client.get("/api/leave-requests?status=pending", headers=roles["hr"]).get_json()
    assert len(pending) == 2


def test_an_unknown_status_filter_is_rejected(client, roles, employee):
    assert client.get("/api/leave-requests?status=maybe", headers=roles["hr"]).status_code == 400
