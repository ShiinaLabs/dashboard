import { json, getSearchParams } from "@/lib/api-server";
import type { LoaderFunctionArgs } from "react-router";
import { getOverviewStats } from "@/lib/services/twitter";
import { requireSession, filterOwnedAccountIds } from "@/lib/auth-helpers";
import { getAccounts } from "@/lib/services/accounts";

async function GET(req: Request) {
  const auth = await requireSession(req);
  if (!auth) return json({ error: "Unauthorized" }, { status: 401 });

  const accountIdsParam = getSearchParams(req).get("accountIds");
  const requestedIds = accountIdsParam
    ? accountIdsParam.split(",").filter(Boolean).map(Number)
    : undefined;
  let ids: number[] | undefined;
  if (auth.user.role === "admin") {
    ids = requestedIds === undefined ? undefined : await filterOwnedAccountIds(auth.user, requestedIds);
  } else {
    const accounts = await getAccounts(auth.user.id);
    const twitterIds = accounts.filter((account) => account.platform === "twitter").map((account) => account.id);
    ids = requestedIds === undefined ? twitterIds : twitterIds.filter((id) => requestedIds.includes(id));
  }

  const stats = await getOverviewStats(ids);
  return json(stats);
}

export async function loader({ request }: LoaderFunctionArgs) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  return GET(request);
}
