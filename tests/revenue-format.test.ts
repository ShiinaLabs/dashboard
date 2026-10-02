import { describe, expect, it } from "vitest";
import { formatRevenueDecimal } from "../lib/client/revenue-format";

describe("Revenue number display", () => {
  it("removes database scale padding without rounding meaningful precision", () => {
    expect(formatRevenueDecimal("1.000000000000")).toBe("1");
    expect(formatRevenueDecimal("11.040000000000")).toBe("11.04");
    expect(formatRevenueDecimal("2.500000000000")).toBe("2.5");
    expect(formatRevenueDecimal("0.000000000000")).toBe("0");
    expect(formatRevenueDecimal("-0.000000000000")).toBe("0");
    expect(formatRevenueDecimal("0.000000000001")).toBe("0.000000000001");
  });

  it("keeps missing values and non-decimal labels intact", () => {
    expect(formatRevenueDecimal(null)).toBe("—");
    expect(formatRevenueDecimal(undefined)).toBe("—");
    expect(formatRevenueDecimal("USD")).toBe("USD");
  });
});
