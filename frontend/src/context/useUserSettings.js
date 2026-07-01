import { createContext, useContext } from "react";

export const DEFAULT_SETTINGS = {
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

export const UserSettingsContext = createContext({
  settings: DEFAULT_SETTINGS,
  updateSettings: async () => {},
  settingsLoaded: false,
});

export const useUserSettings = () => useContext(UserSettingsContext);
