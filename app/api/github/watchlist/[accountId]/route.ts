import { json } from "@/lib/api-server";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { requireSession, authorizeAccountOwner } from "@/lib/auth-helpers";
import { getAccountByIdWithCredential } from "@/lib/services/accounts";
import { GithubWatchlistService } from "@/lib/services/github-watchlist";
import type { AccountRow } from "@/lib/repositories/accounts";

/**
 * Resolve the account for this route: authenticated, owned (or admin), and
 * actually a GitHub account.
 *
 * `authorizeAccountOwner` intentionally returns metadata WITHOUT the token, so
 * the credential is fetched separately and only here — this route is the one
 * place that legitimately needs the PAT to list candidates.
 */
async function resolve(req: Request, params: Record<string, string>) {
  const auth = await requireSession(req);
  if (!auth) return { error: json({ error: "Unauthorized" }, { status: 401 }) };
  const { account, authorized } = await authorizeAccountOwner(auth.user, Number(params.accountId));
  if (!account) return { error: json({ error: "Account not found" }, { status: 404 }) };
  if (!authorized) return { error: json({ error: "Forbidden" }, { status: 403 }) };
  if (account.platform !== "github") return { error: json({ error: "Not a GitHub account" }, { status: 400 }) };
  let credential: AccountRow | undefined;
  try {
    credential = await getAccountByIdWithCredential(account.id);
  } catch {
    return { error: json({ error: "Stored credential cannot be decrypted; update the credential first" }, { status: 409 }) };
  }
  if (!credential) return { error: json({ error: "Account not found" }, { status: 404 }) };
  return { account: credential };
}

async function GET(req: Request, params: Record<string, string>) {
  const resolved = await resolve(req, params);
  if (resolved.error) return resolved.error;
  try {
    return json(await new GithubWatchlistService().get(resolved.account!));
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

async function PUT(req: Request, params: Record<string, string>) {
  const resolved = await resolve(req, params);
  if (resolved.error) return resolved.error;
  let body: { orgs?: unknown; watched?: unknown };
  try {
    body = (await req.json()) as { orgs?: unknown; watched?: unknown };
  } catch {
    return json({ error: "Invalid request body" }, { status: 400 });
  }
  try {
    const payload = await new GithubWatchlistService().save(resolved.account!, {
      orgs: Array.isArray(body.orgs) ? (body.orgs as string[]) : [],
      watched: Array.isArray(body.watched) ? (body.watched as number[]) : [],
    });
    return json(payload);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  return GET(request, params as Record<string, string>);
}

export async function action({ request, params }: ActionFunctionArgs) {
  switch (request.method) {
    case "PUT": return PUT(request, params as Record<string, string>);
    default: return json({ error: "Method not allowed" }, { status: 405 });
  }
}
