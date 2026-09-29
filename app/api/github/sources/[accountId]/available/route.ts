import { json } from "@/lib/api-server";
import type { LoaderFunctionArgs } from "react-router";
import { requireSession, authorizeAccountOwner } from "@/lib/auth-helpers";
import { getGithubAvailableOrgs } from "@/lib/services/github";

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

  const result = await getGithubAvailableOrgs(account.id);
  if (result.status === "credential-error") {
    return json({ error: "Stored credential cannot be decrypted; update the credential first" }, { status: 409 });
  }
  if (result.status === "not-found") return json({ error: "Account not found" }, { status: 404 });
  return json({ orgs: result.orgs, unavailable: result.unavailable });
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  return GET(request, params as Record<string, string>);
}
