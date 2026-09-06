import {
  createTheme,
  type CSSVariablesResolver,
  type MantineColorsTuple,
  type MantineThemeOverride,
} from "@mantine/core";

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
  primaryPalette: MantineColorsTuple;
}

const DEFAULT_THEME_ID = "default-light";

const statusPalettes = {
  success: [
    "#f0fdf4",
    "#dcfce7",
    "#bbf7d0",
    "#86efac",
    "#4ade80",
    "#22c55e",
    "#16a34a",
    "#15803d",
    "#166534",
    "#14532d",
  ],
  warn: [
    "#fffbeb",
    "#fef3c7",
    "#fde68a",
    "#fcd34d",
    "#fbbf24",
    "#f59e0b",
    "#d97706",
    "#b45309",
    "#92400e",
    "#78350f",
  ],
  danger: [
    "#fef2f2",
    "#fee2e2",
    "#fecaca",
    "#fca5a5",
    "#f87171",
    "#ef4444",
    "#dc2626",
    "#b91c1c",
    "#991b1b",
    "#7f1d1d",
  ],
} as const satisfies Record<string, MantineColorsTuple>;

export const dashboardThemeTokens = {
  "default-light": {
    background: "#ffffff",
    foreground: "#0f172a",
    muted: "#f1f5f9",
    mutedForeground: "#64748b",
    border: "#e2e8f0",
    primary: "#3b5998",
    primaryForeground: "#ffffff",
    card: "#ffffff",
    cardForeground: "#0f172a",
    ring: "#3b5998",
    success: "#16a34a",
    warn: "#d97706",
    danger: "#dc2626",
    chart: ["#3b5998", "#0891b2", "#7c3aed", "#d97706", "#e11d48"],
    primaryPalette: [
      "#eef3ff",
      "#dbe5fb",
      "#b9ccf0",
      "#94afe3",
      "#7292d5",
      "#5274bd",
      "#3b5998",
      "#304a80",
      "#293f6a",
      "#24365a",
    ],
  },
  "default-dark": {
    background: "#0f172a",
    foreground: "#f8fafc",
    muted: "#1e293b",
    mutedForeground: "#94a3b8",
    border: "#334155",
    primary: "#5b82c8",
    primaryForeground: "#ffffff",
    card: "#1e293b",
    cardForeground: "#f8fafc",
    ring: "#5b82c8",
    success: "#22c55e",
    warn: "#f59e0b",
    danger: "#ef4444",
    chart: ["#5b82c8", "#22d3d8", "#a78bfa", "#f59e0b", "#fb7185"],
    primaryPalette: [
      "#eaf1ff",
      "#d5e2fb",
      "#acc6f0",
      "#82a7e3",
      "#5b82c8",
      "#456db2",
      "#355a98",
      "#2c4a7d",
      "#263f68",
      "#213658",
    ],
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
    primaryPalette: [
      "#fff8db",
      "#ffefad",
      "#ffe47a",
      "#f3cf4a",
      "#ddb725",
      "#ca9f09",
      "#b58900",
      "#947000",
      "#765900",
      "#604800",
    ],
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
    primaryPalette: [
      "#fff7d6",
      "#ffeca3",
      "#ffdd66",
      "#edbd1f",
      "#cb9b00",
      "#a77f00",
      "#866600",
      "#6d5300",
      "#5a4500",
      "#4d3a00",
    ],
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
    primaryPalette: [
      "#eef0ff",
      "#dde1ff",
      "#bbc3fb",
      "#98a1f0",
      "#747ce2",
      "#5f6bd4",
      "#4b5cc4",
      "#3e4aa4",
      "#343f88",
      "#2c3570",
    ],
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
    primaryPalette: [
      "#eef0ff",
      "#dfe2ff",
      "#c2c8ff",
      "#a4adff",
      "#818cf8",
      "#6975e8",
      "#5560cf",
      "#464fad",
      "#3b438f",
      "#313875",
    ],
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
    primaryPalette: [
      "#eff8eb",
      "#ddf0d5",
      "#bce0ad",
      "#98cd82",
      "#74b45b",
      "#5f9f46",
      "#4d8c36",
      "#3d732a",
      "#315c23",
      "#284c1d",
    ],
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
    primaryPalette: [
      "#f0faeb",
      "#ddf1d5",
      "#bde3ad",
      "#9bd382",
      "#6ab04c",
      "#559b3a",
      "#43812d",
      "#366825",
      "#2c551f",
      "#25481b",
    ],
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
    primaryPalette: [
      "#e8f7ff",
      "#ccecff",
      "#9bd8fa",
      "#64c0ef",
      "#2fa8df",
      "#118fcd",
      "#0284c7",
      "#0369a1",
      "#075985",
      "#0c4a6e",
    ],
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
    primaryPalette: [
      "#e6f7ff",
      "#c7ecff",
      "#91d9ff",
      "#64ccff",
      "#38bdf8",
      "#16a7e3",
      "#0284c7",
      "#0369a1",
      "#075985",
      "#0c4a6e",
    ],
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
    primaryPalette: [
      "#fff1f3",
      "#ffe1e7",
      "#ffc6d1",
      "#ff9caf",
      "#fb7185",
      "#f43f5e",
      "#e11d48",
      "#be123c",
      "#9f1239",
      "#881337",
    ],
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
    primaryPalette: [
      "#fff1f3",
      "#ffe1e7",
      "#ffc6d1",
      "#ff9caf",
      "#fb7185",
      "#f43f5e",
      "#e11d48",
      "#be123c",
      "#9f1239",
      "#881337",
    ],
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

export function createDashboardMantineTheme(themeId: string): MantineThemeOverride {
  const resolvedThemeId = resolveDashboardThemeId(themeId);
  const tokens = dashboardThemeTokens[resolvedThemeId];

  return createTheme({
    primaryColor: "primary",
    primaryShade: { light: 6, dark: 4 },
    autoContrast: true,
    luminanceThreshold: 0.34,
    focusRing: "auto",
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
    headings: {
      fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
      fontWeight: "700",
    },
    defaultRadius: "md",
    radius: {
      xs: "0.25rem",
      sm: "0.375rem",
      md: "0.5rem",
      lg: "0.625rem",
      xl: "0.75rem",
    },
    components: {
      Button: { defaultProps: { radius: "md", size: "md" } },
      ActionIcon: { defaultProps: { radius: "md", size: "lg" } },
      TextInput: { defaultProps: { radius: "md", size: "md" } },
      PasswordInput: { defaultProps: { radius: "md", size: "md" } },
      Textarea: { defaultProps: { radius: "md", size: "md" } },
      Select: { defaultProps: { radius: "md", size: "md" } },
      NativeSelect: { defaultProps: { radius: "md", size: "md" } },
      Modal: { defaultProps: { radius: "lg", overlayProps: { backgroundOpacity: 0.45, blur: 2 } } },
      Drawer: { defaultProps: { overlayProps: { backgroundOpacity: 0.45, blur: 2 } } },
    },
    colors: {
      primary: tokens.primaryPalette,
      success: statusPalettes.success,
      warn: statusPalettes.warn,
      danger: statusPalettes.danger,
    },
    other: {
      dashboardThemeId: resolvedThemeId,
      dashboardThemeTokens: tokens,
    },
  });
}

export const dashboardCssVariablesResolver: CSSVariablesResolver = (theme) => {
  const themeId =
    typeof theme.other.dashboardThemeId === "string"
      ? resolveDashboardThemeId(theme.other.dashboardThemeId)
      : DEFAULT_THEME_ID;
  const tokens = dashboardThemeTokens[themeId];
  const mantineSemanticVariables = {
    "--mantine-color-body": tokens.background,
    "--mantine-color-text": tokens.foreground,
    "--mantine-color-default": tokens.card,
    "--mantine-color-default-hover": tokens.muted,
    "--mantine-color-default-border": tokens.border,
    "--mantine-color-placeholder": tokens.mutedForeground,
  };

  return {
    variables: {
      "--background": tokens.background,
      "--foreground": tokens.foreground,
      "--muted": tokens.muted,
      "--muted-foreground": tokens.mutedForeground,
      "--border": tokens.border,
      "--primary": tokens.primary,
      "--primary-foreground": tokens.primaryForeground,
      "--card": tokens.card,
      "--card-foreground": tokens.cardForeground,
      "--ring": tokens.ring,
      "--success": tokens.success,
      "--warn": tokens.warn,
      "--danger": tokens.danger,
      "--chart-1": tokens.chart[0],
      "--chart-2": tokens.chart[1],
      "--chart-3": tokens.chart[2],
      "--chart-4": tokens.chart[3],
      "--chart-5": tokens.chart[4],
    },
    light: resolveColorScheme(themeId) === "light" ? mantineSemanticVariables : {},
    dark: resolveColorScheme(themeId) === "dark" ? mantineSemanticVariables : {},
  };
};

const dashboardCssVariables = [
  ["--background", "background"],
  ["--foreground", "foreground"],
  ["--muted", "muted"],
  ["--muted-foreground", "mutedForeground"],
  ["--border", "border"],
  ["--primary", "primary"],
  ["--primary-foreground", "primaryForeground"],
  ["--card", "card"],
  ["--card-foreground", "cardForeground"],
  ["--ring", "ring"],
  ["--success", "success"],
  ["--warn", "warn"],
  ["--danger", "danger"],
] as const satisfies readonly (readonly [string, keyof DashboardThemeTokens])[];

export function applyDashboardCssVariables(root: HTMLElement, themeId: string): DashboardThemeId {
  const resolvedThemeId = resolveDashboardThemeId(themeId);
  const tokens = dashboardThemeTokens[resolvedThemeId];

  for (const [variableName, tokenName] of dashboardCssVariables) {
    root.style.setProperty(variableName, tokens[tokenName]);
  }

  tokens.chart.forEach((color, index) => {
    root.style.setProperty(`--chart-${index + 1}`, color);
  });

  return resolvedThemeId;
}
