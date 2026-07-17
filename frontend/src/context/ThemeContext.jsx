import { useCallback, useEffect, useState } from "react";
import { ThemeContext } from "./useTheme";

const STORAGE_KEY = "ems-theme";
const PREFERENCES = ["light", "dark", "system"];
const MEDIA = "(prefers-color-scheme: dark)";

function systemTheme() {
  return typeof window !== "undefined" && window.matchMedia?.(MEDIA).matches ? "dark" : "light";
}

function readPreference() {
  const stored = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
  // An old install stored a plain "light"/"dark"; both are still valid
  // preferences. Anything else (including nothing) defaults to following the OS.
  return PREFERENCES.includes(stored) ? stored : "system";
}

function resolve(preference) {
  return preference === "system" ? systemTheme() : preference;
}

/**
 * Theme provider — three preferences (light / dark / system), one resolved
 * theme actually applied to the document.
 *
 * `theme` is what the user chose; `resolvedTheme` is what is on screen. When the
 * choice is "system", the OS preference is followed live, so changing the system
 * theme flips the app without a reload. The resolved theme is also applied
 * before first paint by an inline script in index.html to avoid a flash.
 */
export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readPreference);
  const [systemPref, setSystemPref] = useState(systemTheme);
  const [resolvedTheme, setResolvedTheme] = useState(() => resolve(readPreference()));

  const apply = useCallback((resolved) => {
    setResolvedTheme(resolved);
    document.documentElement.setAttribute("data-bs-theme", resolved);
  }, []);

  // Track the OS preference at all times, so the control can show what "System"
  // would resolve to even while the user is pinned to light or dark.
  useEffect(() => {
    const mq = window.matchMedia(MEDIA);
    const onChange = (e) => setSystemPref(e.matches ? "dark" : "light");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Apply the resolved theme and persist the preference. Following "system"
  // falls out for free: systemPref is a dependency, so an OS change re-applies.
  useEffect(() => {
    apply(theme === "system" ? systemPref : theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme, systemPref, apply]);

  const setTheme = useCallback((preference) => {
    if (PREFERENCES.includes(preference)) setThemeState(preference);
  }, []);

  // Back-compat for any caller that just wants to flip: toggle the *resolved*
  // theme into an explicit opposite choice.
  const toggleTheme = useCallback(() => {
    setThemeState(resolvedTheme === "dark" ? "light" : "dark");
  }, [resolvedTheme]);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, systemTheme: systemPref, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
