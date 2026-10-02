import type { LoaderFunctionArgs } from "react-router";
import { json } from "@/lib/api-server";
import { requireSession } from "@/lib/auth-helpers";
import { appStoreErrorResponse } from "@/lib/app-store-http";
import { getAppStoreRevenueDashboard } from "@/lib/services/app-store-revenue";

export async function loader({ request }: LoaderFunctionArgs) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  const auth = await requireSession(request);
  if (!auth) return json({ error: "Unauthorized" }, { status: 401 });
  try { return json(await getAppStoreRevenueDashboard(auth.user, Object.fromEntries(new URL(request.url).searchParams))); }
  catch (error) { return appStoreErrorResponse(error); }
}
