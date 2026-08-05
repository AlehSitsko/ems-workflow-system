"""Authentication + authorization boundary for the operational APIs.

These are regression tests for a confirmed P0: the Dispatch Board served 41
calls *with patient names* to an anonymous request, and anonymous callers could
create crew units. The frontend hiding a page is not a security boundary — the
API must fail closed.

Contract:
    no identity            -> 401 Authentication required
    identity, wrong role   -> 403 Insufficient permissions
    permitted role         -> success

Note these tests also document the *limit* of the current scheme: the role is
taken from a request header, so they prove the gate works, not that the identity
is trustworthy. Real auth is the deferred hardening phase — see
docs/PRODUCTION_READINESS.md.
"""

import pytest
from werkzeug.security import generate_password_hash

from models import db, User, Call, DailyCrewUnit, CallAssignment, Patient


@pytest.fixture()
def roles(app, request):
    """A signed-in client per role.

    Identity is a session cookie now, so a test signs in for real rather than
    asserting a role in a header — which means these tests also exercise the
    authentication path itself.
    """
    from conftest import make_user, login

    out = {}
    prefix = request.node.module.__name__.rsplit(".", 1)[-1]
    for role in ("admin", "supervisor", "dispatcher", "hr"):
        user = make_user(role, username=f"{prefix}_{role}")
        c = app.test_client()
        login(c, user.username)
        out[role] = c
    return out


@pytest.fixture()
def board_data(app):
    """A call with a real patient name, plus a unit and an active assignment."""
    patient = Patient(first_name="Confidential", last_name="Patient")
    db.session.add(patient)
    db.session.flush()
    call = Call(trip_date="2026-07-15", status="assigned", service_level="BLS",
                pickup_time="10:00", patient_id=patient.id)
    unit = DailyCrewUnit(shift_date="2026-07-15", unit_type="BLS",
                         truck_number="900", start_time="08:00")
    db.session.add_all([call, unit])
    db.session.flush()
    assignment = CallAssignment(call_id=call.id, unit_id=unit.id, is_active=True)
    db.session.add(assignment)
    db.session.commit()
    return {"call": call, "unit": unit, "assignment": assignment, "patient": patient}


# Every mutating dispatch route, as (method, url_template, json_body).
DISPATCH_MUTATIONS = [
    ("post", "/api/dispatch/assign", {"call_id": "{call}", "unit_id": "{unit}"}),
    ("delete", "/api/dispatch/assign/{assignment}", None),
    ("patch", "/api/dispatch/assign/{assignment}/complete", None),
    ("patch", "/api/dispatch/assign/{assignment}/reopen", None),
    ("patch", "/api/dispatch/units/{unit}/status", {"status": "en_route"}),
    ("patch", "/api/dispatch/units/{unit}/call-order", {"callIds": []}),
]


def _resolve(template, data):
    return (template
            .replace("{call}", str(data["call"].id))
            .replace("{unit}", str(data["unit"].id))
            .replace("{assignment}", str(data["assignment"].id)))


def _body(spec, data):
    if not spec:
        return None
    return {k: int(_resolve(v, data)) if isinstance(v, str) and v.startswith("{") else v
            for k, v in spec.items()}


# ── Dispatch Board: the confirmed PHI leak ──────────────────────────────────

def test_anonymous_cannot_read_the_dispatch_board(client, board_data):
    """The reported P0: this used to return 200 with patient names."""
    resp = client.get("/api/dispatch/board?date=2026-07-15")
    assert resp.status_code == 401
    assert b"Confidential" not in resp.data


def test_hr_cannot_read_the_dispatch_board(client, roles, board_data):
    resp = roles["hr"].get("/api/dispatch/board?date=2026-07-15")
    assert resp.status_code == 403
    assert b"Confidential" not in resp.data


@pytest.mark.parametrize("role", ["admin", "supervisor", "dispatcher"])
def test_operational_roles_can_read_the_board(client, roles, board_data, role):
    resp = roles[role].get("/api/dispatch/board?date=2026-07-15")
    assert resp.status_code == 200


