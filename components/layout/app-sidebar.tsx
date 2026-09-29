import { Bot, ChartNoAxesColumnIncreasing, LayoutDashboard, LogOut, Settings, Shield, Users, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarSeparator,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { AppTitle } from "./app-title";
import { NavGroup, type NavEntry } from "./nav-group";
import { GithubIcon, XIcon, GitlabIcon, RedditIcon } from "@/components/BrandIcons";

export function AppSidebar({ isAdmin, username, role, loggingOut, onLogout }: { isAdmin: boolean; username: string; role: string; loggingOut: boolean; onLogout: () => void }) {
  const { t } = useTranslation();
  const mainItems: NavEntry[] = [
    { to: "/overview", label: t("nav.overview"), icon: LayoutDashboard },
    { to: "/x", label: t("nav.x"), icon: XIcon },
    { to: "/github", label: t("nav.github"), icon: GithubIcon },
    { to: "/gitlab", label: t("nav.gitlab"), icon: GitlabIcon },
    { to: "/reddit", label: t("nav.reddit"), icon: RedditIcon },
    { to: "/analytics", label: t("nav.analytics"), icon: ChartNoAxesColumnIncreasing },
    { to: "/ai", label: t("nav.ai"), icon: Bot },
  ];
  const managementItems: NavEntry[] = [
    { to: "/accounts", label: t("nav.accounts"), icon: Users },
    ...(isAdmin ? [{ to: "/admin", label: t("nav.admin"), icon: Shield } satisfies NavEntry] : []),
    { to: "/settings", label: t("nav.settings"), icon: Settings },
  ];

  return (
    <Sidebar collapsible="icon" variant="inset" className="border-sidebar-border">
      <SidebarHeader className="px-4 py-4">
        <AppTitle />
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent className="gap-2 px-2 py-3">
        <NavGroup label={t("nav.main", { defaultValue: "Main" })} items={mainItems} />
        <NavGroup label={t("nav.management", { defaultValue: "Management" })} items={managementItems} />
      </SidebarContent>
      <SidebarFooter className="gap-3 border-t p-3">
        <div className="flex min-w-0 items-center gap-2.5 px-1">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground"><UserRound size={15} aria-hidden="true" /></span>
          <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-sm font-medium">{username || "—"}</p>
            <p className="truncate text-xs capitalize text-muted-foreground">{role}</p>
          </div>
        </div>
        <SidebarMenuButton className="min-h-10" onClick={onLogout} disabled={loggingOut} tooltip={t("nav.logout")}>
          <LogOut aria-hidden="true" />
          <span>{loggingOut ? "…" : t("nav.logout")}</span>
        </SidebarMenuButton>
      </SidebarFooter>
    </Sidebar>
  );
}
