import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listConnections: vi.fn(), getLatestRunForSource: vi.fn(), recoverStaleRuns: vi.fn(), pruneFinishedRuns: vi.fn(), analytics: vi.fn(), revenue: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn(),
}));
vi.mock("../lib/config", () => ({ isMockMode: () => false }));
vi.mock("../lib/logger", () => ({ getLogger: () => mocks }));
vi.mock("../lib/repositories/app-store", () => ({ listConnections: mocks.listConnections, getLatestRunForSource: mocks.getLatestRunForSource, recoverStaleRuns: mocks.recoverStaleRuns, pruneFinishedRuns: mocks.pruneFinishedRuns }));
vi.mock("../lib/services/app-store-sync", () => ({ syncAppStoreAnalyticsForConnection: mocks.analytics, syncAppStoreRevenueForConnection: mocks.revenue }));
vi.mock("../shared/app-store-revenue", () => ({ latestSalesReportDate: () => "2026-10-01" }));

import { runAppStoreSchedulerTick } from "../lib/scheduler/app-store";

const now = Date.parse("2026-10-02T00:00:00Z");
const connection = { id: 8, is_active: true, updated_at: "v1" };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.listConnections.mockResolvedValue([connection, { ...connection, id: 9, is_active: false }]);
  mocks.getLatestRunForSource.mockImplementation(async (_id: number, kind: string, scope: string) => ({ started_at: new Date(now - 60 * 60 * 1000).toISOString(), status: "running", kind, scope, error_message: null }));
  mocks.recoverStaleRuns.mockResolvedValue(0);
  mocks.pruneFinishedRuns.mockResolvedValue(0);
  mocks.analytics.mockResolvedValue({ status: "success" });
  mocks.revenue.mockResolvedValue({ status: "success" });
});

describe("ASC scheduler tick", () => {
  it("recovers stale runs and skips not-due or already-running sources", async () => {
    await runAppStoreSchedulerTick(now);
    expect(mocks.recoverStaleRuns).toHaveBeenCalled();
    expect(mocks.pruneFinishedRuns).toHaveBeenCalled();
    expect(mocks.analytics).not.toHaveBeenCalled();
    expect(mocks.revenue).not.toHaveBeenCalled();
  });

  it("runs only due sources for active connections using scheduler identity", async () => {
    mocks.getLatestRunForSource.mockImplementation(async (_id: number, kind: string, scope: string) => {
      const hours = kind === "sales" || kind === "finance" ? 24 : 6;
      const old = kind === "analytics" && scope === "acquisition";
      return { started_at: new Date(now - (old ? hours + 1 : hours - 1) * 60 * 60 * 1000).toISOString(), status: "success", kind, scope, error_message: null };
    });
    await runAppStoreSchedulerTick(now);
    expect(mocks.analytics).toHaveBeenCalledTimes(1);
    expect(mocks.analytics).toHaveBeenCalledWith(connection, { scope: "acquisition", trigger: "scheduler" });
    expect(mocks.revenue).not.toHaveBeenCalled();
  });

  it("isolates failures and continues to other due sources", async () => {
    mocks.getLatestRunForSource.mockResolvedValue({ started_at: "2026-10-01T00:00:00Z", status: "error", error_message: null });
    mocks.analytics.mockRejectedValueOnce(new Error("temporary"));
    await runAppStoreSchedulerTick(now);
    expect(mocks.analytics).toHaveBeenCalledTimes(2);
    expect(mocks.revenue).toHaveBeenCalledTimes(2);
  });
});
