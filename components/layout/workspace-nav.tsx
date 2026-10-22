import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  Bot,
  ChartNoAxesColumnIncreasing,
  CircleDollarSign,
  Code2,
  Globe2,
  LayoutDashboard,
  LogOut,
  MessagesSquare,
  PanelLeft,
  Settings,
  Shield,
  Smartphone,
  UserRound,
  Users,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { getAnalyticsSites } from "@/lib/client/analytics-graphql";
import { getAccountsList } from "@/lib/client/graphql/accounts";
import { NAV_DOMAINS, resolveWorkspace, type DomainId, type NavDomain, type NavSurface } from "@/lib/navigation/domains";
import { serializeNavPanelPreference } from "@/lib/navigation/panel-preference";
import type { LucideIcon } from "lucide-react";

interface NavUser {
  username: string;
  role: string;
  isAdmin: boolean;
}

interface WorkspaceNavValue {
  panelOpen: boolean;
  togglePanel(): void;
  closePanel(): void;
  mobileOpen: boolean;
  setMobileOpen(open: boolean): void;
}

const WorkspaceNavContext = createContext<WorkspaceNavValue | null>(null);

export function useWorkspaceNav(): WorkspaceNavValue {
  const value = useContext(WorkspaceNavContext);
  if (!value) throw new Error("useWorkspaceNav must be used within WorkspaceNavProvider");
  return value;
}

export function WorkspaceNavProvider({ initialPanelOpen, children }: { initialPanelOpen: boolean; children: ReactNode }) {
  // Seeded by the dashboard loader. The server and the first client render
  // agree, so the shell never jumps after hydration.
  const [panelOpen, setPanelOpen] = useState(initialPanelOpen);
  const [mobileOpen, setMobileOpen] = useState(false);

  const setPanel = useCallback((next: boolean) => {
    setPanelOpen(next);
    if (typeof document !== "undefined") document.cookie = serializeNavPanelPreference(next);
  }, []);

  const togglePanel = useCallback(() => setPanel(!panelOpen), [panelOpen, setPanel]);
  const closePanel = useCallback(() => setPanel(false), [setPanel]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
        event.preventDefault();
        togglePanel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [togglePanel]);

  return (
    <WorkspaceNavContext.Provider value={{ panelOpen, togglePanel, closePanel, mobileOpen, setMobileOpen }}>
      {children}
    </WorkspaceNavContext.Provider>
  );
}

const DOMAIN_ICONS: Record<DomainId, LucideIcon> = {
  overview: LayoutDashboard,
  social: MessagesSquare,
  developer: Code2,
  business: ChartNoAxesColumnIncreasing,
  ai: Bot,
  connections: Users,
  utility: Settings,
};

const PRIMARY_DOMAINS = NAV_DOMAINS.filter((domain) => domain.placement === "primary");
const CONNECTIONS_DOMAIN = NAV_DOMAINS.find((domain) => domain.id === "connections");

function RailItem({ domain, active, onNavigate }: { domain: NavDomain; active: boolean; onNavigate?: () => void }) {
  const { t } = useTranslation();
  const Icon = DOMAIN_ICONS[domain.id];
  return (
    <Link
      to={domain.to}
      onClick={onNavigate}
      title={t(domain.labelKey)}
      aria-label={t(domain.labelKey)}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex size-11 items-center justify-center rounded-xl text-muted-foreground transition-colors",
        "hover:bg-sidebar-accent hover:text-sidebar-foreground",
        "focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-hidden",
        active && "bg-sidebar-accent text-sidebar-foreground",
      )}
    >
      <Icon size={20} aria-hidden="true" />
      {active && <span aria-hidden="true" className="absolute inset-y-2.5 -start-2 w-0.5 rounded-full bg-primary" />}
    </Link>
  );
}

