"""Fail-soft behaviour of user settings loading.

A corrupt settings_json blob must not crash or lock the user out: load_user_settings
falls back to the defaults and logs a warning (user id only, never the blob contents).
Guards the narrowed exception handling in settings_utils.
"""
import logging

from conftest import make_user
from models import db
from settings_utils import DEFAULT_SETTINGS, load_user_settings


def test_corrupt_settings_json_falls_back_to_defaults(app, caplog):
    user = make_user("dispatcher", username="corrupt_settings")
    user.settings_json = "{ this is not valid json"
    db.session.commit()

    with caplog.at_level(logging.WARNING):
        result = load_user_settings(user)

    assert result == DEFAULT_SETTINGS
    assert any("corrupt settings_json" in r.getMessage() for r in caplog.records)
    # The log must carry the id, never the (potentially sensitive) blob contents.
    assert all("not valid json" not in r.getMessage() for r in caplog.records)


def test_valid_settings_json_is_merged_over_defaults(app):
    user = make_user("dispatcher", username="valid_settings")
    user.settings_json = '{"notifications": {"call_new_today": false}}'
    db.session.commit()

    result = load_user_settings(user)

    assert result["notifications"]["call_new_today"] is False
    # A partial blob still inherits every other default key.
    assert result["notifications"]["doc_expiring"] == DEFAULT_SETTINGS["notifications"]["doc_expiring"]


# ── one-time migration from the legacy UserNotificationPrefs table ───────────

def test_migrates_legacy_notification_and_dispatch_prefs(app):
    """First load with an empty settings_json pulls prefs from the old
    UserNotificationPrefs table into settings_json (and persists them)."""
    from models import UserNotificationPrefs
    user = make_user("dispatcher", username="legacy_prefs")
    db.session.add(UserNotificationPrefs(
        user_id=user.id,
        prefs_json='{"call_new_today": false}',
        dispatch_thresholds_json='{"stuck_after": 15}',
    ))
    db.session.commit()

    result = load_user_settings(user)
    assert result["notifications"]["call_new_today"] is False
    assert result["dispatch"]["stuck_after"] == 15
    # migrated data is persisted onto the user so the next load is a no-op
    assert user.settings_json and "call_new_today" in user.settings_json


def test_corrupt_legacy_prefs_are_skipped_not_fatal(app, caplog):
    from models import UserNotificationPrefs
    user = make_user("dispatcher", username="legacy_corrupt")
    db.session.add(UserNotificationPrefs(user_id=user.id, prefs_json="{not json"))
    db.session.commit()

    with caplog.at_level(logging.WARNING):
        result = load_user_settings(user)
    # falls back to defaults (no notifications key migrated), no crash
    assert result == DEFAULT_SETTINGS
    assert any("legacy" in r.message for r in caplog.records)
