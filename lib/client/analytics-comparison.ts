export type AnalyticsComparison =
  | { kind: "change"; percentage: string }
  | { kind: "new" }
  | { kind: "no-change" };

export function compareAnalyticsPeriod(current: number, previous: number): AnalyticsComparison {
  if (previous === 0) return current === 0 ? { kind: "no-change" } : { kind: "new" };
  const percentage = ((current - previous) / previous) * 100;
  return { kind: "change", percentage: `${percentage > 0 ? "+" : ""}${percentage.toFixed(1)}%` };
}
