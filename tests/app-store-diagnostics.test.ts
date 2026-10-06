import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkpointRun, recoverStaleRuns } from "../lib/repositories/app-store";

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
