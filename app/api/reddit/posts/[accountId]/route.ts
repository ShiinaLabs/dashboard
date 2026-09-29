import { json, getSearchParams } from "@/lib/api-server";
import type { LoaderFunctionArgs } from "react-router";
import { getRedditPosts } from "@/lib/services/reddit";
import { requireSession, authorizeAccountOwner } from "@/lib/auth-helpers";

async function GET(req: Request, params: Record<string, string>) {
  const auth = await requireSession(req);
  if (!auth) return json({ error: "Unauthorized" }, { status: 401 });

  const { accountId } = params;
  const { authorized } = await authorizeAccountOwner(auth.user, Number(accountId));
  if (!authorized) return json({ error: "Forbidden" }, { status: 403 });

  const sp = getSearchParams(req);
  const page = Number(sp.get("page")) || 1;
  const limit = Number(sp.get("limit")) || 20;
  const sort = sp.get("sort") || "score";
  const data = await getRedditPosts(Number(accountId), page, limit, sort);
  return json(data);
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  return GET(request, params as Record<string, string>);
}
