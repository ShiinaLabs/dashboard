export interface DashboardThemeTokens {
  background: string;
  foreground: string;
  muted: string;
  mutedForeground: string;
  border: string;
  primary: string;
  primaryForeground: string;
  card: string;
  cardForeground: string;
  ring: string;
  success: string;
  warn: string;
  danger: string;
}

type ChartPalette = readonly [string, string, string, string, string];

interface DashboardThemeDefinition extends DashboardThemeTokens {
  chart: ChartPalette;
}

const DEFAULT_THEME_ID = "default-light";

export const dashboardThemeTokens = {
  "default-light": {
    background: "#ffffff",
    foreground: "#171717",
    muted: "#f5f5f5",
    mutedForeground: "#737373",
    border: "#e5e5e5",
    primary: "#171717",
    primaryForeground: "#fafafa",
    card: "#ffffff",
    cardForeground: "#171717",
    ring: "#a3a3a3",
    success: "#16a34a",
    warn: "#d97706",
    danger: "#dc2626",
    chart: ["#3b5998", "#0891b2", "#7c3aed", "#d97706", "#e11d48"],
  },
  "default-dark": {
    background: "#171717",
    foreground: "#fafafa",
    muted: "#262626",
    mutedForeground: "#a3a3a3",
    border: "#343434",
    primary: "#f5f5f5",
    primaryForeground: "#171717",
    card: "#1f1f1f",
    cardForeground: "#fafafa",
    ring: "#737373",
    success: "#22c55e",
    warn: "#f59e0b",
    danger: "#ef4444",
    chart: ["#5b82c8", "#22d3d8", "#a78bfa", "#f59e0b", "#fb7185"],
  },
  "sepia-light": {
    background: "#fdf6e3",
    foreground: "#5c4b2e",
    muted: "#eee8d5",
    mutedForeground: "#8b7355",
    border: "#d6c8a8",
    primary: "#b58900",
    primaryForeground: "#ffffff",
    card: "#fdf6e3",
    cardForeground: "#5c4b2e",
    ring: "#b58900",
    success: "#4d8c36",
    warn: "#b45309",
    danger: "#b91c1c",
    chart: ["#b58900", "#cb7310", "#8b4518", "#6b8e23", "#c04040"],
  },
  "sepia-dark": {
    background: "#2d2416",
    foreground: "#e8d5b7",
    muted: "#3d3428",
    mutedForeground: "#a09080",
    border: "#4a3f30",
    primary: "#cb9b00",
    primaryForeground: "#1a1008",
    card: "#3d3428",
    cardForeground: "#e8d5b7",
    ring: "#cb9b00",
    success: "#6ab04c",
    warn: "#f0a040",
    danger: "#f07070",
    chart: ["#cb9b00", "#e0a030", "#c08050", "#8cb04c", "#e07060"],
  },
  "cyber-light": {
    background: "#f0f4ff",
    foreground: "#0a0f2e",
    muted: "#e4eaff",
    mutedForeground: "#5a6a9e",
    border: "#c8d6f5",
    primary: "#4b5cc4",
    primaryForeground: "#ffffff",
    card: "#ffffff",
    cardForeground: "#0a0f2e",
    ring: "#4b5cc4",
    success: "#16a34a",
    warn: "#d97706",
    danger: "#dc2626",
    chart: ["#4b5cc4", "#0ea5b9", "#8b5cf6", "#f59e0b", "#ec4899"],
  },
  "cyber-dark": {
    background: "#0a0f1e",
    foreground: "#e0e8ff",
    muted: "#151d3a",
    mutedForeground: "#7888b8",
    border: "#1e2d5a",
    primary: "#818cf8",
    primaryForeground: "#0a0f1e",
    card: "#151d3a",
    cardForeground: "#e0e8ff",
    ring: "#818cf8",
    success: "#4ade80",
    warn: "#fbbf24",
    danger: "#f87171",
    chart: ["#818cf8", "#38bdf8", "#a78bfa", "#fbbf24", "#f472b6"],
  },
  "forest-light": {
    background: "#f6faf3",
    foreground: "#1a2e12",
    muted: "#e8f2e2",
    mutedForeground: "#5a7a4a",
    border: "#c8dcc0",
    primary: "#4d8c36",
    primaryForeground: "#ffffff",
    card: "#ffffff",
    cardForeground: "#1a2e12",
    ring: "#4d8c36",
    success: "#4d8c36",
    warn: "#b45309",
    danger: "#b91c1c",
    chart: ["#4d8c36", "#0891b2", "#6d28d9", "#d97706", "#db2777"],
  },
  "forest-dark": {
    background: "#121e0e",
    foreground: "#dcecd0",
    muted: "#1d3016",
    mutedForeground: "#7a9a6a",
    border: "#2a4520",
    primary: "#6ab04c",
    primaryForeground: "#121e0e",
    card: "#1d3016",
    cardForeground: "#dcecd0",
    ring: "#6ab04c",
    success: "#6ab04c",
    warn: "#f59e0b",
    danger: "#f87171",
    chart: ["#6ab04c", "#22d3d8", "#a78bfa", "#fbbf24", "#f472b6"],
  },
  "sky-light": {
    background: "#f0f9ff",
    foreground: "#0c2d48",
    muted: "#e0f0fe",
    mutedForeground: "#4a7a9e",
    border: "#b8daf0",
    primary: "#0284c7",
    primaryForeground: "#ffffff",
    card: "#ffffff",
    cardForeground: "#0c2d48",
    ring: "#0284c7",
    success: "#16a34a",
    warn: "#d97706",
    danger: "#dc2626",
    chart: ["#0284c7", "#0d9488", "#6d28d9", "#d97706", "#e11d48"],
  },
  "sky-dark": {
    background: "#0c1a2b",
    foreground: "#d0e8f8",
    muted: "#152a40",
    mutedForeground: "#6a9abc",
    border: "#1e3a55",
    primary: "#38bdf8",
    primaryForeground: "#0c1a2b",
    card: "#152a40",
    cardForeground: "#d0e8f8",
    ring: "#38bdf8",
    success: "#4ade80",
    warn: "#fbbf24",
    danger: "#f87171",
    chart: ["#38bdf8", "#2dd4bf", "#a78bfa", "#fbbf24", "#fb7185"],
  },
  "rose-light": {
    background: "#fff5f6",
    foreground: "#3d1218",
    muted: "#ffe4e8",
    mutedForeground: "#9e5a66",
    border: "#f0c4cc",
    primary: "#e11d48",
    primaryForeground: "#ffffff",
    card: "#ffffff",
    cardForeground: "#3d1218",
    ring: "#e11d48",
    success: "#16a34a",
    warn: "#d97706",
    danger: "#e11d48",
    chart: ["#e11d48", "#d9468f", "#7c3aed", "#f59e0b", "#0891b2"],
  },
  "rose-dark": {
    background: "#1f0e12",
    foreground: "#f8d8de",
    muted: "#301a20",
    mutedForeground: "#b87a86",
    border: "#45252e",
    primary: "#fb7185",
    primaryForeground: "#1f0e12",
    card: "#301a20",
    cardForeground: "#f8d8de",
    ring: "#fb7185",
    success: "#4ade80",
    warn: "#fbbf24",
    danger: "#fb7185",
    chart: ["#fb7185", "#f472b6", "#a78bfa", "#fbbf24", "#38bdf8"],
  },
} as const satisfies Record<string, DashboardThemeDefinition>;

