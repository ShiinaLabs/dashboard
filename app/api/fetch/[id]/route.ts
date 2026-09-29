import { json } from "@/lib/api-server";
import type { ActionFunctionArgs } from "react-router";
import { startManualFetch } from "@/lib/services/manual-fetch";
import { isMockMode } from "@/lib/config";
import { requireSession, authorizeAccountOwner } from "@/lib/auth-helpers";

async function POST(req: Request, params: Record<string, string>) {
  const auth = await requireSession(req);
  if (!auth) return json({ error: "Unauthorized" }, { status: 401 });

  const { id } = params;

  // Mock/debug mode: no real fetch — pretend it started.
  if (isMockMode()) {
    return json({ ok: true, message: `Mock fetch started for account ${id}` });
  }

  const { authorized, account } = await authorizeAccountOwner(auth.user, Number(id));
  if (!account) return json({ error: "Account not found" }, { status: 404 });
  if (!authorized) return json({ error: "Forbidden" }, { status: 403 });

  let level: string | undefined;
  try {
    const body = await req.json().catch(() => ({})) as { level?: string };
    level = body.level;
  } catch { /* no body */ }

  const result = await startManualFetch(Number(id), level);
  if (result.status === "credential-error") {
    return json({ error: "Stored credential cannot be decrypted; update the credential first" }, { status: 409 });
  }
  if (result.status === "not-found") return json({ error: "Account not found" }, { status: 404 });
  return json({ ok: true, message: `Fetch started for @${result.screenName}` });
}

export async function action({ request, params }: ActionFunctionArgs) {
  switch (request.method) {
    case "POST": return POST(request, params as Record<string, string>);
    default: return json({ error: "Method not allowed" }, { status: 405 });
  }
}
