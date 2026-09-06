import { useState, useCallback, useRef } from "react";
import { useLocation, useNavigate } from "react-router";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { LayoutDashboard, PanelLeftClose, Settings, LogOut, Shield, Users, Menu, Bot } from "lucide-react";
import { XIcon, GithubIcon, GitlabIcon, RedditIcon } from "./BrandIcons";
import { NavigationProgress } from "./NavigationProgress";
import { NavigatingOverlay } from "./NavigatingOverlay";
import { FloatingAiChat } from "./FloatingAiChat";
import { api } from "@/lib/api";
import { useBingWallpaper } from "@/lib/client/useBingWallpaper";
import { useIsMobile } from "@/lib/client/useIsMobile";
import { ActionIcon, Button, Drawer } from "@/components/ui";

const SIDEBAR_KEY = "sidebar-state";
const SIDEBAR_WIDTH = 240;
const TITLEBAR_H = 48;

function loadVisible(): boolean {
  if (typeof window === "undefined") return true;
  try { return JSON.parse(localStorage.getItem(SIDEBAR_KEY) ?? "true"); } catch { return true; }
}

function saveVisible(v: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SIDEBAR_KEY, JSON.stringify(v));
}

function NavItem({ to, label, icon: Icon, isActive, onClick, onMouseEnter }: {
  to: string;
  label: string;
  icon: React.ComponentType<{ size: number }>;
  isActive: boolean;
  onClick?: () => void;
  onMouseEnter?: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onFocus={onMouseEnter}
      aria-current={isActive ? "page" : undefined}
      className={`relative flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 ${
        isActive
          ? "bg-[var(--primary)]/8 text-[var(--foreground)] font-semibold shadow-sm"
          : "text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]"
      }`}
    >
      {isActive && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-[var(--primary)]" />}
      <Icon size={18} />
      <span className="truncate">{label}</span>
    </Link>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const queryClient = useQueryClient();
  const { url } = useBingWallpaper();
  const [isOpen, setIsOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia("(max-width: 767px)").matches ? false : loadVisible();
  });
  const [loggingOut, setLoggingOut] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);

  // Keep the sidebar state in sync when crossing the mobile breakpoint
  const handleBreakpointChange = useCallback((mobile: boolean) => {
    if (mobile) {
      setIsOpen(false);
      saveVisible(false);
    } else {
      setIsOpen(loadVisible());
    }
  }, []);
  const isMobile = useIsMobile(handleBreakpointChange);

  const { data: authData } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => api.checkAuth(),
    staleTime: 2 * 60_000,
  });

  const isAdmin = authData?.role === "admin";

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await api.logout();
      queryClient.setQueryData(["auth", "me"], { authenticated: false });
      navigate("/login");
    } catch {
      queryClient.setQueryData(["auth", "me"], { authenticated: false });
      navigate("/login");
    } finally {
      setLoggingOut(false);
    }
  };

  const toggle = useCallback(() => {
    setIsOpen((prev) => {
      saveVisible(!prev);
      return !prev;
    });
  }, []);

  const closeMobile = useCallback(() => {
    if (isMobile) {
      setIsOpen(false);
      saveVisible(false);
    }
  }, [isMobile]);

  const isActive = (path: string) => {
    if (path === "/") return pathname === "/";
    return pathname.startsWith(path);
  };

  const NAV_ITEMS = [
    { to: "/", label: t("nav.overview"), icon: LayoutDashboard },
    { to: "/x", label: t("nav.x"), icon: XIcon },
    { to: "/github", label: t("nav.github"), icon: GithubIcon },
    { to: "/gitlab", label: t("nav.gitlab"), icon: GitlabIcon },
    { to: "/reddit", label: t("nav.reddit"), icon: RedditIcon },
    { to: "/ai", label: t("nav.ai"), icon: Bot },
  ] as const;

  const sidebarContent = (onNavClick?: () => void) => (
    <>
      <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--border)] shrink-0">
        <LayoutDashboard size={20} className="shrink-0" />
        <h1 className="text-lg font-semibold truncate">{t("common.dashboard")}</h1>
      </div>
      <nav className="flex flex-col gap-1 p-3">
        {NAV_ITEMS.map(({ to, label, icon }) => (
          <NavItem
            key={to}
            to={to}
            label={label}
            icon={icon}
            isActive={isActive(to)}
            onClick={onNavClick}
          />
        ))}
      </nav>
      <div className="mt-auto p-3 border-t border-[var(--border)] space-y-3">
        {isAdmin && (
          <NavItem
            to="/admin"
            label={t("nav.admin")}
            icon={Shield}
            isActive={isActive("/admin")}
            onClick={onNavClick}
          />
        )}
        <NavItem
          to="/accounts"
          label={t("nav.accounts")}
          icon={Users}
          isActive={isActive("/accounts")}
          onClick={onNavClick}
        />
        <NavItem
          to="/settings"
          label={t("nav.settings")}
          icon={Settings}
          isActive={isActive("/settings")}
          onClick={onNavClick}
        />
        <Button
          onClick={handleLogout}
          disabled={loggingOut}
          variant="subtle"
          color="danger"
          justify="flex-start"
          fullWidth
          leftSection={<LogOut size={18} />}
        >
          {loggingOut ? "…" : t("nav.logout")}
        </Button>
        <p className="text-xs text-[var(--muted-foreground)] px-3">{t("common.copyright")}</p>
      </div>
    </>
  );

  return (
    <div className="h-dvh flex overflow-hidden bg-[var(--background)]">
      <NavigationProgress />
      <NavigatingOverlay />
      {/* Desktop sidebar */}
      {!isMobile && (
        <aside
          className="h-full border-r border-[var(--border)] bg-[var(--card)] flex flex-col overflow-y-auto relative z-20 shrink-0"
          inert={!isOpen}
          style={{
            width: isOpen ? SIDEBAR_WIDTH : 0,
            transition: "width 0.3s ease",
            overflow: "hidden",
          }}
        >
          <div style={{ width: SIDEBAR_WIDTH }} className="flex flex-col h-full">
            {sidebarContent()}
          </div>
        </aside>
      )}

      {/* Mobile sidebar overlay */}
      {isMobile && (
        <Drawer
          opened={isOpen}
          onClose={() => {
            closeMobile();
            toggleRef.current?.focus();
          }}
          position="left"
          size={SIDEBAR_WIDTH}
          withCloseButton={false}
          title={t("common.dashboard")}
          styles={{
            header: { display: "none" },
            content: {
              background: "var(--card)",
              borderRight: "1px solid var(--border)",
            },
            body: { padding: 0 },
          }}
        >
          <div className="flex h-full flex-col overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
            {sidebarContent(closeMobile)}
          </div>
        </Drawer>
      )}

      {/* Floating AI chat — desktop only, hidden on /ai page */}
      {!isMobile && pathname !== "/ai" && <FloatingAiChat pathname={pathname} />}

      {/* Main content */}
      <main className="flex-1 min-w-0 h-full overflow-hidden flex flex-col relative">
        {/* /api/bing-wallpaper 302-redirects to bing.com; cross-origin img */}
        <img
          src={url}
          alt=""
          className="fixed inset-0 w-full h-full object-cover pointer-events-none"
        />
        <div className="fixed inset-0 bg-[var(--background)]/92" />

        {/* Title bar */}
        <div
          className="relative z-10 shrink-0 flex items-center gap-3 border-b border-[var(--border)] bg-[var(--card)]/80 backdrop-blur-sm pt-[env(safe-area-inset-top)]"
          style={{ minHeight: `calc(${TITLEBAR_H}px + env(safe-area-inset-top))` }}
        >
          <ActionIcon
            ref={toggleRef}
            onClick={toggle}
            aria-expanded={isOpen}
            variant="subtle"
            color="gray"
            size="lg"
            ml="sm"
            title={isOpen ? t("common.collapseSidebar") : t("common.expandSidebar")}
            aria-label={isOpen ? t("common.collapseSidebar") : t("common.expandSidebar")}
          >
            <span
              className="block transition-transform duration-300"
              style={{ transform: isOpen ? "rotate(0deg)" : "rotate(180deg)" }}
            >
              {isMobile ? <Menu size={20} /> : <PanelLeftClose size={20} />}
            </span>
          </ActionIcon>
          <div className="flex items-center gap-2 shrink-0">
            <LayoutDashboard size={18} className="text-[var(--primary)]" />
            <span className="hidden min-[360px]:inline text-sm font-semibold">{t("common.dashboard")}</span>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden relative z-10 pb-[env(safe-area-inset-bottom)]">
          <div
            className="max-w-6xl mx-auto transition-all duration-300"
            style={{
              paddingTop: isMobile ? 16 : 24,
              paddingBottom: isMobile ? 16 : 24,
              paddingLeft: isMobile ? "max(16px, env(safe-area-inset-left))" : 32,
              paddingRight: isMobile ? "max(16px, env(safe-area-inset-right))" : 32,
            }}
          >
            <div key={pathname} className="page-enter">
              {children}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
