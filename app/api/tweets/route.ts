import { json, getSearchParams } from "@/lib/api-server";
import type { LoaderFunctionArgs } from "react-router";
import { getTweets } from "@/lib/services/twitter";
import { requireSession, filterOwnedAccountIds } from "@/lib/auth-helpers";
import { getAccounts } from "@/lib/services/accounts";

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

  const accountIdsParam = sp.get("accountIds");
  const requestedIds = accountIdsParam
    ? accountIdsParam.split(",").filter(Boolean).map(Number)
    : undefined;
  let accountIds: number[] | undefined;
  if (auth.user.role === "admin") {
    accountIds = requestedIds === undefined ? undefined : await filterOwnedAccountIds(auth.user, requestedIds);
  } else {
    const accounts = await getAccounts(auth.user.id);
    const twitterIds = accounts.filter((account) => account.platform === "twitter").map((account) => account.id);
    accountIds = requestedIds === undefined ? twitterIds : twitterIds.filter((id) => requestedIds.includes(id));
  }

  const data = await getTweets(page, limit, sort, order, search, accountIds, isReply);
  return json(data);
}

export async function loader({ request }: LoaderFunctionArgs) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  return GET(request);
}
