import json

DEFAULT_SETTINGS = {
    "notifications": {
        "call_new_today":       True,
        "call_unassigned_soon": True,
        "call_als_on_bls":      True,
        "unit_stuck_status":    True,
        "unit_understaffed":    True,
        "cert_expiring":        True,
        "employee_added":       False,
        "doc_expiring":         True,
        "cert_no_scan":         False,
    },
    "dispatch": {
        "pickup_late_after": 0,
        "stuck_after":       30,
    },
    "ui": {
        "time_format": "12h",
        "panels": {
            "dispatch": {
                "leftWidth":    280,
                "bottomHeight": 300,
            }
        },
    },
    "calendar": {
        # Per-source visibility. Operational sources (scheduled_call, crew_shift)
        # and the derived overlay sources can each be toggled off in the user's
        # view. Access is still enforced server-side; these are display prefs.
        "sources": {
            "scheduled_call":    True,
            "crew_shift":        True,
            "patient_birthday":  True,
            "employee_birthday": True,
            "certification":     True,
            "task":              True,
            "vehicle":           True,
            "calendar_event":    True,
        },
        "showWeekends":  True,   # highlight Sat/Sun
        "showHolidays":  True,   # show US federal holiday markers
        "weekStartsOn":  0,      # 0 = Sunday, 1 = Monday
        "density":       "comfortable",  # comfortable | compact
    },
    "dashboard": {
        # Home dashboard customisation. `quickLinks` is null to mean "use the
        # role defaults" and otherwise an ordered list of route paths the user
        # picked. `hiddenWidgets` names the dashboard cards the user has hidden
        # (todayBoard | tasks | quickLinks) — the "needs attention" card is the
        # point of the page and is not hideable.
        "quickLinks":     None,
        "hiddenWidgets":  [],
    },
}


def deep_merge(base, patch):
    result = dict(base)
    for k, v in patch.items():
        if k in result and isinstance(result[k], dict) and isinstance(v, dict):
            result[k] = deep_merge(result[k], v)
        else:
            result[k] = v
    return result


def load_user_settings(user, db_session=None):
    """
    Returns the full settings dict for a user.
    Merges stored settings_json with defaults.
    On first call (settings_json is empty) migrates data from UserNotificationPrefs.
    """
    from models import UserNotificationPrefs

    stored = {}
    if user.settings_json:
        try:
            stored = json.loads(user.settings_json)
        except Exception:
            pass

    # One-time migration from old UserNotificationPrefs table
    if not stored:
        old = UserNotificationPrefs.query.get(user.id)
        if old:
            if old.prefs_json:
                try:
                    stored["notifications"] = json.loads(old.prefs_json)
                except Exception:
                    pass
            if old.dispatch_thresholds_json:
                try:
                    stored["dispatch"] = json.loads(old.dispatch_thresholds_json)
                except Exception:
                    pass
        if stored:
            # Persist migrated data immediately
            from models import db
            user.settings_json = json.dumps(stored)
            db.session.commit()

    return deep_merge(DEFAULT_SETTINGS, stored)


def save_user_settings(user, patch):
    """Deep-merges patch into user settings and persists to DB."""
    from models import db
    current = load_user_settings(user)
    merged = deep_merge(current, patch)
    user.settings_json = json.dumps(merged)
    db.session.commit()
    return merged
