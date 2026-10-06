import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listConnections: vi.fn(), getLatestRunForSource: vi.fn(), hasFinanceImport: vi.fn(), readCommerceImportDates: vi.fn(), recoverStaleRuns: vi.fn(), pruneFinishedRuns: vi.fn(), analytics: vi.fn(), revenue: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn(),
}));
vi.mock("../lib/config", () => ({ isMockMode: () => false }));
vi.mock("../lib/logger", () => ({ getLogger: () => mocks, logStructured: (level: "debug" | "info" | "warn" | "error", component: string, event: string, fields: Record<string, unknown>) => mocks[level](component, JSON.stringify({ event, ...fields })) }));
vi.mock("../lib/repositories/app-store", () => ({ listConnections: mocks.listConnections, getLatestRunForSource: mocks.getLatestRunForSource, recoverStaleRuns: mocks.recoverStaleRuns, pruneFinishedRuns: mocks.pruneFinishedRuns }));
vi.mock("../lib/repositories/app-store-facts", () => ({ hasFinanceImport: mocks.hasFinanceImport, readCommerceImportDates: mocks.readCommerceImportDates }));
vi.mock("../lib/services/app-store-sync", () => ({ syncAppStoreAnalyticsForConnection: mocks.analytics, syncAppStoreRevenueForConnection: mocks.revenue }));
vi.mock("../shared/app-store-revenue", async (importOriginal) => ({ ...await importOriginal<typeof import("../shared/app-store-revenue")>(), latestSalesReportDate: () => "2026-10-01" }));

import { runAppStoreSchedulerTick } from "../lib/scheduler/app-store";

