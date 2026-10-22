import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { useFreshness } from "@/lib/client/freshness";
import { useNow } from "@/lib/client/use-now";
import { PanelToggleIcon, useWorkspaceNav } from "./workspace-nav";

export function Header() {
  const { t } = useTranslation();
  const { panelOpen, togglePanel, setMobileOpen } = useWorkspaceNav();
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
    <header data-shell-header className="sticky top-0 z-20 flex h-14 w-full shrink-0 items-center gap-3 bg-background px-4 shadow-[inset_0_-1px_0_var(--border)] md:px-6">
      <Link
        to="/overview"
        aria-label={t("common.dashboard")}
        className="flex h-full shrink-0 items-center gap-2.5 pe-1"
      >
        <img src="/favicon.png" alt="" width={28} height={28} className="size-7 rounded-md object-contain" />
        <span className="hidden text-sm font-semibold tracking-tight sm:inline">{t("common.dashboard")}</span>
      </Link>

      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label={t("navPanel.openNav")}
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:hidden"
      >
        <PanelToggleIcon />
      </button>

      <button
        type="button"
        onClick={togglePanel}
        aria-expanded={panelOpen}
        aria-controls="workspace-panel"
        aria-label={panelOpen ? t("navPanel.closeNav") : t("navPanel.openNav")}
        className="hidden size-8 shrink-0 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:inline-flex"
      >
        <PanelToggleIcon />
      </button>

      <span
        role="status"
        aria-label={t("freshness.statusLabel", { state: freshnessLabel })}
        title={t("freshness.title", { checked: serverChecked, refreshed: dataRefreshed })}
        className="ml-auto shrink-0 text-xs text-muted-foreground"
      >
        {freshnessLabel}
      </span>
    </header>
  );
}
