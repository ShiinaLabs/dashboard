import { describe, expect, it, vi } from "vitest";
import worker from "../analytics/collector/src/index";

const site = "123e4567-e89b-42d3-a456-426614174000";
const payload = {
  site,
  host: "wifi-lens.app",
  path: "/pricing",
  referrer: "https://www.google.com/search?q=private-query",
  visitor: true,
  visit: false,
};

function makeRequest(body: unknown = payload, headers: Record<string, string> = {}) {
  const request = new Request("https://collector.example/collect", {
    method: "POST",
    headers: { "content-type": "text/plain;charset=UTF-8", origin: "https://wifi-lens.app", "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36", "cf-connecting-ip": "203.0.113.40", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as Request & { cf?: { country?: string } };
  request.cf = { country: "US" };
  return request;
}

function binding() {
  return { writeDataPoint: vi.fn() };
}

describe("analytics collector", () => {
  it("writes the compatible event schema and stores only normalized privacy-safe values", async () => {
    const analytics = binding();
    const response = await worker.fetch(makeRequest(), { ANALYTICS: analytics });
    expect(response.status).toBe(204);
    expect(analytics.writeDataPoint).toHaveBeenCalledOnce();
    const event = analytics.writeDataPoint.mock.calls[0][0];
    expect(event.blobs).toHaveLength(8);
    expect(event.blobs).toEqual([
      site, "wifi-lens.app", "/pricing", "www.google.com", "macOS", "Chrome", "US", "Desktop",
    ]);
    expect(event.doubles).toEqual([1, 0]);
    expect(event.indexes).toEqual([site]);
    expect(JSON.stringify(event)).not.toContain("203.0.113.40");
    expect(JSON.stringify(event)).not.toContain("Mozilla/5.0");
    expect(event.blobs[3]).not.toContain("/search");
  });

  it("drops bot events without failing the request", async () => {
    const analytics = binding();
    const response = await worker.fetch(makeRequest(payload, { "user-agent": "Googlebot/2.1 (+http://www.google.com/bot.html)" }), { ANALYTICS: analytics });
    expect(response.status).toBe(204);
    expect(analytics.writeDataPoint).not.toHaveBeenCalled();
  });

  it("stores an empty referrer for same-site navigation", async () => {
    const analytics = binding();
    const sameSite = { ...payload, referrer: "https://wifi-lens.app/private?token=ignored" };
    await worker.fetch(makeRequest(sameSite), { ANALYTICS: analytics });
    expect(analytics.writeDataPoint.mock.calls[0][0].blobs[3]).toBe("");
  });

  it("rejects invalid site IDs and mismatched Origins without writing", async () => {
    const analytics = binding();
    const invalidId = await worker.fetch(makeRequest({ ...payload, site: "not-a-uuid" }), { ANALYTICS: analytics });
    expect(invalidId.status).toBe(400);
    const mismatch = await worker.fetch(makeRequest(payload, { origin: "https://evil.example" }), { ANALYTICS: analytics });
    expect(mismatch.status).toBe(403);
    expect(analytics.writeDataPoint).not.toHaveBeenCalled();
  });

  it("limits the body and only handles the collector endpoint", async () => {
    const analytics = binding();
    const tooLarge = await worker.fetch(makeRequest("x".repeat(8 * 1024 + 1)), { ANALYTICS: analytics });
    expect(tooLarge.status).toBe(413);
    const wrongPath = await worker.fetch(new Request("https://collector.example/other"), { ANALYTICS: analytics });
    expect(wrongPath.status).toBe(404);
    const wrongMethod = await worker.fetch(new Request("https://collector.example/collect", { method: "GET" }), { ANALYTICS: analytics });
    expect(wrongMethod.status).toBe(405);
    const preflight = await worker.fetch(new Request("https://collector.example/collect", { method: "OPTIONS", headers: { origin: "https://wifi-lens.app" } }), { ANALYTICS: analytics });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-methods")).toBe("POST, OPTIONS");
    expect(analytics.writeDataPoint).not.toHaveBeenCalled();
  });
});
