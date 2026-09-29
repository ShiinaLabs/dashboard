import { json } from "@/lib/api-server";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { requireSession } from "@/lib/auth-helpers";
import { getAiSettings, updateAiSettings } from "@/lib/services/settings";

async function requireAdmin(req: Request) {
  const auth = await requireSession(req);
  if (!auth || auth.user.role !== "admin") return null;
  return auth.user;
}

async function GET(req: Request) {
  if (!(await requireAdmin(req))) return json({ error: "Forbidden" }, { status: 403 });
  return json(await getAiSettings());
}

async function PUT(req: Request) {
  if (!(await requireAdmin(req))) return json({ error: "Forbidden" }, { status: 403 });
  return json(await updateAiSettings(await req.json()));
}

export async function loader({ request }: LoaderFunctionArgs) {
  if (request.method === "GET") return GET(request);
  return json({ error: "Method not allowed" }, { status: 405 });
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method === "PUT") return PUT(request);
  return json({ error: "Method not allowed" }, { status: 405 });
}
