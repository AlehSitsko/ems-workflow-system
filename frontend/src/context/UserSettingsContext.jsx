import { useCallback, useEffect, useState } from "react";
import { getSettings, patchSettings } from "../api/settingsApi";
import { UserSettingsContext, DEFAULT_SETTINGS } from "./useUserSettings";

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
    getSettings()
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
      const merged = await patchSettings(patch);
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
