import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
      <CardHeader className="gap-1 px-5 pb-0 pt-5" data-slot="chart-card-title">
        <div className="flex min-w-0 items-center gap-2">{icon}<CardTitle role="heading" aria-level={2} className="truncate text-sm font-semibold">{title}</CardTitle></div>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className={cn("min-w-0 overflow-hidden px-5 pb-5 pt-4", bodyClassName)} data-slot="chart-card-body">{children}</CardContent>
    </Card>
  );
}
