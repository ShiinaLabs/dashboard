import { Card, Skeleton as MantineSkeleton } from "@mantine/core";

export function Skeleton({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`skeleton ${className}`} style={style} />;
}

export function ChartCardSkeleton({ rows = 1 }: { rows?: number }) {
  return (
    <Card
      withBorder
      radius="md"
      p={0}
      style={{ background: "var(--card)", color: "var(--card-foreground)" }}
    >
      <div className="chart-card-title">
        <MantineSkeleton height={16} width={128} radius="sm" />
      </div>
      <div className="chart-card-body">
        <MantineSkeleton height={160} width="100%" radius="sm" />
        {rows > 1 && <MantineSkeleton height={12} width={96} radius="sm" />}
      </div>
    </Card>
  );
}
