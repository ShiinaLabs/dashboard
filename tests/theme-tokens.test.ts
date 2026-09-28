import { afterEach, describe, expect, it, vi } from "vitest";
import { applyTheme, DEFAULT_SETTINGS, resolveTheme, themes } from "@/lib/client/themes";
import { dashboardThemeTokens } from "@/lib/client/theme-tokens";

describe("dashboard theme tokens", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("provides the shadcn token contract for every saved theme id", () => {
    expect(themes).toHaveLength(12);
    for (const theme of themes) {
      const tokens = dashboardThemeTokens[theme.id as keyof typeof dashboardThemeTokens];
      expect(tokens.background).toBeTruthy();
      expect(tokens.foreground).toBeTruthy();
      expect(tokens.card).toBeTruthy();
      expect(tokens.primary).toBeTruthy();
      expect(tokens.chart).toHaveLength(5);
    }
  });

  it("preserves existing settings ids and applies light and dark theme changes", () => {
    expect(DEFAULT_SETTINGS).toEqual({ mode: "system", lightTheme: "default-light", darkTheme: "default-dark" });
    expect(resolveTheme({ mode: "light", lightTheme: "rose-light", darkTheme: "default-dark" })).toBe("rose-light");
    expect(resolveTheme({ mode: "dark", lightTheme: "default-light", darkTheme: "forest-dark" })).toBe("forest-dark");

    const values: Record<string, string> = {};
    const attributes: Record<string, string> = {};
    const classes = new Set<string>();
    const root = {
      style: { setProperty: (name: string, value: string) => { values[name] = value; } },
      classList: { toggle: (name: string, enabled: boolean) => enabled ? classes.add(name) : classes.delete(name) },
      setAttribute: (name: string, value: string) => { attributes[name] = value; },
    };
    vi.stubGlobal("document", { documentElement: root });

    applyTheme("default-light");
    expect(attributes["data-theme"]).toBe("default-light");
    expect(classes.has("dark")).toBe(false);
    expect(values["--popover"]).toBe(dashboardThemeTokens["default-light"].card);
    expect(values["--sidebar-border"]).toBe(dashboardThemeTokens["default-light"].border);

    applyTheme("forest-dark");
    expect(attributes["data-theme"]).toBe("forest-dark");
    expect(classes.has("dark")).toBe(true);
    expect(values["--chart-5"]).toBe(dashboardThemeTokens["forest-dark"].chart[4]);
  });
});
