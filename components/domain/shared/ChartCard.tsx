import type { ReactNode } from "react";
import { Card, Text } from "@mantine/core";
import { cn } from "@/lib/client/utils";

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
    <Card
      withBorder
      radius="md"
      p={0}
      className={className}
      style={{ background: "var(--card)", color: "var(--card-foreground)" }}
    >
      <div className="chart-card-title" data-slot="chart-card-title">
        <div className="chart-card-heading">
          {icon}
          <Text component="h3" fz="lg" fw={600} lh={1.2}>{title}</Text>
        </div>
        {description && <Text size="sm" c="dimmed">{description}</Text>}
      </div>
      <div className={cn("chart-card-body", bodyClassName)} data-slot="chart-card-body">
        {children}
      </div>
    </Card>
  );
}
