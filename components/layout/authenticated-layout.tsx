import { useCallback, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { api } from "@/lib/api";
import { useBingWallpaper } from "@/lib/client/useBingWallpaper";
import { useIsMobile } from "@/lib/client/useIsMobile";
import { FloatingAiChat } from "@/components/FloatingAiChat";
import { NavigationProgress } from "@/components/NavigationProgress";
import { NavigatingOverlay } from "@/components/NavigatingOverlay";
import { AppSidebar } from "./app-sidebar";
import { Header } from "./header";
import { Main } from "./main";

const SIDEBAR_KEY = "sidebar-state";

function loadSidebarOpen() {
  if (typeof window === "undefined") return true;
  try { return JSON.parse(localStorage.getItem(SIDEBAR_KEY) ?? "true") as boolean; } catch { return true; }
}

export function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const queryClient = useQueryClient();
  const { url } = useBingWallpaper();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(loadSidebarOpen);
  const [loggingOut, setLoggingOut] = useState(false);

  const { data: authData } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => api.checkAuth(),
    staleTime: 2 * 60_000,
  });

  const setSidebarOpen = useCallback((next: boolean) => {
    setOpen(next);
    if (typeof window !== "undefined") localStorage.setItem(SIDEBAR_KEY, JSON.stringify(next));
  }, []);

  const handleLogout = async () => {
    setLoggingOut(true);
    try { await api.logout(); } catch { /* Local logout must still end the session view. */ }
    queryClient.setQueryData(["auth", "me"], { authenticated: false });
    setLoggingOut(false);
    navigate("/login");
  };

  return (
    <SidebarProvider open={open} onOpenChange={setSidebarOpen}>
      <NavigationProgress />
      <NavigatingOverlay />
      <AppSidebar isAdmin={authData?.role === "admin"} loggingOut={loggingOut} onLogout={handleLogout} />
      <SidebarInset className="min-h-svh overflow-hidden">
        <img src={url} alt="" className="pointer-events-none fixed inset-0 h-full w-full object-cover" />
        <div className="pointer-events-none fixed inset-0 bg-background/95" />
        <Header />
        <Main>{children}</Main>
      </SidebarInset>
      {!isMobile && pathname !== "/ai" && <FloatingAiChat pathname={pathname} />}
    </SidebarProvider>
  );
}
