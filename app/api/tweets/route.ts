import { json, getSearchParams } from "@/lib/api-server";
import type { LoaderFunctionArgs } from "react-router";
import { getTweets } from "@/lib/services/twitter";
import { requireSession, filterOwnedAccountIds } from "@/lib/auth-helpers";

async function GET(req: Request) {
  const auth = await requireSession(req);
  if (!auth) return json({ error: "Unauthorized" }, { status: 401 });

  const sp = getSearchParams(req);
  const page = Number(sp.get("page")) || 1;
  const limit = Number(sp.get("limit")) || 20;
  const sort = sp.get("sort") || "created_at";
  const order = sp.get("order") || "desc";
  const search = sp.get("search") || undefined;
  const isReply = sp.get("isReply") !== undefined ? Number(sp.get("isReply")) : undefined;

  let accountIds = sp.get("accountIds")?.split(",").map(Number);
  if (accountIds && accountIds.length > 0) {
    accountIds = await filterOwnedAccountIds(auth.user, accountIds);
    if (accountIds.length === 0) return json({ data: [], total: 0 });
  }

  const data = await getTweets(page, limit, sort, order, search, accountIds, isReply);
  return json(data);
}

export async function loader({ request }: LoaderFunctionArgs) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  return GET(request);
}
