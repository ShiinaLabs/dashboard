import { Card } from "@/components/ui/card";
import { Skeleton as ShadcnSkeleton } from "@/components/ui/skeleton";

export function Skeleton({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return <ShadcnSkeleton className={className} style={style} />;
}

export function ChartCardSkeleton({ rows = 1 }: { rows?: number }) {
  return (
    <Card p={0}>
      <div className="px-5 pb-0 pt-5"><ShadcnSkeleton className="h-4 w-32" /></div>
      <div className="space-y-3 px-5 pb-5 pt-4">
        <ShadcnSkeleton className="h-40 w-full" />
        {rows > 1 && <ShadcnSkeleton className="h-3 w-24" />}
      </div>
    </Card>
  );
}
