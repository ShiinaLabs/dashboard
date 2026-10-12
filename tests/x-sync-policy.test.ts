import { describe, expect, it } from "vitest";
import { adaptiveXRefreshInterval, selectXDueCandidates, xRefreshIntervalMs, xRetryAfterAt, xRetryDelayMs } from "../lib/application/usecases/xSyncPolicy";
import type { XSyncCandidate } from "../lib/repositories/x-sync";

const candidate = (id: string, kind: XSyncCandidate["kind"]): XSyncCandidate => ({
  id, kind, isPinned: false, publishedAt: new Date().toISOString(), failureCount: 0,
  lastAttemptAt: null, fetchedAt: null, metrics: null,
});

describe("X sync policy", () => {
  it("applies the age bands and pinned retention", () => {
    const now = Date.now();
    expect(xRefreshIntervalMs(new Date(now - 2 * 60 * 60_000).toISOString(), false, now)).toBe(90 * 60_000);
    expect(xRefreshIntervalMs(new Date(now - 2 * 24 * 60 * 60_000).toISOString(), false, now)).toBe(6 * 60 * 60_000);
    expect(xRefreshIntervalMs(new Date(now - 100 * 24 * 60 * 60_000).toISOString(), false, now)).toBeNull();
    expect(xRefreshIntervalMs(new Date(now - 100 * 24 * 60 * 60_000).toISOString(), true, now)).toBe(7 * 24 * 60 * 60_000);
  });

  it("caps failures at one day and shortens active refreshes without dropping below 90 minutes", () => {
    expect(xRetryDelayMs(0)).toBe(60 * 60_000);
    expect(xRetryDelayMs(5)).toBe(24 * 60 * 60_000);
    expect(xRetryAfterAt({ headers: { get: () => "120" } }).getTime()).toBeGreaterThan(Date.now() + 100_000);
    expect(adaptiveXRefreshInterval(6 * 60 * 60_000, 10, 15)).toBe(3 * 60 * 60_000);
    expect(adaptiveXRefreshInterval(90 * 60_000, 10, 15)).toBe(90 * 60_000);
    expect(adaptiveXRefreshInterval(6 * 60 * 60_000, 10, 5)).toBe(6 * 60 * 60_000);
    expect(adaptiveXRefreshInterval(60 * 60_000, null, 10)).toBe(60 * 60_000);
  });

  it("reserves work for due and retry backlog while prioritizing new identities", () => {
    const selected = selectXDueCandidates([
      ...Array.from({ length: 30 }, (_, i) => candidate(`new-${i}`, "new")),
      ...Array.from({ length: 20 }, (_, i) => candidate(`retry-${i}`, "retry")),
      ...Array.from({ length: 20 }, (_, i) => candidate(`due-${i}`, "due")),
    ], 40);
    expect(selected).toHaveLength(40);
    expect(selected.filter(x => x.kind === "new")).toHaveLength(20);
    expect(selected.filter(x => x.kind === "retry")).toHaveLength(10);
    expect(selected.filter(x => x.kind === "due")).toHaveLength(10);
  });
});
