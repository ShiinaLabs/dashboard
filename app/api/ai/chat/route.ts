import { json } from "@/lib/api-server";
import type { ActionFunctionArgs } from "react-router";
import { runAgentStream, type ChatMessage } from "@/lib/services/ai-analysis";
import { aiConfig, isMockMode } from "@/lib/config";
import { requireSession } from "@/lib/auth-helpers";

// ── Rate limiting ─────────────────────────────────────────────────
// Per-user: max N requests per minute window.
// NOTE: In-memory Map — per-process only. For multi-instance deployments,
// consider using Redis or a shared store for consistent rate limiting.
const rateLimitMap = new Map<number, { count: number; resetAt: number }>();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_REQUESTS = 10;

function checkRateLimit(userId: number): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_MAX_REQUESTS) return false;
  entry.count++;
  return true;
}

// ── Request limits ────────────────────────────────────────────────
const MAX_MESSAGES = 50;
const MAX_MESSAGE_CONTENT_LENGTH = 4000;
const MAX_BODY_SIZE_BYTES = 256 * 1024; // 256 KB

async function POST(req: Request) {
  const auth = await requireSession(req);
  if (!auth) return json({ error: "Unauthorized" }, { status: 401 });

  if (!isMockMode()) {
    const config = aiConfig();
    if (!config.baseUrl && !config.apiKey) {
      return json({ error: "AI not configured. Contact admin." }, { status: 503 });
    }
  }

  // Rate limit check
  if (!checkRateLimit(auth.user.id)) {
    return json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  try {
    // Body size check (read as text first to enforce limit)
    const rawBody = await req.text();
    if (rawBody.length > MAX_BODY_SIZE_BYTES) {
      return json({ error: "Request body too large" }, { status: 413 });
    }

    let body: { messages?: unknown };
    try {
      body = JSON.parse(rawBody);
    } catch {
      return json({ error: "Invalid JSON" }, { status: 400 });
    }

    const messages = body.messages as ChatMessage[];

    if (!Array.isArray(messages) || messages.length === 0) {
      return json({ error: "messages array is required" }, { status: 400 });
    }

    // Message count limit
    if (messages.length > MAX_MESSAGES) {
      return json({ error: `Too many messages. Maximum is ${MAX_MESSAGES}.` }, { status: 400 });
    }

    // Validate message format and length
    for (const m of messages) {
      if (m.role !== "user" && m.role !== "assistant") {
        return json({ error: "Invalid message role" }, { status: 400 });
      }
      if (typeof m.content !== "string" || !m.content.trim()) {
        return json({ error: "Invalid message content" }, { status: 400 });
      }
      if (m.content.length > MAX_MESSAGE_CONTENT_LENGTH) {
        return json({ error: `Message content too long. Maximum is ${MAX_MESSAGE_CONTENT_LENGTH} characters.` }, { status: 400 });
      }
    }

    const { stream } = await runAgentStream(auth.user.id, messages);

    // Return as streaming text response
    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Daily token limit exceeded")) {
      return json({ error: msg }, { status: 429 });
    }
    if (msg.includes("AI not configured")) {
      return json({ error: msg }, { status: 503 });
    }
    return json({ error: msg }, { status: 500 });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method === "POST") return POST(request);
  return json({ error: "Method not allowed" }, { status: 405 });
}
