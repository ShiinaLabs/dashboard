import { PanelLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { AppTitle } from "./app-title";

export function Header() {
  const { t } = useTranslation();
  const { isMobile, open, openMobile } = useSidebar();
  const isOpen = isMobile ? openMobile : open;
  return (
    <header className="sticky top-0 z-20 flex min-h-12 items-center gap-3 border-b bg-background/95 px-3 pt-[env(safe-area-inset-top)] backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-4">
      <SidebarTrigger className="size-9" aria-expanded={isOpen} aria-label={isOpen ? t("common.collapseSidebar") : t("common.expandSidebar")}>
        <PanelLeft aria-hidden="true" />
      </SidebarTrigger>
      <div className="md:hidden"><AppTitle /></div>
      <div className="hidden text-sm font-medium text-muted-foreground md:block">{t("common.dashboard")}</div>
      <div className="ml-auto" />
    </header>
  );
}
