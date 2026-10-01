import { useState, type ComponentType, type SVGProps } from "react";
import { ChevronDown } from "lucide-react";
import { Link, useLocation } from "react-router";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";

type IconType = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

export interface NavLinkEntry {
  type: "link";
  to: string;
  label: string;
  icon: IconType;
}

export interface NavTreeEntry {
  type: "group";
  label: string;
  icon: IconType;
  children: NavLinkEntry[];
}

export type NavEntry = NavLinkEntry | NavTreeEntry;

function matchesPath(pathname: string, to: string) {
  return pathname === to || pathname.startsWith(`${to}/`);
}

function NavLinkItem({ entry, nested = false }: { entry: NavLinkEntry; nested?: boolean }) {
  const { pathname } = useLocation();
  const { isMobile, setOpenMobile } = useSidebar();
  const active = matchesPath(pathname, entry.to);
  const Icon = entry.icon;
  const onNavigate = () => isMobile && setOpenMobile(false);

  if (nested) {
    return (
      <SidebarMenuSubItem>
        <SidebarMenuSubButton asChild isActive={active} aria-current={active ? "page" : undefined}>
          <Link to={entry.to} onClick={onNavigate}>
            <Icon aria-hidden="true" />
            <span>{entry.label}</span>
          </Link>
        </SidebarMenuSubButton>
      </SidebarMenuSubItem>
    );
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} tooltip={entry.label}>
        <Link to={entry.to} onClick={onNavigate} aria-current={active ? "page" : undefined}>
          <Icon aria-hidden="true" />
          <span>{entry.label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function NavTreeItem({ entry }: { entry: NavTreeEntry }) {
  const { pathname } = useLocation();
  const { isMobile, open, setOpen } = useSidebar();
  const childIsActive = entry.children.some((child) => matchesPath(pathname, child.to));
  const [manuallyOpen, setManuallyOpen] = useState(childIsActive);
  const isOpen = childIsActive || manuallyOpen;
  const Icon = entry.icon;

  return (
    <SidebarMenuItem>
      <Collapsible
        open={isOpen}
        onOpenChange={(nextOpen) => {
          if (childIsActive && !nextOpen) return;
          setManuallyOpen(nextOpen);
        }}
        className="group/collapsible"
      >
        <CollapsibleTrigger asChild>
          <SidebarMenuButton
            type="button"
            isActive={childIsActive}
            tooltip={entry.label}
            aria-expanded={isOpen}
            onClick={() => {
              if (!isMobile && !open) setOpen(true);
            }}
          >
            <Icon aria-hidden="true" />
            <span>{entry.label}</span>
            <ChevronDown className="ms-auto transition-transform group-data-[state=open]/collapsible:rotate-180" aria-hidden="true" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {entry.children.map((child) => <NavLinkItem key={child.to} entry={child} nested />)}
          </SidebarMenuSub>
        </CollapsibleContent>
      </Collapsible>
    </SidebarMenuItem>
  );
}

export function NavGroup({ items }: { items: NavEntry[] }) {
  return (
    <SidebarGroup className="p-0">
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((entry) => entry.type === "link"
            ? <NavLinkItem key={entry.to} entry={entry} />
            : <NavTreeItem key={entry.label} entry={entry} />)}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
