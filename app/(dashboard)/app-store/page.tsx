import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getAppStoreAnalyticsPage } from "@/lib/client/graphql/app-store";
import { pageMeta, type PageTitleKey, type TitleHandle } from "@/lib/page-titles";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AppStoreAnalyticsMetrics } from "@/shared/app-store-analytics";
import { useNow } from "@/lib/client/use-now";
import { getTimezone } from "@/lib/client/datetime";
import { dashboardDateRange } from "@/lib/client/dashboard-date";

const titleKey = "nav.appStoreAnalytics" satisfies PageTitleKey;
export const meta = pageMeta(titleKey);
export const handle = { titleKey } satisfies TitleHandle;

const metricKeys = ["impressions", "views", "firstTimeDownloads", "downloads", "conversion"] as const;
const emptyMetrics: AppStoreAnalyticsMetrics = { impressions: null, views: null, firstTimeDownloads: null, downloads: null, conversion: null };

function metricValue(value: number | null, percentage = false): string {
  return value === null ? "—" : percentage ? `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}%` : value.toLocaleString();
}

function MetricsTable({ rows, label }: { rows: ({ label: string } & AppStoreAnalyticsMetrics)[]; label: string }) {
  const { t } = useTranslation();
  return <div className="overflow-x-auto rounded-lg border">
    <table className="w-full whitespace-nowrap text-sm">
      <thead className="bg-muted/50"><tr><th className="p-3 text-left font-medium">{label}</th>{["impressions", "views", "downloads", "conversion"].map((key) => <th key={key} className="p-3 text-right font-medium">{t(`appStoreAnalytics.metrics.${key}`)}</th>)}</tr></thead>
      <tbody>{rows.map((row) => <tr key={row.label} className="border-t"><th scope="row" className="p-3 text-left font-normal">{row.label}</th>{(["impressions", "views", "downloads", "conversion"] as const).map((key) => <td key={key} className="p-3 text-right tabular-nums">{metricValue(row[key], key === "conversion")}</td>)}</tr>)}</tbody>
    </table>
  </div>;
}

