import { describe, expect, it } from "vitest";
import { isSyncDue } from "../lib/scheduler/app-store";
import { financeCandidateMonths } from "../shared/app-store-revenue";
import { salesCandidateDates } from "../lib/scheduler/app-store";

describe("ASC scheduler due calculation", () => {
  const now = Date.parse("2026-10-02T00:00:00Z");
  it("runs never-attempted sources and waits until the UTC interval elapses", () => {
    expect(isSyncDue(null, now, 6 * 60 * 60 * 1000)).toBe(true);
    expect(isSyncDue(new Date(now - 5 * 60 * 60 * 1000).toISOString(), now, 6 * 60 * 60 * 1000)).toBe(false);
    expect(isSyncDue(new Date(now - 6 * 60 * 60 * 1000).toISOString(), now, 6 * 60 * 60 * 1000)).toBe(true);
  });
});

describe("Finance candidate months", () => {
  it("checks the two conservative months before the current UTC month", () => {
    expect(financeCandidateMonths(Date.parse("2026-10-02T00:00:00Z"))).toEqual(["2026-09", "2026-08"]);
  });

  it("handles a year boundary", () => {
    expect(financeCandidateMonths(Date.parse("2027-01-15T00:00:00Z"))).toEqual(["2026-12", "2026-11"]);
  });
});

describe("Sales scheduler date candidates", () => {
  it("fills imported-date gaps in the last 30 available dates and rechecks recent corrections", () => {
    expect(salesCandidateDates("2026-10-01", ["2026-09-30", "2026-09-29"], 8, 3)).toEqual([
      "2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27", "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01",
    ]);
  });

  it("does not re-request imported older dates while retaining correction overlap", () => {
    const dates = Array.from({ length: 30 }, (_, offset) => new Date(Date.parse("2026-10-01T00:00:00Z") - offset * 86_400_000).toISOString().slice(0, 10));
    expect(salesCandidateDates("2026-10-01", dates, 30, 3)).toEqual(["2026-09-29", "2026-09-30", "2026-10-01"]);
  });

  it("recovers gaps left by a five-day scheduler outage", () => {
    expect(salesCandidateDates("2026-10-01", ["2026-09-29", "2026-09-30", "2026-10-01"], 30, 3)).toContain("2026-09-27");
    expect(salesCandidateDates("2026-10-01", ["2026-09-29", "2026-09-30", "2026-10-01"], 30, 3)).toContain("2026-09-28");
  });
});
