import { describe, expect, it } from "vitest";
import { classifyAppStoreSourceHealth } from "../lib/services/app-store-health";

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
});
