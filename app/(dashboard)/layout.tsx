import { Outlet } from "react-router";
import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { MockModeBanner } from "@/components/MockModeBanner";

export default function DashboardLayout() {
  return (
    <AuthenticatedLayout>
      <Outlet />
      <MockModeBanner />
    </AuthenticatedLayout>
  );
}
