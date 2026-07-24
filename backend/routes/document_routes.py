from datetime import datetime

from flask import Blueprint, jsonify, request

from models import db, EmployeeDocument, Employee, DOC_TYPES
from storage import save_file, delete_file, get_file_response
from notification_utils import create_notification
from utils.validation_utils import check_length
from utils.auth_utils import get_request_user_id, require_role

doc_bp = Blueprint("documents", __name__, url_prefix="/api")

ALLOWED_ROLES = {"admin", "supervisor", "hr"}
ALLOWED_MIME = {
    "application/pdf",
    "image/jpeg", "image/png", "image/webp",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
MAX_SIZE = 10 * 1024 * 1024  # 10 MB


def _user_id_from_request():
    return get_request_user_id()


# ── Document list + create ──────────────────────────────────────────────────

@doc_bp.route("/employees/<int:employee_id>/documents", methods=["GET"])
def list_documents(employee_id):
    Employee.query.get_or_404(employee_id)
    docs = (EmployeeDocument.query
            .filter_by(employee_id=employee_id)
            .order_by(EmployeeDocument.uploaded_at.desc())
            .all())
    return jsonify([d.to_dict() for d in docs])


@doc_bp.route("/employees/<int:employee_id>/documents", methods=["POST"])
@require_role(*ALLOWED_ROLES)
def upload_document(employee_id):
    Employee.query.get_or_404(employee_id)

    doc_type = request.form.get("doc_type", "other")
    if doc_type not in DOC_TYPES:
        return jsonify({"error": f"Invalid doc_type. Must be one of: {DOC_TYPES}"}), 400

    title = (request.form.get("title") or "").strip()
    if not title:
        return jsonify({"error": "title is required"}), 400

    try:
        check_length(title, 200, "title")
        check_length(request.form.get("notes"), 2000, "notes")
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    file_path = file_name = file_size = mime_type = None

    if "file" in request.files:
        f = request.files["file"]
        if f.filename:
            mime = f.mimetype or ""
            if mime not in ALLOWED_MIME:
                return jsonify({"error": "File type not allowed. Use PDF, JPG, PNG, or DOCX."}), 400
            f.seek(0, 2)
            size = f.tell()
            f.seek(0)
            if size > MAX_SIZE:
                return jsonify({"error": "File too large. Maximum 10 MB."}), 400
            file_path, file_name, file_size = save_file(f, employee_id)
            file_name = f.filename
            mime_type = mime

    now = datetime.utcnow().isoformat()
    doc = EmployeeDocument(
        employee_id=employee_id,
        doc_type=doc_type,
        title=title,
        file_path=file_path,
        file_name=file_name,
        file_size=file_size,
        mime_type=mime_type,
        document_number=request.form.get("document_number"),
        issuing_body=request.form.get("issuing_body"),
        issued_date=request.form.get("issued_date"),
        expiry_date=request.form.get("expiry_date") or None,
        notes=request.form.get("notes"),
        uploaded_by=_user_id_from_request(),
        uploaded_at=now,
        updated_at=now,
    )
    db.session.add(doc)
    db.session.commit()
    _notify_if_expiring(doc)
    return jsonify(doc.to_dict()), 201


def _notify_if_expiring(doc):
    """Fire an immediate doc_expiring notification if the document is within 90 days of expiry."""
    if not doc.expiry_date:
        return
    try:
        exp_dt = datetime.strptime(doc.expiry_date, "%Y-%m-%d")
        days_left = (exp_dt.date() - datetime.now().date()).days
        if days_left < 0 or days_left > 90:
            return
        severity = "critical" if days_left <= 14 else "warning"
        emp = doc.employee
        emp_name = f"{emp.first_name} {emp.last_name}" if emp else f"Employee #{doc.employee_id}"
        label = f"expiring in {days_left} days" if days_left > 0 else "expired today"
        create_notification(
            "doc_expiring", severity,
            f"{emp_name} — {doc.title} {label}",
            f"Document type: {doc.doc_type}. Expires: {doc.expiry_date}",
            entity_type="employee_document", entity_id=doc.id,
            dedup_minutes=60,
        )
    except Exception:
        pass


# ── Single document ──────────────────────────────────────────────────────────

@doc_bp.route("/documents/<int:doc_id>", methods=["GET"])
@require_role(*ALLOWED_ROLES)
def get_document(doc_id):
    doc = EmployeeDocument.query.get_or_404(doc_id)
    return jsonify(doc.to_dict())


@doc_bp.route("/documents/<int:doc_id>", methods=["PATCH"])
@require_role(*ALLOWED_ROLES)
def update_document(doc_id):
    doc = EmployeeDocument.query.get_or_404(doc_id)
    data = request.get_json() or {}

    if "doc_type" in data and data["doc_type"] not in DOC_TYPES:
        return jsonify({"error": f"Invalid doc_type. Must be one of: {DOC_TYPES}"}), 400

    if "title" in data and not (data.get("title") or "").strip():
        return jsonify({"error": "title is required"}), 400

    try:
        check_length(data.get("title"), 200, "title")
        check_length(data.get("notes"), 2000, "notes")
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    for field in ("title", "doc_type", "document_number", "issuing_body",
                  "issued_date", "expiry_date", "notes"):
        if field in data:
            setattr(doc, field, data[field] or None if field in ("expiry_date",) else data[field])

    doc.updated_by = _user_id_from_request()
    doc.updated_at = datetime.utcnow().isoformat()
    db.session.commit()
    _notify_if_expiring(doc)
    return jsonify(doc.to_dict())


@doc_bp.route("/documents/<int:doc_id>", methods=["DELETE"])
@require_role(*ALLOWED_ROLES)
def delete_document(doc_id):
    doc = EmployeeDocument.query.get_or_404(doc_id)
    if doc.file_path:
        delete_file(doc.file_path)
    db.session.delete(doc)
    db.session.commit()
    return jsonify({"ok": True})


# ── File download ─────────────────────────────────────────────────────────────

@doc_bp.route("/documents/<int:doc_id>/file", methods=["GET"])
@require_role(*ALLOWED_ROLES)
def download_document_file(doc_id):
    doc = EmployeeDocument.query.get_or_404(doc_id)
    if not doc.file_path:
        return jsonify({"error": "No file attached to this document"}), 404

    return get_file_response(doc.file_path)


# ── Compliance summary (all employees × doc types) ───────────────────────────

def _cert_status_from_date(expiry_date_str: str | None, has_license: bool) -> str:
    """Convert legacy Employee cert fields to a compliance status string."""
    if not has_license:
        return "none"
    if not expiry_date_str:
        return "ok"  # has cert but no expiry tracked
    from datetime import date
    try:
        exp = date.fromisoformat(expiry_date_str)
        days = (exp - date.today()).days
        if days < 0:
            return "expired"
        if days <= 14:
            return "critical"
        if days <= 90:
            return "warning"
        return "ok"
    except ValueError:
        return "ok"


@doc_bp.route("/documents/compliance", methods=["GET"])
@require_role(*ALLOWED_ROLES)
def compliance_summary():
    employees = Employee.query.filter(Employee.is_active.is_(True)).order_by(Employee.last_name).all()
    all_docs = EmployeeDocument.query.all()

    STATUS_RANK = {"ok": 4, "warning": 3, "critical": 2, "expired": 1, "none": 0}

    # Index by employee_id → doc_type → best status (from EmployeeDocument records)
    index: dict[int, dict[str, str]] = {}
    for doc in all_docs:
        emp_map = index.setdefault(doc.employee_id, {})
        status = doc.expiry_status()
        existing = emp_map.get(doc.doc_type, "none")
        if STATUS_RANK.get(status, 0) > STATUS_RANK.get(existing, 0):
            emp_map[doc.doc_type] = status

    # Merge legacy Employee cert fields — only upgrade if better than existing
    # Mapping: Employee field prefix → EmployeeDocument doc_type
    LEGACY_CERT_MAP = {
        "cpr":       "cpr_cert",
        "evoc":      "evoc_cert",
        "emt":       "emt_cert",
        "paramedic": "emt_cert",  # paramedic also satisfies emt_cert
    }
    for emp in employees:
        emp_map = index.setdefault(emp.id, {})
        for prefix, doc_type in LEGACY_CERT_MAP.items():
            has_lic = getattr(emp, f"{prefix}_has_license", False)
            exp_date = getattr(emp, f"{prefix}_expiration_date", None)
            status = _cert_status_from_date(exp_date, has_lic)
            existing = emp_map.get(doc_type, "none")
            if STATUS_RANK.get(status, 0) > STATUS_RANK.get(existing, 0):
                emp_map[doc_type] = status

    result = []
    for emp in employees:
        result.append({
            "employee_id": emp.id,
            "first_name": emp.first_name,
            "last_name": emp.last_name,
            "role": emp.role or "EMT",
            "docs": index.get(emp.id, {}),
        })

    return jsonify({"employees": result, "doc_types": DOC_TYPES})
