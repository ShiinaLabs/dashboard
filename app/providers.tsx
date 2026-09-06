import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ThemeProvider } from "@/components/ThemeProvider";
import {
  createDashboardMantineTheme,
  dashboardCssVariablesResolver,
  resolveColorScheme,
} from "@/lib/client/mantine-theme";
import { applyTheme, loadSettings, resolveTheme, saveSettings } from "@/lib/client/themes";
import type { ThemeSettings } from "@/lib/client/themes";
import "@/lib/client/i18n";

function matchSystemDark() {
  return window.matchMedia("(prefers-color-scheme: dark)");
}

function getSystemColorScheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return matchSystemDark().matches ? "dark" : "light";
}

export function Providers({ children }: { children: React.ReactNode }) {
  // Hydration guard: render the client shell only after the browser takes
  // over, so i18n language detection never causes an SSR/client mismatch.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, staleTime: 3 * 60_000 },
        },
      })
  );
  const [settings, setSettingsState] = useState<ThemeSettings>(loadSettings);
  const [systemColorScheme, setSystemColorScheme] = useState(getSystemColorScheme);

  const setSettings = useCallback((nextSettings: ThemeSettings) => {
    setSettingsState(nextSettings);
    saveSettings(nextSettings);
  }, []);

  const themeId = useMemo(() => resolveTheme(settings, systemColorScheme), [settings, systemColorScheme]);
  const mantineTheme = useMemo(() => createDashboardMantineTheme(themeId), [themeId]);
  const colorScheme = resolveColorScheme(themeId);

  useEffect(() => {
    if (settings.mode !== "system") return;

    const mediaQuery = matchSystemDark();
    const handler = () => setSystemColorScheme(mediaQuery.matches ? "dark" : "light");

    handler();
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, [settings.mode]);

  useEffect(() => {
    applyTheme(themeId);
  }, [themeId]);

  if (!mounted) {
    return <div className="min-h-dvh bg-[var(--background)]" aria-label="Loading" />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <MantineProvider
        theme={mantineTheme}
        cssVariablesResolver={dashboardCssVariablesResolver}
        forceColorScheme={colorScheme}
      >
        <Notifications position="top-right" zIndex={1000} />
        <ThemeProvider value={{ settings, setSettings }}>
          {children}
        </ThemeProvider>
      </MantineProvider>
    </QueryClientProvider>
  );
}