function UserMenu({ user, onLogout, loggingOut }: { user: NavUser; onLogout: () => void; loggingOut: boolean }) {
  const { t } = useTranslation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={user.username}
          title={`${user.username} · ${user.role}`}
          className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-hidden"
        >
          <UserRound size={15} aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="end" className="w-48">
        <DropdownMenuLabel className="truncate">{user.username} · {user.role}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/settings"><Settings aria-hidden="true" />{t("nav.settings")}</Link>
        </DropdownMenuItem>
        {user.isAdmin && (
          <DropdownMenuItem asChild>
            <Link to="/admin"><Shield aria-hidden="true" />{t("nav.admin")}</Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onLogout} disabled={loggingOut}>
          <LogOut aria-hidden="true" />{t("nav.logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function WorkspaceRail({
  user,
  onLogout,
  loggingOut = false,
  onNavigate,
  mobile = false,
}: {
  user: NavUser;
  onLogout: () => void;
  loggingOut?: boolean;
  onNavigate?: () => void;
  mobile?: boolean;
}) {
  const { pathname } = useLocation();
  const resolved = resolveWorkspace(pathname);
  return (
    <nav
      aria-label="Primary"
      className={cn(
        "w-16 shrink-0 flex-col items-center gap-1 border-e border-sidebar-border bg-sidebar py-2",
        mobile
          ? "flex h-full"
          : "sticky top-14 hidden h-[calc(100svh-3.5rem)] self-start md:flex",
      )}
    >
      {PRIMARY_DOMAINS.map((domain) => (
        <RailItem
          key={domain.id}
          domain={domain}
          active={resolved?.domain.id === domain.id}
          onNavigate={onNavigate}
        />
      ))}
      <div className="mt-auto flex flex-col items-center gap-2 pb-1">
        {CONNECTIONS_DOMAIN && (
          <RailItem
            domain={CONNECTIONS_DOMAIN}
            active={resolved?.domain.id === CONNECTIONS_DOMAIN.id}
            onNavigate={onNavigate}
          />
        )}
        <UserMenu user={user} onLogout={onLogout} loggingOut={loggingOut} />
      </div>
    </nav>
  );
}

const rowClass = (active: boolean) =>
  cn(
    "flex h-10 items-center gap-2 rounded-md px-2 text-sm text-muted-foreground transition-colors",
    "hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
    active && "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
  );

function PanelShell({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      {title ? (
        <div className="px-4 pb-2 pt-4">
          <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{title}</h2>
        </div>
      ) : (
        <div className="h-3 shrink-0" />
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">{children}</div>
    </div>
  );
}

function PanelSkeleton() {
  return (
    <div className="space-y-1.5 px-1 py-2" aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <div key={index} className="h-9 animate-pulse rounded-md bg-sidebar-accent/60" />
      ))}
    </div>
  );
}

function SurfaceSwitcher({ domain, active }: { domain: NavDomain; active: NavSurface }) {
  const { t } = useTranslation();
  if (domain.surfaces.length < 2) return null;
  return (
    <div className="mb-2 flex flex-col gap-0.5 border-b border-sidebar-border pb-2">
      {domain.surfaces.map((surface) => (
        <Link
          key={surface.id}
          to={surface.to}
          aria-current={surface.id === active.id ? "page" : undefined}
          className={cn(
            "flex h-8 items-center rounded-md px-2 text-xs text-muted-foreground transition-colors",
            "hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
            surface.id === active.id && "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
          )}
        >
          {t(surface.labelKey)}
        </Link>
      ))}
    </div>
  );
}

function AccountsPanel({ domain, surface }: { domain: NavDomain; surface: NavSurface }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const platform = surface.platform ?? "twitter";
  const queryPlatform = platform.toUpperCase() as "TWITTER" | "GITHUB" | "GITLAB" | "REDDIT";
  const { data, isPending } = useQuery({
    queryKey: ["accounts", "list", platform],
    queryFn: ({ signal }) => getAccountsList(queryPlatform, signal),
    staleTime: 60_000,
  });
  const base = platform === "twitter" ? "/x" : `/${platform}`;
  return (
    <PanelShell>
      <SurfaceSwitcher domain={domain} active={surface} />
      <p className="px-2 pb-1 pt-2 text-[11px] text-muted-foreground">{t("navPanel.accounts")}</p>
      {isPending ? (
        <PanelSkeleton />
      ) : data && data.length > 0 ? (
        <ul className="space-y-0.5">
          {data.map((account) => {
            const href = `${base}/${account.id}`;
            const active = pathname === href;
            return (
              <li key={account.id}>
                <Link to={href} aria-current={active ? "page" : undefined} className={rowClass(active)}>
                  <span className="truncate">{platform === "twitter" ? `@${account.screen_name}` : account.screen_name}</span>
                  <span
                    aria-hidden="true"
                    className={cn("ms-auto size-1.5 shrink-0 rounded-full", account.is_active ? "bg-emerald-500" : "bg-muted-foreground/40")}
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="px-2 py-3 text-xs text-muted-foreground">{t("navPanel.noAccounts")}</p>
      )}
      <Link to="/accounts" className="mt-3 flex h-8 items-center rounded-md px-2 text-xs text-primary hover:bg-sidebar-accent/70">
        {t("navPanel.manage")}
      </Link>
    </PanelShell>
  );
}

function BusinessPanel({ domain, surface }: { domain: NavDomain; surface: NavSurface }) {
  const { t } = useTranslation();
  const { search } = useLocation();
  const activeSite = new URLSearchParams(search).get("site");
  const { data, isPending } = useQuery({
    queryKey: ["analytics", "sites"],
    queryFn: ({ signal }) => getAnalyticsSites(signal),
    staleTime: 60_000,
  });
  return (
    <PanelShell>
      <SurfaceSwitcher domain={domain} active={surface} />
      {surface.id === "analytics" ? (
        <>
          <p className="px-2 pb-1 pt-2 text-[11px] text-muted-foreground">{t("navPanel.sites")}</p>
          <Link to="/analytics" aria-current={!activeSite ? "page" : undefined} className={rowClass(!activeSite)}>
            <Globe2 size={15} aria-hidden="true" />
            <span className="truncate">{t("navPanel.allSites")}</span>
          </Link>
          {isPending ? (
            <PanelSkeleton />
          ) : data && data.length > 0 ? (
            data.map((site) => {
              const active = activeSite === String(site.id);
              return (
                <Link
                  key={site.id}
                  to={`/analytics?site=${site.id}`}
                  aria-current={active ? "page" : undefined}
                  className={rowClass(active)}
                >
                  <Globe2 size={15} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{site.name}</span>
                  <span className="max-w-[45%] truncate text-[10px] text-muted-foreground">{site.host}</span>
                </Link>
              );
            })
          ) : (
            <p className="px-2 py-3 text-xs text-muted-foreground">{t("navPanel.noSites")}</p>
          )}
          <Link to="/analytics" className="mt-3 flex h-8 items-center rounded-md px-2 text-xs text-primary hover:bg-sidebar-accent/70">
            {t("navPanel.manage")}
          </Link>
        </>
      ) : (
        <Link to={surface.to} className={rowClass(true)}>
          {surface.id === "app-store" ? <Smartphone size={15} aria-hidden="true" /> : <CircleDollarSign size={15} aria-hidden="true" />}
          <span className="truncate">{t(surface.labelKey)}</span>
        </Link>
      )}
    </PanelShell>
  );
}

function OverviewPanel() {
  const { t } = useTranslation();
  const targets = NAV_DOMAINS.filter((domain) => ["social", "developer", "business", "ai"].includes(domain.id));
  return (
    <PanelShell>
      <p className="px-2 pb-1 pt-2 text-[11px] text-muted-foreground">{t("navPanel.jumpTo")}</p>
      {targets.map((domain) => {
        const Icon = DOMAIN_ICONS[domain.id];
        return (
          <Link key={domain.id} to={domain.to} className={rowClass(false)}>
            <Icon size={15} aria-hidden="true" />
            <span className="truncate">{t(domain.labelKey)}</span>
          </Link>
        );
      })}
    </PanelShell>
  );
}

function ConnectionsPanel() {
  const { t } = useTranslation();
  const platforms = [
    { key: "twitter", labelKey: "nav.x", Icon: MessagesSquare },
    { key: "github", labelKey: "nav.github", Icon: Code2 },
    { key: "gitlab", labelKey: "nav.gitlab", Icon: Code2 },
    { key: "reddit", labelKey: "nav.reddit", Icon: MessagesSquare },
    { key: "app-store", labelKey: "nav.appStoreAnalytics", Icon: Smartphone },
  ] as const;
  return (
    <PanelShell>
      <p className="px-2 pb-1 pt-2 text-[11px] text-muted-foreground">{t("navPanel.services")}</p>
      {platforms.map(({ key, labelKey, Icon }) => (
        <Link key={key} to={`/accounts?tab=${key}`} className={rowClass(false)}>
          <Icon size={15} aria-hidden="true" />
          <span className="truncate">{t(labelKey)}</span>
        </Link>
      ))}
    </PanelShell>
  );
}

function AiPanel() {
  const { t } = useTranslation();
  return (
    <PanelShell>
      <Link to="/ai" className={rowClass(true)}>
        <Bot size={15} aria-hidden="true" />
        <span className="truncate">{t("nav.ai")}</span>
      </Link>
    </PanelShell>
  );
}

function UtilityPanel() {
  const { t } = useTranslation();
  return (
    <PanelShell>
      <Link to="/settings" className={rowClass(false)}>
        <Settings size={15} aria-hidden="true" />
        <span>{t("nav.settings")}</span>
      </Link>
      <Link to="/admin" className={rowClass(false)}>
        <Shield size={15} aria-hidden="true" />
        <span>{t("nav.admin")}</span>
      </Link>
    </PanelShell>
  );
}

function PanelContent({ domain, surface }: { domain: NavDomain; surface: NavSurface }) {
  switch (domain.id) {
    case "social":
    case "developer":
      return <AccountsPanel domain={domain} surface={surface} />;
    case "business":
      return <BusinessPanel domain={domain} surface={surface} />;
    case "overview":
      return <OverviewPanel />;
    case "connections":
      return <ConnectionsPanel />;
    case "ai":
      return <AiPanel />;
    default:
      return <UtilityPanel />;
  }
}

export function WorkspacePanel() {
  const { panelOpen } = useWorkspaceNav();
  const { pathname } = useLocation();
  const resolved = resolveWorkspace(pathname);
  return (
    <aside
      id="workspace-panel"
      aria-label="Navigation panel"
      className={cn(
        "sticky top-14 hidden h-[calc(100svh-3.5rem)] shrink-0 flex-col self-start overflow-hidden border-e border-sidebar-border bg-sidebar transition-[width] duration-200 md:flex",
        panelOpen ? "w-[248px]" : "w-0 border-e-0",
      )}
    >
      {panelOpen && resolved ? (
        <div className="flex h-full w-[248px] flex-col">
          <PanelContent domain={resolved.domain} surface={resolved.surface} />
        </div>
      ) : null}
    </aside>
  );
}

export function MobileWorkspaceNav({
  user,
  onLogout,
  loggingOut = false,
}: {
  user: NavUser;
  onLogout: () => void;
  loggingOut?: boolean;
}) {
  const { t } = useTranslation();
  const { mobileOpen, setMobileOpen } = useWorkspaceNav();
  const { pathname } = useLocation();
  const resolved = resolveWorkspace(pathname);

  // Close the sheet after a navigation.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname, setMobileOpen]);

  return (
    <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
      <SheetContent side="left" className="w-[320px] max-w-[86vw] p-0">
        <SheetHeader className="sr-only">
          <SheetTitle>{t("navPanel.openNav")}</SheetTitle>
          <SheetDescription>{t("navPanel.openNav")}</SheetDescription>
        </SheetHeader>
        <div className="flex h-full min-h-0">
          <WorkspaceRail
            user={user}
            onLogout={onLogout}
            loggingOut={loggingOut}
            onNavigate={() => setMobileOpen(false)}
            mobile
          />
          <div className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-sidebar">
            {resolved ? <PanelContent domain={resolved.domain} surface={resolved.surface} /> : null}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function PanelToggleIcon() {
  return <PanelLeft aria-hidden="true" className="size-4" />;
}
