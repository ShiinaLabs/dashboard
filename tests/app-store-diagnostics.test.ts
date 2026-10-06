import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkpointRun, recoverStaleRuns } from "../lib/repositories/app-store";
import { hasAppleProcessingAhead, summarizeLocalReportPartitions, upsertDiagnosticReport } from "../lib/services/app-store-diagnostics";

const mocks = vi.hoisted(() => ({ update: vi.fn(), set: vi.fn(), where: vi.fn(), returning: vi.fn() }));
vi.mock("../lib/db/connection", () => ({ getDb: () => ({ update: mocks.update }) }));
vi.mock("../lib/config", () => ({ isMockMode: () => false }));

beforeEach(() => {
  vi.clearAllMocks();
  const query = { set: mocks.set, where: mocks.where, returning: mocks.returning };
  mocks.update.mockReturnValue(query);
  mocks.set.mockReturnValue(query);
  mocks.where.mockReturnValue(query);
  mocks.returning.mockResolvedValue([{ id: 4 }]);
});

describe("durable ASC checkpoints", () => {
  it("stores a checkpoint summary without putting it in finish-only state", async () => {
    const summary = { version: 1 as const, checkpoint: "commit", checkpointAt: "2026-10-07T00:00:00Z", source: "analytics", scope: "acquisition", trigger: "manual" as const, counters: { imported: 1 }, reports: [], before: {}, after: {}, issues: [] };
    await checkpointRun({ id: 4 } as never, summary);
    expect(mocks.set).toHaveBeenCalledWith({ diagnostic_summary: summary });
  });

  it("recovers stale runs while preserving their last durable diagnostic checkpoint", async () => {
    await recoverStaleRuns(new Date("2026-10-06T00:00:00Z"), new Date("2026-10-07T00:00:00Z"));
    const recoveryUpdate = mocks.set.mock.calls[0][0];
    expect(recoveryUpdate).toMatchObject({ status: "error", error_message: "stale_run_recovered" });
    expect(recoveryUpdate).not.toHaveProperty("diagnostic_summary");
  });
});

describe("ASC report diagnostic semantics", () => {
  it("updates one report row by app/report/access identity", () => {
    const reports = [] as import("../shared/app-store").AppStoreDiagnosticReport[];
    const base = { appId: 4, reportKind: "discovery", accessType: "ONGOING" as const, state: "current" as const, appleProcessingDate: "2026-10-05", localProcessingDate: "2026-10-04", latestData: "2026-10-03" };
    upsertDiagnosticReport(reports, base);
    upsertDiagnosticReport(reports, { ...base, state: "imported", localProcessingDate: "2026-10-05" });
    expect(reports).toEqual([{ ...base, state: "imported", localProcessingDate: "2026-10-05" }]);
  });

  it("summarizes max processing date and max business date independently for corrections", () => {
    const report = summarizeLocalReportPartitions([
      { app_id: 4, report_kind: "discovery", processing_date: "2026-10-05", date: "2026-10-03" },
      { app_id: 4, report_kind: "discovery", processing_date: "2026-10-04", date: "2026-10-04" },
      { app_id: 4, report_kind: "downloads", processing_date: "2026-10-03", date: "2026-10-05" },
    ]);
    expect(report).toEqual([
      { appId: 4, reportKind: "discovery", localProcessingDate: "2026-10-05", latestData: "2026-10-04" },
      { appId: 4, reportKind: "downloads", localProcessingDate: "2026-10-03", latestData: "2026-10-05" },
    ]);
  });

  it("does not report Apple as ahead when persisted local processing caught up on an old business date", () => {
    expect(hasAppleProcessingAhead([{ reportKind: "discovery", appleProcessingDate: "2026-10-05", localProcessingDate: "2026-10-05" }], ["discovery"])).toBe(false);
    expect(hasAppleProcessingAhead([{ reportKind: "discovery", appleProcessingDate: "2026-10-05", localProcessingDate: "2026-10-04" }], ["discovery"])).toBe(true);
  });
});
