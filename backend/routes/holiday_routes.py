"""Company-observed holidays (per organisation).

A holiday inside a leave range does not spend PTO (see utils/pto.business_days), and
it is a natural thing to show on the calendar. Any staff role may read the list; HR
maintains it. Org-scoped — `Holiday` is tenant-filtered.
"""

from datetime import datetime

from flask import Blueprint, jsonify, request

from models import db, Holiday
from utils.auth_utils import require_role, ALL_ROLES
from utils.validation_utils import is_valid_date, check_length


holiday_bp = Blueprint("holiday", __name__, url_prefix="/api/holidays")

HR_ROLES = ("admin", "hr")


@holiday_bp.route("", methods=["GET"])
@require_role(*ALL_ROLES)
def list_holidays():
    holidays = Holiday.query.order_by(Holiday.date.asc()).all()
    return jsonify([h.to_dict() for h in holidays])


@holiday_bp.route("", methods=["POST"])
@require_role(*HR_ROLES)
def create_holiday():
    data = request.get_json() or {}
    date = (data.get("date") or "").strip()
    name = (data.get("name") or "").strip()
    if not is_valid_date(date):
        return jsonify({"error": "date must be a real YYYY-MM-DD date"}), 400
    if not name:
        return jsonify({"error": "name is required"}), 400
    try:
        check_length(name, 150, "name")
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    # Unique per org+date — the tenant filter scopes this lookup to the caller's org.
    if Holiday.query.filter_by(date=date).first():
        return jsonify({"error": "A holiday already exists on that date"}), 409

    holiday = Holiday(date=date, name=name,
                      created_at=datetime.now().isoformat(timespec="seconds"))
    db.session.add(holiday)
    db.session.commit()
    return jsonify(holiday.to_dict()), 201


@holiday_bp.route("/<int:holiday_id>", methods=["DELETE"])
@require_role(*HR_ROLES)
def delete_holiday(holiday_id):
    holiday = Holiday.query.filter_by(id=holiday_id).first()   # org-filtered
    if not holiday:
        return jsonify({"error": "Holiday not found"}), 404
    db.session.delete(holiday)
    db.session.commit()
    return jsonify({"message": "Holiday deleted"})
