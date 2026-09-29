import { json } from "@/lib/api-server";
import type { LoaderFunctionArgs } from "react-router";
import { requireSession } from "@/lib/auth-helpers";
import { AnalyticsSiteError, getAnalyticsInstallationForSite } from "@/lib/services/analytics";

export async function loader({ request, params }: LoaderFunctionArgs) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  const auth = await requireSession(request);
  if (!auth) return json({ error: "Unauthorized" }, { status: 401 });
  const siteId = Number(params.id);
  if (!Number.isSafeInteger(siteId) || siteId < 1) return json({ error: "Not found" }, { status: 404 });
  try {
    return json(await getAnalyticsInstallationForSite(siteId, { id: auth.user.id, role: auth.user.role }));
  } catch (error) {
    if (error instanceof AnalyticsSiteError && error.code === "not_found") return json({ error: "Not found" }, { status: 404 });
    if (error instanceof AnalyticsSiteError && error.code === "forbidden") return json({ error: "Forbidden" }, { status: 403 });
    if (error instanceof AnalyticsSiteError && error.code === "public_origin_not_configured") {
      return json({ error: "Analytics public URL is not configured", code: error.code }, { status: 503 });
    }
    return json({ error: "Analytics installation is unavailable" }, { status: 503 });
  }
}
