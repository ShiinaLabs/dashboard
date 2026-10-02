import type { ActionFunctionArgs } from "react-router";
import { json } from "@/lib/api-server";
import { requireSession } from "@/lib/auth-helpers";
import { appStoreErrorResponse, appStoreId } from "@/lib/app-store-http";
import { backfillAppStoreAnalytics, backfillAppStoreRevenue } from "@/lib/services/app-store-sync";

export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const auth = await requireSession(request);
  if (!auth) return json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || !("kind" in body) || (body.kind !== "analytics" && body.kind !== "revenue")) return json({ error: "Select Analytics or Revenue backfill" }, { status: 400 });
    const result = body.kind === "analytics"
      ? await backfillAppStoreAnalytics(appStoreId(params.id), auth.user)
      : await backfillAppStoreRevenue(appStoreId(params.id), auth.user, body);
    return json(result);
  } catch (error) { return appStoreErrorResponse(error); }
}
