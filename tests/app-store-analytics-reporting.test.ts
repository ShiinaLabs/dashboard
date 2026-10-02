import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getApps, listConnections } from "../lib/repositories/app-store";
import { getAppStoreAnalyticsDashboard, listEnabledAnalyticsApps } from "../lib/services/app-store-analytics-reporting";

vi.mock("../lib/repositories/app-store", () => ({ getApps: vi.fn(), listConnections: vi.fn() }));
const viewer = { id: 1, role: "user" };
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("MOCK_DATA", "1");
  vi.mocked(listConnections).mockResolvedValue([{ id: 1, is_active: true }, { id: 2, is_active: false }] as never);
  vi.mocked(getApps).mockResolvedValue([{ id: 1, name: "Enabled", is_enabled: true }, { id: 2, name: "Disabled", is_enabled: false }] as never);
});
afterEach(() => vi.unstubAllEnvs());

describe("ASC Analytics filters and missing values", () => {
  it("scopes enabled app options to accessible active connections", async () => {
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
    await expect(getAppStoreAnalyticsDashboard(viewer, { appId: 2, from: "2026-10-01", to: "2026-10-02" })).rejects.toMatchObject({ status: 403 });
    vi.mocked(getApps).mockResolvedValue([]);
    const dashboard = await getAppStoreAnalyticsDashboard(viewer, { from: "2026-10-01", to: "2026-10-02" });
    expect(Object.values(dashboard.overview).every((value) => value === null)).toBe(true);
    expect(dashboard.updatedAt).toBeNull();
    expect(dashboard.completeThrough).toBeNull();
  });
});
