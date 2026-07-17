import { useEffect, useRef, useState } from "react";
import { FaMoon, FaSun, FaDesktop, FaCheck } from "react-icons/fa";

import { useTheme } from "../../context/useTheme";

/**
 * Theme control — Light / Dark / System.
 *
 * The trigger shows the theme currently on screen (sun or moon); the menu lets
 * the user pin light or dark, or follow the operating system. When "System" is
 * chosen the app tracks the OS preference live (see ThemeContext).
 */

const OPTIONS = [
  { value: "light", label: "Light", icon: <FaSun /> },
  { value: "dark", label: "Dark", icon: <FaMoon /> },
  { value: "system", label: "System", icon: <FaDesktop /> },
];

export default function ThemeControl() {
  const { theme, resolvedTheme, systemTheme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") { setOpen(false); triggerRef.current?.focus(); }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const choose = (value) => { setTheme(value); setOpen(false); triggerRef.current?.focus(); };

  return (
    <div ref={ref} className="theme-control">
      <button
        type="button"
        ref={triggerRef}
        className="app-header-icon-button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Theme"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {resolvedTheme === "dark" ? <FaMoon /> : <FaSun />}
      </button>

      {open && (
        <div className="theme-menu" role="menu" aria-label="Theme">
          {OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="menuitemradio"
              aria-checked={theme === opt.value}
              className={`theme-menu-item${theme === opt.value ? " active" : ""}`}
              onClick={() => choose(opt.value)}
            >
              <span className="theme-menu-item-icon">{opt.icon}</span>
              <span className="theme-menu-item-label">{opt.label}</span>
              {opt.value === "system" && systemTheme && (
                // What "System" resolves to right now — the live OS preference,
                // shown even while the user is pinned to light or dark.
                <span className="theme-menu-item-hint">{systemTheme}</span>
              )}
              {theme === opt.value && <FaCheck className="theme-menu-item-check" aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
