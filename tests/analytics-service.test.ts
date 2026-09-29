import { beforeEach, describe, expect, it, vi } from "vitest";
import { analyticsPublicOrigin } from "../lib/config";
import { createAnalyticsSite, getAnalyticsAcquisitionForSite, getAnalyticsDashboardForSite, getAnalyticsInstallationForSite, getAnalyticsTrafficForSite, getAnalyticsSites } from "../lib/services/analytics";
import * as sitesRepo from "../lib/repositories/analytics-sites";
import * as eventsRepo from "../lib/repositories/analytics-events";

vi.mock("../lib/config", () => ({ analyticsPublicOrigin: vi.fn() }));
vi.mock("../lib/repositories/analytics-sites", () => ({
  getAnalyticsSites: vi.fn(), getAnalyticsSiteById: vi.fn(), getAnalyticsSiteByKey: vi.fn(), createAnalyticsSite: vi.fn(),
}));
vi.mock("../lib/repositories/analytics-events", () => ({ insertAnalyticsEvent: vi.fn(), getAnalyticsTrafficReport: vi.fn(), getAnalyticsAcquisitionReport: vi.fn(), getAnalyticsDashboardReport: vi.fn() }));

const siteA = { id: 10, owner_id: 1, name: "A", site_key: "site-a", host: "a.example", created_at: "now", updated_at: "now", deleted_at: null };
const trafficReport = {
  period: { days: 7 as const, timezone: "Asia/Tokyo" },
  overview: { views: 3, visitors: 1, visits: 2 },
  timeline: [],
  topPages: [],
};
const acquisitionReport = {
  period: { days: 7 as const, timezone: "Asia/Tokyo" },
  totalVisits: 5,
  referrers: [{ referrer: "", visits: 1 }, { referrer: "google.com", visits: 4 }],
  entryPages: [{ path: "/", visits: 2 }, { path: "/landing", visits: 3 }],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(analyticsPublicOrigin).mockReturnValue("https://dashboard.example");
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

  it("loads the traffic report for an owner and an admin", async () => {
    vi.mocked(eventsRepo.getAnalyticsTrafficReport).mockResolvedValue(trafficReport);
    await expect(getAnalyticsTrafficForSite(10, { id: 1, role: "user" }, "Asia/Tokyo")).resolves.toEqual(trafficReport);
    await getAnalyticsTrafficForSite(10, { id: 99, role: "admin" }, "Asia/Tokyo");
    expect(eventsRepo.getAnalyticsTrafficReport).toHaveBeenNthCalledWith(1, 10, "Asia/Tokyo");
    expect(eventsRepo.getAnalyticsTrafficReport).toHaveBeenNthCalledWith(2, 10, "Asia/Tokyo");
  });

  it("blocks foreign sites before querying events and reports missing sites", async () => {
    await expect(getAnalyticsTrafficForSite(10, { id: 2, role: "user" }, "UTC")).rejects.toMatchObject({ code: "forbidden" });
    expect(eventsRepo.getAnalyticsTrafficReport).not.toHaveBeenCalled();
    vi.mocked(sitesRepo.getAnalyticsSiteById).mockResolvedValue(undefined);
    await expect(getAnalyticsTrafficForSite(99, { id: 2, role: "user" }, "UTC")).rejects.toMatchObject({ code: "not_found" });
    expect(eventsRepo.getAnalyticsTrafficReport).not.toHaveBeenCalled();
  });

  it("loads acquisition reports for owners and admins", async () => {
    vi.mocked(eventsRepo.getAnalyticsAcquisitionReport).mockResolvedValue(acquisitionReport);
    await expect(getAnalyticsAcquisitionForSite(10, { id: 1, role: "user" }, "Asia/Tokyo")).resolves.toEqual(acquisitionReport);
    await expect(getAnalyticsAcquisitionForSite(10, { id: 99, role: "admin" }, "UTC")).resolves.toEqual(acquisitionReport);
    expect(eventsRepo.getAnalyticsAcquisitionReport).toHaveBeenNthCalledWith(1, 10, "Asia/Tokyo");
    expect(eventsRepo.getAnalyticsAcquisitionReport).toHaveBeenNthCalledWith(2, 10, "UTC");
  });

  it("blocks foreign acquisition access before querying the repository", async () => {
    await expect(getAnalyticsAcquisitionForSite(10, { id: 2, role: "user" }, "UTC")).rejects.toMatchObject({ code: "forbidden" });
    expect(eventsRepo.getAnalyticsAcquisitionReport).not.toHaveBeenCalled();
  });

  it.each([7, 30, 90])("loads the %i-day dashboard for an authorized site", async (days) => {
    const report = { period: { days, timezone: "Asia/Tokyo", startDate: "2026-09-01", endDate: "2026-09-30" } } as never;
    vi.mocked(eventsRepo.getAnalyticsDashboardReport).mockResolvedValue(report);
    await expect(getAnalyticsDashboardForSite(10, { id: 1, role: "user" }, "Asia/Tokyo", days)).resolves.toBe(report);
    expect(eventsRepo.getAnalyticsDashboardReport).toHaveBeenCalledWith(10, "Asia/Tokyo", days);
  });

  it("allows an admin to load a dashboard regardless of site ownership", async () => {
    vi.mocked(eventsRepo.getAnalyticsDashboardReport).mockResolvedValue({} as never);
    await expect(getAnalyticsDashboardForSite(10, { id: 99, role: "admin" }, "UTC", 7)).resolves.toEqual({});
    expect(eventsRepo.getAnalyticsDashboardReport).toHaveBeenCalledWith(10, "UTC", 7);
  });

  it("rejects unsupported dashboard ranges and invalid timezones before querying the repository", async () => {
    await expect(getAnalyticsDashboardForSite(10, { id: 1, role: "user" }, "UTC", 14)).rejects.toMatchObject({ code: "invalid_input" });
    await expect(getAnalyticsDashboardForSite(10, { id: 1, role: "user" }, "Not/AZone", 7)).rejects.toMatchObject({ code: "invalid_input" });
    expect(eventsRepo.getAnalyticsDashboardReport).not.toHaveBeenCalled();
  });

  it("blocks foreign dashboard access before querying the repository", async () => {
    await expect(getAnalyticsDashboardForSite(10, { id: 2, role: "user" }, "UTC", 7)).rejects.toMatchObject({ code: "forbidden" });
    expect(eventsRepo.getAnalyticsDashboardReport).not.toHaveBeenCalled();
  });

  it("rejects missing sites and invalid acquisition timezones before querying the repository", async () => {
    vi.mocked(sitesRepo.getAnalyticsSiteById).mockResolvedValue(undefined);
    await expect(getAnalyticsAcquisitionForSite(99, { id: 1, role: "user" }, "UTC")).rejects.toMatchObject({ code: "not_found" });
    vi.mocked(sitesRepo.getAnalyticsSiteById).mockResolvedValue(siteA);
    await expect(getAnalyticsAcquisitionForSite(10, { id: 1, role: "user" }, "Not/AZone")).rejects.toMatchObject({ code: "invalid_input" });
    expect(eventsRepo.getAnalyticsAcquisitionReport).not.toHaveBeenCalled();
  });

  it.each(["Not/AZone", "../../etc", "x".repeat(101)])("rejects invalid timezone %s", async (timezone) => {
    await expect(getAnalyticsTrafficForSite(10, { id: 1, role: "user" }, timezone)).rejects.toMatchObject({ code: "invalid_input" });
    expect(eventsRepo.getAnalyticsTrafficReport).not.toHaveBeenCalled();
  });

  it("propagates a traffic repository failure for the route to map", async () => {
    vi.mocked(eventsRepo.getAnalyticsTrafficReport).mockRejectedValue(new Error("database details"));
    await expect(getAnalyticsTrafficForSite(10, { id: 1, role: "user" }, "UTC")).rejects.toThrow("database details");
  });

  it("returns an escaped installation snippet to the owner and admin", async () => {
    const site = { ...siteA, site_key: "123e4567-e89b-42d3-a456-426614174000", host: "site.example" };
    vi.mocked(sitesRepo.getAnalyticsSiteById).mockResolvedValue(site);
    await expect(getAnalyticsInstallationForSite(10, { id: 1, role: "user" })).resolves.toEqual({
      trackerUrl: "https://dashboard.example/a/t.js",
      snippet: '<script defer src="https://dashboard.example/a/t.js" data-site-id="123e4567-e89b-42d3-a456-426614174000" data-site-host="site.example"></script>',
    });
    await expect(getAnalyticsInstallationForSite(10, { id: 99, role: "admin" })).resolves.toMatchObject({ trackerUrl: "https://dashboard.example/a/t.js" });
    expect(sitesRepo.getAnalyticsSiteById).toHaveBeenCalledWith(10);
  });

  it("blocks foreign installation access and reports missing site or collector config", async () => {
    await expect(getAnalyticsInstallationForSite(10, { id: 2, role: "user" })).rejects.toMatchObject({ code: "forbidden" });
    vi.mocked(sitesRepo.getAnalyticsSiteById).mockResolvedValue(undefined);
    await expect(getAnalyticsInstallationForSite(99, { id: 2, role: "user" })).rejects.toMatchObject({ code: "not_found" });
    vi.mocked(sitesRepo.getAnalyticsSiteById).mockResolvedValue(siteA);
    vi.mocked(analyticsPublicOrigin).mockReturnValue(null);
    await expect(getAnalyticsInstallationForSite(10, { id: 1, role: "user" })).rejects.toMatchObject({ code: "public_origin_not_configured" });
  });
});
