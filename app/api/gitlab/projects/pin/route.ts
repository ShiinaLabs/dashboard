import { json } from "@/lib/api-server";
import type { ActionFunctionArgs } from "react-router";
import { setPinnedGitlabProjects } from "@/lib/services/gitlab";
import { requireSession, authorizeAccountOwner } from "@/lib/auth-helpers";

async function PUT(req: Request) {
  const auth = await requireSession(req);
  if (!auth) return json({ error: "Unauthorized" }, { status: 401 });

  const { accountId, projectIds } = await req.json();
  const { authorized } = await authorizeAccountOwner(auth.user, Number(accountId));
  if (!authorized) return json({ error: "Forbidden" }, { status: 403 });

  await setPinnedGitlabProjects(accountId, projectIds);
  return json({ ok: true });
}

export async function action({ request }: ActionFunctionArgs) {
  switch (request.method) {
    case "PUT": return PUT(request);
    default: return json({ error: "Method not allowed" }, { status: 405 });
  }
}
