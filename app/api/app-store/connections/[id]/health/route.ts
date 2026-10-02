import type { LoaderFunctionArgs } from "react-router";
import { json } from "@/lib/api-server";
import { requireSession } from "@/lib/auth-helpers";
import { appStoreErrorResponse, appStoreId } from "@/lib/app-store-http";
import { getAppStoreHealth } from "@/lib/services/app-store-health";

export async function loader({ request, params }: LoaderFunctionArgs) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  const auth = await requireSession(request);
  if (!auth) return json({ error: "Unauthorized" }, { status: 401 });
  try { return json(await getAppStoreHealth(appStoreId(params.id), auth.user)); }
  catch (error) { return appStoreErrorResponse(error); }
}
