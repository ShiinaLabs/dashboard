import type { LoaderFunctionArgs } from "react-router";
import { json } from "@/lib/api-server";
import { requireSession } from "@/lib/auth-helpers";
import { appStoreErrorResponse } from "@/lib/app-store-http";
import { getAppStoreAnalyticsDashboard } from "@/lib/services/app-store-analytics-reporting";

export async function loader({ request }: LoaderFunctionArgs) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  const auth = await requireSession(request);
  if (!auth) return json({ error: "Unauthorized" }, { status: 401 });
  try {
    const query = new URL(request.url).searchParams;
    return json(await getAppStoreAnalyticsDashboard(auth.user, { from: query.get("from"), to: query.get("to"), ...(query.has("appId") ? { appId: query.get("appId") } : {}), ...(query.has("territory") ? { territory: query.get("territory") } : {}) }));
  } catch (error) { return appStoreErrorResponse(error); }
}
