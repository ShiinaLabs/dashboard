import { json } from "@/lib/api-server";
import type { LoaderFunctionArgs } from "react-router";
import { getGithubReleaseDownloadTimeline } from "@/lib/services/github";
import { requireSession, authorizeAccountOwner } from "@/lib/auth-helpers";

const ALLOWED_DAYS = new Set([7, 14, 30]);

function parseDays(raw: string | null): number {
  const days = Number(raw ?? "30");
  if (!Number.isFinite(days) || !ALLOWED_DAYS.has(days)) return 30;
  return days;
}

async function GET(req: Request, params: Record<string, string>) {
  const auth = await requireSession(req);
  if (!auth) return json({ error: "Unauthorized" }, { status: 401 });

  const { accountId, repoId } = params;
  const { authorized } = await authorizeAccountOwner(auth.user, Number(accountId));
  if (!authorized) return json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const days = parseDays(url.searchParams.get("days"));
  const data = await getGithubReleaseDownloadTimeline(Number(accountId), Number(repoId), days);
  return json(data);
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  return GET(request, params as Record<string, string>);
}
