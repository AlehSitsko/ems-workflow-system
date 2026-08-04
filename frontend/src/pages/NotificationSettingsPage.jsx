import React, { useState, useEffect } from "react";
import { FaSave } from "react-icons/fa";
import { usePushNotifications } from "../hooks/usePushNotifications";
import { useUserSettings } from "../context/useUserSettings";
import TimeFormatSettings from "../components/settings/TimeFormatSettings";
import BrowserNotificationSettings from "../components/settings/BrowserNotificationSettings";
import NotificationTypeSettings from "../components/settings/NotificationTypeSettings";
import DispatchVisualAlertsSettings from "../components/settings/DispatchVisualAlertsSettings";
import CalendarDisplaySettings from "../components/settings/CalendarDisplaySettings";
import DashboardSettings from "../components/settings/DashboardSettings";
import ActiveSessions from "../components/settings/ActiveSessions";
import OrgSettings from "../components/settings/OrgSettings";
import HolidaySettings from "../components/settings/HolidaySettings";
import { getNavigationItems } from "../config/routeMetadata";
import { roleQuickLinks } from "../config/dashboardDefaults";
import API_BASE from "../api/config.js";

const DEFAULT_CALENDAR_SETTINGS = {
  sources: {
    scheduled_call: true, crew_shift: true, patient_birthday: true,
    employee_birthday: true, certification: true, task: true, vehicle: true,
    calendar_event: true,
  },
  showWeekends: true, showHolidays: true, weekStartsOn: 0, density: "comfortable",
};

function NotificationSettingsPage({ currentUser }) {
  // Available types + labels for this user's role (from backend, role-filtered)
  const [availableTypes, setAvailableTypes] = useState({});
  const [loadingTypes, setLoadingTypes] = useState(true);

  // Local edits before saving
  const [localNotifs, setLocalNotifs] = useState({});
  const [localDispatch, setLocalDispatch] = useState({ pickup_late_after: 0, stuck_after: 30 });
  const [localTimeFormat, setLocalTimeFormat] = useState("12h");
  const [localCalendar, setLocalCalendar] = useState(DEFAULT_CALENDAR_SETTINGS);
  const [localDashboard, setLocalDashboard] = useState({ quickLinks: null, hiddenWidgets: [] });
  const [hydrated, setHydrated] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const { settings, updateSettings, settingsLoaded } = useUserSettings();
  const { status, vapidConfigured, subscribe, sendTestPush } = usePushNotifications(currentUser);

  const [testState, setTestState] = useState("idle"); // idle | sending | sent | error
  const [testError, setTestError] = useState("");

  // Load available types + labels from backend (role-specific metadata)
  useEffect(() => {
    if (!currentUser?.id) return;
    fetch(`${API_BASE}/api/notifications/prefs`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => { setAvailableTypes(data); setLoadingTypes(false); })
      .catch(() => setLoadingTypes(false));
  }, [currentUser?.id]);

  // Hydrate local state from context once both are ready
  useEffect(() => {
    if (!settingsLoaded || loadingTypes) return;
    const notifValues = {};
    Object.keys(availableTypes).forEach((type) => {
      notifValues[type] = settings.notifications[type] ?? availableTypes[type]?.enabled ?? true;
    });
    setLocalNotifs(notifValues);
    setLocalDispatch({ ...settings.dispatch });
    setLocalTimeFormat(settings.ui?.time_format === "24h" ? "24h" : "12h");
    setLocalCalendar({
      ...DEFAULT_CALENDAR_SETTINGS,
      ...(settings.calendar || {}),
      sources: { ...DEFAULT_CALENDAR_SETTINGS.sources, ...(settings.calendar?.sources || {}) },
    });
    setLocalDashboard({
      quickLinks: settings.dashboard?.quickLinks ?? null,
      hiddenWidgets: settings.dashboard?.hiddenWidgets ?? [],
    });
    setHydrated(true);
  }, [settingsLoaded, loadingTypes, settings, availableTypes]);

  const toggleNotif = (type) => {
    setLocalNotifs((prev) => ({ ...prev, [type]: !prev[type] }));
    setSaved(false);
  };

  const setTimeFormat = (fmt) => {
    setLocalTimeFormat(fmt);
    setSaved(false);
  };

  const setDispatchThreshold = (key, val) => {
    const n = Math.max(0, parseInt(val, 10) || 0);
    setLocalDispatch((prev) => ({ ...prev, [key]: n }));
    setSaved(false);
  };

  // Save only ever writes user preferences (notification toggles, dispatch
  // thresholds, time format) — never the browser permission or push
  // subscription state, which live outside user-controlled settings.
  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSettings({
        notifications: localNotifs,
        dispatch: localDispatch,
        ui: { time_format: localTimeFormat },
        calendar: localCalendar,
        dashboard: localDashboard,
      });
      setSaved(true);
    } catch { /* noop */ }
    setSaving(false);
  };

  const handleEnable = async () => {
    setTestState("idle");
    setTestError("");
    await subscribe();
  };

  const handleTestPush = async () => {
    setTestState("sending");
    setTestError("");
    try {
      await sendTestPush();
      setTestState("sent");
    } catch (err) {
      setTestState("error");
      setTestError(err.message || "Failed to send test notification");
    }
  };

  if (loadingTypes || !hydrated) {
    return <div className="page-stack"><p className="text-muted">Loading...</p></div>;
  }

  return (
    <div className="page-stack">
      <section className="content-panel">
        <div className="content-panel-header">
          <div>
            <h4>Settings</h4>
            <p>Your personal preferences and notification settings — saved to your account across all sessions.</p>
          </div>
          <button
            type="button"
            className="btn btn-primary btn-sm d-inline-flex align-items-center gap-2"
            onClick={handleSave}
            disabled={saving}
          >
            <FaSave />
            {saving ? "Saving..." : saved ? "Saved ✓" : "Save"}
          </button>
        </div>

        <TimeFormatSettings value={localTimeFormat} onChange={setTimeFormat} />

        <BrowserNotificationSettings
          status={status}
          vapidConfigured={vapidConfigured}
          onEnable={handleEnable}
          onSendTest={handleTestPush}
          testState={testState}
          testError={testError}
        />

        <NotificationTypeSettings
          availableTypes={availableTypes}
          localNotifs={localNotifs}
          onToggle={toggleNotif}
        />

        <DispatchVisualAlertsSettings
          pickupLateAfter={localDispatch.pickup_late_after}
          stuckAfter={localDispatch.stuck_after}
          onChange={setDispatchThreshold}
        />

        <CalendarDisplaySettings
          value={localCalendar}
          onChange={(next) => { setLocalCalendar(next); setSaved(false); }}
        />

        <DashboardSettings
          value={localDashboard}
          allowedLinks={getNavigationItems(currentUser)}
          roleDefaults={roleQuickLinks(currentUser?.role)}
          onChange={(next) => { setLocalDashboard(next); setSaved(false); }}
        />
      </section>

      {currentUser?.role === "admin" && (
        <section className="mt-4">
          <OrgSettings />
        </section>
      )}

      {["admin", "hr"].includes(currentUser?.role) && (
        <section className="mt-4">
          <HolidaySettings />
        </section>
      )}

      <section className="mt-4">
        <ActiveSessions />
      </section>
    </div>
  );
}

export default NotificationSettingsPage;
