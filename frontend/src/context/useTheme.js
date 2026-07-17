import { createContext, useContext } from "react";

export const ThemeContext = createContext({
  theme: "system",
  resolvedTheme: "light",
  systemTheme: "light",
  setTheme: () => {},
  toggleTheme: () => {},
});

export const useTheme = () => useContext(ThemeContext);