def test_unknown_role_is_forbidden_not_unauthenticated(app, board_data):
    """A signed-in user whose role the app no longer recognises is identified,
    just not allowed anywhere — 403, not 401."""
    from conftest import make_user, login

    user = make_user("ghost", username="sec_ghost")
    c = app.test_client()
    login(c, user.username)

    assert c.get("/api/dispatch/board?date=2026-07-15").status_code == 403


# ── Dispatch mutations ──────────────────────────────────────────────────────

@pytest.mark.parametrize("method,url,body", DISPATCH_MUTATIONS)
def test_dispatch_mutations_reject_anonymous(client, board_data, method, url, body):
    resp = getattr(client, method)(_resolve(url, board_data), json=_body(body, board_data))
    assert resp.status_code == 401


@pytest.mark.parametrize("method,url,body", DISPATCH_MUTATIONS)
def test_dispatch_mutations_reject_hr(roles, board_data, method, url, body):
    resp = getattr(roles["hr"], method)(_resolve(url, board_data),
                                        json=_body(body, board_data))
    assert resp.status_code == 403


# ── Crew units: the confirmed anonymous-write hole ──────────────────────────

def crew_payload(**overrides):
    data = {"shiftDate": "2026-09-09", "unitType": "BLS",
            "truckNumber": "SEC-1", "startTime": "08:00"}
    data.update(overrides)
    return data


def test_anonymous_cannot_create_a_crew_unit(client):
    """The reported P0: this used to return 201."""
    resp = client.post("/api/crew-units", json=crew_payload())
    assert resp.status_code == 401
    assert DailyCrewUnit.query.filter_by(truck_number="SEC-1").first() is None


def test_hr_cannot_create_a_crew_unit(client, roles):
    resp = roles["hr"].post("/api/crew-units", json=crew_payload(truckNumber="SEC-2"))
    assert resp.status_code == 403
    assert DailyCrewUnit.query.filter_by(truck_number="SEC-2").first() is None


@pytest.mark.parametrize("role", ["admin", "supervisor", "dispatcher"])
def test_operational_roles_can_create_a_crew_unit(client, roles, role):
    resp = roles[role].post("/api/crew-units", json=crew_payload(truckNumber=f"SEC-{role}"))
    assert resp.status_code == 201


def test_anonymous_cannot_read_crew_units(client, board_data):
    # Crew units carry the day's patient order, which is PHI.
    assert client.get("/api/crew-units").status_code == 401


def test_hr_cannot_read_crew_units(client, roles, board_data):
    assert roles["hr"].get("/api/crew-units").status_code == 403


def test_anonymous_cannot_mutate_crew_units(client, board_data):
    unit_id = board_data["unit"].id
    assert client.put(f"/api/crew-units/{unit_id}", json=crew_payload()).status_code == 401
    assert client.delete(f"/api/crew-units/{unit_id}").status_code == 401
    assert client.post(f"/api/crew-units/{unit_id}/make-night", json={}).status_code == 401
    assert client.get("/api/crew-units/alerts").status_code == 401


def test_hr_cannot_mutate_crew_units(roles, board_data):
    unit_id = board_data["unit"].id
    hr = roles["hr"]
    assert hr.put(f"/api/crew-units/{unit_id}", json=crew_payload()).status_code == 403
    assert hr.delete(f"/api/crew-units/{unit_id}").status_code == 403
    assert hr.post(f"/api/crew-units/{unit_id}/make-night", json={}).status_code == 403


# ── The old header scheme must stay dead ────────────────────────────────────
#
# Identity used to come from X-User-* headers the server believed, so anyone who
# could reach the API could claim admin with a curl flag. These pin that the
# headers are now inert: reintroducing that trust is the one regression that
# would quietly undo session authentication.

@pytest.mark.parametrize("headers", [
    {"X-User-Id": "1", "X-User-Role": "admin", "X-User-Name": "Forged Admin"},
    {"X-User-Role": "admin"},
    {"X-User-Id": "1"},
    {"X-User-Role": ""},
])
def test_forged_identity_headers_are_ignored(client, board_data, headers):
    resp = client.get("/api/dispatch/board?date=2026-07-15", headers=headers)
    assert resp.status_code == 401, "an X-User-* header authenticated the caller"


