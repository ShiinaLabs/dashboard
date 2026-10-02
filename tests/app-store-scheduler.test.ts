import { describe, expect, it } from "vitest";
import { isSyncDue } from "../lib/scheduler/app-store";

describe("ASC scheduler due calculation", () => {
  const now = Date.parse("2026-10-02T00:00:00Z");
  it("runs never-attempted sources and waits until the UTC interval elapses", () => {
    expect(isSyncDue(null, now, 6 * 60 * 60 * 1000)).toBe(true);
    expect(isSyncDue(new Date(now - 5 * 60 * 60 * 1000).toISOString(), now, 6 * 60 * 60 * 1000)).toBe(false);
    expect(isSyncDue(new Date(now - 6 * 60 * 60 * 1000).toISOString(), now, 6 * 60 * 60 * 1000)).toBe(true);
  });
});
