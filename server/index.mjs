import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequestListener } from "@react-router/node";
import * as build from "../build/server/index.js";

const port = Number(process.env.PORT || 3000);
const app = createRequestListener({ build });

// React Router's node adapter handles the app but not static files, so we
// serve the client build ourselves. Zero-dependency on purpose: every extra
// package (express/serve-static) costs install time and memory in CI.
const clientDir = fileURLToPath(new URL("../build/client", import.meta.url));

const MIME_TYPES = {
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json",
};

// Hashed build assets are safe to cache forever; public/ files are not.
function cacheControl(pathname) {
  return pathname.startsWith("/assets/")
    ? "public, max-age=31536000, immutable"
    : "public, max-age=3600";
}

async function serveStatic(req, res, pathname) {
  let relative;
  try {
    relative = decodeURIComponent(pathname).replace(/^\/+/, "");
  } catch {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Bad Request");
    return;
  }
  const filePath = resolve(clientDir, relative);
  if (filePath !== clientDir && !filePath.startsWith(clientDir + sep)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }
  let info;
  try {
    info = await stat(filePath);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not Found");
    return;
  }
  if (!info.isFile()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not Found");
    return;
  }
  const type = MIME_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream";
  const headers = {
    "Content-Type": type,
    "Content-Length": info.size,
    "Cache-Control": cacheControl(pathname),
  };
  res.writeHead(200, headers);
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  createReadStream(filePath).pipe(res);
}

// Mirrors the security headers previously set by next.config.ts.
const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://www.bing.com https://*.bing.com",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; "),
};

// Resolve the CORS allow-origin. When ALLOWED_ORIGINS is unset we do NOT emit
// an Access-Control-Allow-Origin header at all (same-origin requests are
// always allowed), instead of defaulting to a wildcard that would let any
// origin read API responses alongside a credential cookie.
function resolveAllowedOrigin(req) {
  const configured = (process.env.ALLOWED_ORIGINS || "").trim();
  if (!configured) return null;
  const origin = req.headers.origin;
  if (!origin) return null;
  const allowed = configured.split(",").map((s) => s.trim()).filter(Boolean);
  return allowed.includes(origin) ? origin : null;
}

function listener(req, res) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(name, value);
  }
  if (req.url?.startsWith("/api/")) {
    res.setHeader("Vary", "Origin");
    const allowOrigin = resolveAllowedOrigin(req);
    if (allowOrigin) {
      res.setHeader("Access-Control-Allow-Origin", allowOrigin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    }
  }
  // Handle CORS preflight for API routes directly; React Router's adapter does
  // not respond to OPTIONS.
  if ((req.method ?? "GET") === "OPTIONS" && req.url?.startsWith("/api/")) {
    res.writeHead(204);
    res.end();
    return;
  }
  const method = req.method ?? "GET";
  if (method === "GET" || method === "HEAD") {
    const pathname = req.url?.split("?", 1)[0] ?? "/";
    if (
      pathname.startsWith("/assets/") ||
      pathname === "/a/t.js" ||
      pathname === "/favicon.ico" ||
      pathname === "/favicon.png" ||
      pathname === "/apple-touch-icon.png"
    ) {
      serveStatic(req, res, pathname);
      return;
    }
  }
  app(req, res);
}

const server = createServer(listener);

// Fail fast in production if the JWT/encryption secret is unset or malformed.
// A predictable all-zero fallback would otherwise let an attacker forge
// session tokens. Local development and mock mode are exempt.
function assertSecureStartup() {
  const isProd = process.env.NODE_ENV === "production";
  const isMock = Boolean(process.env.MOCK_DATA);
  if (!isProd || isMock) return;
  const secret = process.env.DASHBOARD_SECRET || "";
  if (!/^[0-9a-fA-F]{64}$/.test(secret)) {
    console.error(
      "[startup] DASHBOARD_SECRET must be a 64-char hex value in production. " +
      "Refusing to start with an insecure default.",
    );
    process.exit(1);
  }
}

assertSecureStartup();

server.listen(port, () => {
  console.log(`dashboard listening on http://localhost:${port}`);
});
