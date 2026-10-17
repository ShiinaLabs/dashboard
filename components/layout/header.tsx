import { PanelLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { AppTitle } from "./app-title";
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
  const serverChecked = freshness.lastServerCheckAt === null ? "—" : new Date(freshness.lastServerCheckAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const dataRefreshed = freshness.lastSuccessfulDataRefreshAt === null ? "—" : new Date(freshness.lastSuccessfulDataRefreshAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const freshnessLabel = freshness.serverState === "offline" ? t("freshness.offline")
    : freshness.serverState === "unreachable" ? t("freshness.serverUnavailable")
      : freshness.serverState === "checking" ? t("freshness.checking")
        : freshness.refreshState === "refreshing" ? t("freshness.refreshing")
          : freshness.refreshState === "failed" ? t("freshness.refreshFailed")
            : freshness.lastSuccessfulDataRefreshAt === null ? t("freshness.updatedUnknown")
              : now - freshness.lastSuccessfulDataRefreshAt > 10 * 60_000 ? t("freshness.stale", { minutes: Math.floor((now - freshness.lastSuccessfulDataRefreshAt) / 60_000) })
                : t("freshness.updated", { time: dataRefreshed });
  return (
    <header data-shell-header className="sticky top-0 z-20 flex h-16 w-full shrink-0 items-center gap-3 bg-background px-4 shadow-[inset_0_-1px_0_var(--border)] md:px-6">
      <div
        className="flex h-full shrink-0 items-center"
        style={{ width: isMobile ? undefined : `calc(var(${open ? "--sidebar-width" : "--sidebar-width-icon"}) + 1rem)` }}
      >
        <AppTitle compact={isMobile || !open} />
      </div>
      <SidebarTrigger variant="outline" className="size-8 shrink-0" aria-expanded={isOpen} aria-label={isOpen ? t("common.collapseSidebar") : t("common.expandSidebar")}>
        <PanelLeft aria-hidden="true" />
      </SidebarTrigger>
      <Separator orientation="vertical" className="h-6 shrink-0" />
      <nav aria-label={t("common.dashboard")} className="flex min-w-0 items-center gap-2 text-sm">
        <Link to="/overview" className="hidden text-muted-foreground transition-colors hover:text-foreground sm:inline">{t("common.dashboard")}</Link>
        <span aria-hidden="true" className="hidden text-muted-foreground sm:inline">/</span>
        <span className="truncate font-medium text-foreground">{context}</span>
      </nav>
      <span role="status" aria-label={t("freshness.statusLabel", { state: freshnessLabel })} title={t("freshness.title", { checked: serverChecked, refreshed: dataRefreshed })} className="ml-auto shrink-0 text-xs text-muted-foreground">{freshnessLabel}</span>
    </header>
  );
}
