import { describe, expect, it } from "vitest";
import { compareAnalyticsPeriod } from "@/lib/client/analytics-comparison";

describe("analytics previous-period comparison", () => {
  it("formats positive and negative changes to one decimal place", () => {
    expect(compareAnalyticsPeriod(1124, 1000)).toEqual({ kind: "change", percentage: "+12.4%" });
    expect(compareAnalyticsPeriod(919, 1000)).toEqual({ kind: "change", percentage: "-8.1%" });
  });

  it("handles a zero previous period without producing infinity", () => {
    expect(compareAnalyticsPeriod(1, 0)).toEqual({ kind: "new" });
    expect(compareAnalyticsPeriod(0, 0)).toEqual({ kind: "no-change" });
  });
});
