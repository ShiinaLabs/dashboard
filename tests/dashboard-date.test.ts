import { describe, expect, it } from "vitest";
import { dashboardDateRange } from "../lib/client/dashboard-date";

describe("dashboard calendar date ranges", () => {
  it("uses dashboard timezone calendar dates across UTC midnight", () => {
    const now = Date.parse("2026-10-07T16:30:00.000Z");
    expect(dashboardDateRange(now, "Asia/Singapore", 7)).toEqual({ from: "2026-10-02", to: "2026-10-08" });
    expect(dashboardDateRange(now, "America/Los_Angeles", 7)).toEqual({ from: "2026-10-01", to: "2026-10-07" });
  });

  it("rolls the query date forward as time advances without a page reload", () => {
    const timezone = "Asia/Singapore";
    expect(dashboardDateRange(Date.parse("2026-10-07T15:59:59.000Z"), timezone, 1).to).toBe("2026-10-07");
    expect(dashboardDateRange(Date.parse("2026-10-07T16:00:01.000Z"), timezone, 1).to).toBe("2026-10-08");
  });
});
