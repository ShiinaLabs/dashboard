import { json } from "@/lib/api-server";
import type { ActionFunctionArgs } from "react-router";
import { requireSession } from "@/lib/auth-helpers";
import { updateAiSettings } from "@/lib/services/settings";

async function requireAdmin(req: Request) {
  const auth = await requireSession(req);
  if (!auth || auth.user.role !== "admin") return null;
  return auth.user;
}

async function PUT(req: Request) {
  if (!(await requireAdmin(req))) return json({ error: "Forbidden" }, { status: 403 });
  return json(await updateAiSettings(await req.json()));
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method === "PUT") return PUT(request);
  return json({ error: "Method not allowed" }, { status: 405 });
}
