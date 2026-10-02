import type { ActionFunctionArgs } from "react-router";
import { json } from "@/lib/api-server";
import { requireSession } from "@/lib/auth-helpers";
import { appStoreErrorResponse, appStoreId } from "@/lib/app-store-http";
import { syncAppStoreRevenue } from "@/lib/services/app-store-sync";

export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const auth = await requireSession(request);
  if (!auth) return json({ error: "Unauthorized" }, { status: 401 });
  try { return json(await syncAppStoreRevenue(appStoreId(params.id), auth.user, await request.json())); }
  catch (error) { return appStoreErrorResponse(error); }
}
