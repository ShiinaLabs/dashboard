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

const densityTokens = {
  default: { padding: "sm", minHeight: 108, iconSize: 40 },
  compact: { padding: "md", minHeight: 96, iconSize: 40 },
} as const;

export function MetricCard({ icon, label, value, hint, density = "default", tone = "primary", className, valuePrefix, valueSuffix }: MetricCardProps) {
  const tokens = densityTokens[density];
  const formattedValue = `${valuePrefix ?? ""}${value.toLocaleString("en-US")}${valueSuffix ?? ""}`;
  return (
    <Card
      p={tokens.padding}
      className={cn("metric-card", className)}
      data-tone={tone}
      style={{ minHeight: tokens.minHeight, justifyContent: "center", borderColor: `color-mix(in srgb, var(--${tone}) 22%, var(--border))` }}
    >
      <div className="flex w-full min-w-0 items-center gap-3">
        <span data-slot="metric-icon" className="grid shrink-0 place-items-center rounded-lg bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] text-[var(--primary)]" style={{ width: tokens.iconSize, height: tokens.iconSize }}>{icon}</span>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
          <span data-slot="metric-label" className="line-clamp-2 min-w-0 text-xs font-semibold uppercase leading-tight text-muted-foreground">{label}</span>
          <span data-slot="metric-value" className="truncate text-xl font-bold leading-tight tabular-nums" style={{ fontFamily: "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)" }}>{formattedValue}</span>
          <span data-slot="metric-hint" className="line-clamp-2 min-w-0 text-xs leading-tight text-muted-foreground" style={{ opacity: hint != null ? 0.8 : 0 }} aria-hidden={hint == null}>{hint ?? "No additional context"}</span>
        </div>
      </div>
    </Card>
  );
}

export function MetricCardSkeleton({ density = "default", className }: { density?: MetricCardDensity; className?: string }) {
  const tokens = densityTokens[density];
  return (
    <Card p={tokens.padding} className={cn("metric-card justify-center", className)} data-tone="primary" style={{ minHeight: tokens.minHeight, borderColor: "color-mix(in srgb, var(--primary) 22%, var(--border))" }}>
      <div className="flex w-full min-w-0 items-center gap-3">
        <Skeleton data-slot="metric-skeleton-icon" className="shrink-0 rounded-lg" style={{ width: tokens.iconSize, height: tokens.iconSize }} />
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
          <Skeleton data-slot="metric-skeleton-label" className="h-3 w-[70%]" />
          <Skeleton data-slot="metric-skeleton-value" className="h-6 w-[62%]" />
          <Skeleton data-slot="metric-skeleton-hint" className="h-3 w-[52%]" />
        </div>
      </div>
    </Card>
  );
}
