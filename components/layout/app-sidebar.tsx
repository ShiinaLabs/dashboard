import { Bot, LayoutDashboard, LogOut, Settings, Shield, Users } from "lucide-react";
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

export function AppSidebar({ isAdmin, loggingOut, onLogout }: { isAdmin: boolean; loggingOut: boolean; onLogout: () => void }) {
  const { t } = useTranslation();
  const mainItems: NavEntry[] = [
    { to: "/overview", label: t("nav.overview"), icon: LayoutDashboard },
    { to: "/x", label: t("nav.x"), icon: XIcon },
    { to: "/github", label: t("nav.github"), icon: GithubIcon },
    { to: "/gitlab", label: t("nav.gitlab"), icon: GitlabIcon },
    { to: "/reddit", label: t("nav.reddit"), icon: RedditIcon },
    { to: "/ai", label: t("nav.ai"), icon: Bot },
  ];
  const managementItems: NavEntry[] = [
    { to: "/accounts", label: t("nav.accounts"), icon: Users },
    ...(isAdmin ? [{ to: "/admin", label: t("nav.admin"), icon: Shield } satisfies NavEntry] : []),
    { to: "/settings", label: t("nav.settings"), icon: Settings },
  ];

  return (
    <Sidebar collapsible="icon" variant="inset" className="border-sidebar-border">
      <SidebarHeader className="px-3 py-3">
        <AppTitle />
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent className="gap-0">
        <NavGroup label={t("nav.main", { defaultValue: "Main" })} items={mainItems} />
        <NavGroup label={t("nav.management", { defaultValue: "Management" })} items={managementItems} />
      </SidebarContent>
      <SidebarFooter className="gap-2 p-2">
        <SidebarMenuButton className="min-h-11" onClick={onLogout} disabled={loggingOut} tooltip={t("nav.logout")}>
          <LogOut aria-hidden="true" />
          <span>{loggingOut ? "…" : t("nav.logout")}</span>
        </SidebarMenuButton>
        <p className="px-2 text-xs text-muted-foreground">{t("common.copyright")}</p>
      </SidebarFooter>
    </Sidebar>
  );
}
