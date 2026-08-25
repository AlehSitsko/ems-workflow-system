"""Global audit log."""

from .base import db


class AuditLog(db.Model):
    __tablename__ = "audit_log"

    id            = db.Column(db.Integer, primary_key=True)
    timestamp     = db.Column(db.String(50), nullable=False, index=True)
    user_id       = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)
    user_name     = db.Column(db.String(150))        # denormalized for display after user deletion
    action        = db.Column(db.String(100), nullable=False)   # e.g. "call.assigned"
    entity_type   = db.Column(db.String(50), index=True)         # "call", "patient", "unit", "time_entry"
    entity_id     = db.Column(db.Integer)
    entity_label  = db.Column(db.String(255))        # human-readable: "Call #42", "John Doe"
    details       = db.Column(db.Text)               # JSON string with old/new values or extra context

    # Tenant owner — so one organisation's admin cannot read another's audit trail.
    # Stamped automatically for in-request writes (tenant.py); a system-written entry
    # (no request context) has none and is not shown in any org's view.
    org_id        = db.Column(db.Integer, db.ForeignKey("organization.id"), nullable=True, index=True)

    def to_dict(self):
        return {
            "id":           self.id,
            "timestamp":    self.timestamp,
            "user_id":      self.user_id,
            "user_name":    self.user_name or "System",
            "action":       self.action,
            "entity_type":  self.entity_type,
            "entity_id":    self.entity_id,
            "entity_label": self.entity_label or "",
            "details":      self.details or "",
        }


# ── Staff Tasks ─────────────────────────────────────────────────────────────