def test_headers_cannot_escalate_a_real_session(roles, board_data):
    """A signed-in HR user cannot promote themselves by adding a header."""
    resp = roles["hr"].get("/api/dispatch/board?date=2026-07-15",
                           headers={"X-User-Role": "admin", "X-User-Id": "1"})
    assert resp.status_code == 403


# ── User administration ─────────────────────────────────────────────────────
#
# These routes had no gate whatsoever: an anonymous POST created an admin
# account, and anyone could list, edit or disable users. The frontend hid the
# page behind an admin-only route, which was never protection. Found while
# verifying session auth; these pin it shut.

USER_ADMIN_ROUTES = [
    ("get", "/api/auth/users", None),
    ("post", "/api/auth/users",
     {"username": "intruder", "password": "x", "display_name": "I", "role": "admin"}),
    ("put", "/api/auth/users/1", {"display_name": "Renamed"}),
    ("patch", "/api/auth/users/1/toggle-active", None),
]


@pytest.mark.parametrize("method,url,body", USER_ADMIN_ROUTES)
def test_user_administration_rejects_anonymous(client, method, url, body):
    resp = getattr(client, method)(url, json=body)
    assert resp.status_code == 401, f"{method.upper()} {url} was open to anonymous callers"


@pytest.mark.parametrize("method,url,body", USER_ADMIN_ROUTES)
@pytest.mark.parametrize("role", ["dispatcher", "hr", "supervisor"])
def test_user_administration_is_admin_only(roles, method, url, body, role):
    resp = getattr(roles[role], method)(url, json=body)
    assert resp.status_code == 403, f"{role} could reach {method.upper()} {url}"


def test_anonymous_cannot_create_an_admin_account(client):
    """The worst shape of the hole: self-service privilege escalation."""
    from models import User

    before = User.query.count()
    resp = client.post("/api/auth/users", json={
        "username": "intruder", "password": "x",
        "display_name": "Intruder", "role": "admin",
    })
    assert resp.status_code == 401
    assert User.query.count() == before, "an account was created anyway"


def test_an_admin_can_still_administer_users(roles):
    assert roles["admin"].get("/api/auth/users").status_code == 200


# ── Default-deny for the whole API ──────────────────────────────────────────
#
# An audit during the session-auth work found 74 registered routes with no gate.
# Probing them anonymously returned 22KB of patient records and 22KB of call
# records — PHI, to a caller who had never logged in. Authentication is now the
# default for /api/ (see utils/auth_utils.register_api_auth_guard); these pin
# both halves of that: the exposure is closed, and the exceptions stay narrow.

ANONYMOUS_MUST_NOT_READ = [
    "/api/patients",
    "/api/calls",
    "/api/employees",
    "/api/payroll/periods",
    "/api/analytics/dispatchers",
    "/api/settings",
    "/api/tasks",
    "/api/taxonomy",
]


@pytest.mark.parametrize("path", ANONYMOUS_MUST_NOT_READ)
def test_anonymous_reads_nothing(client, path):
    resp = client.get(path)
    assert resp.status_code == 401, f"{path} returned data to an anonymous caller"


def test_a_new_route_is_protected_by_omission(app, client):
    """The guard covers routes it has never heard of.

    This is the property that makes it worth having: adding a route without a
    decorator must fail closed rather than quietly publish whatever it returns.
    """
    @app.route("/api/some-future-endpoint")
    def _future():
        return {"secret": "should never be readable"}

    assert client.get("/api/some-future-endpoint").status_code == 401


