import { Card } from "@/components/ui/card";
import { Skeleton as ShadcnSkeleton } from "@/components/ui/skeleton";

export function Skeleton({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return <ShadcnSkeleton className={className} style={style} />;
}

export function ChartCardSkeleton({ rows = 1 }: { rows?: number }) {
  return (
    <Card p={0}>
      <div className="chart-card-title"><ShadcnSkeleton className="h-4 w-32" /></div>
      <div className="chart-card-body">
        <ShadcnSkeleton className="h-40 w-full" />
        {rows > 1 && <ShadcnSkeleton className="h-3 w-24" />}
      </div>
    </Card>
  );
}
