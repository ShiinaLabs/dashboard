import {
  applyDashboardCssVariables,
  dashboardThemeIds,
  isDashboardThemeId,
  resolveColorScheme,
} from "./mantine-theme";

export interface Theme {
  id: string;
  name: string;
}

export interface ThemeSettings {
  mode: "system" | "light" | "dark";
  lightTheme: string;
  darkTheme: string;
}

const themeNames = {
  "default-light": "Default Light",
  "default-dark": "Default Dark",
  "sepia-light": "Sepia Light",
  "sepia-dark": "Sepia Dark",
  "cyber-light": "Cyber Light",
  "cyber-dark": "Cyber Dark",
  "forest-light": "Forest Light",
  "forest-dark": "Forest Dark",
  "sky-light": "Sky Light",
  "sky-dark": "Sky Dark",
  "rose-light": "Rose Light",
  "rose-dark": "Rose Dark",
} as const;

export const themes: Theme[] = dashboardThemeIds.map((id) => ({
  id,
  name: themeNames[id],
}));

export const DEFAULT_SETTINGS: ThemeSettings = {
  mode: "system",
  lightTheme: "default-light",
  darkTheme: "default-dark",
};

const STORAGE_KEY = "theme-settings";
const isBrowser = typeof window !== "undefined";

export function loadSettings(): ThemeSettings {
  if (!isBrowser) {
    return { ...DEFAULT_SETTINGS };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch { /* intentionally empty, return defaults */ }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(settings: ThemeSettings) {
  if (!isBrowser) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function resolveTheme(settings: ThemeSettings, systemColorScheme?: "light" | "dark"): string {
  if (settings.mode === "light") {
    return isDashboardThemeId(settings.lightTheme) ? settings.lightTheme : DEFAULT_SETTINGS.lightTheme;
  }
  if (settings.mode === "dark") {
    return isDashboardThemeId(settings.darkTheme) ? settings.darkTheme : DEFAULT_SETTINGS.darkTheme;
  }
  if (!isBrowser && !systemColorScheme) return settings.lightTheme;
  const prefersDark =
    systemColorScheme !== undefined
      ? systemColorScheme === "dark"
      : window.matchMedia("(prefers-color-scheme: dark)").matches;
  const themeId = prefersDark ? settings.darkTheme : settings.lightTheme;
  const fallbackThemeId = prefersDark ? DEFAULT_SETTINGS.darkTheme : DEFAULT_SETTINGS.lightTheme;
  return isDashboardThemeId(themeId) ? themeId : fallbackThemeId;
}

export function applyTheme(themeId: string) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const resolvedThemeId = applyDashboardCssVariables(root, themeId);
  root.setAttribute("data-theme", resolvedThemeId);
  root.setAttribute("data-mantine-color-scheme", resolveColorScheme(resolvedThemeId));
  root.classList.toggle("dark", resolveColorScheme(resolvedThemeId) === "dark");
}
