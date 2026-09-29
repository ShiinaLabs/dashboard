import { beforeEach, describe, expect, it, vi } from "vitest";
import { cloudflareAnalyticsConfig, isMockMode } from "../lib/config";
import { getTrafficSummary } from "../lib/integrations/cloudflare-analytics";
import { getAnalyticsOverview } from "../lib/services/analytics";

vi.mock("../lib/config", () => ({
  cloudflareAnalyticsConfig: vi.fn(),
  isMockMode: vi.fn(),
}));
vi.mock("../lib/integrations/cloudflare-analytics", () => ({ getTrafficSummary: vi.fn() }));

const configured = {
  accountId: "account-id",
  apiToken: "test-token",
  dataset: "AnalyticsDataset",
  siteId: "site-key",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isMockMode).mockReturnValue(false);
});

describe("analytics service", () => {
  it("calls the Cloudflare integration for the configured site", async () => {
    vi.mocked(cloudflareAnalyticsConfig).mockReturnValue(configured);
    vi.mocked(getTrafficSummary).mockResolvedValue({ views: 100, visitors: 25, visits: 40 });

    await expect(getAnalyticsOverview()).resolves.toEqual({ period: "7d", views: 100, visitors: 25, visits: 40 });
    expect(getTrafficSummary).toHaveBeenCalledWith(configured);
  });

  it("returns local fixture totals in mock mode without Cloudflare config", async () => {
    vi.mocked(isMockMode).mockReturnValue(true);

    await expect(getAnalyticsOverview()).resolves.toEqual({ period: "7d", views: 12_842, visitors: 2_931, visits: 4_102 });
    expect(cloudflareAnalyticsConfig).not.toHaveBeenCalled();
    expect(getTrafficSummary).not.toHaveBeenCalled();
  });

  it("fails clearly when Cloudflare Analytics is not configured", async () => {
    vi.mocked(cloudflareAnalyticsConfig).mockReturnValue(null);
    await expect(getAnalyticsOverview()).rejects.toThrow("Cloudflare Analytics is not configured");
    expect(getTrafficSummary).not.toHaveBeenCalled();
  });
});
