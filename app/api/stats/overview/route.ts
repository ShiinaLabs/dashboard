import { json, getSearchParams } from "@/lib/api-server";
import type { LoaderFunctionArgs } from "react-router";
import { getOverviewStats } from "@/lib/services/twitter";
import { requireSession, filterOwnedAccountIds } from "@/lib/auth-helpers";

async function GET(req: Request) {
  const auth = await requireSession(req);
  if (!auth) return json({ error: "Unauthorized" }, { status: 401 });

  const accountIdsParam = getSearchParams(req).get("accountIds");
  let ids = accountIdsParam ? accountIdsParam.split(",").map(Number) : undefined;
  if (ids && ids.length > 0) {
    ids = await filterOwnedAccountIds(auth.user, ids);
    if (ids.length === 0) return json({});
  }

  const stats = await getOverviewStats(ids);
  return json(stats);
}

export async function loader({ request }: LoaderFunctionArgs) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  return GET(request);
}
