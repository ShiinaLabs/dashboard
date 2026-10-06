import { describe, expect, it } from "vitest";
import { isResumeGap } from "../lib/client/freshness";

describe("freshness sleep/resume detection", () => {
  it("detects a foreground timer gap over 90 seconds", () => {
    expect(isResumeGap(10_000, 100_000)).toBe(false);
    expect(isResumeGap(10_000, 100_001)).toBe(true);
  });
});
