import { beforeEach, describe, expect, it, vi } from "vitest";
import { cloudflareAnalyticsConfig, isMockMode } from "../lib/config";
import { getTrafficSummary } from "../lib/integrations/cloudflare-analytics";
import { createAnalyticsSite, getAnalyticsOverviewForSite, getAnalyticsSites, AnalyticsSiteError } from "../lib/services/analytics";
import * as sitesRepo from "../lib/repositories/analytics-sites";

vi.mock("../lib/config", () => ({ cloudflareAnalyticsConfig: vi.fn(), isMockMode: vi.fn() }));
vi.mock("../lib/integrations/cloudflare-analytics", () => ({ getTrafficSummary: vi.fn() }));
vi.mock("../lib/repositories/analytics-sites", () => ({
  getAnalyticsSites: vi.fn(), getAnalyticsSiteById: vi.fn(), createAnalyticsSite: vi.fn(),
}));

const configured = { accountId: "account-id", apiToken: "test-token", dataset: "AnalyticsDataset" };
const siteA = { id: 10, owner_id: 1, name: "A", site_key: "site-a", host: "a.example", created_at: "now", updated_at: "now", deleted_at: null };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isMockMode).mockReturnValue(false);
  vi.mocked(cloudflareAnalyticsConfig).mockReturnValue(configured);
  vi.mocked(sitesRepo.getAnalyticsSiteById).mockResolvedValue(siteA);
});

describe("analytics service", () => {
  it("keeps site lists owner-scoped through the repository", async () => {
    vi.mocked(sitesRepo.getAnalyticsSites).mockResolvedValue([siteA]);
    await expect(getAnalyticsSites(1)).resolves.toMatchObject([{ id: 10, name: "A" }]);
    expect(sitesRepo.getAnalyticsSites).toHaveBeenCalledWith(1);
  });

  it("creates a site for the supplied session owner and normalizes its host", async () => {
    vi.mocked(sitesRepo.createAnalyticsSite).mockImplementation(async (row) => ({ ...siteA, ...row }));
    await createAnalyticsSite(7, { name: "  New Site ", siteKey: " key ", host: "HTTPS://Example.COM/" });
    expect(sitesRepo.createAnalyticsSite).toHaveBeenCalledWith({ owner_id: 7, name: "New Site", site_key: "key", host: "example.com" });
  });

  it("rejects incomplete or path-bearing site input", async () => {
    await expect(createAnalyticsSite(7, { name: "", siteKey: "x", host: "x.example" })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(createAnalyticsSite(7, { name: "x", siteKey: "x", host: "x.example/path" })).rejects.toMatchObject({ code: "invalid_input" });
    expect(sitesRepo.createAnalyticsSite).not.toHaveBeenCalled();
  });

  it("queries the selected site's key for its owner and admin", async () => {
    vi.mocked(getTrafficSummary).mockResolvedValue({ views: 100, visitors: 25, visits: 40 });
    await expect(getAnalyticsOverviewForSite(10, { id: 1, role: "user" })).resolves.toEqual({ period: "7d", views: 100, visitors: 25, visits: 40 });
    await getAnalyticsOverviewForSite(10, { id: 99, role: "admin" });
    expect(getTrafficSummary).toHaveBeenNthCalledWith(1, configured, "site-a");
    expect(getTrafficSummary).toHaveBeenNthCalledWith(2, configured, "site-a");
  });

  it("blocks foreign sites before querying Cloudflare and reports missing sites", async () => {
    vi.mocked(getTrafficSummary).mockResolvedValue({ views: 0, visitors: 0, visits: 0 });
    await expect(getAnalyticsOverviewForSite(10, { id: 2, role: "user" })).rejects.toBeInstanceOf(AnalyticsSiteError);
    expect(getTrafficSummary).not.toHaveBeenCalled();
    vi.mocked(sitesRepo.getAnalyticsSiteById).mockResolvedValue(undefined);
    await expect(getAnalyticsOverviewForSite(99, { id: 2, role: "user" })).rejects.toMatchObject({ code: "not_found" });
  });

  it("returns mock totals without requiring Cloudflare configuration", async () => {
    vi.mocked(isMockMode).mockReturnValue(true);
    await expect(getAnalyticsOverviewForSite(10, { id: 1, role: "admin" })).resolves.toEqual({ period: "7d", views: 12_842, visitors: 2_931, visits: 4_102 });
    expect(cloudflareAnalyticsConfig).not.toHaveBeenCalled();
    expect(getTrafficSummary).not.toHaveBeenCalled();
  });
});
