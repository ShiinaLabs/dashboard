import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export interface AnalyticsAtAGlanceItem {
  key: string;
  label: string;
  value: string;
  detail?: string;
  title?: string;
}

interface AnalyticsAtAGlanceProps {
  title: string;
  items: AnalyticsAtAGlanceItem[];
  emptyMessage: string;
  loadingLabel: string;
  empty?: boolean;
  loading?: boolean;
}

export function AnalyticsAtAGlance({
  title,
  items,
  emptyMessage,
  loadingLabel,
  empty = false,
  loading = false,
}: AnalyticsAtAGlanceProps) {
  return (
    <section aria-labelledby="analytics-at-a-glance-heading" className="min-w-0">
      <Card className="min-w-0 gap-0">
        <CardHeader className="gap-1 px-5 pb-3 pt-5">
          <CardTitle id="analytics-at-a-glance-heading" role="heading" aria-level={2} className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent className="min-w-0 px-5 pb-5">
          {loading ? (
            <div className="space-y-2" aria-label={loadingLabel}>
              <span className="sr-only">{loadingLabel}</span>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {Array.from({ length: 4 }, (_, index) => <div key={index} className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-6 w-32 max-w-full" />
                  <Skeleton className="h-4 w-28" />
                </div>)}
              </div>
            </div>
          ) : empty ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{emptyMessage}</p>
          ) : (
            <dl className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {items.map((item) => <div key={item.key} className="min-w-0 space-y-1">
                <dt className="text-sm text-muted-foreground">{item.label}</dt>
                <dd className="truncate text-lg font-semibold tracking-tight" title={item.title ?? item.value}>{item.value}</dd>
                <dd className="truncate text-sm text-muted-foreground" title={item.detail}>{item.detail ?? " "}</dd>
              </div>)}
            </dl>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
