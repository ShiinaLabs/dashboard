import { describe, expect, it } from "vitest";
import { classifyAppStoreAnalyticsHealth, classifyAppStoreSourceHealth } from "../lib/services/app-store-health";

const now = Date.parse("2026-10-02T00:00:00Z");
function run(status: "running" | "success" | "partial" | "error", error_message: string | null = null, started_at = new Date(now - 60_000).toISOString()) {
  return { id: 1, connection_id: 1, kind: "sales" as const, scope: "revenue", trigger: "manual" as const, status, started_at, finished_at: started_at, duration_ms: 1, error_message };
}

describe("ASC source health", () => {
  it("distinguishes never-run, healthy, waiting, stale, action-required and error", () => {
    expect(classifyAppStoreSourceHealth(undefined, null, 4 * 86_400_000, now).state).toBe("never_run");
    expect(classifyAppStoreSourceHealth(run("success"), "2026-10-01", 4 * 86_400_000, now).state).toBe("healthy");
    expect(classifyAppStoreSourceHealth(run("success", "waiting: finance_unavailable"), null, 4 * 86_400_000, now).state).toBe("waiting");
    expect(classifyAppStoreSourceHealth(run("success"), "2026-09-20", 4 * 86_400_000, now).state).toBe("stale");
    expect(classifyAppStoreSourceHealth(run("error", "apple_report_error status=403 code=FORBIDDEN"), null, 4 * 86_400_000, now).state).toBe("action_required");
    expect(classifyAppStoreSourceHealth(run("error", "unsupported_report_structure"), null, 4 * 86_400_000, now).state).toBe("error");
  });

  const analyticsHealth = (options: {
    status?: "running" | "success" | "partial" | "error";
    message?: string | null;
    latestData?: string | null;
    completeThrough?: string | null;
    appleAhead?: boolean;
    firstRequestStartedAt?: number;
  } = {}) => classifyAppStoreAnalyticsHealth({
    run: run(options.status ?? "success", options.message ?? null),
    latestData: options.latestData === undefined ? "2026-10-01" : options.latestData,
    completeThrough: options.completeThrough === undefined ? "2026-10-01" : options.completeThrough,
    maxAge: 5 * 86_400_000,
    now,
    appleAhead: options.appleAhead ?? false,
    stoppedRequest: false,
    firstRequestStartedAt: options.firstRequestStartedAt,
  });

  it("preserves high-priority Analytics run failures over data and Apple freshness", () => {
    expect(analyticsHealth({ status: "error", message: "unsupported_report_structure", latestData: null, completeThrough: null }).state).toBe("error");
    expect(analyticsHealth({ status: "error", message: "unsupported_report_structure", appleAhead: true }).state).toBe("error");
    expect(analyticsHealth({ status: "error", message: "permission denied", appleAhead: true }).state).toBe("action_required");
    expect(analyticsHealth({ status: "partial", message: "report failed", appleAhead: true }).state).toBe("partial");
  });

  it("keeps running sync waiting and applies the first-report grace only after a successful run", () => {
    expect(analyticsHealth({ status: "running", latestData: null, completeThrough: null }).state).toBe("waiting");
    expect(analyticsHealth({ latestData: null, completeThrough: null, firstRequestStartedAt: now - 12 * 60 * 60_000 }).state).toBe("waiting");
    expect(analyticsHealth({ latestData: null, completeThrough: null, firstRequestStartedAt: now - 73 * 60 * 60_000 }).state).toBe("stale");
  });

  it("uses Apple-ahead and complete-through freshness only for otherwise successful runs", () => {
    expect(analyticsHealth({ appleAhead: true }).state).toBe("stale");
    expect(analyticsHealth({ completeThrough: "2026-09-20" }).state).toBe("stale");
    expect(analyticsHealth().state).toBe("healthy");
  });
});
