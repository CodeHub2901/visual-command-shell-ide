// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import {
  parseThemePreference,
  resolveTheme,
  THEME_PREFERENCE_STORAGE_KEY,
  type ResolvedTheme,
  type ThemePreference
} from "./theme-preference";

type ThemeContextValue = {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const DARK_MODE_QUERY = "(prefers-color-scheme: dark)";

function storedThemePreference(): ThemePreference {
  try {
    return parseThemePreference(window.localStorage.getItem(THEME_PREFERENCE_STORAGE_KEY));
  } catch {
    return "system";
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>(storedThemePreference);
  const [systemPrefersDark, setSystemPrefersDark] = useState(() =>
    window.matchMedia(DARK_MODE_QUERY).matches
  );
  const resolvedTheme = resolveTheme(preference, systemPrefersDark);

  useEffect(() => {
    const media = window.matchMedia(DARK_MODE_QUERY);
    const updateSystemTheme = (event: MediaQueryListEvent) => setSystemPrefersDark(event.matches);
    setSystemPrefersDark(media.matches);
    media.addEventListener("change", updateSystemTheme);
    return () => media.removeEventListener("change", updateSystemTheme);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolvedTheme;
    root.dataset.themePreference = preference;
    root.style.colorScheme = resolvedTheme;
    try {
      window.localStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, preference);
    } catch {
      // Restricted renderer sessions still retain the in-memory preference.
    }
  }, [preference, resolvedTheme]);

  const value = useMemo<ThemeContextValue>(() => ({
    preference,
    resolvedTheme,
    setPreference
  }), [preference, resolvedTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const theme = useContext(ThemeContext);
  if (theme === null) throw new Error("useTheme must be used inside ThemeProvider");
  return theme;
}