def test_the_public_allowlist_stays_small_and_deliberate(app):
    """Anything added here is a considered exception, not an oversight."""
    from utils.auth_utils import PUBLIC_ENDPOINTS

    expected = {
        "auth.login", "auth.logout",          # signing in and out
        "auth.needs_setup", "auth.setup",     # desktop first-run (self-closing once a user exists)
        "health_check", "home",               # liveness, used before login
        "time.kiosk_employee_list", "time.kiosk_verify_pin",
        "time.kiosk_clock_in", "time.kiosk_clock_out", "time.kiosk_status",
        "notifications.vapid_public_key",     # the public VAPID key
        "tenant.current_tenant",              # login-screen workspace greeting
    }
    assert PUBLIC_ENDPOINTS == expected, (
        "the set of unauthenticated endpoints changed — every entry here is "
        "reachable with no session at all"
    )


def test_health_stays_reachable_for_container_checks(client):
    assert client.get("/api/health").status_code == 200


def test_the_kiosk_stays_reachable(client):
    """A wall-mounted clock-in device has no user session by design."""
    assert client.get("/api/kiosk/employees").status_code == 200


# ── Data-boundary authorization (role-correctness audit) ────────────────────
#
# The global guard makes every /api/ route require *a* session. These pin the
# separate question the audit asked: is "any signed-in user" too permissive for
# routes touching data the documented policy restricts by role —
#   "Dispatcher never sees payroll/salary/HR-private data;
#    HR never sees patient data."
# (docs/ROADMAP.md). Each was empirically reachable by the wrong role before the
# guards were added.

def _make_patient():
    p = Patient(first_name="Priv", last_name="Ate", dob="1980-01-01")
    db.session.add(p); db.session.commit()
    return p


def _make_employee():
    from models import Employee
    e = Employee(first_name="Ed", last_name="Medic", role="EMT")
    db.session.add(e); db.session.commit()
    return e


# Patients are PHI — HR must not reach them.
@pytest.mark.parametrize("path", ["/api/patients", "/api/patient/{pid}"])
def test_hr_cannot_read_patient_data(roles, path):
    p = _make_patient()
    resp = roles["hr"].get(path.format(pid=p.id))
    assert resp.status_code == 403, "HR reached patient PHI"


@pytest.mark.parametrize("role", ["admin", "supervisor", "dispatcher"])
def test_operational_roles_can_read_patients(roles, role):
    p = _make_patient()
    assert roles[role].get(f"/api/patient/{p.id}").status_code == 200


# Payroll is salary — dispatcher must not reach it.
@pytest.mark.parametrize("path", ["/api/payroll/periods", "/api/payroll/export"])
def test_dispatcher_cannot_read_payroll(roles, path):
    assert roles["dispatcher"].get(path).status_code == 403


def test_payroll_roles_can_read_payroll(roles):
    assert roles["hr"].get("/api/payroll/periods").status_code == 200
    assert roles["supervisor"].get("/api/payroll/periods").status_code == 200


# Pay configuration is salary — dispatcher must not read or set it.
def test_dispatcher_cannot_touch_pay_config(roles):
    e = _make_employee()
    assert roles["dispatcher"].get(f"/api/employees/{e.id}/pay-config").status_code == 403
    assert roles["dispatcher"].put(f"/api/employees/{e.id}/pay-config",
                                   json={"hourlyRate": 99}).status_code == 403


# Employee records are HR data. The LIST stays open — the Dispatch Board and
# Crew Planner need it for crew dropdowns — but detail and mutations do not.
def test_dispatcher_can_list_employees_for_crew_dropdowns(roles):
    _make_employee()
    assert roles["dispatcher"].get("/api/employees").status_code == 200


def test_dispatcher_cannot_open_or_change_an_employee_record(roles):
    e = _make_employee()
    assert roles["dispatcher"].get(f"/api/employees/{e.id}").status_code == 403
    assert roles["dispatcher"].get(f"/api/employees/{e.id}/shifts").status_code == 403
    assert roles["dispatcher"].delete(f"/api/employees/{e.id}").status_code == 403
    assert roles["dispatcher"].put(f"/api/employees/{e.id}",
                                   json={"firstName": "X"}).status_code == 403


