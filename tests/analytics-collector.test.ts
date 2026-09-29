import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAnalyticsSiteByKey, insertAnalyticsEvent } = vi.hoisted(() => ({
  getAnalyticsSiteByKey: vi.fn(),
  insertAnalyticsEvent: vi.fn(),
}));

vi.mock("../lib/repositories/analytics-sites", () => ({ getAnalyticsSiteByKey }));
vi.mock("../lib/repositories/analytics-events", () => ({ insertAnalyticsEvent }));

import { AnalyticsCollectorError, collectAnalyticsEvent } from "../lib/services/analytics-collector";

const siteKey = "123e4567-e89b-42d3-a456-426614174000";
const validPayload = {
  site: siteKey,
  host: "wifi-lens.app",
  path: "/pricing",
  referrer: "https://www.google.com/search?q=private-query",
  visitor: true,
  visit: false,
};

describe("analytics collector application service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAnalyticsSiteByKey.mockResolvedValue({ id: 7, site_key: siteKey, host: "wifi-lens.app", deleted_at: null });
  });

  it("records only normalized event fields for a registered site and matching Origin", async () => {
    await expect(collectAnalyticsEvent({
      payload: validPayload,
      origin: "https://wifi-lens.app",
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36",
      country: "us",
    })).resolves.toBe("recorded");

    expect(getAnalyticsSiteByKey).toHaveBeenCalledWith(siteKey);
    expect(insertAnalyticsEvent).toHaveBeenCalledOnce();
    expect(insertAnalyticsEvent).toHaveBeenCalledWith({
      site_id: 7,
      path: "/pricing",
      referrer_host: "www.google.com",
      os: "macOS",
      browser: "Chrome",
      country: "US",
      device_type: "Desktop",
      visitor: true,
      visit: false,
    });
    const stored = JSON.stringify(insertAnalyticsEvent.mock.calls[0][0]);
    expect(stored).not.toContain("private-query");
    expect(stored).not.toContain("Mozilla/5.0");
    expect(stored).not.toContain("203.0.113.40");
  });

  it("requires an existing site key and rejects payload or Origin host mismatches", async () => {
    getAnalyticsSiteByKey.mockResolvedValueOnce(undefined);
    await expect(collectAnalyticsEvent({ payload: validPayload, origin: "https://wifi-lens.app" }))
      .rejects.toMatchObject({ code: "unknown_site" });
    await expect(collectAnalyticsEvent({ payload: { ...validPayload, host: "evil.example" }, origin: "https://evil.example" }))
      .rejects.toMatchObject({ code: "host_mismatch" });
    await expect(collectAnalyticsEvent({ payload: validPayload, origin: "https://evil.example" }))
      .rejects.toMatchObject({ code: "origin_mismatch" });
    await expect(collectAnalyticsEvent({ payload: validPayload, origin: null }))
      .rejects.toMatchObject({ code: "origin_missing" });
    expect(insertAnalyticsEvent).not.toHaveBeenCalled();
  });

  it("rejects invalid event fields and drops bots without persistence", async () => {
    await expect(collectAnalyticsEvent({ payload: { ...validPayload, path: "/?secret=1" }, origin: "https://wifi-lens.app" }))
      .rejects.toBeInstanceOf(AnalyticsCollectorError);
    await expect(collectAnalyticsEvent({
      payload: validPayload,
      origin: "https://wifi-lens.app",
      userAgent: "Googlebot/2.1 (+http://www.google.com/bot.html)",
    })).resolves.toBe("bot");
    expect(insertAnalyticsEvent).not.toHaveBeenCalled();
  });

  it("omits same-site referrers and uses Unknown for absent or invalid country", async () => {
    await collectAnalyticsEvent({
      payload: { ...validPayload, referrer: "https://wifi-lens.app/private?token=secret" },
      origin: "https://wifi-lens.app",
      country: "XX1",
    });
    expect(insertAnalyticsEvent).toHaveBeenCalledWith(expect.objectContaining({ referrer_host: "", country: "Unknown" }));
  });
});
