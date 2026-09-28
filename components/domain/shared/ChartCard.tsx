import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface ChartCardProps {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

export function ChartCard({ title, description, icon, children, className, bodyClassName }: ChartCardProps) {
  return (
    <Card p={0} className={className}>
      <div className="chart-card-title" data-slot="chart-card-title">
        <div className="chart-card-heading">{icon}<h3 className="text-lg font-semibold leading-tight">{title}</h3></div>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className={cn("chart-card-body", bodyClassName)} data-slot="chart-card-body">{children}</div>
    </Card>
  );
}
