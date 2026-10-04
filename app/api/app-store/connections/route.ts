import type { ActionFunctionArgs } from "react-router";
import { json } from "@/lib/api-server";
import { requireSession } from "@/lib/auth-helpers";
import { createConnection } from "@/lib/services/app-store";
import { appStoreErrorResponse } from "@/lib/app-store-http";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const auth = await requireSession(request);
  if (!auth) return json({ error: "Unauthorized" }, { status: 401 });
  try { return json(await createConnection(auth.user, await request.json()), { status: 201 }); }
  catch (error) { return appStoreErrorResponse(error); }
}
