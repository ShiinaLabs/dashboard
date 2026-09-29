import { useState, useSyncExternalStore } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Activity, ArrowUpRight, Eye, Globe2, MousePointerClick } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricCard, MetricCardSkeleton } from "@/components/domain/shared/MetricCard";
import { MetricGrid } from "@/components/domain/shared/MetricGrid";
import { SectionShell } from "@/components/domain/shared/SectionShell";
import { TimeRangeSelector } from "@/components/TimeRangeSelector";
import { compareAnalyticsPeriod } from "@/lib/client/analytics-comparison";
import { getAnalyticsPortfolio, type AnalyticsRange } from "@/lib/client/analytics-graphql";
import { getTimezone } from "@/lib/client/datetime";

const TIME_OPTIONS = [
  { value: 7, labelKey: "overview.webAnalytics.range7d" },
  { value: 30, labelKey: "overview.webAnalytics.range30d" },
  { value: 90, labelKey: "overview.webAnalytics.range90d" },
];

function analyticsRange(days: number): AnalyticsRange {
  if (days === 30) return "DAYS_30";
  if (days === 90) return "DAYS_90";
  return "DAYS_7";
}

export function WebAnalyticsSection() {
  const { t, i18n } = useTranslation();
  const [days, setDays] = useState(7);
  const timezone = useSyncExternalStore(() => () => {}, getTimezone, () => null);
  const range = analyticsRange(days);
  const { data, isPending, isError } = useQuery({
    queryKey: ["analytics", "portfolio", range, timezone],
    queryFn: () => getAnalyticsPortfolio(range, timezone!),
    enabled: Boolean(timezone),
  });
  const number = new Intl.NumberFormat(i18n.resolvedLanguage ?? i18n.language);

  function comparison(current: number, previous: number): string {
    const result = compareAnalyticsPeriod(current, previous);
    if (result.kind === "new") return t("analytics.newVsPrevious");
    if (result.kind === "no-change") return t("analytics.noChangeVsPrevious");
    return t("analytics.changeVsPrevious", { percentage: result.percentage });
  }

  const action = <div className="flex flex-wrap items-center gap-2">
    <TimeRangeSelector value={days} onChange={setDays} options={TIME_OPTIONS} />
    <Button asChild variant="outline" size="sm">
      <Link to="/analytics">{t("overview.webAnalytics.openAnalytics")}<ArrowUpRight aria-hidden="true" /></Link>
    </Button>
  </div>;

  return (
    <section aria-label={t("overview.webAnalytics.heading")}>
      <SectionShell icon={<Globe2 />} title={t("overview.webAnalytics.heading")} action={action}>
        {isPending ? (
          <div className="space-y-4">
            <MetricGrid className="sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }, (_, index) => <MetricCardSkeleton key={index} density="compact" />)}
            </MetricGrid>
            <Card className="gap-0">
              <CardHeader className="px-5 pb-3 pt-5"><CardTitle className="text-base">{t("overview.webAnalytics.topSites")}</CardTitle></CardHeader>
              <CardContent className="space-y-4 px-5 pb-5">
                {Array.from({ length: 3 }, (_, index) => <div key={index} className="h-12 animate-pulse rounded-md bg-muted" />)}
              </CardContent>
            </Card>
          </div>
        ) : isError || !data ? (
          <p className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            {t("overview.webAnalytics.unavailable")}
          </p>
        ) : data.summary.trackedSites === 0 ? (
          <div className="rounded-md border border-dashed px-4 py-8 text-center">
            <p className="text-sm text-muted-foreground">{t("overview.webAnalytics.noSites")}</p>
            <Button asChild className="mt-4">
              <Link to="/analytics">{t("overview.webAnalytics.setup")}</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <MetricGrid className="sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard density="compact" icon={<Globe2 />} label={t("overview.webAnalytics.trackedSites")} value={data.summary.trackedSites} />
              <MetricCard density="compact" icon={<Activity />} label={t("overview.webAnalytics.activeSites")} value={data.summary.activeSites} />
              <MetricCard density="compact" icon={<Eye />} label={t("analytics.views")} value={data.summary.views} hint={comparison(data.summary.views, data.previousSummary.views)} />
              <MetricCard density="compact" icon={<MousePointerClick />} label={t("analytics.visits")} value={data.summary.visits} hint={comparison(data.summary.visits, data.previousSummary.visits)} />
            </MetricGrid>

            {data.summary.activeSites === 0 ? <p className="text-sm text-muted-foreground">{t("overview.webAnalytics.noTraffic")}</p> : null}

            <Card className="min-w-0 gap-0">
              <CardHeader className="gap-1 px-5 pb-3 pt-5">
                <CardTitle className="text-base">{t("overview.webAnalytics.topSites")}</CardTitle>
              </CardHeader>
              <CardContent className="min-w-0 px-5 pb-5">
                <div className="mb-2 hidden grid-cols-[minmax(0,1fr)_auto_auto] gap-4 px-2 text-xs font-medium text-muted-foreground sm:grid">
                  <span>{t("overview.webAnalytics.site")}</span>
                  <span>{t("analytics.views")}</span>
                  <span>{t("analytics.visits")}</span>
                </div>
                <ul className="space-y-1">
                  {data.sites.slice(0, 5).map((site) => <li key={site.id} className="flex min-w-0 flex-col gap-2 rounded-md px-2 py-3 sm:grid sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium" title={site.name}>{site.name}</p>
                      <p className="truncate text-xs text-muted-foreground" title={site.host}>{site.host}</p>
                    </div>
                    <span className="text-sm tabular-nums sm:text-right">{number.format(site.views)} <span className="text-muted-foreground sm:hidden">{t("analytics.views")}</span></span>
                    <span className="text-sm tabular-nums sm:text-right">{number.format(site.visits)} <span className="text-muted-foreground sm:hidden">{t("analytics.visits")}</span></span>
                  </li>)}
                </ul>
                {data.sites.length > 5 ? <p className="mt-3 text-sm text-muted-foreground">{t("overview.webAnalytics.moreSites", { count: data.sites.length - 5 })}</p> : null}
              </CardContent>
            </Card>
          </div>
        )}
      </SectionShell>
    </section>
  );
}
