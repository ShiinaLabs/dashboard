import { describe, expect, it } from "vitest";
import { isResumeGap, recordDataRefresh, recordServerCheck, type FreshnessTimestamps } from "../lib/client/freshness-state";

describe("freshness sleep/resume detection", () => {
  it("detects a foreground timer gap over 90 seconds", () => {
    expect(isResumeGap(10_000, 100_000)).toBe(false);
    expect(isResumeGap(10_000, 100_001)).toBe(true);
  });
});

describe("independent server and data freshness timestamps", () => {
  it("records a health check without advancing data freshness", () => {
    const initial: FreshnessTimestamps = { lastServerCheckAt: null, lastSuccessfulDataRefreshAt: null };
    expect(recordServerCheck(initial, 100)).toEqual({ lastServerCheckAt: 100, lastSuccessfulDataRefreshAt: null });
  });

  it("advances data freshness only on an observed successful data fetch", () => {
    const checked = { lastServerCheckAt: 100, lastSuccessfulDataRefreshAt: 50 };
    expect(recordDataRefresh(checked, 200)).toEqual({ lastServerCheckAt: 100, lastSuccessfulDataRefreshAt: 200 });
    expect(recordServerCheck(checked, 300)).toEqual({ lastServerCheckAt: 300, lastSuccessfulDataRefreshAt: 50 });
  });

  it("keeps prior data freshness when a server check succeeds but data refresh fails", () => {
    const previous: FreshnessTimestamps = { lastServerCheckAt: 100, lastSuccessfulDataRefreshAt: 50 };
    const checked = recordServerCheck(previous, 200);
    expect(checked.lastSuccessfulDataRefreshAt).toBe(50);
  });
});
