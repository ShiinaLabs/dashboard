import { useTranslation } from "react-i18next";
import { formatDateTime } from "@/lib/client/datetime";
import { Card, CardContent } from "@/components/ui/card";
import type { AppStoreHealth, AppStoreHealthState } from "@/shared/app-store-health";

const sources = ["connection", "analytics", "revenueAnalytics", "sales", "finance"] as const;
const states: AppStoreHealthState[] = ["healthy", "partial", "waiting", "stale", "action_required", "error", "never_run"];

export function AppStoreHealthPanel({ data }: { data: AppStoreHealth }) {
  const { t } = useTranslation();
  return <Card><CardContent className="space-y-3 p-5">
    <h3 className="font-semibold">{t("appStore.health.title")}</h3>
    <dl className="divide-y text-sm">
      {sources.map((source) => { const item = data[source]; return <div key={source} className="grid gap-1 py-3 sm:grid-cols-[minmax(10rem,1fr)_minmax(9rem,auto)_2fr] sm:items-start">
        <dt className="font-medium">{t(`appStore.health.source.${source}`)}</dt>
        <dd>{t(`appStore.health.state.${states.includes(item.state) ? item.state : "error"}`)}</dd>
        <dd className="space-y-1 text-muted-foreground">{item.lastSync && <p>{t("appStore.health.lastSync", { value: formatDateTime(item.lastSync) })}</p>}{item.latestData && <p>{t("appStore.health.latestData", { value: item.latestData })}</p>}{item.completeThrough && <p>{t("appStore.health.completeThrough", { value: item.completeThrough })}</p>}{item.reason && <p>{item.reason}</p>}{!item.lastSync && !item.latestData && !item.reason && <p>—</p>}</dd>
      </div>; })}
    </dl>
  </CardContent></Card>;
}
