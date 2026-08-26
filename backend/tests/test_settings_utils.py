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
