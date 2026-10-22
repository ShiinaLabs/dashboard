import { useCallback, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AuthUser } from "@/lib/auth-helpers";
import { useIsMobile } from "@/lib/client/useIsMobile";
import { FloatingAiChat } from "@/components/FloatingAiChat";
import { NavigationProgress } from "@/components/NavigationProgress";
import { NavigatingOverlay } from "@/components/NavigatingOverlay";
import { Header } from "./header";
import { Main } from "./main";
import {
  MobileWorkspaceNav,
  WorkspaceNavProvider,
  WorkspacePanel,
  WorkspaceRail,
} from "./workspace-nav";

export function AuthenticatedLayout({
  children,
  user,
  initialPanelOpen,
}: {
  children: React.ReactNode;
  user: AuthUser;
  initialPanelOpen: boolean;
}) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [loggingOut, setLoggingOut] = useState(false);

  const navUser = { username: user.username, role: user.role, isAdmin: user.role === "admin" };

  const handleLogout = useCallback(async () => {
    setLoggingOut(true);
    try {
      await api.logout();
    } catch {
      // Local logout must still end the session view.
    } finally {
      await queryClient.cancelQueries();
      queryClient.clear();
      queryClient.setQueryData(["auth", "me"], { authenticated: false });
      setLoggingOut(false);
      navigate("/login");
    }
  }, [navigate, queryClient]);

  return (
    <WorkspaceNavProvider initialPanelOpen={initialPanelOpen}>
      <NavigationProgress />
      <NavigatingOverlay />
      <div className="flex min-h-svh flex-col">
        <Header />
        <div className="flex min-h-[calc(100svh-3.5rem)] flex-1">
          <WorkspaceRail user={navUser} onLogout={handleLogout} loggingOut={loggingOut} />
          <WorkspacePanel />
          <div className="min-w-0 flex-1 overflow-x-clip">
            <Main>{children}</Main>
          </div>
        </div>
      </div>
      <MobileWorkspaceNav user={navUser} onLogout={handleLogout} loggingOut={loggingOut} />
      {!isMobile && pathname !== "/ai" && <FloatingAiChat pathname={pathname} />}
    </WorkspaceNavProvider>
  );
}
