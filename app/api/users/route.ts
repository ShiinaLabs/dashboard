import { json } from "@/lib/api-server";
import type { ActionFunctionArgs } from "react-router";
import { requireSession } from "@/lib/auth-helpers";
import { createUser } from "@/lib/services/users";
import { validatePasswordStrength } from "@/lib/auth";

async function requireAdmin(req: Request) {
  const auth = await requireSession(req);
  if (!auth || auth.user.role !== "admin") return null;
  return auth.user;
}

async function POST(req: Request) {
  if (!(await requireAdmin(req))) return json({ error: "Forbidden" }, { status: 403 });
  const { username, password, role } = await req.json();
  if (!username || !password) return json({ error: "username and password required" }, { status: 400 });
  if (!validatePasswordStrength(password).valid) {
    return json({ error: "Password does not meet requirements" }, { status: 400 });
  }
  try {
    const user = await createUser(username, password, role || "user");
    if (!user) return json({ error: "Failed to create user" }, { status: 500 });
    const pub = { id: user.id, username: user.username, role: user.role, created_at: user.created_at };
    return json(pub, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("UNIQUE")) return json({ error: "Username already exists" }, { status: 409 });
    // Don't leak database/driver details (SQL, host, connection strings) to the
    // client; log the full error server-side.
    console.error("[users] create failed:", e);
    return json({ error: "Failed to create user" }, { status: 500 });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  switch (request.method) {
    case "POST": return POST(request);
    default: return json({ error: "Method not allowed" }, { status: 405 });
  }
}