def test_hr_and_supervisor_can_open_an_employee_record(roles):
    e = _make_employee()
    assert roles["hr"].get(f"/api/employees/{e.id}").status_code == 200
    assert roles["supervisor"].get(f"/api/employees/{e.id}").status_code == 200


# Employee documents (certs) are HR — the list was the one open endpoint.
def test_dispatcher_cannot_list_employee_documents(roles):
    e = _make_employee()
    assert roles["dispatcher"].get(f"/api/employees/{e.id}/documents").status_code == 403


# Supervisor analytics — not for dispatcher or HR.
@pytest.mark.parametrize("role", ["dispatcher", "hr"])
def test_analytics_is_supervisor_only(roles, role):
    assert roles[role].get("/api/analytics/dispatchers").status_code == 403


def test_supervisor_can_read_analytics(roles):
    assert roles["supervisor"].get("/api/analytics/dispatchers").status_code == 200


# ── Kiosk PIN is a credential, not roster data ──────────────────────────────
#
# The clock-in PIN lets you clock a colleague in or out at the shared kiosk.
# Employee.to_dict() used to include it, so every signed-in user could read
# every PIN from the employee list. It now travels only in the HR-gated detail
# payload that backs the edit form.

def test_the_employee_list_never_carries_kiosk_pins(roles):
    from models import Employee
    db.session.add(Employee(first_name="Pin", last_name="Holder", role="EMT", kiosk_pin="4321"))
    db.session.commit()

    body = roles["admin"].get("/api/employees").get_json()
    assert body, "no employees returned"
    for emp in body:
        assert "kioskPin" not in emp, "the roster payload leaked a kiosk PIN"


def test_the_hr_detail_endpoint_still_carries_the_pin_for_the_edit_form(roles):
    from models import Employee
    e = Employee(first_name="Pin", last_name="Holder", role="EMT", kiosk_pin="4321")
    db.session.add(e); db.session.commit()

    body = roles["hr"].get(f"/api/employees/{e.id}").get_json()
    assert body["kioskPin"] == "4321", "the edit form can no longer prefill the PIN"


# ── Audit resolutions: calls exclude HR, time-entries exclude dispatcher ─────
#
# Two contradictions the audit flagged for an owner decision, now resolved
# toward the documented policy ("HR never sees calls; dispatcher never sees
# payroll data") after verifying no HR or dispatcher flow depends on them.

@pytest.mark.parametrize("method,path", [
    ("get", "/api/calls"),
    ("get", "/api/calls/confirmation-round?date=2099-01-01"),
    ("get", "/api/calls/unscheduled"),
])
def test_hr_cannot_read_calls(roles, method, path):
    assert getattr(roles["hr"], method)(path).status_code == 403


@pytest.mark.parametrize("role", ["admin", "supervisor", "dispatcher"])
def test_operational_roles_can_read_calls(roles, role):
    assert roles[role].get("/api/calls").status_code == 200


def test_dispatcher_cannot_touch_time_entries(roles):
    e = _make_employee()
    assert roles["dispatcher"].get(f"/api/employees/{e.id}/time-entries").status_code == 403
    assert roles["dispatcher"].post(f"/api/employees/{e.id}/time-entries",
                                    json={"clock_in": "2026-01-01T08:00"}).status_code == 403


def test_payroll_roles_can_read_time_entries(roles):
    e = _make_employee()
    assert roles["hr"].get(f"/api/employees/{e.id}/time-entries").status_code == 200
    assert roles["supervisor"].get(f"/api/employees/{e.id}/time-entries").status_code == 200


def test_kiosk_clock_in_stays_reachable_after_time_entry_lockdown(client):
    """Tightening the management routes must not touch the public kiosk."""
    assert client.get("/api/kiosk/employees").status_code == 200


# ── Server-side revocation: the DB is authoritative every request ───────────
#
# Identity used to be re-checked only at login and on /me. These pin that
# disabling a user or changing their role takes effect on the very next request,
# without waiting for the cookie to expire — the app's revocation mechanism.

