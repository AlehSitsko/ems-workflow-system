"""Navigation badges beyond the four queues: the tasks and compliance counts on
GET /api/operations/attention.
"""

from datetime import date, timedelta

from models import db, Task, Employee, User


TODAY = date.today().isoformat()
YESTERDAY = (date.today() - timedelta(days=1)).isoformat()
TOMORROW = (date.today() + timedelta(days=1)).isoformat()
FAR = (date.today() + timedelta(days=200)).isoformat()
SOON = (date.today() + timedelta(days=10)).isoformat()   # within the 14-day window


def mk_task(created_by, due_date=None, status="New"):
    db.session.add(Task(
        title="t", task_type="General Task", status=status, priority="Normal",
        created_by_user_id=created_by, due_date=due_date,
        created_at="2026-01-01T00:00:00", updated_at="2026-01-01T00:00:00",
    ))
    db.session.commit()


def mk_employee(last, active=True, cpr_expiry=None):
    e = Employee(
        first_name="X", last_name=last, is_active=active,
        cpr_has_license=bool(cpr_expiry), cpr_expiration_date=cpr_expiry,
    )
    db.session.add(e)
    db.session.commit()
    return e


def attention(client):
    return client.get("/api/operations/attention").get_json()


# ── Tasks badge ──────────────────────────────────────────────────────────────

def test_tasks_badge_counts_my_overdue_and_due_today_only(clients):
    admin = User.query.filter_by(username="test_admin").first()
    mk_task(admin.id, due_date=YESTERDAY)              # overdue → counts
    mk_task(admin.id, due_date=TODAY)                  # due today → counts
    mk_task(admin.id, due_date=TOMORROW)               # future → no
    mk_task(admin.id, due_date=None)                   # no due date → no
    mk_task(admin.id, due_date=YESTERDAY, status="Completed")  # terminal → no

    assert attention(clients["admin"])["tasks"] == 2


def test_tasks_badge_is_scoped_to_the_caller(clients):
    other = User.query.filter_by(username="test_supervisor").first()
    mk_task(other.id, due_date=YESTERDAY)   # someone else's overdue task
    assert attention(clients["admin"])["tasks"] == 0


# ── Compliance badge ─────────────────────────────────────────────────────────

def test_compliance_badge_counts_expired_or_soon_certs(clients):
    mk_employee("Expired", cpr_expiry=YESTERDAY)   # expired → counts
    mk_employee("Soon", cpr_expiry=SOON)           # within 14 days → counts
    mk_employee("Fine", cpr_expiry=FAR)            # far off → no
    mk_employee("Inactive", active=False, cpr_expiry=YESTERDAY)  # inactive → no
    mk_employee("NoCert")                          # no cert → no

    assert attention(clients["admin"])["compliance"] == 2


def test_compliance_badge_is_hidden_from_dispatcher(clients):
    mk_employee("Expired", cpr_expiry=YESTERDAY)
    counts = attention(clients["dispatcher"])
    # Dispatcher runs operations, not the HR compliance record.
    assert "compliance" not in counts


def test_badges_need_a_session(anon):
    assert anon.get("/api/operations/attention").status_code == 401
