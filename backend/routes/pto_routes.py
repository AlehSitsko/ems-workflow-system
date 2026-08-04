"""PTO balances and accrual — HR-facing.

An employee's balance is the sum of their ledger; HR reads it, runs the (idempotent)
monthly accrual, and can post a manual correction. All org-scoped: `Employee` and
`PtoLedgerEntry` are tenant-filtered, so an HR user only ever sees or touches their
own organisation.
"""

from flask import Blueprint, jsonify, request

from models import db, Employee, PtoLedgerEntry
from utils.auth_utils import require_role, get_request_user_id, get_request_user_name
from utils import pto
from audit_utils import log_action


pto_bp = Blueprint("pto", __name__, url_prefix="/api/pto")

HR_ROLES = ("admin", "hr")


def _employee_or_none(employee_id):
    # Org-filtered: another org's employee resolves to None → 404.
    return Employee.query.filter_by(id=employee_id).first()


@pto_bp.route("/employees/<int:employee_id>", methods=["GET"])
@require_role(*HR_ROLES)
def employee_pto(employee_id):
    """An employee's balance, annual allotment and full ledger (newest first)."""
    emp = _employee_or_none(employee_id)
    if not emp:
        return jsonify({"error": "Employee not found"}), 404
    ledger = (
        PtoLedgerEntry.query
        .filter_by(employee_id=emp.id)
        .order_by(PtoLedgerEntry.effective_date.desc(), PtoLedgerEntry.id.desc())
        .all()
    )
    return jsonify({
        "employeeId": emp.id,
        "balance": pto.pto_balance(emp.id),
        "annualDays": pto.annual_days(emp),
        "ledger": [e.to_dict() for e in ledger],
    })


@pto_bp.route("/run-accrual", methods=["POST"])
@require_role(*HR_ROLES)
def run_accrual():
    """Post monthly accruals (and any year-end carryover) through today. Idempotent
    — a month already accrued is never posted twice, so this is safe to re-run."""
    posted = pto.accrue_through(created_by=get_request_user_id())
    return jsonify({"posted": len(posted)})


@pto_bp.route("/employees/<int:employee_id>/adjust", methods=["POST"])
@require_role(*HR_ROLES)
def adjust(employee_id):
    """A manual balance correction (+/- days) with a note — audited."""
    emp = _employee_or_none(employee_id)
    if not emp:
        return jsonify({"error": "Employee not found"}), 404

    data = request.get_json() or {}
    try:
        delta = float(data.get("deltaDays"))
    except (TypeError, ValueError):
        return jsonify({"error": "deltaDays must be a number"}), 400
    if delta == 0:
        return jsonify({"error": "deltaDays must be non-zero"}), 400
    note = (data.get("note") or "").strip() or None

    pto.record_adjustment(emp.id, delta, note=note, created_by=get_request_user_id())
    log_action("pto.adjusted", "employee", emp.id, f"{emp.first_name} {emp.last_name}",
               {"deltaDays": delta, "note": note},
               user_id=get_request_user_id(), user_name=get_request_user_name())
    db.session.commit()
    return jsonify({"balance": pto.pto_balance(emp.id)})
