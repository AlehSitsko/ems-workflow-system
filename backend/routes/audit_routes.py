from flask import Blueprint, jsonify, request

from models import db, AuditLog

audit_bp = Blueprint("audit", __name__, url_prefix="/api/audit")

ALLOWED_ROLES = {"admin", "supervisor", "hr"}


@audit_bp.route("", methods=["GET"])
def get_audit_log():
    role = request.headers.get("X-User-Role", "")
    if role not in ALLOWED_ROLES:
        return jsonify({"error": "Insufficient permissions"}), 403

    entity_type = request.args.get("entity_type", "").strip() or None
    entity_id   = request.args.get("entity_id", "").strip() or None
    action      = request.args.get("action", "").strip() or None
    date_from   = request.args.get("date_from", "").strip() or None
    date_to     = request.args.get("date_to", "").strip() or None
    page        = max(1, int(request.args.get("page", 1)))
    per_page    = min(200, max(1, int(request.args.get("per_page", 50))))

    q = AuditLog.query

    if entity_type:
        q = q.filter(AuditLog.entity_type == entity_type)
    if entity_id:
        try:
            q = q.filter(AuditLog.entity_id == int(entity_id))
        except ValueError:
            pass
    if action:
        q = q.filter(AuditLog.action.like(f"%{action}%"))
    if date_from:
        q = q.filter(AuditLog.timestamp >= date_from)
    if date_to:
        q = q.filter(AuditLog.timestamp < date_to + "T99")

    total = q.count()
    entries = q.order_by(AuditLog.id.desc()).offset((page - 1) * per_page).limit(per_page).all()

    return jsonify({
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": (total + per_page - 1) // per_page,
        "entries": [e.to_dict() for e in entries],
    })
