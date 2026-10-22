import { Outlet, redirect, useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { MockModeBanner } from "@/components/MockModeBanner";
import { requireSession, type AuthUser } from "@/lib/auth-helpers";
import { parseNavPanelPreference } from "@/lib/navigation/panel-preference";

export interface DashboardLoaderData {
  user: AuthUser;
  initialPanelOpen: boolean;
}

export async function loader({ request }: LoaderFunctionArgs): Promise<DashboardLoaderData> {
  const authenticated = await requireSession(request);
  if (!authenticated) {
    const url = new URL(request.url);
    const from = `${url.pathname}${url.search}`;
    throw redirect(`/login?from=${encodeURIComponent(from)}`);
  }
  const { id, username, role } = authenticated.user;
  return {
    user: { id, username, role },
    initialPanelOpen: parseNavPanelPreference(request.headers.get("cookie")),
  };
}

export default function DashboardLayout() {
  const { user, initialPanelOpen } = useLoaderData<typeof loader>();
  return (
    <AuthenticatedLayout user={user} initialPanelOpen={initialPanelOpen}>
      <Outlet context={user} />
      <MockModeBanner />
    </AuthenticatedLayout>
  );
}