export type DashboardThemeId = keyof typeof dashboardThemeTokens;

export const dashboardThemeIds = Object.keys(dashboardThemeTokens) as DashboardThemeId[];

export function isDashboardThemeId(themeId: string): themeId is DashboardThemeId {
  return Object.hasOwn(dashboardThemeTokens, themeId);
}

export function resolveDashboardThemeId(themeId: string): DashboardThemeId {
  return isDashboardThemeId(themeId) ? themeId : DEFAULT_THEME_ID;
}

export function resolveColorScheme(themeId: string): "light" | "dark" {
  return resolveDashboardThemeId(themeId).endsWith("-dark") ? "dark" : "light";
}

export function applyDashboardThemeTokens(root: HTMLElement, themeId: string): DashboardThemeId {
  const resolvedThemeId = resolveDashboardThemeId(themeId);
  const tokens = dashboardThemeTokens[resolvedThemeId];
  const variables: Record<string, string> = {
    "--background": tokens.background,
    "--foreground": tokens.foreground,
    "--card": tokens.card,
    "--card-foreground": tokens.cardForeground,
    "--popover": tokens.card,
    "--popover-foreground": tokens.cardForeground,
    "--primary": tokens.primary,
    "--primary-foreground": tokens.primaryForeground,
    "--secondary": tokens.muted,
    "--secondary-foreground": tokens.foreground,
    "--muted": tokens.muted,
    "--muted-foreground": tokens.mutedForeground,
    "--accent": tokens.muted,
    "--accent-foreground": tokens.foreground,
    "--destructive": tokens.danger,
    "--border": tokens.border,
    "--input": tokens.border,
    "--ring": tokens.ring,
    "--success": tokens.success,
    "--warn": tokens.warn,
    "--danger": tokens.danger,
    "--sidebar": tokens.background,
    "--sidebar-foreground": tokens.foreground,
    "--sidebar-primary": tokens.primary,
    "--sidebar-primary-foreground": tokens.primaryForeground,
    "--sidebar-accent": tokens.muted,
    "--sidebar-accent-foreground": tokens.foreground,
    "--sidebar-border": tokens.border,
    "--sidebar-ring": tokens.ring,
  };
  Object.entries(variables).forEach(([name, value]) => root.style.setProperty(name, value));
  tokens.chart.forEach((color, index) => root.style.setProperty(`--chart-${index + 1}`, color));

  return resolvedThemeId;
}
