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
    org_id: int = None,
):
    """Append a row to audit_log. Never raises — audit must not break the main flow.

    `org_id` is set explicitly only for cross-org actors (a platform super-admin has
    no org of their own, so the tenant write-stamp can't attribute the entry). For
    ordinary in-org actions it stays None and the stamp fills it from the caller's
    org, exactly as before — so that entry lands in the acting org's trail."""
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
        if org_id is not None:
            entry.org_id = org_id
        db.session.add(entry)
        db.session.flush()   # write within current transaction; caller commits
    except Exception:
        # Auditing must never break the action it records; log and move on.
        logger.exception("failed to write audit log entry")
