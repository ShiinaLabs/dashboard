import { PanelLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { useFreshness } from "@/lib/client/freshness";
import { useNow } from "@/lib/client/use-now";

function routeContext(pathname: string, t: (key: string) => string) {
  const path = pathname.split("/").filter(Boolean);
  const section = path[0] ?? "overview";
  const labels: Record<string, string> = {
    overview: t("nav.overview"),
    x: t("nav.x"),
    github: t("nav.github"),
    gitlab: t("nav.gitlab"),
    reddit: t("nav.reddit"),
    analytics: t("nav.analytics"),
    revenue: t("nav.revenue"),
    "app-store": t("nav.appStoreAnalytics"),
    ai: t("nav.ai"),
    accounts: t("nav.connections"),
    settings: t("nav.settings"),
    admin: t("nav.admin"),
  };
  return labels[section] ?? t("common.dashboard");
}

export function Header() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { isMobile, open, openMobile } = useSidebar();
  const isOpen = isMobile ? openMobile : open;
  const context = routeContext(pathname, t);
  const freshness = useFreshness();
  const now = useNow();
  const freshnessLabel = freshness.serverState === "offline" ? "Offline"
    : freshness.serverState === "unreachable" ? "Server unavailable"
      : freshness.serverState === "checking" ? "Checking server…"
        : freshness.refreshState === "refreshing" ? "Refreshing…"
          : freshness.refreshState === "failed" ? "Refresh failed"
            : freshness.lastSuccessfulRefreshAt === null ? "Updated —"
              : now - freshness.lastSuccessfulRefreshAt > 10 * 60_000 ? `Stale · ${Math.floor((now - freshness.lastSuccessfulRefreshAt) / 60_000)}m`
                : `Updated ${new Date(freshness.lastSuccessfulRefreshAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-background/95 px-4 pt-[env(safe-area-inset-top)] backdrop-blur supports-[backdrop-filter]:bg-background/80 md:px-6">
      <SidebarTrigger variant="outline" className="size-9" aria-expanded={isOpen} aria-label={isOpen ? t("common.collapseSidebar") : t("common.expandSidebar")}>
        <PanelLeft aria-hidden="true" />
      </SidebarTrigger>
      <Separator orientation="vertical" className="h-6" />
      <nav aria-label={t("common.dashboard")} className="flex min-w-0 items-center gap-2 text-sm">
        <Link to="/overview" className="hidden text-muted-foreground transition-colors hover:text-foreground sm:inline">{t("common.dashboard")}</Link>
        <span aria-hidden="true" className="hidden text-muted-foreground sm:inline">/</span>
        <span className="truncate font-medium text-foreground">{context}</span>
      </nav>
      <span role="status" aria-label={`Dashboard server freshness: ${freshnessLabel}`} className="ml-auto shrink-0 text-xs text-muted-foreground">{freshnessLabel}</span>
    </header>
  );
}
