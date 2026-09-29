import { jwtVerify } from "jose";
import { json } from "@/lib/api-server";
import { isMockMode } from "@/lib/config";
import { ensureApplicationReady } from "@/lib/startup";

const SESSION_COOKIE = "dash_session";

/** Decode a 64-char hex string to a 32-byte Uint8Array. */
function hexToBytes(hex: string): Uint8Array {
  const len = hex.length;
  const bytes = new Uint8Array(len / 2);
  for (let i = 0; i < len; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

// Fallback key so importing this module without DASHBOARD_SECRET (e.g. mock
// mode) doesn't crash. Only used when not in mock mode and the secret is set.
const JWT_SECRET_KEY = hexToBytes(process.env.DASHBOARD_SECRET || "0".repeat(64));

const PUBLIC_API_PATHS = [
  "/api/auth/login",
  "/api/auth/me",
  "/api/reddit/callback",
  "/api/bing-wallpaper",
  "/api/health",
];

const PUBLIC_PAGE_PATHS = ["/login"];

function getCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return part.slice(eq + 1).trim();
      }
    }
  }
  return undefined;
}

async function authMiddleware({ request }: { request: Request }): Promise<Response | void> {
  const { pathname } = new URL(request.url);

  // Startup ordering is centralized: logger, bootstrap, then scheduler.
  // Await readiness before auth can reach application data.
  await ensureApplicationReady();

  // Static assets — pass through
  if (pathname.startsWith("/assets")) {
    return;
  }

  // Public browser analytics collector; event integrity is validated by its service.
  if (pathname === "/a/e" && (request.method === "POST" || request.method === "OPTIONS")) {
    return;
  }

  // Public API endpoints — pass through
  if (PUBLIC_API_PATHS.includes(pathname)) {
    return;
  }

  // Public page paths — pass through
  if (PUBLIC_PAGE_PATHS.includes(pathname)) {
    return;
  }

  // Mock/debug mode: accept any session token. Keep /login reachable and
  // require a token for /api + protected pages so the login UX still works.
  if (isMockMode()) {
    const token = getCookie(request, SESSION_COOKIE);
    if (!token) {
      if (pathname.startsWith("/api/")) {
        return json({ error: "Unauthorized" }, { status: 401 });
      }
      const reqUrl = new URL(request.url);
      const from = reqUrl.pathname + reqUrl.search;
      const loginUrl = new URL("/login", request.url);
      if (from !== "/login" && !from.startsWith("/login?")) {
        loginUrl.searchParams.set("from", from);
      }
      return new Response(null, { status: 302, headers: { location: loginUrl.toString() } });
    }
    return;
  }

  const token = getCookie(request, SESSION_COOKIE);

  // API routes — return 401 if no token
  if (pathname.startsWith("/api/")) {
    if (!token) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
      await jwtVerify(token, JWT_SECRET_KEY, { algorithms: ["HS256"] });
    } catch {
      return json({ error: "Session expired or invalid" }, { status: 401 });
    }
    return;
  }

  // Page routes — redirect to /login if no token
  if (!token) {
    // Avoid an immediate loop if the request itself is already targeting
    // /login (PUBLIC_PAGE_PATHS handles it, but be defensive if the list
    // drifts). Also preserve the full original location (pathname + search)
    // so the login page can return the user to the intended view.
    const reqUrl = new URL(request.url);
    const from = reqUrl.pathname + reqUrl.search;
    const loginUrl = new URL("/login", request.url);
    if (from !== "/login" && !from.startsWith("/login?")) {
      loginUrl.searchParams.set("from", from);
    }
    return new Response(null, { status: 302, headers: { location: loginUrl.toString() } });
  }

  // Validate JWT for page routes
  try {
    await jwtVerify(token, JWT_SECRET_KEY, { algorithms: ["HS256"] });
  } catch {
    const loginUrl = new URL("/login", request.url);
    // Don't leak an invalid token's original destination if it was /login
    // itself — that would bounce between /login?from=/login and /login.
    const reqUrl = new URL(request.url);
    const from = reqUrl.pathname + reqUrl.search;
    if (from !== "/login" && !from.startsWith("/login?")) {
      // Preserve where the user was headed so post-reauth they land back
      // on the same view instead of always on /overview.
      const curFrom = reqUrl.searchParams.get("from");
      if (!curFrom) loginUrl.searchParams.set("from", from);
    }
    // Include the original search of /login?from=... if it already carried one
    const existing = reqUrl.searchParams.get("from");
    if (existing && !loginUrl.searchParams.has("from")) {
      loginUrl.searchParams.set("from", existing);
    }
    return new Response(null, { status: 302, headers: { location: loginUrl.toString() } });
  }
}

export const middleware = [authMiddleware];
