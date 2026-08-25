"""Notification events and per-user notifications / preferences."""

from .base import db


class NotificationEvent(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    type = db.Column(db.String(100), nullable=False)
    severity = db.Column(db.String(20), default="info")  # info | warning | critical
    title = db.Column(db.String(255), nullable=False)
    body = db.Column(db.Text)
    entity_type = db.Column(db.String(50))   # call | unit | employee
    entity_id = db.Column(db.Integer)
    created_at = db.Column(db.String(50), nullable=False, index=True)
    expires_at = db.Column(db.String(50))

    # Multi-tenancy foundation.
    org_id = db.Column(db.Integer, db.ForeignKey("organization.id"), nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "type": self.type,
            "severity": self.severity,
            "title": self.title,
            "body": self.body,
            "entity_type": self.entity_type,
            "entity_id": self.entity_id,
            "created_at": self.created_at,
            "expires_at": self.expires_at,
        }


class UserNotification(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    event_id = db.Column(db.Integer, db.ForeignKey("notification_event.id"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False, index=True)
    is_read = db.Column(db.Boolean, default=False, index=True)
    created_at = db.Column(db.String(50), nullable=False)

    def to_dict(self, event=None):
        e = event or NotificationEvent.query.get(self.event_id)
        base = e.to_dict() if e else {}
        base.update({
            "id": self.id,
            "event_id": self.event_id,
            "is_read": self.is_read,
            "created_at": self.created_at,
        })
        return base


class UserNotificationPrefs(db.Model):
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), primary_key=True)
    prefs_json = db.Column(db.Text)   # JSON: {"call_new_today": true, ...}
    push_sub_json = db.Column(db.Text)  # Web Push subscription object JSON
    dispatch_thresholds_json = db.Column(db.Text)  # JSON: {pickup_late_after: N, stuck_after: N}
