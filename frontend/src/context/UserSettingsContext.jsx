import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getSettings, patchSettings } from "../api/settingsApi";

const DEFAULT_SETTINGS = {
  notifications: {
    call_new_today:       true,
    call_unassigned_soon: true,
    call_als_on_bls:      true,
    unit_stuck_status:    true,
    unit_understaffed:    true,
    cert_expiring:        true,
    employee_added:       false,
    doc_expiring:         true,
    cert_no_scan:         false,
  },
  dispatch: {
    pickup_late_after: 0,
    stuck_after:       30,
  },
  ui: {
    time_format: "24h",
    panels: {
      dispatch: {
        leftWidth:    280,
        bottomHeight: 300,
      },
    },
  },
};

const UserSettingsContext = createContext({
  settings: DEFAULT_SETTINGS,
  updateSettings: async () => {},
  settingsLoaded: false,
});

export function UserSettingsProvider({ currentUser, children }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  useEffect(() => {
    if (!currentUser?.id) {
      setSettings(DEFAULT_SETTINGS);
      setSettingsLoaded(true);
      return;
    }
    setSettingsLoaded(false);
    getSettings(currentUser.id)
      .then((data) => { setSettings(data); setSettingsLoaded(true); })
      .catch(() => setSettingsLoaded(true));
  }, [currentUser?.id]);

  /**
   * Deep-merges patch into current settings, saves to backend, updates state.
   * Returns the new merged settings.
   */
  const updateSettings = useCallback(
    async (patch) => {
      if (!currentUser?.id) return settings;
      const merged = await patchSettings(currentUser.id, patch);
      setSettings(merged);
      return merged;
    },
    [currentUser?.id, settings],
  );

  return (
    <UserSettingsContext.Provider value={{ settings, updateSettings, settingsLoaded }}>
      {children}
    </UserSettingsContext.Provider>
  );
}

export const useUserSettings = () => useContext(UserSettingsContext);
