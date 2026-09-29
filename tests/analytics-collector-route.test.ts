import { beforeEach, describe, expect, it, vi } from "vitest";

const collectAnalyticsEvent = vi.hoisted(() => vi.fn());
vi.mock("../lib/services/analytics-collector", () => ({
  AnalyticsCollectorError: class AnalyticsCollectorError extends Error { constructor(readonly code: string) { super(code); } },
  collectAnalyticsEvent,
}));

import { action, loader } from "../app/a/e/route";
import { AnalyticsCollectorError } from "../lib/services/analytics-collector";

const body = JSON.stringify({ site: "key", host: "wifi-lens.app" });
const request = (method: string, init: RequestInit = {}) => new Request("https://dashboard.example/a/e", { method, ...init });
const args = (req: Request) => ({ request: req, params: {}, context: {} }) as never;

describe("public analytics event route", () => {
  beforeEach(() => vi.clearAllMocks());
  it("supports a cache-safe JSON POST without session cookies and only reflects valid Origins", async () => {
    collectAnalyticsEvent.mockResolvedValueOnce("recorded");
    const req = request("POST", { headers: { origin: "https://wifi-lens.app", "content-type": "application/json", cookie: "dash_session=ignored" }, body });
    const response = await action(args(req));
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://wifi-lens.app");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(collectAnalyticsEvent).toHaveBeenCalledWith(expect.objectContaining({
      payload: { site: "key", host: "wifi-lens.app" },
      origin: "https://wifi-lens.app",
    }));
  });

  it("enforces the body limit for streamed bodies without Content-Length", async () => {
    const oversized = new Request("https://dashboard.example/a/e", {
      method: "POST",
      headers: { origin: "https://wifi-lens.app" },
      body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(8193)); controller.close(); } }),
      duplex: "half",
    } as RequestInit);
    const response = await action(args(oversized));
    expect(response.status).toBe(413);
    expect(collectAnalyticsEvent).not.toHaveBeenCalled();
  });

  it("handles preflight without invoking the event service and rejects other methods", async () => {
    const preflight = await loader(args(request("OPTIONS", { headers: { origin: "https://wifi-lens.app" } })));
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-methods")).toBe("POST, OPTIONS");
    expect(preflight.headers.get("access-control-allow-origin")).toBe("https://wifi-lens.app");
    const method = await action(args(request("PUT", { body })));
    expect(method.status).toBe(405);
    expect(collectAnalyticsEvent).not.toHaveBeenCalled();
  });

  it("maps validation, unknown-site, and storage failures to HTTP responses", async () => {
    collectAnalyticsEvent.mockRejectedValueOnce(new AnalyticsCollectorError("invalid_payload"));
    expect((await action(args(request("POST", { body })))).status).toBe(400);
    collectAnalyticsEvent.mockRejectedValueOnce(new AnalyticsCollectorError("unknown_site"));
    expect((await action(args(request("POST", { headers: { origin: "https://wifi-lens.app" }, body })))).status).toBe(404);
    collectAnalyticsEvent.mockRejectedValueOnce(new Error("database unavailable"));
    expect((await action(args(request("POST", { headers: { origin: "https://wifi-lens.app" }, body })))).status).toBe(503);
  });

  it("maps site and Origin integrity failures to 403 and treats bot events as an empty 204", async () => {
    collectAnalyticsEvent.mockRejectedValueOnce(new AnalyticsCollectorError("host_mismatch"));
    expect((await action(args(request("POST", { headers: { origin: "https://wifi-lens.app" }, body })))).status).toBe(403);
    collectAnalyticsEvent.mockRejectedValueOnce(new AnalyticsCollectorError("origin_missing"));
    expect((await action(args(request("POST", { body })))).status).toBe(403);
    collectAnalyticsEvent.mockRejectedValueOnce(new AnalyticsCollectorError("origin_mismatch"));
    expect((await action(args(request("POST", { headers: { origin: "https://evil.example" }, body })))).status).toBe(403);
    collectAnalyticsEvent.mockResolvedValueOnce("bot");
    const botResponse = await action(args(request("POST", { headers: { origin: "https://wifi-lens.app" }, body })));
    expect(botResponse.status).toBe(204);
    expect(botResponse.headers.has("access-control-allow-origin")).toBe(false);
  });
});