export default function AppStoreAnalyticsPage() {
  const { t } = useTranslation();
  const [appId, setAppId] = useState("all");
  const [range, setRange] = useState(7);
  const [territory, setTerritory] = useState("all");
  const now = useNow();
  const timezone = getTimezone();
  const { from, to: today } = dashboardDateRange(now, timezone, range);
  const page = useQuery({
    queryKey: ["app-store-analytics-page", appId, from, today, territory],
    queryFn: ({ signal }) => getAppStoreAnalyticsPage({ from, to: today, appId: appId === "all" ? undefined : Number(appId), territory: territory === "all" ? undefined : territory }, signal),
    staleTime: 5 * 60_000,
  });
  const data = page.data?.analytics;
  const apps = page.data?.enabledApps ?? [];
  const metrics = data?.overview ?? emptyMetrics;
  return <div className="space-y-6">
    <div className="space-y-2"><h1 className="text-2xl font-semibold tracking-tight">{t(titleKey)}</h1>
      <p className="text-sm text-muted-foreground">{t("appStoreAnalytics.description")}</p>
    </div>
    <div className="flex flex-wrap items-center gap-3">
      <Select value={appId} onValueChange={(value) => { setAppId(value); setTerritory("all"); }}><SelectTrigger aria-label={t("appStoreAnalytics.app")} className="w-full sm:w-56"><SelectValue /></SelectTrigger><SelectContent>
        <SelectItem value="all">{t("appStoreAnalytics.allApps")}</SelectItem>
        {apps.map((app) => <SelectItem key={app.id} value={String(app.id)}>{app.name}</SelectItem>)}
      </SelectContent></Select>
      <div role="group" aria-label={t("appStoreAnalytics.dateRange")} className="flex gap-1 rounded-lg border p-1">{[7, 30, 90].map((days) => <Button key={days} variant={range === days ? "secondary" : "ghost"} size="sm" aria-pressed={range === days} onClick={() => setRange(days)}>{days}D</Button>)}</div>
      <Select value={territory} onValueChange={setTerritory}><SelectTrigger aria-label={t("appStoreAnalytics.territory")} className="w-full sm:w-48"><SelectValue /></SelectTrigger><SelectContent>
        <SelectItem value="all">{t("appStoreAnalytics.allTerritories")}</SelectItem>
        {[...new Set([...(data?.territories ?? []), ...(territory === "all" ? [] : [territory])])].map((code) => <SelectItem key={code} value={code}>{code}</SelectItem>)}
      </SelectContent></Select>
    </div>
    <dl className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
      <div className="flex gap-2"><dt>{t("appStoreAnalytics.updated")}</dt><dd>{data?.updatedAt?.slice(0, 10) ?? "—"}</dd></div>
      <div className="flex gap-2"><dt>{t("appStoreAnalytics.completeThrough")}</dt><dd>{data?.completeThrough ?? "—"}</dd></div>
    </dl>
    {page.isError && <p role="alert" className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive">{page.error.message}</p>}
    {page.isLoading && <p role="status">{t("common.loading")}</p>}
    {page.isSuccess && !apps.length && <p className="text-sm text-muted-foreground">{t("appStoreAnalytics.noEnabledApps")} <Link className="underline" to="/accounts">{t("nav.connections")}</Link></p>}
    <Tabs defaultValue="overview">
      <TabsList><TabsTrigger value="overview">{t("appStoreAnalytics.overview")}</TabsTrigger><TabsTrigger value="acquisition">{t("appStoreAnalytics.acquisition")}</TabsTrigger><TabsTrigger value="campaigns">{t("appStoreAnalytics.campaigns")}</TabsTrigger></TabsList>
      <TabsContent value="overview" className="space-y-6 pt-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{metricKeys.map((key) => { const coverage = data?.coverage[key]; return <Card key={key}><CardContent className="p-5"><p className="text-xs text-muted-foreground">{t(`appStoreAnalytics.metrics.${key}`)}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{metricValue(metrics[key], key === "conversion")}</p>{coverage?.state === "partial" && <p className="mt-1 text-xs text-amber-600">{t("appStoreAnalytics.partialCoverage", { reportingApps: coverage.reportingApps, totalApps: coverage.totalApps })}</p>}</CardContent></Card>; })}</div>
        <Card><CardContent className="space-y-4 p-5"><h2 className="font-medium">{t("appStoreAnalytics.dailyTrend")}</h2>
          {data?.trend.some((row) => metricKeys.some((key) => row.coverage[key].state === "partial")) && <p className="text-xs text-amber-600">{t("appStoreAnalytics.partialTrendCoverage", { days: new Set(data.trend.filter((row) => metricKeys.some((key) => row.coverage[key].state === "partial")).map((row) => row.date)).size })}</p>}
          {data?.trend.length ? <div className="h-64"><ResponsiveContainer width="100%" height="100%"><LineChart data={data.trend}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip formatter={(value) => value === null ? "—" : value} />{(["impressions", "views", "downloads"] as const).map((key, index) => <Line key={key} dataKey={key} name={t(`appStoreAnalytics.metrics.${key}`)} stroke={["var(--chart-1)", "var(--chart-2)", "var(--chart-3)"][index]} dot={false} connectNulls={false} />)}</LineChart></ResponsiveContainer></div> : <p className="text-sm text-muted-foreground">{t(page.isSuccess ? "appStoreAnalytics.noData" : "appStoreAnalytics.reportUnavailable")}</p>}
        </CardContent></Card>
        <section className="space-y-3"><h2 className="font-medium">{t("appStoreAnalytics.downloadsBySource")}</h2><MetricsTable label={t("appStoreAnalytics.source")} rows={(data?.acquisition ?? []).map((row) => ({ ...row, label: row.source }))} /></section>
      </TabsContent>
      <TabsContent value="acquisition" className="space-y-3 pt-4"><MetricsTable label={t("appStoreAnalytics.source")} rows={(data?.acquisition ?? []).map((row) => ({ ...row, label: row.source }))} /></TabsContent>
      <TabsContent value="campaigns" className="space-y-4 pt-4">
        {data?.campaigns.length ? <><MetricsTable label={t("appStoreAnalytics.campaign")} rows={data.campaigns.map((row) => ({ ...row, label: row.campaign }))} />{data.campaigns.map((campaign) => <Card key={campaign.campaign}><CardContent className="space-y-3 p-5"><h2 className="font-medium">{campaign.campaign}</h2><p className="text-xs text-muted-foreground">{t("appStoreAnalytics.dailyTrend")}</p><div className="h-40"><ResponsiveContainer width="100%" height="100%"><LineChart data={campaign.trend}><XAxis dataKey="date" /><YAxis /><Tooltip /><Line dataKey="downloads" stroke="var(--chart-1)" connectNulls={false} /></LineChart></ResponsiveContainer></div></CardContent></Card>)}</> : <p className="rounded-lg border p-8 text-center text-sm text-muted-foreground">{t(page.isSuccess ? "appStoreAnalytics.noCampaignData" : "appStoreAnalytics.reportUnavailable")}</p>}
      </TabsContent>
    </Tabs>
  </div>;
}
