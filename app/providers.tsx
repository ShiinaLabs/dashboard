import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Toaster } from "@/components/ui/sonner";
import i18n from "@/lib/client/i18n";
import { applyTheme, DEFAULT_SETTINGS, loadSettings, resolveTheme, saveSettings } from "@/lib/client/themes";
import type { ThemeSettings } from "@/lib/client/themes";

function matchSystemDark() {
  return window.matchMedia("(prefers-color-scheme: dark)");
}

function getSystemColorScheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return matchSystemDark().matches ? "dark" : "light";
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, staleTime: 3 * 60_000 },
        },
      })
  );
  const [settings, setSettingsState] = useState<ThemeSettings>(DEFAULT_SETTINGS);
  const [systemColorScheme, setSystemColorScheme] = useState<"light" | "dark">("light");

  const setSettings = useCallback((nextSettings: ThemeSettings) => {
    setSettingsState(nextSettings);
    saveSettings(nextSettings);
  }, []);

  const themeId = useMemo(() => resolveTheme(settings, systemColorScheme), [settings, systemColorScheme]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setSettingsState(loadSettings());
      setSystemColorScheme(getSystemColorScheme());
    });
    let savedLanguage: string | null = null;
    try { savedLanguage = localStorage.getItem("i18n-lang"); } catch { /* Browser storage can be disabled. */ }
    const browserLanguage = navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
    const language = savedLanguage === "zh" || savedLanguage === "en" ? savedLanguage : browserLanguage;
    if (language !== i18n.language) void i18n.changeLanguage(language);
    return () => cancelAnimationFrame(frame);
  }, []);
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

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={{ settings, setSettings }}>
        <Toaster position="top-right" />
        {children}
      </ThemeProvider>
    </QueryClientProvider>
  );
}
