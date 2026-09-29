import { json } from "@/lib/api-server";
import type { LoaderFunctionArgs } from "react-router";
import { getTweetById } from "@/lib/services/twitter";
import { requireSession, authorizeAccountOwner } from "@/lib/auth-helpers";

async function GET(req: Request, params: Record<string, string>) {
  const auth = await requireSession(req);
  if (!auth) return json({ error: "Unauthorized" }, { status: 401 });

  const { id } = params;
  const tweet = await getTweetById(id);
  if (!tweet) return json({ error: "Not found" }, { status: 404 });

  // Verify the tweet's account belongs to the current user
  const { authorized } = await authorizeAccountOwner(auth.user, tweet.account_id);
  if (!authorized) return json({ error: "Forbidden" }, { status: 403 });

  return json(tweet);
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  return GET(request, params as Record<string, string>);
}