def test_disabling_a_user_ends_their_session_on_the_next_request(app, roles):
    from models import User
    # The dispatcher is signed in and working.
    assert roles["dispatcher"].get("/api/patients").status_code == 200

    # An admin disables the account mid-session.
    user = User.query.filter_by(username="test_security_dispatcher").first()
    user.is_active = False
    db.session.commit()

    # Their very next request is rejected — not honoured until expiry.
    resp = roles["dispatcher"].get("/api/patients")
    assert resp.status_code == 401


def test_a_role_change_takes_effect_on_the_next_request(app, roles):
    from models import User
    # A dispatcher cannot administer users.
    assert roles["dispatcher"].get("/api/auth/users").status_code == 403

    # An admin promotes them.
    user = User.query.filter_by(username="test_security_dispatcher").first()
    user.role = "admin"
    db.session.commit()

    # The new role is honoured immediately, from the database — not the stale
    # role baked into the cookie at login.
    assert roles["dispatcher"].get("/api/auth/users").status_code == 200


def test_a_demotion_also_takes_effect_immediately(app, roles):
    from models import User
    assert roles["admin"].get("/api/auth/users").status_code == 200

    user = User.query.filter_by(username="test_security_admin").first()
    user.role = "dispatcher"
    db.session.commit()

    assert roles["admin"].get("/api/auth/users").status_code == 403


def test_deleting_the_user_behind_a_live_session_ends_it(app, roles):
    from models import User
    user = User.query.filter_by(username="test_security_hr").first()
    db.session.delete(user)
    db.session.commit()

    assert roles["hr"].get("/api/employees").status_code == 401


# ── CSRF: state-changing requests need the token header ─────────────────────
#
# The session cookie is SameSite=Lax, which blocks the common cross-site POST.
# This is the defence-in-depth layer for the rest: a mutation must echo the
# session's CSRF token, delivered in a JS-readable cookie a cross-site page
# cannot read. `csrf=False` on the test client sends no header, i.e. forges the
# request the way an attacker's page would.

def test_a_mutation_without_the_csrf_header_is_refused(roles):
    resp = roles["admin"].post("/api/patients",
                               json={"first_name": "No", "last_name": "Token"}, csrf=False)
    assert resp.status_code == 403
    assert "CSRF" in resp.get_json()["error"]


def test_a_mutation_with_a_wrong_csrf_token_is_refused(roles):
    resp = roles["admin"].post("/api/patients",
                               json={"first_name": "Bad", "last_name": "Token"},
                               headers={"X-CSRF-Token": "not-the-real-token"}, csrf=False)
    assert resp.status_code == 403


def test_a_mutation_with_the_right_csrf_token_succeeds(roles):
    # The auto-CSRF client attaches the cookie's token; this is the happy path.
    resp = roles["admin"].post("/api/patients",
                               json={"first_name": "Good", "last_name": "Token"})
    assert resp.status_code == 201


@pytest.mark.parametrize("method,url", [
    ("put", "/api/patient/1"),
    ("delete", "/api/patient/1"),
])
def test_other_unsafe_methods_are_also_guarded(roles, method, url):
    assert getattr(roles["admin"], method)(url, csrf=False).status_code == 403


def test_safe_reads_do_not_need_a_csrf_token(roles):
    # GET changes nothing, so it is exempt — the app would be unusable otherwise.
    assert roles["admin"].get("/api/patients").status_code == 200


def test_login_does_not_require_a_csrf_token(client):
    """Login is a POST but has no session yet, so it cannot carry a token; it is
    the endpoint that establishes one."""
    from conftest import make_user
    make_user("admin", username="csrf_login")
    resp = client.post("/api/auth/login",
                       json={"username": "csrf_login", "password": "test-password"}, csrf=False)
    assert resp.status_code == 200


def test_login_hands_the_client_a_readable_csrf_cookie(client):
    from conftest import make_user
    make_user("admin", username="csrf_cookie")
    client.post("/api/auth/login",
                json={"username": "csrf_cookie", "password": "test-password"}, csrf=False)
    token = client.get_cookie("csrf_token")
    assert token is not None and token.value, "no CSRF cookie delivered at login"
