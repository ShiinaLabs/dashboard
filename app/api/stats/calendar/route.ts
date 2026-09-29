import { json, getSearchParams } from "@/lib/api-server";
import type { LoaderFunctionArgs } from "react-router";
import { getCalendarData } from "@/lib/services/twitter";
import { requireSession, getOwnerId } from "@/lib/auth-helpers";
import { getAccounts } from "@/lib/services/accounts";

async function GET(req: Request) {
  const auth = await requireSession(req);
  if (!auth) return json({ error: "Unauthorized" }, { status: 401 });

  const year = Number(getSearchParams(req).get("year")) || new Date().getFullYear();
  const ownerId = getOwnerId(auth.user);
  const accounts = await getAccounts(ownerId);
  const twitterIds = accounts.filter((a) => a.platform === "twitter").map((a) => a.id);
  const accountScope = auth.user.role === "admin" ? undefined : twitterIds;
  const data = await getCalendarData(year, accountScope);
  return json(data);
}

export async function loader({ request }: LoaderFunctionArgs) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  return GET(request);
}
