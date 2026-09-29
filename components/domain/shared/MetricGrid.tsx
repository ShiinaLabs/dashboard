import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type MetricGridColumns = "three" | "four" | "five";
interface MetricGridProps { columns?: MetricGridColumns; children: ReactNode; className?: string }
const columns: Record<MetricGridColumns, string> = { three: "xl:grid-cols-3", four: "xl:grid-cols-4", five: "xl:grid-cols-5" };

export function MetricGrid({ columns: count = "four", children, className }: MetricGridProps) {
  return <div data-slot="metric-grid" data-columns={count} className={cn("grid grid-cols-2 gap-2 sm:gap-3 xl:gap-4", columns[count], className)}>{children}</div>;
}
