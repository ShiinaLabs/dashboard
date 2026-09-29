import { json, getSearchParams } from "@/lib/api-server";
import type { LoaderFunctionArgs } from "react-router";
import { getTopTweets } from "@/lib/services/twitter";
import { requireSession, getOwnerId } from "@/lib/auth-helpers";
import { getAccounts } from "@/lib/services/accounts";

async function GET(req: Request) {
  const auth = await requireSession(req);
  if (!auth) return json({ error: "Unauthorized" }, { status: 401 });

  const metric = getSearchParams(req).get("metric") || "favorite_count";
  const limit = Number(getSearchParams(req).get("limit")) || 10;
  const ownerId = getOwnerId(auth.user);
  const accounts = await getAccounts(ownerId);
  const twitterIds = accounts.filter((a) => a.platform === "twitter").map((a) => a.id);
  const accountScope = auth.user.role === "admin" ? undefined : twitterIds;
  const tweets = await getTopTweets(metric, limit, accountScope);
  return json(tweets);
}

export async function loader({ request }: LoaderFunctionArgs) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  return GET(request);
}
