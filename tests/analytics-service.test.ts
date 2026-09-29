import { beforeEach, describe, expect, it, vi } from "vitest";
import { analyticsCollectorUrl, cloudflareAnalyticsConfig, isMockMode } from "../lib/config";
import { getTrafficSummary } from "../lib/integrations/cloudflare-analytics";
import { createAnalyticsSite, getAnalyticsInstallationForSite, getAnalyticsOverviewForSite, getAnalyticsSites, AnalyticsSiteError } from "../lib/services/analytics";
import * as sitesRepo from "../lib/repositories/analytics-sites";

vi.mock("../lib/config", () => ({ analyticsCollectorUrl: vi.fn(), cloudflareAnalyticsConfig: vi.fn(), isMockMode: vi.fn() }));
vi.mock("../lib/integrations/cloudflare-analytics", () => ({ getTrafficSummary: vi.fn() }));
vi.mock("../lib/repositories/analytics-sites", () => ({
  getAnalyticsSites: vi.fn(), getAnalyticsSiteById: vi.fn(), createAnalyticsSite: vi.fn(),
}));

const configured = { accountId: "account-id", apiToken: "test-token", dataset: "AnalyticsDataset" };
const siteA = { id: 10, owner_id: 1, name: "A", site_key: "site-a", host: "a.example", created_at: "now", updated_at: "now", deleted_at: null };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isMockMode).mockReturnValue(false);
  vi.mocked(analyticsCollectorUrl).mockReturnValue("https://collector.example");
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
    const first = await createAnalyticsSite(7, { name: "  New Site ", host: "HTTPS://Example.COM/" });
    const second = await createAnalyticsSite(7, { name: "Another Site", host: "another.example" });
    expect(first.site_key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(second.site_key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(first.site_key).not.toBe(second.site_key);
    expect(sitesRepo.createAnalyticsSite).toHaveBeenNthCalledWith(1, {
      owner_id: 7, name: "New Site", site_key: first.site_key, host: "example.com",
    });
    expect(sitesRepo.createAnalyticsSite).toHaveBeenNthCalledWith(2, {
      owner_id: 7, name: "Another Site", site_key: second.site_key, host: "another.example",
    });
  });

  it("rejects incomplete or path-bearing site input", async () => {
    await expect(createAnalyticsSite(7, { name: "", host: "x.example" })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(createAnalyticsSite(7, { name: "x", host: "x.example/path" })).rejects.toMatchObject({ code: "invalid_input" });
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

  it("returns an escaped installation snippet to the owner and admin", async () => {
    const site = { ...siteA, site_key: "123e4567-e89b-42d3-a456-426614174000", host: "site.example" };
    vi.mocked(sitesRepo.getAnalyticsSiteById).mockResolvedValue(site);
    await expect(getAnalyticsInstallationForSite(10, { id: 1, role: "user" })).resolves.toEqual({
      trackerUrl: "https://collector.example/tracker.js",
      snippet: '<script defer src="https://collector.example/tracker.js" data-site-id="123e4567-e89b-42d3-a456-426614174000" data-site-host="site.example"></script>',
    });
    await expect(getAnalyticsInstallationForSite(10, { id: 99, role: "admin" })).resolves.toMatchObject({ trackerUrl: "https://collector.example/tracker.js" });
    expect(sitesRepo.getAnalyticsSiteById).toHaveBeenCalledWith(10);
  });

  it("blocks foreign installation access and reports missing site or collector config", async () => {
    await expect(getAnalyticsInstallationForSite(10, { id: 2, role: "user" })).rejects.toMatchObject({ code: "forbidden" });
    vi.mocked(sitesRepo.getAnalyticsSiteById).mockResolvedValue(undefined);
    await expect(getAnalyticsInstallationForSite(99, { id: 2, role: "user" })).rejects.toMatchObject({ code: "not_found" });
    vi.mocked(sitesRepo.getAnalyticsSiteById).mockResolvedValue(siteA);
    vi.mocked(analyticsCollectorUrl).mockReturnValue(null);
    await expect(getAnalyticsInstallationForSite(10, { id: 1, role: "user" })).rejects.toMatchObject({ code: "collector_not_configured" });
  });
});
