import { SignJWT, jwtVerify } from "jose";
import { getJwtSecret } from "./crypto";
import { isMockMode } from "./config";
import { getRequestCookie } from "./api-server";
import { getUserByUsername } from "./services/users";
import { getAccountById, getAccounts, type AccountMetadata } from "./services/accounts";

const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

export async function createSessionToken(username: string, role: string): Promise<string> {
  if (isMockMode()) return "mock-session-token";
  const secret = getJwtSecret();
  return new SignJWT({ sub: username, role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(secret);
}

export async function validateSession(token: string): Promise<{ username: string; role: string } | null> {
  if (isMockMode()) return token ? { username: "admin", role: "admin" } : null;
  try {
    const secret = getJwtSecret();
    const { payload } = await jwtVerify(token, secret);
    const username = payload.sub;
    const role = payload.role as string | undefined;
    if (!username || !role) return null;
    return { username, role };
  } catch {
    return null;
  }
}

// ── Auth helpers for route handlers ───────────────────────────────

export interface AuthSession {
  username: string;
  role: string;
}

export interface AuthUser {
  id: number;
  username: string;
  role: string;
}

/**
 * Extract and validate the dash_session cookie from a request.
 * Returns the session + user, or null if unauthorized.
 */
export async function requireSession(request: Request): Promise<{ session: AuthSession; user: AuthUser } | null> {
  const token = getRequestCookie(request, "dash_session");
  const session = token ? await validateSession(token) : null;
  if (!session) return null;
  const user = await getUserByUsername(session.username);
  if (!user) return null;
  return { session, user: { id: user.id, username: user.username, role: user.role } };
}

/**
 * Check whether the given accountId belongs to the user.
 * Admin users can access all accounts.
 * Returns the account if authorized, null otherwise.
 */
export async function authorizeAccountOwner(
  user: AuthUser,
  accountId: number,
): Promise<{ authorized: boolean; account?: AccountMetadata }> {
  const account = await getAccountById(accountId);
  if (!account) return { authorized: false };
  // Admin can access all accounts; regular users can only access their own
  if (user.role === "admin" || account.owner_id === user.id) {
    return { authorized: true, account };
  }
  return { authorized: false };
}

/**
 * Get ownerId filter for queries. Admin sees all, regular users see only their own.
 */
export function getOwnerId(user: AuthUser): number | undefined {
  return user.role === "admin" ? undefined : user.id;
}

/**
 * Filter a list of accountIds to only those owned by the user.
 * Admin users see all requested IDs; regular users' IDs are intersected
 * with their owned accounts.
 */
export async function filterOwnedAccountIds(user: AuthUser, requestedIds: number[]): Promise<number[]> {
  const accounts = await getAccounts(getOwnerId(user));
  const ownedIds = new Set(accounts.map((a) => a.id));
  return requestedIds.filter((id) => ownedIds.has(id));
}

export { SESSION_MAX_AGE };
