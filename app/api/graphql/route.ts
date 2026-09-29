import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { json } from "@/lib/api-server";
import { requireSession } from "@/lib/auth-helpers";
import { yoga } from "@/lib/graphql/schema";

async function handleGraphQL(request: Request): Promise<Response> {
  const auth = await requireSession(request);
  if (!auth) return json({ error: "Unauthorized" }, { status: 401 });
  return yoga.fetch(request, { user: auth.user });
}

export async function loader({ request }: LoaderFunctionArgs): Promise<Response> {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  return handleGraphQL(request);
}

export async function action({ request }: ActionFunctionArgs): Promise<Response> {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  return handleGraphQL(request);
}
