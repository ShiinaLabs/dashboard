import { json } from "@/lib/api-server";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { getAccountById, updateAccount, deleteAccount, assertSafeInstanceUrl } from "@/lib/services/accounts";
import { validateConfirmToken } from "@/lib/confirm-helpers";
import { getLatestUserStats } from "@/lib/services/twitter";
import { getRecentFetchRuns } from "@/lib/services/fetch-health";
import { requireSession, authorizeAccountOwner } from "@/lib/auth-helpers";

async function GET(req: Request, params: Record<string, string>) {
  const auth = await requireSession(req);
  if (!auth) return json({ error: "Unauthorized" }, { status: 401 });

  const { id } = params;
  const { authorized, account } = await authorizeAccountOwner(auth.user, Number(id));
  if (!account) return json({ error: "Not found" }, { status: 404 });
  if (!authorized) return json({ error: "Forbidden" }, { status: 403 });

  const stats = await getLatestUserStats(account.id);
  const recentFetchRuns = await getRecentFetchRuns(account.id);
  const { auth_token: _, ...rest } = account as unknown as Record<string, unknown>;
  return json({ ...rest, stats: stats || null, recentFetchRuns });
}

async function PUT(req: Request, params: Record<string, string>) {
  const auth = await requireSession(req);
  if (!auth) return json({ error: "Unauthorized" }, { status: 401 });

  const { id } = params;
  const { authorized, account } = await authorizeAccountOwner(auth.user, Number(id));
  if (!account) return json({ error: "Not found" }, { status: 404 });
  if (!authorized) return json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { screenName, authToken, fetchInterval, isActive, instanceUrl, authType } = body;

  const updates: Record<string, unknown> = {};
  if (screenName !== undefined) updates.screen_name = screenName;
  if (authToken !== undefined && authToken !== "") updates.auth_token = authToken;
  if (fetchInterval !== undefined) updates.fetch_interval = fetchInterval;
  if (isActive !== undefined) updates.is_active = isActive ? 1 : 0;
  if (instanceUrl !== undefined) {
    try {
      assertSafeInstanceUrl(instanceUrl);
      updates.instance_url = instanceUrl;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return json({ error: msg }, { status: 400 });
    }
  }
  if (authType !== undefined) updates.auth_type = authType;

  await updateAccount(Number(id), updates);
  const updated = await getAccountById(Number(id));
  if (!updated) return json({ error: "Not found" }, { status: 404 });
  const { auth_token: _, ...pub } = updated as unknown as Record<string, unknown>;
  return json(pub);
}

async function DELETE(req: Request, params: Record<string, string>) {
  const auth = await requireSession(req);
  if (!auth) return json({ error: "Unauthorized" }, { status: 401 });

  const { id } = params;
  const { authorized, account } = await authorizeAccountOwner(auth.user, Number(id));
  if (!account) return json({ error: "Not found" }, { status: 404 });
  if (!authorized) return json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { confirmToken } = body as { confirmToken?: string };
  if (!confirmToken || !validateConfirmToken(confirmToken, {
    userId: auth.user.id,
    target: Number(id),
    action: "delete",
  })) {
    return json({ error: "Invalid or expired confirmation token" }, { status: 400 });
  }
  await deleteAccount(Number(id));
  return json({ success: true });
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  return GET(request, params as Record<string, string>);
}
export async function action({ request, params }: ActionFunctionArgs) {
  switch (request.method) {
    case "PUT": return PUT(request, params as Record<string, string>);
    case "DELETE": return DELETE(request, params as Record<string, string>);
    default: return json({ error: "Method not allowed" }, { status: 405 });
  }
}
