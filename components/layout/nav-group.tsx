import type { ComponentType, SVGProps } from "react";
import { Link, useLocation } from "react-router";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

export interface NavEntry {
  to: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;
}

export function NavGroup({ label, items }: { label: string; items: NavEntry[] }) {
  const { pathname } = useLocation();
  const { isMobile, setOpenMobile } = useSidebar();
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map(({ to, label: itemLabel, icon: Icon }) => {
            const active = to === "/" ? pathname === "/" || pathname === "/overview" : pathname.startsWith(to);
            return (
              <SidebarMenuItem key={to}>
                <SidebarMenuButton asChild isActive={active} tooltip={itemLabel}>
                  <Link to={to} onClick={() => isMobile && setOpenMobile(false)} aria-current={active ? "page" : undefined}>
                    <Icon aria-hidden="true" />
                    <span>{itemLabel}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
