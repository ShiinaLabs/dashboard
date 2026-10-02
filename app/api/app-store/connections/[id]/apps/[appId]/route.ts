import type { ActionFunctionArgs } from "react-router";
import { json } from "@/lib/api-server";
import { requireSession } from "@/lib/auth-helpers";
import { setAppEnabled } from "@/lib/services/app-store";
import { appStoreErrorResponse, appStoreId } from "@/lib/app-store-http";

export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method !== "PUT") return json({ error: "Method not allowed" }, { status: 405 });
  const auth = await requireSession(request);
  if (!auth) return json({ error: "Unauthorized" }, { status: 401 });
  try { return json(await setAppEnabled(appStoreId(params.id), appStoreId(params.appId), auth.user, await request.json())); }
  catch (error) { return appStoreErrorResponse(error); }
}
