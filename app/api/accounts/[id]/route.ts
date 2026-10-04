import { json } from "@/lib/api-server";
import type { ActionFunctionArgs } from "react-router";
import { getAccountById, updateAccountFromInput, deleteAccount, InvalidAccountInputError } from "@/lib/services/accounts";
import { validateConfirmToken } from "@/lib/confirm-helpers";
import { requireSession, authorizeAccountOwner } from "@/lib/auth-helpers";

async function PUT(req: Request, params: Record<string, string>) {
  const auth = await requireSession(req);
  if (!auth) return json({ error: "Unauthorized" }, { status: 401 });

  const { id } = params;
  const { authorized, account } = await authorizeAccountOwner(auth.user, Number(id));
  if (!account) return json({ error: "Not found" }, { status: 404 });
  if (!authorized) return json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  try {
    await updateAccountFromInput(Number(id), body);
  } catch (err) {
    if (err instanceof InvalidAccountInputError) {
      const msg = err instanceof Error ? err.message : String(err);
      return json({ error: msg }, { status: 400 });
    }
    throw err;
  }
  const updated = await getAccountById(Number(id));
  if (!updated) return json({ error: "Not found" }, { status: 404 });
  const { auth_token: _, ...pub } = updated as unknown as Record<string, unknown>;
  return json(pub);
}

async function DELETE(req: Request, params: Record<string, string>) {
  const auth = await requireSession(req);
  if (!auth) return json({ error: "Unauthorized" }, { status: 401 });

  const { id } = params;
  const { authorized, account } = await authorizeAccountOwner(auth.user, Number(id));
  if (!account) return json({ error: "Not found" }, { status: 404 });
  if (!authorized) return json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { confirmToken } = body as { confirmToken?: string };
  if (!confirmToken || !validateConfirmToken(confirmToken, {
    userId: auth.user.id,
    target: Number(id),
    action: "delete",
  })) {
    return json({ error: "Invalid or expired confirmation token" }, { status: 400 });
  }
  await deleteAccount(Number(id));
  return json({ success: true });
}

export async function action({ request, params }: ActionFunctionArgs) {
  switch (request.method) {
    case "PUT": return PUT(request, params as Record<string, string>);
    case "DELETE": return DELETE(request, params as Record<string, string>);
    default: return json({ error: "Method not allowed" }, { status: 405 });
  }
}
