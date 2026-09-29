import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface AnalyticsDimensionItem {
  key: string;
  label: string;
  value: number;
  title?: string;
}

interface AnalyticsDimensionCardProps {
  title: string;
  itemLabel: string;
  metricLabel: string;
  shareLabel: string;
  emptyMessage: string;
  loadingLabel: string;
  items: AnalyticsDimensionItem[];
  totalValue: number;
  loading?: boolean;
}

export function AnalyticsDimensionCard({
  title,
  itemLabel,
  metricLabel,
  shareLabel,
  emptyMessage,
  loadingLabel,
  items,
  totalValue,
  loading = false,
}: AnalyticsDimensionCardProps) {
  const percent = new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 1 });

  return (
    <Card className="min-w-0 gap-0">
      <CardHeader className="gap-1 px-5 pb-3 pt-5">
        <CardTitle role="heading" aria-level={2} className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="min-w-0 px-5 pb-5">
        {loading ? <p className="py-8 text-center text-sm text-muted-foreground">{loadingLabel}</p> : items.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{emptyMessage}</p>
        ) : <>
          <div className="mb-2 grid grid-cols-[auto_minmax(0,1fr)_auto_auto] gap-3 px-1 text-xs font-medium text-muted-foreground">
            <span aria-hidden="true">#</span><span>{itemLabel}</span><span>{metricLabel}</span><span>{shareLabel}</span>
          </div>
          <ol className="space-y-1">
            {items.map((item, index) => {
              const share = percent.format(totalValue > 0 ? item.value / totalValue : 0);
              return <li key={item.key} className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3 rounded-md px-1 py-2 text-sm">
                <span className="w-5 text-right tabular-nums text-muted-foreground">{index + 1}</span>
                <span className="min-w-0 truncate" title={item.title ?? item.label}>{item.label}</span>
                <span className="min-w-12 text-right tabular-nums">{item.value.toLocaleString()}</span>
                <span className="min-w-12 text-right tabular-nums text-muted-foreground">{share}</span>
              </li>;
            })}
          </ol>
        </>}
      </CardContent>
    </Card>
  );
}