const now = Date.parse("2026-10-02T00:00:00Z");
const connection = { id: 8, is_active: true, updated_at: "2026-09-30T20:00:00Z" };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.listConnections.mockResolvedValue([connection, { ...connection, id: 9, is_active: false }]);
  mocks.getLatestRunForSource.mockImplementation(async (_id: number, kind: string, scope: string) => ({ started_at: new Date(now - 60 * 60 * 1000).toISOString(), status: "running", kind, scope, error_message: null }));
  mocks.recoverStaleRuns.mockResolvedValue(0);
  mocks.pruneFinishedRuns.mockResolvedValue(0);
  mocks.hasFinanceImport.mockResolvedValue(false);
  mocks.readCommerceImportDates.mockResolvedValue({ sales: [], finance: [] });
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

  it("requests only missing Sales dates plus recent corrections in chronological order", async () => {
    mocks.readCommerceImportDates.mockResolvedValue({ sales: ["2026-09-30"], finance: [] });
    await runSalesOnlyTick();

    expect(mocks.readCommerceImportDates).toHaveBeenCalledWith(8, { from: "2026-09-02", to: "2026-10-01" });
    expect(mocks.revenue).toHaveBeenCalledTimes(1);
    expect(mocks.revenue).toHaveBeenCalledWith(connection, expect.objectContaining({ from: "2026-09-02", to: "2026-10-01" }), expect.objectContaining({ sources: ["sales"], salesDates: expect.arrayContaining(["2026-09-02", "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01"]) }));
    expect(mocks.revenue.mock.calls[0][2].salesDates.slice(0, 5)).toEqual(["2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06"]);
  });

  it("skips an auth-failed source until its connection is edited", async () => {
    mocks.getLatestRunForSource.mockImplementation(async (_id: number, kind: string, scope: string) => kind === "sales" ? { started_at: new Date(now - 20 * 60 * 60 * 1000).toISOString(), status: "error", kind, scope, error_message: "apple_report_error status=403 code=FORBIDDEN_ERROR" } : { started_at: new Date(now).toISOString(), status: "success", kind, scope, error_message: null });
    await runAppStoreSchedulerTick(now);
    expect(mocks.revenue.mock.calls.filter((call) => call[2].sources[0] === "sales")).toHaveLength(0);

    mocks.listConnections.mockResolvedValue([{ ...connection, updated_at: "2026-10-01T13:00:00Z" }]);
    await runAppStoreSchedulerTick(now);
    expect(mocks.revenue.mock.calls.filter((call) => call[2].sources[0] === "sales")).toHaveLength(1);
    expect(mocks.revenue.mock.calls.find((call) => call[2].sources[0] === "sales")?.[2]).toMatchObject({ trigger: "scheduler", sources: ["sales"] });
  });

  it.each([
    ["status=429 code=TOO_MANY_REQUESTS", "due"],
    ["status=503 code=SERVICE_UNAVAILABLE", "due"],
    ["permission denied while parsing report", "due"],
    ["status=403 code=FORBIDDEN_ERROR", "latched"],
    ["status=401 code=AUTHENTICATION_ERROR", "latched"],
    ["vendor_required", "latched"],
  ])("classifies permanent auth diagnostics narrowly (%s)", async (errorMessage, expected) => {
    mocks.getLatestRunForSource.mockImplementation(async (_id: number, kind: string, scope: string) => kind === "sales" || kind === "finance" ? { started_at: new Date(now - 25 * 60 * 60 * 1000).toISOString(), status: "error", kind, scope, error_message: errorMessage } : { started_at: new Date(now).toISOString(), status: "success", kind, scope, error_message: null });
    await runAppStoreSchedulerTick(now);
    expect(mocks.revenue.mock.calls.filter((call) => call[2].sources[0] === "sales")).toHaveLength(expected === "due" ? 1 : 0);
  });

  it("skips the Sales API when all dates are imported outside the correction window", async () => {
    mocks.readCommerceImportDates.mockResolvedValue({ sales: Array.from({ length: 30 }, (_, offset) => new Date(Date.parse("2026-10-01T00:00:00Z") - offset * 86_400_000).toISOString().slice(0, 10)), finance: [] });
    await runSalesOnlyTick();
    expect(mocks.revenue.mock.calls.filter((call) => call[2].sources[0] === "sales")).toHaveLength(1);
    expect(mocks.revenue.mock.calls.find((call) => call[2].sources[0] === "sales")?.[2].salesDates).toEqual(["2026-09-29", "2026-09-30", "2026-10-01"]);
  });

  it("runs only due sources for active connections using scheduler identity", async () => {
    mocks.getLatestRunForSource.mockImplementation(async (_id: number, kind: string, scope: string) => {
      const hours = kind === "sales" || kind === "finance" ? 24 : 6;
      const old = kind === "analytics" && scope === "acquisition";
      return { started_at: new Date(now - (old ? hours + 1 : hours - 1) * 60 * 60 * 1000).toISOString(), status: "success", kind, scope, error_message: null };
    });
    await runAppStoreSchedulerTick(now);
    expect(mocks.analytics).toHaveBeenCalledTimes(1);
    expect(mocks.analytics).toHaveBeenCalledWith(connection, { scope: "acquisition", trigger: "scheduler", mode: "ongoing" });
    expect(mocks.revenue).not.toHaveBeenCalled();
  });

  it("isolates failures and continues to other due sources", async () => {
    mocks.getLatestRunForSource.mockResolvedValue({ started_at: "2026-10-01T00:00:00Z", status: "error", error_message: null });
    mocks.analytics.mockRejectedValueOnce(new Error("temporary"));
    await runAppStoreSchedulerTick(now);
    expect(mocks.analytics).toHaveBeenCalledTimes(2);
    expect(mocks.revenue).toHaveBeenCalledTimes(3);
  });

  async function runOnlySource(target: "sales" | "finance") {
    mocks.getLatestRunForSource.mockImplementation(async (_id: number, kind: string, scope: string) => ({
      started_at: kind === target ? new Date(now - 25 * 60 * 60 * 1000).toISOString() : new Date(now).toISOString(),
      status: "success", kind, scope, error_message: null,
    }));
    await runAppStoreSchedulerTick(now);
  }

  const runFinanceOnlyTick = () => runOnlySource("finance");
  const runSalesOnlyTick = async () => {
    mocks.getLatestRunForSource.mockImplementation(async (_id: number, kind: string, scope: string) => ({
      started_at: kind === "sales" ? new Date(now - 25 * 60 * 60 * 1000).toISOString() : new Date(now).toISOString(),
      status: "success", kind, scope, error_message: null,
    }));
    await runAppStoreSchedulerTick(now);
  };

  it("skips both latest Finance months when their import facts already exist", async () => {
    mocks.hasFinanceImport.mockResolvedValue(true);
    await runFinanceOnlyTick();

    expect(mocks.hasFinanceImport.mock.calls).toEqual([[8, "2026-09", "ZZ"], [8, "2026-08", "ZZ"]]);
    expect(mocks.revenue).not.toHaveBeenCalled();
    const events = mocks.info.mock.calls.map(([, line]) => JSON.parse(line));
    expect(events).toContainEqual(expect.objectContaining({ event: "asc_scheduler_due", source: "finance", candidateFiscalMonths: ["2026-09", "2026-08"] }));
    const debugEvents = mocks.debug.mock.calls.map(([, line]) => JSON.parse(line));
    expect(debugEvents.filter((event: { event?: string }) => event.event === "finance_month_skipped")).toHaveLength(2);
  });

  it("requests only missing Finance months and logs the selected month", async () => {
    mocks.hasFinanceImport.mockImplementation(async (_connectionId: number, fiscalMonth: string) => fiscalMonth === "2026-09");
    await runFinanceOnlyTick();

    expect(mocks.revenue).toHaveBeenCalledTimes(1);
    expect(mocks.revenue).toHaveBeenCalledWith(connection, expect.objectContaining({ fiscalMonth: "2026-08", regionCode: "ZZ" }), { trigger: "scheduler", sources: ["finance"], mode: "ongoing" });
    const events = mocks.info.mock.calls.map(([, line]) => JSON.parse(line));
    expect(events).toContainEqual(expect.objectContaining({ event: "finance_month_selected", fiscalMonth: "2026-08", regionCode: "ZZ" }));
    expect(mocks.debug.mock.calls.map(([, line]) => JSON.parse(line))).toContainEqual(expect.objectContaining({ event: "finance_month_skipped", fiscalMonth: "2026-09", reason: "already_imported" }));
  });

  it("requests the latest missing month and leaves an unavailable report in waiting", async () => {
    mocks.hasFinanceImport.mockImplementation(async (_connectionId: number, fiscalMonth: string) => fiscalMonth === "2026-08");
    mocks.revenue.mockResolvedValueOnce({ status: "waiting", waitingReasons: ["finance_unavailable"], errors: [] });
    await runFinanceOnlyTick();

    expect(mocks.revenue).toHaveBeenCalledTimes(1);
    expect(mocks.revenue.mock.calls[0][1]).toEqual(expect.objectContaining({ fiscalMonth: "2026-09" }));
    expect(mocks.warn).not.toHaveBeenCalledWith("ASC", expect.stringContaining("asc_scheduler_source_failed"));
  });

  it("attempts both missing months without skipping the older candidate", async () => {
    await runFinanceOnlyTick();

    expect(mocks.revenue.mock.calls.map(([, input]) => input.fiscalMonth)).toEqual(["2026-09", "2026-08"]);
  });

  it("continues to the previous month when the latest Finance request throws", async () => {
    mocks.revenue.mockRejectedValueOnce(new Error("temporary"));
    await runFinanceOnlyTick();

    expect(mocks.revenue.mock.calls.map(([, input]) => input.fiscalMonth)).toEqual(["2026-09", "2026-08"]);
  });
});
