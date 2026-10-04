import { Outlet, redirect, useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { MockModeBanner } from "@/components/MockModeBanner";
import { requireSession, type AuthUser } from "@/lib/auth-helpers";

export async function loader({ request }: LoaderFunctionArgs): Promise<AuthUser> {
  const authenticated = await requireSession(request);
  if (!authenticated) {
    const url = new URL(request.url);
    const from = `${url.pathname}${url.search}`;
    throw redirect(`/login?from=${encodeURIComponent(from)}`);
  }
  const { id, username, role } = authenticated.user;
  return { id, username, role };
}

export default function DashboardLayout() {
  const user = useLoaderData<typeof loader>();
  return (
    <AuthenticatedLayout user={user}>
      <Outlet context={user} />
      <MockModeBanner />
    </AuthenticatedLayout>
  );
}
