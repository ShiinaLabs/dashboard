import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { AnalyticsCollectorError, collectAnalyticsEvent } from "@/lib/services/analytics-collector";

const MAX_BODY_BYTES = 8 * 1024;

function response(status: number, origin?: string | null): Response {
  const headers = new Headers({ "Cache-Control": "no-store", Vary: "Origin" });
  if (origin) headers.set("Access-Control-Allow-Origin", origin);
  return new Response(null, { status, headers });
}

function preflightOrigin(value: string | null): string | null {
  if (!value) return null;
  try {
    const origin = new URL(value);
    if ((origin.protocol !== "https:" && origin.protocol !== "http:") || origin.username || origin.password
      || origin.pathname !== "/" || origin.search || origin.hash) return null;
    return origin.origin;
  } catch {
    return null;
  }
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

export async function loader({ request }: LoaderFunctionArgs) {
  if (request.method === "OPTIONS") return options(request);
  return new Response("Method not allowed", { status: 405, headers: { Allow: "POST, OPTIONS" } });
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method === "OPTIONS") return options(request);
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { Allow: "POST, OPTIONS" } });

  const body = await readBody(request);
  if (body.tooLarge) return response(413);
  if (body.invalid) return response(400);
  let payload: unknown;
  try {
    payload = JSON.parse(body.text ?? "");
  } catch {
    return response(400);
  }

  const origin = request.headers.get("origin");
  try {
    const outcome = await collectAnalyticsEvent({
      payload,
      origin,
      userAgent: request.headers.get("user-agent"),
      country: request.headers.get("cf-ipcountry"),
    });
    return response(204, outcome === "recorded" && origin ? new URL(origin).origin : null);
  } catch (error) {
    if (error instanceof AnalyticsCollectorError) {
      if (error.code === "unknown_site") return response(404);
      if (error.code === "host_mismatch" || error.code === "origin_missing" || error.code === "origin_mismatch") return response(403);
      return response(400);
    }
    return response(503);
  }
}

function options(request: Request): Response {
  const origin = preflightOrigin(request.headers.get("origin"));
  const headers = new Headers({
    "Cache-Control": "no-store",
    Vary: "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  if (origin) headers.set("Access-Control-Allow-Origin", origin);
  return new Response(null, { status: 204, headers });
}
