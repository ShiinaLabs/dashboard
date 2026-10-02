/** Remove numeric database scale padding while preserving meaningful precision. */
export function formatRevenueDecimal(value: string | null | undefined): string {
  if (value == null) return "—";

  const match = value.match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!match) return value;

  const [, sign, rawInteger, rawFraction = ""] = match;
  const integer = rawInteger.replace(/^0+(?=\d)/, "");
  const fraction = rawFraction.replace(/0+$/, "");
  const isZero = integer === "0" && fraction.length === 0;

  return `${isZero ? "" : sign}${integer}${fraction ? `.${fraction}` : ""}`;
}
