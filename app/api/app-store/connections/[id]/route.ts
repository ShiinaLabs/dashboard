import type { ActionFunctionArgs } from "react-router";
import { json } from "@/lib/api-server";
import { requireSession } from "@/lib/auth-helpers";
import { deleteConnection, updateConnection } from "@/lib/services/app-store";
import { appStoreErrorResponse, appStoreId } from "@/lib/app-store-http";
import { validateConfirmToken } from "@/lib/confirm-helpers";

export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method !== "PUT" && request.method !== "DELETE") return json({ error: "Method not allowed" }, { status: 405 });
  const auth = await requireSession(request);
  if (!auth) return json({ error: "Unauthorized" }, { status: 401 });
  try {
    const id = appStoreId(params.id);
    if (request.method === "PUT") return json(await updateConnection(id, auth.user, await request.json()));
    const body: unknown = await request.json();
    const token = body && typeof body === "object" && "confirmToken" in body ? body.confirmToken : null;
    if (typeof token !== "string" || !validateConfirmToken(token, { userId: auth.user.id, target: id, action: "delete_app_store_connection" })) {
      return json({ error: "Invalid or expired confirmation token" }, { status: 400 });
    }
    await deleteConnection(id, auth.user);
    return json({ success: true });
  } catch (error) { return appStoreErrorResponse(error); }
}
