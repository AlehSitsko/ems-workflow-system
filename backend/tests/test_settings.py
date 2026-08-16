"""Per-user settings — focused on the dashboard customisation slice.

The settings store is a deep-merged JSON blob; these pin the dashboard section's
defaults, validation and round-trip so a bad payload can't land in it.
"""


def test_defaults_include_the_dashboard_section(clients):
    body = clients["admin"].get("/api/settings").get_json()
    assert body["dashboard"] == {"quickLinks": None, "hiddenWidgets": []}


def test_quick_links_and_hidden_widgets_round_trip(clients):
    resp = clients["admin"].patch("/api/settings", json={
        "dashboard": {
            "quickLinks": ["/dispatch", "/calendar"],
            "hiddenWidgets": ["tasks"],
        },
    })
    assert resp.status_code == 200
    dash = resp.get_json()["dashboard"]
    assert dash["quickLinks"] == ["/dispatch", "/calendar"]
    assert dash["hiddenWidgets"] == ["tasks"]

    # Persisted for the next request.
    again = clients["admin"].get("/api/settings").get_json()["dashboard"]
    assert again["quickLinks"] == ["/dispatch", "/calendar"]


def test_realtime_notification_prefs_persist_across_requests(clients):
    """The realtime notification preferences (Off/Visual/Sound, volume, DND, quiet
    hours) are stored server-side per user, so they survive logout/login and are the
    same across a user's clients — not just browser-local UI state."""
    c = clients["dispatcher"]
    prefs = {
        "soundEnabled": False,
        "volume": 0.2,
        "dnd": True,
        "quietHours": {"enabled": True, "start": "22:00", "end": "07:00"},
        "types": {"newCall": "visual", "assignmentChanged": "off", "unitStatusChanged": "sound"},
    }
    resp = c.patch("/api/settings", json={"realtimeNotifications": prefs})
    assert resp.status_code == 200
    assert resp.get_json()["realtimeNotifications"] == prefs

    # A fresh request (i.e. a new session / another client / after re-login) still
    # sees them — proof they are persisted, not client-only.
    again = c.get("/api/settings").get_json()["realtimeNotifications"]
    assert again == prefs


def test_quick_links_can_be_reset_to_role_defaults_with_null(clients):
    clients["admin"].patch("/api/settings", json={"dashboard": {"quickLinks": ["/dispatch"]}})
    resp = clients["admin"].patch("/api/settings", json={"dashboard": {"quickLinks": None}})
    assert resp.status_code == 200
    assert resp.get_json()["dashboard"]["quickLinks"] is None


def test_patching_one_dashboard_field_leaves_the_other(clients):
    clients["admin"].patch("/api/settings", json={"dashboard": {"quickLinks": ["/dispatch"]}})
    # Only touch hiddenWidgets; quickLinks must survive the merge.
    resp = clients["admin"].patch("/api/settings", json={"dashboard": {"hiddenWidgets": ["todayBoard"]}})
    dash = resp.get_json()["dashboard"]
    assert dash["quickLinks"] == ["/dispatch"]
    assert dash["hiddenWidgets"] == ["todayBoard"]


def test_quick_links_must_be_a_list_of_strings(clients):
    assert clients["admin"].patch("/api/settings",
                                  json={"dashboard": {"quickLinks": "dispatch"}}).status_code == 400
    assert clients["admin"].patch("/api/settings",
                                  json={"dashboard": {"quickLinks": [1, 2]}}).status_code == 400


def test_quick_links_are_capped(clients):
    too_many = [f"/p{i}" for i in range(13)]
    assert clients["admin"].patch("/api/settings",
                                  json={"dashboard": {"quickLinks": too_many}}).status_code == 400


def test_hidden_widgets_must_be_known_keys(clients):
    assert clients["admin"].patch("/api/settings",
                                  json={"dashboard": {"hiddenWidgets": ["attention"]}}).status_code == 400
    assert clients["admin"].patch("/api/settings",
                                  json={"dashboard": {"hiddenWidgets": ["tasks", "quickLinks"]}}).status_code == 200


def test_calendar_saved_views_round_trip(clients):
    view = {"name": "My shifts", "view": "week",
            "sources": {"scheduled_call": False, "crew_shift": True}}
    resp = clients["admin"].patch("/api/settings", json={"calendar": {"savedViews": [view]}})
    assert resp.status_code == 200
    saved = resp.get_json()["calendar"]["savedViews"]
    assert len(saved) == 1 and saved[0]["name"] == "My shifts"


def test_calendar_saved_views_validation(clients):
    c = clients["admin"]
    assert c.patch("/api/settings", json={"calendar": {"savedViews": "nope"}}).status_code == 400
    assert c.patch("/api/settings", json={"calendar": {"savedViews": [{"view": "week"}]}}).status_code == 400  # no name
    assert c.patch("/api/settings", json={"calendar": {"savedViews": [{"name": ""}]}}).status_code == 400
    assert c.patch("/api/settings",
                   json={"calendar": {"savedViews": [{"name": "x"}] * 21}}).status_code == 400


def test_settings_require_a_session(anon):
    # The API auth guard blocks an anonymous mutation before it reaches the route.
    assert anon.patch("/api/settings", json={"dashboard": {"hiddenWidgets": []}}).status_code == 401
