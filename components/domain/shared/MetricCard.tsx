import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type MetricCardDensity = "default" | "compact";
export type MetricCardTone = "primary" | "success" | "warn" | "danger";

export interface MetricCardProps {
  icon: ReactNode;
  label: string;
  value: number;
  hint?: ReactNode;
  density?: MetricCardDensity;
  tone?: MetricCardTone;
  className?: string;
  valuePrefix?: string;
  valueSuffix?: string;
}

export function MetricCard({ icon, label, value, hint, density = "default", tone = "primary", className, valuePrefix, valueSuffix }: MetricCardProps) {
  const formattedValue = `${valuePrefix ?? ""}${value.toLocaleString("en-US")}${valueSuffix ?? ""}`;
  return (
    <Card
      className={cn("gap-3 rounded-lg border p-4 shadow-none", density === "compact" && "gap-2 p-3", className)}
      data-tone={tone}
    >
      <div className="flex items-center justify-between gap-3">
        <span data-slot="metric-label" className="line-clamp-2 min-w-0 text-sm font-medium leading-5 text-muted-foreground">{label}</span>
        <span data-slot="metric-icon" className="shrink-0 text-muted-foreground [&_svg]:size-4 [&_svg]:stroke-[1.75]" aria-hidden="true">{icon}</span>
      </div>
      <div className="min-w-0">
        <span data-slot="metric-value" className="block truncate text-2xl font-semibold tracking-tight tabular-nums">{formattedValue}</span>
        {hint != null && <span data-slot="metric-hint" className="mt-1 block line-clamp-2 text-xs text-muted-foreground">{hint}</span>}
      </div>
    </Card>
  );
}

export function MetricCardSkeleton({ density = "default", className }: { density?: MetricCardDensity; className?: string }) {
  return (
    <Card className={cn("gap-3 rounded-lg border p-4 shadow-none", density === "compact" && "gap-2 p-3", className)} data-tone="primary">
      <div className="flex items-center justify-between gap-3">
        <Skeleton data-slot="metric-skeleton-label" className="h-4 w-24" />
        <Skeleton data-slot="metric-skeleton-icon" className="size-4 rounded" />
      </div>
      <div className="min-w-0 space-y-2">
          <Skeleton data-slot="metric-skeleton-value" className="h-7 w-20" />
          <Skeleton data-slot="metric-skeleton-hint" className="h-3 w-32" />
        </div>
    </Card>
  );
}
