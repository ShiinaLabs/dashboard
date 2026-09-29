import { afterEach, describe, expect, it, vi } from "vitest";
import { getTrafficSummary, parseTrafficSummary } from "../lib/integrations/cloudflare-analytics";

const config = {
  accountId: "account-id",
  apiToken: "test-token",
  dataset: "AnalyticsDataset",
  siteId: "site'key",
};

afterEach(() => vi.unstubAllGlobals());

describe("Cloudflare Analytics integration", () => {
  it("parses the configured site's PV, UV, and visit totals", () => {
    expect(parseTrafficSummary({ data: [{ views: "100", visitors: 25, visits: "40" }] })).toEqual({
      views: 100,
      visitors: 25,
      visits: 40,
    });
  });

  it("rejects a malformed Cloudflare response instead of reporting zero traffic", () => {
    expect(() => parseTrafficSummary({})).toThrow("unexpected response");
  });

  it("queries the 7-day summary and escapes the site key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{ views: "100", visitors: "25", visits: "40" }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getTrafficSummary(config)).resolves.toEqual({ views: 100, visitors: 25, visits: 40 });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.cloudflare.com/client/v4/accounts/account-id/analytics_engine/sql");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer test-token");
    expect(init.body).toContain("INTERVAL '7' DAY");
    expect(init.body).toContain("blob1 = 'site''key'");
  });

  it("surfaces Cloudflare API failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 })));
    await expect(getTrafficSummary(config)).rejects.toThrow("HTTP 503");
  });

  it("rejects an unsafe dataset identifier before making a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(getTrafficSummary({ ...config, dataset: "dataset; DROP TABLE" })).rejects.toThrow("SQL identifier");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
