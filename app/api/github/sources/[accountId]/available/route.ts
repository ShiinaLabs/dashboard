import { json } from "@/lib/api-server";
import type { LoaderFunctionArgs } from "react-router";
import { requireSession, authorizeAccountOwner } from "@/lib/auth-helpers";
import { GithubClient } from "@/lib/infra/fetchers/GithubClient";

/**
 * Organizations the PAT belongs to, offered as picker options.
 *
 * Failure is reported rather than thrown, because "cannot enumerate" is a
 * normal state and the UI must explain it: a fine-grained PAT answers 200 with
 * an empty list, and a classic PAT without the `user`/`read:org` scope answers
 * 403. Neither means the user has no organizations, so the manual login field
 * is the fallback either way.
 */
async function GET(req: Request, params: Record<string, string>) {
  const auth = await requireSession(req);
  if (!auth) return json({ error: "Unauthorized" }, { status: 401 });
  const { account, authorized } = await authorizeAccountOwner(auth.user, Number(params.accountId));
  if (!account) return json({ error: "Account not found" }, { status: 404 });
  if (!authorized) return json({ error: "Forbidden" }, { status: 403 });
  if (account.platform !== "github") return json({ error: "Not a GitHub account" }, { status: 400 });

  try {
    const orgs = await new GithubClient().fetchAuthenticatedOrgs(account.auth_token);
    return json({
      orgs: orgs
        .map((raw) => {
          const org = raw as { login?: unknown; id?: unknown; node_id?: unknown };
          return typeof org?.login === "string"
            ? { login: org.login, githubId: typeof org.id === "number" ? org.id : null, nodeId: typeof org.node_id === "string" ? org.node_id : null }
            : null;
        })
        .filter(Boolean),
      unavailable: null,
    });
  } catch (error) {
    return json({ orgs: [], unavailable: error instanceof Error ? error.message : String(error) });
  }
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  return GET(request, params as Record<string, string>);
}
