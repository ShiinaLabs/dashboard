import { isbot } from "isbot";
import { UAParser } from "ua-parser-js";

const MAX_BODY_BYTES = 8 * 1024;
const MAX_HOST_LENGTH = 255;
const MAX_PATH_LENGTH = 2048;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface AnalyticsEngineBinding {
  writeDataPoint(data: { blobs: string[]; doubles: number[]; indexes: string[] }): void;
}

interface CollectorEnv {
  ANALYTICS: AnalyticsEngineBinding;
}

interface CollectorRequest extends Request {
  cf?: { country?: string | null };
}

interface EventPayload {
  site: string;
  host: string;
  path: string;
  referrer: string;
  visitor: boolean;
  visit: boolean;
}

function response(body: BodyInit | null, status: number, origin?: string, headers?: HeadersInit): Response {
  const resultHeaders = new Headers(headers);
  resultHeaders.set("Cache-Control", "no-store");
  resultHeaders.set("Vary", "Origin");
  resultHeaders.set("Access-Control-Allow-Origin", origin ?? "*");
  return new Response(body, { status, headers: resultHeaders });
}

function validateHost(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_HOST_LENGTH || /[\s/?#@\\]/.test(value)) return null;
  try {
    const parsed = new URL(`https://${value}`);
    if (parsed.pathname !== "/" || parsed.username || parsed.password || parsed.host.toLowerCase() !== value.toLowerCase()) return null;
    return parsed.host.toLowerCase();
  } catch {
    return null;
  }
}

function validOrigin(origin: string, host: string): boolean {
  try {
    const parsed = new URL(origin);
    return (parsed.protocol === "https:" || parsed.protocol === "http:")
      && !parsed.username && !parsed.password
      && parsed.host.toLowerCase() === host;
  } catch {
    return false;
  }
}

function validatePayload(value: unknown): EventPayload | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as Record<string, unknown>;
  const host = validateHost(payload.host);
  if (typeof payload.site !== "string" || !UUID_V4.test(payload.site)) return null;
  if (!host || typeof payload.path !== "string" || !payload.path.startsWith("/") || payload.path.length > MAX_PATH_LENGTH) return null;
  // eslint-disable-next-line no-control-regex -- reject control characters in paths before persistence
  if (/[\u0000-\u001f\u007f]/.test(payload.path) || payload.path.includes("?") || payload.path.includes("#")) return null;
  if (typeof payload.referrer !== "string" || payload.referrer.length > 4096) return null;
  if (typeof payload.visitor !== "boolean" || typeof payload.visit !== "boolean") return null;
  return {
    site: payload.site,
    host,
    path: payload.path,
    referrer: payload.referrer,
    visitor: payload.visitor,
    visit: payload.visit,
  };
}

async function readBody(request: Request): Promise<{ text?: string; tooLarge?: boolean; invalid?: boolean }> {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) return { tooLarge: true };
  const reader = request.body?.getReader();
  if (!reader) return { text: "" };
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) {
        await reader.cancel();
        return { tooLarge: true };
      }
      chunks.push(value);
    }
  } catch {
    return { invalid: true };
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    return { invalid: true };
  }
}

function referrerHost(referrer: string, siteHost: string): string {
  if (!referrer) return "";
  try {
    const parsed = new URL(referrer);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    const host = parsed.host.toLowerCase();
    return host === siteHost ? "" : host;
  } catch {
    return "";
  }
}

function normalizedOs(name: string | undefined): string {
  if (!name) return "Other";
  if (name === "Mac OS") return "macOS";
  if (name.startsWith("Windows")) return "Windows";
  if (name === "iOS") return "iOS";
  if (name === "Android") return "Android";
  if (name.startsWith("Linux")) return "Linux";
  return name.slice(0, 64);
}

function normalizedDevice(type: string | undefined): string {
  if (type === "mobile") return "Mobile";
  if (type === "tablet") return "Tablet";
  if (!type) return "Desktop";
  return "Other";
}

async function collect(request: CollectorRequest, env: CollectorEnv): Promise<Response> {
  const body = await readBody(request);
  if (body.tooLarge) return response(null, 413);
  if (body.invalid) return response(null, 400);

  let decoded: unknown;
  try {
    decoded = JSON.parse(body.text ?? "");
  } catch {
    return response(null, 400);
  }
  const event = validatePayload(decoded);
  if (!event) return response(null, 400);

  const origin = request.headers.get("origin") ?? undefined;
  if (origin && !validOrigin(origin, event.host)) return response(null, 403);

  const userAgent = request.headers.get("user-agent") ?? "";
  if (isbot(userAgent)) return response(null, 204, origin);

  const parsedUa = new UAParser(userAgent).getResult();
  try {
    env.ANALYTICS.writeDataPoint({
      blobs: [
        event.site,
        event.host,
        event.path,
        referrerHost(event.referrer, event.host),
        normalizedOs(parsedUa.os.name),
        (parsedUa.browser.name || "Other").slice(0, 64),
        request.cf?.country || "Unknown",
        normalizedDevice(parsedUa.device.type),
      ],
      doubles: [event.visitor ? 1 : 0, event.visit ? 1 : 0],
      indexes: [event.site],
    });
  } catch {
    return response(null, 503, origin);
  }
  return response(null, 204, origin);
}

export default {
  async fetch(request: CollectorRequest, env: CollectorEnv): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/collect") return new Response("Not found", { status: 404 });
    if (request.method === "OPTIONS") {
      const origin = request.headers.get("origin") ?? "*";
      return response(null, 204, origin, {
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
      });
    }
    if (request.method !== "POST") return response(null, 405, request.headers.get("origin") ?? undefined, { Allow: "POST, OPTIONS" });
    return collect(request, env);
  },
};
