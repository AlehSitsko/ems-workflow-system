import json
import logging
from datetime import datetime, timezone

from models import db, AuditLog

logger = logging.getLogger(__name__)


def log_action(
    action: str,
    entity_type: str = None,
    entity_id: int = None,
    entity_label: str = None,
    details: dict = None,
    user_id: int = None,
    user_name: str = None,
):
    """Append a row to audit_log. Never raises — audit must not break the main flow."""
    try:
        entry = AuditLog(
            timestamp=datetime.now(timezone.utc).isoformat(timespec="seconds"),
            user_id=user_id,
            user_name=user_name or "System",
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            entity_label=entity_label,
            details=json.dumps(details) if details else None,
        )
        db.session.add(entry)
        db.session.flush()   # write within current transaction; caller commits
    except Exception:
        # Auditing must never break the action it records; log and move on.
        logger.exception("failed to write audit log entry")
