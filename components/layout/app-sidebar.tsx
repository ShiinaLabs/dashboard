import { Bot, ChartNoAxesColumnIncreasing, Code2, Ellipsis, LayoutDashboard, LogOut, MessagesSquare, Settings, Shield, UserRound, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarSeparator,
  SidebarMenuButton,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AppTitle } from "./app-title";
import { NavGroup, type NavEntry } from "./nav-group";
import { GithubIcon, XIcon, GitlabIcon, RedditIcon } from "@/components/BrandIcons";

export function AppSidebar({ isAdmin, username, role, loggingOut, onLogout }: { isAdmin: boolean; username: string; role: string; loggingOut: boolean; onLogout: () => void }) {
  const { t } = useTranslation();
  const { isMobile, setOpenMobile } = useSidebar();
  const mainItems: NavEntry[] = [
    { type: "link", to: "/overview", label: t("nav.overview"), icon: LayoutDashboard },
    {
      type: "group",
      label: t("nav.social"),
      icon: MessagesSquare,
      children: [
        { type: "link", to: "/x", label: t("nav.x"), icon: XIcon },
        { type: "link", to: "/reddit", label: t("nav.reddit"), icon: RedditIcon },
      ],
    },
    {
      type: "group",
      label: t("nav.developer"),
      icon: Code2,
      children: [
        { type: "link", to: "/github", label: t("nav.github"), icon: GithubIcon },
        { type: "link", to: "/gitlab", label: t("nav.gitlab"), icon: GitlabIcon },
      ],
    },
    { type: "link", to: "/analytics", label: t("nav.analytics"), icon: ChartNoAxesColumnIncreasing },
    { type: "link", to: "/ai", label: t("nav.ai"), icon: Bot },
  ];
  const connectionItems: NavEntry[] = [
    { type: "link", to: "/accounts", label: t("nav.connections"), icon: Users },
  ];
  const userTooltip = [username || "—", role].filter(Boolean).join(" · ");

  return (
    <Sidebar collapsible="icon" variant="inset" className="border-sidebar-border">
      <SidebarHeader className="px-4 py-4">
        <AppTitle />
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent className="gap-2 px-2 py-3">
        <NavGroup items={mainItems} />
        <SidebarSeparator />
        <NavGroup items={connectionItems} />
      </SidebarContent>
      <SidebarFooter className="border-t p-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton className="h-auto min-h-11 justify-start" tooltip={userTooltip}>
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                <UserRound size={15} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                <span className="block truncate text-sm font-medium">{username || "—"}</span>
                <span className="block truncate text-xs capitalize text-muted-foreground">{role}</span>
              </span>
              <Ellipsis className="ms-auto group-data-[collapsible=icon]:hidden" aria-hidden="true" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-56">
            <DropdownMenuItem asChild>
              <Link to="/settings" onClick={() => isMobile && setOpenMobile(false)}>
                <Settings aria-hidden="true" />
                {t("nav.settings")}
              </Link>
            </DropdownMenuItem>
            {isAdmin && (
              <DropdownMenuItem asChild>
                <Link to="/admin" onClick={() => isMobile && setOpenMobile(false)}>
                  <Shield aria-hidden="true" />
                  {t("nav.admin")}
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" disabled={loggingOut} onSelect={onLogout}>
              <LogOut aria-hidden="true" />
              {loggingOut ? "…" : t("nav.logout")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
