import { json } from "@/lib/api-server";
import type { ActionFunctionArgs } from "react-router";
import { requireSession } from "@/lib/auth-helpers";
import { AnalyticsSiteError, renameAnalyticsSite } from "@/lib/services/analytics";

export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method !== "PUT") return json({ error: "Method not allowed" }, { status: 405 });
  const auth = await requireSession(request);
  if (!auth) return json({ error: "Unauthorized" }, { status: 401 });
  const id = Number(params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return json({ error: "Invalid site id" }, { status: 400 });
  try {
    const body = await request.json() as { name?: unknown } | null;
    const name = body && typeof body === "object" && typeof body.name === "string" ? body.name : "";
    const site = await renameAnalyticsSite(id, { id: auth.user.id, role: auth.user.role }, { name });
    return json(site);
  } catch (error) {
    if (error instanceof AnalyticsSiteError) {
      if (error.code === "invalid_input") return json({ error: "Name is required" }, { status: 400 });
      if (error.code === "not_found") return json({ error: "Not found" }, { status: 404 });
      if (error.code === "forbidden") return json({ error: "Forbidden" }, { status: 403 });
    }
    if (error instanceof SyntaxError) return json({ error: "Invalid JSON body" }, { status: 400 });
    throw error;
  }
}
