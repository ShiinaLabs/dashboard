import type { ReactNode } from "react";

type TrafficMetricListProps = {
  label: ReactNode;
  primaryLabel: ReactNode;
  secondaryLabel: ReactNode;
  children: ReactNode;
};

export function TrafficMetricList({
  label,
  primaryLabel,
  secondaryLabel,
  children,
}: TrafficMetricListProps) {
  return (
    <div className="flex flex-col">
      <div className="flex shrink-0 items-center justify-between px-1 pb-1 text-xs font-medium text-[var(--muted-foreground)]">
        <span>{label}</span>
        <span className="flex shrink-0 gap-2 sm:gap-6">
          <span className="w-12 text-right sm:w-16">{primaryLabel}</span>
          <span className="w-12 text-right sm:w-16">{secondaryLabel}</span>
        </span>
      </div>
      <div className="max-h-60 space-y-0.5 overflow-y-auto overscroll-contain pr-1">
        {children}
      </div>
    </div>
  );
}
