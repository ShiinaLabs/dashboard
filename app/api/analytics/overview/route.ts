import { json } from "@/lib/api-server";
import type { LoaderFunctionArgs } from "react-router";
import { requireSession } from "@/lib/auth-helpers";
import { getAnalyticsOverview } from "@/lib/services/analytics";

async function GET(request: Request) {
  const auth = await requireSession(request);
  if (!auth) return json({ error: "Unauthorized" }, { status: 401 });
  try {
    return json(await getAnalyticsOverview());
  } catch {
    return json({ error: "Analytics unavailable" }, { status: 503 });
  }
}

export async function loader({ request }: LoaderFunctionArgs) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  return GET(request);
}
