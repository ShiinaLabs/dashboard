import { DEFAULT_THEME, mergeMantineTheme } from "@mantine/core";
import { describe, expect, it } from "vitest";
import { themes } from "@/lib/client/themes";
import {
  createDashboardMantineTheme,
  dashboardCssVariablesResolver,
  dashboardThemeTokens,
  resolveColorScheme,
} from "@/lib/client/mantine-theme";

function resolveThemeVariables(themeId: string) {
  const theme = mergeMantineTheme(DEFAULT_THEME, createDashboardMantineTheme(themeId));
  return dashboardCssVariablesResolver(theme);
}

describe("dashboard Mantine theme bridge", () => {
  it("maps every dashboard theme to Mantine tokens", () => {
    expect(Object.keys(dashboardThemeTokens)).toHaveLength(12);

    for (const theme of themes) {
      const resolved = createDashboardMantineTheme(theme.id);

      expect(dashboardThemeTokens[theme.id]).toBeDefined();
      expect(resolved.primaryColor).toBe("primary");
      expect(resolved.colors?.primary).toHaveLength(10);
    }
  });

  it("keeps dark state aligned with the dashboard theme", () => {
    for (const theme of themes) {
      expect(resolveColorScheme(theme.id)).toBe(theme.id.endsWith("-dark") ? "dark" : "light");
    }
  });

  it("puts Mantine semantic colors in the active scheme bucket", () => {
    const light = resolveThemeVariables("default-light");
    const dark = resolveThemeVariables("sky-dark");

    expect(light.light).toMatchObject({
      "--mantine-color-body": "#ffffff",
      "--mantine-color-text": "#0f172a",
      "--mantine-color-default": "#ffffff",
      "--mantine-color-default-hover": "#f1f5f9",
      "--mantine-color-default-border": "#e2e8f0",
      "--mantine-color-placeholder": "#64748b",
    });
    expect(light.variables["--mantine-color-body"]).toBeUndefined();

    expect(dark.dark).toMatchObject({
      "--mantine-color-body": "#0c1a2b",
      "--mantine-color-text": "#d0e8f8",
      "--mantine-color-default": "#152a40",
      "--mantine-color-default-hover": "#152a40",
      "--mantine-color-default-border": "#1e3a55",
      "--mantine-color-placeholder": "#6a9abc",
    });
    expect(dark.variables["--mantine-color-body"]).toBeUndefined();
  });
});
