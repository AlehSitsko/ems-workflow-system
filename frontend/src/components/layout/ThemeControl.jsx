import { FaMoon, FaSun } from "react-icons/fa";

import { useTheme } from "../../context/useTheme";

/**
 * Theme control in the header.
 *
 * Today this toggles light/dark through the existing ThemeContext. The
 * three-way Light / Dark / System control (with the system preference followed
 * live and the choice stored in user settings) is the themes stage — this is a
 * working control now, not a placeholder for it.
 */
export default function ThemeControl() {
  const { theme, toggleTheme } = useTheme();
  const next = theme === "light" ? "dark" : "light";

  return (
    <button
      type="button"
      className="app-header-icon-button"
      onClick={toggleTheme}
      title={`Switch to ${next} mode`}
      aria-label={`Switch to ${next} mode`}
    >
      {theme === "light" ? <FaMoon /> : <FaSun />}
    </button>
  );
}
