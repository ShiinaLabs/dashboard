import { json } from "@/lib/api-server";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { getAccounts, createAccount, assertSafeInstanceUrl } from "@/lib/services/accounts";
import { getOverviewStats } from "@/lib/repositories/twitter";
import { isSupportedPlatform } from "@/lib/platforms";
import { requireSession, getOwnerId } from "@/lib/auth-helpers";

async function GET(req: Request) {
  const auth = await requireSession(req);
  if (!auth) return json({ error: "Unauthorized" }, { status: 401 });

  const ownerId = getOwnerId(auth.user);
  const accounts = await getAccounts(ownerId);
  const overview = await getOverviewStats(accounts.map((a) => a.id));
  return json({ accounts, overview });
}

async function POST(req: Request) {
  const auth = await requireSession(req);
  if (!auth) return json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { screenName, authToken, fetchInterval, platform, instanceUrl, authType } = body;
  if (!screenName) {
    return json({ error: "screenName is required" }, { status: 400 });
  }
  if (!authToken && authType !== "reddit_public") {
    return json({ error: "authToken is required" }, { status: 400 });
  }
  if (!isSupportedPlatform(platform || "twitter")) {
    return json({ error: `Unsupported platform: ${platform}` }, { status: 400 });
  }
  try {
    assertSafeInstanceUrl(instanceUrl);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: msg }, { status: 400 });
  }

  const account = await createAccount({
    screenName,
    authToken: authToken || "reddit_public",
    fetchInterval: fetchInterval || 90,
    platform: platform || "twitter",
    instanceUrl: instanceUrl || null,
    authType: authType || null,
    ownerId: auth.user.id,
  });

  const { auth_token: _, ...pub } = account;
  return json(pub, { status: 201 });
}

export async function loader({ request }: LoaderFunctionArgs) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  return GET(request);
}
export async function action({ request }: ActionFunctionArgs) {
  switch (request.method) {
    case "POST": return POST(request);
    default: return json({ error: "Method not allowed" }, { status: 405 });
  }
}
