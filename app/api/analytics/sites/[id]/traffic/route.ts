import type { LoaderFunctionArgs } from "react-router";
import { json } from "@/lib/api-server";
import { requireSession } from "@/lib/auth-helpers";
import { AnalyticsSiteError, getAnalyticsTrafficForSite } from "@/lib/services/analytics";

export async function loader({ request, params }: LoaderFunctionArgs) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  const auth = await requireSession(request);
  if (!auth) return json({ error: "Unauthorized" }, { status: 401 });
  const siteId = Number(params.id);
  if (!Number.isSafeInteger(siteId) || siteId < 1) return json({ error: "Not found" }, { status: 404 });

  const timezone = new URL(request.url).searchParams.get("timezone") ?? "UTC";
  try {
    return json(await getAnalyticsTrafficForSite(siteId, { id: auth.user.id, role: auth.user.role }, timezone));
  } catch (error) {
    if (error instanceof AnalyticsSiteError) {
      if (error.code === "not_found") return json({ error: "Not found" }, { status: 404 });
      if (error.code === "forbidden") return json({ error: "Forbidden" }, { status: 403 });
      if (error.code === "invalid_input") return json({ error: "Invalid timezone" }, { status: 400 });
    }
    return json({ error: "Analytics traffic unavailable" }, { status: 503 });
  }
}
