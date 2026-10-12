import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getApps, listConnections } from "../lib/repositories/app-store";
import { getAppStoreAnalyticsDashboard, listEnabledAnalyticsApps } from "../lib/services/app-store-analytics-reporting";
import { readAnalyticsFacts } from "../lib/repositories/app-store-facts";
import { analyticsCompleteThrough } from "../lib/services/app-store-analytics-reporting";

vi.mock("../lib/repositories/app-store", () => ({ getApps: vi.fn(), listConnections: vi.fn() }));
vi.mock("../lib/repositories/app-store-facts", () => ({ readAnalyticsFacts: vi.fn() }));
const viewer = { id: 1, role: "user" };
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("MOCK_DATA", "1");
  vi.mocked(listConnections).mockResolvedValue([{ id: 1, is_active: true }, { id: 2, is_active: false }] as never);
  vi.mocked(getApps).mockResolvedValue([{ id: 1, name: "Enabled", is_enabled: true }, { id: 2, name: "Disabled", is_enabled: false }] as never);
});
afterEach(() => vi.unstubAllEnvs());

describe("ASC Analytics filters and missing values", () => {
  it("plots confirmed empty dates as zero, preserves uncovered dates as null, and reports partial app coverage", async () => {
    vi.stubEnv("MOCK_DATA", "0");
    vi.mocked(getApps).mockResolvedValue([{ id: 1, name: "Enabled", is_enabled: true }] as never);
    const rows = [
      { id: 1, app_id: 1, date: "2026-10-01", event: "Impression", page_type: "Product page", source_type: "Search", territory: "USA", counts: "5", unique_counts: null },
      { id: 2, app_id: 1, date: "2026-10-03", event: "Impression", page_type: "Product page", source_type: "Search", territory: "USA", counts: "3", unique_counts: null },
    ];
    const partition = (app_id: number, date: string) => ({ id: app_id * 10, app_id, report_kind: "discovery", date, granularity: "DAILY", source_instance_id: `i-${app_id}-${date}`, processing_date: "2026-10-06", coverage_source: "daily_complete", updated_at: date });
    vi.mocked(readAnalyticsFacts).mockResolvedValue({ discovery: rows, downloads: [], purchases: [], subscriptionState: [], subscriptionEvent: [], partitions: ["2026-10-01", "2026-10-02", "2026-10-03"].map((date) => partition(1, date)) } as never);
    let dashboard = await getAppStoreAnalyticsDashboard(viewer, { appId: 1, from: "2026-10-01", to: "2026-10-03" });
    expect(dashboard.trend.map((row) => row.impressions)).toEqual([5, 0, 3]);

    vi.mocked(readAnalyticsFacts).mockResolvedValue({ discovery: rows, downloads: [], purchases: [], subscriptionState: [], subscriptionEvent: [], partitions: [partition(1, "2026-10-01"), partition(1, "2026-10-03")] } as never);
    dashboard = await getAppStoreAnalyticsDashboard(viewer, { appId: 1, from: "2026-10-01", to: "2026-10-03" });
    expect(dashboard.trend.map((row) => row.impressions)).toEqual([5, null, 3]);

    vi.mocked(getApps).mockResolvedValue([{ id: 1, name: "Enabled", is_enabled: true }, { id: 2, name: "Second", is_enabled: true }] as never);
    vi.mocked(readAnalyticsFacts).mockResolvedValue({ discovery: [], downloads: [], purchases: [], subscriptionState: [], subscriptionEvent: [], partitions: [partition(1, "2026-10-01"), partition(2, "2026-10-01"), partition(1, "2026-10-02"), partition(1, "2026-10-03"), partition(2, "2026-10-03")] } as never);
    dashboard = await getAppStoreAnalyticsDashboard(viewer, { from: "2026-10-01", to: "2026-10-03" });
    expect(dashboard.trend.map((row) => row.impressions)).toEqual([0, 0, 0]);
    expect(dashboard.trend[1].coverage.impressions).toMatchObject({ state: "partial", reportingApps: 1, totalApps: 2 });

    vi.mocked(getApps).mockResolvedValue([{ id: 1, name: "Enabled", is_enabled: true }] as never);
    vi.mocked(readAnalyticsFacts).mockResolvedValue({ discovery: [], downloads: [], purchases: [], subscriptionState: [], subscriptionEvent: [], partitions: [{ ...partition(1, "2026-10-03"), coverage_source: "facts", processing_date: "2026-10-04" }] } as never);
    dashboard = await getAppStoreAnalyticsDashboard(viewer, { appId: 1, from: "2026-10-03", to: "2026-10-03" });
    expect(dashboard.trend[0].impressions).toBeNull();
  });

  it("routes mock facts through the same projection and keeps zero, partial, and unpublished dates distinct", async () => {
    const dashboard = await getAppStoreAnalyticsDashboard(viewer, { appId: 1, from: "2026-09-20", to: "2026-09-26" });
    expect(dashboard.trend.some((row) => row.impressions === 0)).toBe(true);
    expect(dashboard.trend.at(-1)?.impressions).toBeNull();
    expect(readAnalyticsFacts).not.toHaveBeenCalled();
  });

  it("scopes enabled app options to accessible active connections", async () => {
    vi.stubEnv("MOCK_DATA", "0");
    expect(await listEnabledAnalyticsApps(viewer)).toEqual([{ id: 1, name: "Enabled" }]);
    expect(listConnections).toHaveBeenCalledWith(1);
    expect(getApps).toHaveBeenCalledTimes(1);
    await listEnabledAnalyticsApps({ id: 3, role: "admin" });
    expect(listConnections).toHaveBeenLastCalledWith(undefined);
  });

  it.each([
    { from: "2026-10-01", to: "2026-09-30" },
    { from: "2026-01-01", to: "2026-10-01" },
    { from: "not-a-date", to: "2026-10-01" },
    { from: "2026-02-30", to: "2026-03-01" },
  ])("rejects invalid or unsupported date ranges %j", async (input) => {
    await expect(getAppStoreAnalyticsDashboard(viewer, input)).rejects.toMatchObject({ status: 400 });
  });

  it("does not return disabled apps or synthesize zeros when no enabled apps exist", async () => {
    vi.stubEnv("MOCK_DATA", "0");
    await expect(getAppStoreAnalyticsDashboard(viewer, { appId: 2, from: "2026-10-01", to: "2026-10-02" })).rejects.toMatchObject({ status: 403 });
    vi.mocked(getApps).mockResolvedValue([]);
    const dashboard = await getAppStoreAnalyticsDashboard(viewer, { from: "2026-10-01", to: "2026-10-02" });
    expect(Object.values(dashboard.overview).every((value) => value === null)).toBe(true);
    expect(dashboard.updatedAt).toBeNull();
    expect(dashboard.completeThrough).toBeNull();
  });

  it("keeps partial All Apps sums and exposes app coverage without treating missing apps as zero", async () => {
    vi.stubEnv("MOCK_DATA", "0");
    vi.mocked(getApps).mockResolvedValue([{ id: 1, name: "First", is_enabled: true }, { id: 2, name: "Second", is_enabled: true }] as never);
    vi.mocked(readAnalyticsFacts).mockResolvedValue({
      discovery: [{ app_id: 1, date: "2026-10-01", territory: "USA", source_type: null, event: "Impression", page_type: null, counts: "12", unique_counts: null }],
      downloads: [],
      partitions: [{ app_id: 1, report_kind: "discovery", date: "2026-10-01", processing_date: "2026-10-04", coverage_source: "daily_complete" }],
    } as never);
    const dashboard = await getAppStoreAnalyticsDashboard(viewer, { from: "2026-10-01", to: "2026-10-01" });
    expect(dashboard.overview.impressions).toBe(12);
    expect(dashboard.coverage.impressions).toEqual({ state: "partial", reportingApps: 1, totalApps: 2, reportingAppDays: 1, totalAppDays: 2 });
    expect(dashboard.overview.downloads).toBeNull();
    expect(dashboard.coverage.downloads).toEqual({ state: "unknown", reportingApps: 0, totalApps: 2, reportingAppDays: 0, totalAppDays: 2 });
    expect(dashboard.trend[0].coverage.impressions).toEqual({ state: "partial", reportingApps: 1, totalApps: 2, reportingAppDays: 1, totalAppDays: 2 });
    expect(dashboard.completeThrough).toBeNull();
  });

  it("marks a range partial when every app reported at least once but some app-days are missing", async () => {
    vi.stubEnv("MOCK_DATA", "0");
    vi.mocked(getApps).mockResolvedValue([{ id: 1, name: "First", is_enabled: true }, { id: 2, name: "Second", is_enabled: true }] as never);
    const discoveryPartitions = [
      { app_id: 1, report_kind: "discovery", date: "2026-10-01", processing_date: "2026-10-05", coverage_source: "daily_complete" },
      { app_id: 1, report_kind: "discovery", date: "2026-10-02", processing_date: "2026-10-05", coverage_source: "daily_complete" },
      { app_id: 2, report_kind: "discovery", date: "2026-10-01", processing_date: "2026-10-05", coverage_source: "daily_complete" },
    ];
    vi.mocked(readAnalyticsFacts).mockResolvedValue({ discovery: [{ app_id: 1, date: "2026-10-01", territory: "USA", source_type: "App Store Search", event: "Impression", page_type: null, counts: "5", unique_counts: null }], downloads: [], partitions: discoveryPartitions } as never);
    const dashboard = await getAppStoreAnalyticsDashboard(viewer, { from: "2026-10-01", to: "2026-10-02" });
    expect(dashboard.coverage.impressions).toEqual({ state: "partial", reportingApps: 2, totalApps: 2, reportingAppDays: 3, totalAppDays: 4 });
    expect(dashboard.acquisition[0].coverage.impressions.reportingAppDays).toBe(3);
    expect(dashboard.trend[0].coverage.impressions).toEqual({ state: "complete", reportingApps: 2, totalApps: 2, reportingAppDays: 2, totalAppDays: 2 });
    expect(dashboard.trend[1].coverage.impressions).toEqual({ state: "partial", reportingApps: 1, totalApps: 2, reportingAppDays: 1, totalAppDays: 2 });
  });

  it("advances complete-through only when all enabled apps and required reports are complete", () => {
    const partitions = [1, 2].flatMap((app_id) => ["discovery", "downloads"].map((report_kind) => ({ app_id, report_kind, date: "2026-10-01", processing_date: "2026-10-04", coverage_source: "daily_complete" })));
    expect(analyticsCompleteThrough(partitions, [1, 2], ["discovery", "downloads"], "2026-10-01", "2026-10-01")).toBe("2026-10-01");
    expect(analyticsCompleteThrough(partitions.filter((row) => row.app_id === 1), [1, 2], ["discovery", "downloads"], "2026-10-01", "2026-10-01")).toBeNull();
  });
});
