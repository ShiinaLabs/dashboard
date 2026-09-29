import { json } from "@/lib/api-server";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { getOwnerId, requireSession } from "@/lib/auth-helpers";
import { AnalyticsSiteError, createAnalyticsSite, getAnalyticsSites } from "@/lib/services/analytics";

export async function loader({ request }: LoaderFunctionArgs) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  const auth = await requireSession(request);
  if (!auth) return json({ error: "Unauthorized" }, { status: 401 });
  return json({ sites: await getAnalyticsSites(getOwnerId(auth.user)) });
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const auth = await requireSession(request);
  if (!auth) return json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json() as { name?: string; siteKey?: string; host?: string };
    const site = await createAnalyticsSite(auth.user.id, {
      name: body.name ?? "",
      siteKey: body.siteKey ?? "",
      host: body.host ?? "",
    });
    return json(site, { status: 201 });
  } catch (error) {
    if (error instanceof AnalyticsSiteError && error.code === "invalid_input") {
      return json({ error: "Name, Site ID, and Host are required" }, { status: 400 });
    }
    if (error instanceof SyntaxError) return json({ error: "Invalid JSON body" }, { status: 400 });
    if ((error as { code?: string })?.code === "23505") return json({ error: "This Site ID already exists" }, { status: 409 });
    throw error;
  }
}
