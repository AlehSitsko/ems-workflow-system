"""Operational day closures."""

from .base import db


class OperationalDayClosure(db.Model):
    """A day someone has reviewed and signed off.

    Past dates are already read-only (see utils.operational_dates), so this is
    not a lock — it is the record that a human checked the day, what state it was
    in when they did, and what they said about it. Without it "yesterday is
    finished" is an assumption; with it, it is a fact with a name against it.

    The counts are a snapshot taken at closing time. They are stored rather than
    recomputed because the point is what the day looked like when it was signed
    off — a later edit to a call should not silently rewrite the handoff.
    """
    __tablename__ = "operational_day_closure"

    id = db.Column(db.Integer, primary_key=True)

    # One closure per operational day.
    day = db.Column(db.String(20), nullable=False, unique=True, index=True)

    closed_at = db.Column(db.String(50), nullable=False)
    closed_by = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)
    closed_by_name = db.Column(db.String(150))
    notes = db.Column(db.Text)

    # Snapshot of the day as it stood when it was closed.
    calls_total = db.Column(db.Integer, default=0)
    calls_completed = db.Column(db.Integer, default=0)
    calls_cancelled = db.Column(db.Integer, default=0)
    calls_unfinished = db.Column(db.Integer, default=0)
    units_total = db.Column(db.Integer, default=0)
    units_unfinished = db.Column(db.Integer, default=0)

    # Multi-tenancy foundation.
    org_id = db.Column(db.Integer, db.ForeignKey("organization.id"), nullable=True)

    def to_dict(self):
        return {
            "day": self.day,
            "closedAt": self.closed_at,
            "closedBy": self.closed_by,
            "closedByName": self.closed_by_name or "",
            "notes": self.notes or "",
            "snapshot": {
                "callsTotal": self.calls_total or 0,
                "callsCompleted": self.calls_completed or 0,
                "callsCancelled": self.calls_cancelled or 0,
                "callsUnfinished": self.calls_unfinished or 0,
                "unitsTotal": self.units_total or 0,
                "unitsUnfinished": self.units_unfinished or 0,
            },
        }
