import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useSyncExternalStore } from "react";
import { Eye, Globe2, MousePointerClick, PanelsTopLeft, Plus, UsersRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AnalyticsDimensionCard } from "@/components/domain/analytics/AnalyticsDimensionCard";
import { AnalyticsAtAGlance } from "@/components/domain/analytics/AnalyticsAtAGlance";
import { AnalyticsWorldMap } from "@/components/domain/analytics/AnalyticsWorldMap";
import { ChartCard } from "@/components/domain/shared/ChartCard";
import { MetricCard, MetricCardSkeleton } from "@/components/domain/shared/MetricCard";
import { MetricGrid } from "@/components/domain/shared/MetricGrid";
import { api } from "@/lib/api";
import { compareAnalyticsPeriod } from "@/lib/client/analytics-comparison";
import { getAnalyticsPage, type AnalyticsRange } from "@/lib/client/analytics-graphql";
import { getTimezone } from "@/lib/client/datetime";
import { calcYAxisWidth } from "@/lib/client/utils";
import { useIsMobile } from "@/lib/client/useIsMobile";
import { notifications } from "@/components/ui/notifications";
import { pageMeta, type PageTitleKey, type TitleHandle } from "@/lib/page-titles";

const titleKey = "nav.analytics" satisfies PageTitleKey;
export const meta = pageMeta(titleKey);
export const handle = { titleKey } satisfies TitleHandle;

function countryLabel(code: string, locale: string, unknownLabel: string): string {
  if (code === "Unknown") return unknownLabel;
  try {
    const name = new Intl.DisplayNames([locale], { type: "region" }).of(code);
    return name && name !== code ? `${name} (${code})` : code;
  } catch {
    return code;
  }
}

export default function WebAnalyticsPage() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const timezone = useSyncExternalStore(
    () => () => {},
    getTimezone,
    () => null,
  );
  const [selectedSiteId, setSelectedSiteId] = useState<"all" | number>("all");
  const [selectedRange, setSelectedRange] = useState<AnalyticsRange>("DAYS_7");
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [showRenameForm, setShowRenameForm] = useState(false);
  const [siteName, setSiteName] = useState("");
  const pageQuery = useQuery({
    queryKey: ["analytics-page", selectedSiteId, selectedRange, timezone],
    queryFn: ({ signal }) => getAnalyticsPage({
      range: selectedRange,
      timezone: timezone!,
      siteId: typeof selectedSiteId === "number" ? selectedSiteId : 0,
      showGlobal: selectedSiteId === "all",
      showSite: typeof selectedSiteId === "number",
    }, signal),
    enabled: Boolean(timezone),
    placeholderData: (previousData) => previousData,
    staleTime: 5 * 60_000,
  });
  const sitesQuery = pageQuery;
  const sites = pageQuery.data?.sites ?? [];
  const selectedSite = typeof selectedSiteId === "number"
    ? sites.find((site) => site.id === selectedSiteId)
    : undefined;
  const createSite = useMutation({
    mutationFn: api.createAnalyticsSite,
    onSuccess: async (site) => {
      setSelectedSiteId(site.id);
      setShowForm(false);
      setName(""); setHost("");
      await queryClient.invalidateQueries({ queryKey: ["analytics-page"] });
    },
  });
  const renameSite = useMutation({
    mutationFn: () => api.renameAnalyticsSite(selectedSite!.id, { name: siteName }),
    onSuccess: async () => {
      setShowRenameForm(false);
      await queryClient.invalidateQueries({ queryKey: ["analytics-page"] });
    },
  });
  const dashboard = pageQuery.data?.dashboard ?? undefined;
  const globalDashboard = pageQuery.data?.globalDashboard ?? undefined;
  const acquisition = dashboard?.acquisition;
  const installation = pageQuery.data?.installation ?? undefined;
  const publicOriginNotConfigured = pageQuery.error instanceof Error
    && pageQuery.error.message === "Analytics public URL is not configured";
  const totalViews = dashboard?.overview.views ?? 0;
  const dimensionCardLabels = {
    totalValue: totalViews,
    metricLabel: t("analytics.views"),
    shareLabel: t("analytics.share"),
    loadingLabel: t("common.loading"),
    loading: !dashboard,
  };
  const dimensionData = dashboard?.dimensions;
  const countryLocale = i18n.resolvedLanguage ?? i18n.language;
  const summaryNumber = new Intl.NumberFormat(countryLocale);
  const topPage = dashboard?.topPages[0];
  const topSource = dashboard?.acquisition.referrers[0];
  const topCountry = dashboard?.dimensions.countries[0];
  const topCampaign = dashboard?.acquisition.campaigns[0];
  const topGlobalSite = globalDashboard?.sites[0];
  const topGlobalSource = globalDashboard?.acquisition.referrers[0];
  const topGlobalCountry = globalDashboard?.dimensions.countries[0];
  const topGlobalCampaign = globalDashboard?.acquisition.campaigns[0];
  const globalCampaignSourceMedium = `${topGlobalCampaign?.source || "—"} / ${topGlobalCampaign?.medium || "—"}`;
  const globalGlanceItems = [
    {
      key: "site",
      label: t("analytics.topSite"),
      value: topGlobalSite?.name ?? "—",
      detail: topGlobalSite ? `${topGlobalSite.host} · ${summaryNumber.format(topGlobalSite.views)} ${t("analytics.views")}` : undefined,
      title: topGlobalSite?.name,
    },
    {
      key: "source",
      label: t("analytics.topSource"),
      value: topGlobalSource ? (topGlobalSource.referrer === "" ? t("analytics.direct") : topGlobalSource.referrer) : "—",
      detail: topGlobalSource ? `${summaryNumber.format(topGlobalSource.visits)} ${t("analytics.visits")}` : undefined,
      title: topGlobalSource?.referrer || (topGlobalSource ? t("analytics.direct") : undefined),
    },
    {
      key: "country",
      label: t("analytics.topCountry"),
      value: topGlobalCountry ? countryLabel(topGlobalCountry.country, countryLocale, t("analytics.unknown")) : "—",
      detail: topGlobalCountry ? `${summaryNumber.format(topGlobalCountry.views)} ${t("analytics.views")}` : undefined,
      title: topGlobalCountry ? countryLabel(topGlobalCountry.country, countryLocale, t("analytics.unknown")) : undefined,
    },
    {
      key: "campaign",
      label: t("analytics.topCampaign"),
      value: topGlobalCampaign ? (topGlobalCampaign.campaign || globalCampaignSourceMedium) : "—",
      detail: topGlobalCampaign
        ? `${topGlobalCampaign.siteName} · ${globalCampaignSourceMedium} · ${summaryNumber.format(topGlobalCampaign.visits)} ${t("analytics.visits")}`
        : t("analytics.noCampaignDataSummary"),
      title: topGlobalCampaign ? `${topGlobalCampaign.siteHost} · ${topGlobalCampaign.campaign || globalCampaignSourceMedium}` : undefined,
    },
  ];
  const campaignSource = topCampaign?.source || "—";
  const campaignMedium = topCampaign?.medium || "—";
  const campaignSourceMedium = `${campaignSource} / ${campaignMedium}`;
  const glanceItems = [
    {
      key: "page",
      label: t("analytics.topPage"),
      value: topPage?.path ?? "—",
      detail: topPage ? `${summaryNumber.format(topPage.views)} ${t("analytics.views")}` : undefined,
      title: topPage?.path,
    },
    {
      key: "source",
      label: t("analytics.topSource"),
      value: topSource ? (topSource.referrer === "" ? t("analytics.direct") : topSource.referrer) : "—",
      detail: topSource ? `${summaryNumber.format(topSource.visits)} ${t("analytics.visits")}` : undefined,
      title: topSource?.referrer || (topSource ? t("analytics.direct") : undefined),
    },
    {
      key: "country",
      label: t("analytics.topCountry"),
      value: topCountry ? countryLabel(topCountry.country, countryLocale, t("analytics.unknown")) : "—",
      detail: topCountry ? `${summaryNumber.format(topCountry.views)} ${t("analytics.views")}` : undefined,
      title: topCountry ? countryLabel(topCountry.country, countryLocale, t("analytics.unknown")) : undefined,
    },
    {
      key: "campaign",
      label: t("analytics.topCampaign"),
      value: topCampaign ? (topCampaign.campaign || campaignSourceMedium) : "—",
      detail: topCampaign
        ? `${topCampaign.campaign ? `${campaignSourceMedium} · ` : ""}${summaryNumber.format(topCampaign.visits)} ${t("analytics.visits")}`
        : t("analytics.noCampaignDataSummary"),
      title: topCampaign ? `${topCampaign.campaign ? `${topCampaign.campaign} · ` : ""}${campaignSourceMedium}` : undefined,
    },
  ];

  function comparisonLabel(current: number, previous: number): string {
    const comparison = compareAnalyticsPeriod(current, previous);
    if (comparison.kind === "new") return t("analytics.newVsPrevious");
    if (comparison.kind === "no-change") return t("analytics.noChangeVsPrevious");
    return t("analytics.changeVsPrevious", { percentage: comparison.percentage });
  }

  async function copyTrackingCode() {
    try {
      await navigator.clipboard.writeText(installation!.snippet);
      notifications.show({ message: t("analytics.copySuccess"), color: "green" });
    } catch {
      notifications.show({ message: t("analytics.copyError"), color: "red" });
    }
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">{t("analytics.heading")}</h1>
        <p className="text-sm text-muted-foreground">{t("analytics.period", { days: selectedRange === "DAYS_7" ? 7 : selectedRange === "DAYS_30" ? 30 : 90 })}</p>
      </header>

      {sitesQuery.isError ? <Alert variant="destructive"><AlertTitle>{t("analytics.loadErrorTitle")}</AlertTitle><AlertDescription>{t("analytics.sitesLoadError")}</AlertDescription></Alert> : null}

      {!sitesQuery.isPending && sites.length === 0 ? (
        <section className="rounded-xl border bg-card p-8 text-center">
          <h2 className="text-lg font-semibold">{t("analytics.emptyTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("analytics.emptyDescription")}</p>
          <Button className="mt-5" onClick={() => setShowForm((visible) => !visible)}><Plus />{t("analytics.addSite")}</Button>
        </section>
      ) : null}

      {sites.length > 0 ? <div className="flex flex-wrap items-center gap-3">
        <Select value={selectedSiteId === "all" ? "all" : String(selectedSiteId)} onValueChange={(value) => setSelectedSiteId(value === "all" ? "all" : Number(value))}>
          <SelectTrigger className="w-full sm:w-72" aria-label={t("analytics.selectSite")}><SelectValue placeholder={t("analytics.selectSite")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("analytics.allSites")}</SelectItem>
            {sites.map((site) => <SelectItem key={site.id} value={String(site.id)}>{site.name} · {site.host}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={() => setShowForm((visible) => !visible)}><Plus />{t("analytics.addSite")}</Button>
        {selectedSite && !showRenameForm ? <Button variant="outline" onClick={() => { setSiteName(selectedSite.name); setShowRenameForm(true); }}>{t("analytics.renameSite")}</Button> : null}
      </div> : null}

      {sites.length > 0 ? <div className="flex items-center gap-1" role="group" aria-label={t("analytics.range")}>{([
        ["DAYS_7", "7D"], ["DAYS_30", "30D"], ["DAYS_90", "90D"],
      ] as const).map(([range, label]) => <Button
        key={range}
        type="button"
        size="sm"
        variant={selectedRange === range ? "default" : "outline"}
        aria-pressed={selectedRange === range}
        onClick={() => setSelectedRange(range)}
      >{label}</Button>)}</div> : null}

      {showForm ? <form className="grid gap-4 rounded-xl border bg-card p-5 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); createSite.mutate({ name, host }); }}>
        <div className="space-y-2"><Label htmlFor="analytics-site-name">{t("analytics.name")}</Label><Input id="analytics-site-name" value={name} onChange={(event) => setName(event.target.value)} required /></div>
        <div className="space-y-2"><Label htmlFor="analytics-site-host">{t("analytics.host")}</Label><Input id="analytics-site-host" value={host} onChange={(event) => setHost(event.target.value)} placeholder="example.com" required /></div>
        {createSite.isError ? <p className="text-sm text-destructive sm:col-span-3">{t("analytics.createError")}</p> : null}
        <div className="flex gap-2 sm:col-span-3"><Button type="submit" disabled={createSite.isPending}>{createSite.isPending ? t("analytics.saving") : t("analytics.saveSite")}</Button><Button type="button" variant="outline" onClick={() => setShowForm(false)}>{t("common.cancel")}</Button></div>
      </form> : null}

      {showRenameForm && selectedSite ? <form className="grid gap-4 rounded-xl border bg-card p-5 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); renameSite.mutate(); }}>
        <div className="space-y-2"><Label htmlFor="analytics-site-rename">{t("analytics.siteName")}</Label><Input id="analytics-site-rename" value={siteName} onChange={(event) => setSiteName(event.target.value)} required maxLength={200} /></div>
        {renameSite.isError ? <p className="text-sm text-destructive sm:col-span-2">{t("analytics.renameError")}</p> : null}
        <div className="flex gap-2 sm:col-span-2"><Button type="submit" disabled={renameSite.isPending}>{renameSite.isPending ? t("analytics.renaming") : t("analytics.renameSite")}</Button><Button type="button" variant="outline" onClick={() => setShowRenameForm(false)}>{t("common.cancel")}</Button></div>
      </form> : null}

      {selectedSiteId === "all" && sites.length > 0 ? <>
        {pageQuery.isError ? <Alert variant="destructive">
          <AlertTitle>{t("analytics.loadErrorTitle")}</AlertTitle>
          <AlertDescription>{t("analytics.dashboardUnavailable")}</AlertDescription>
        </Alert> : <>
          {globalDashboard ? <MetricGrid columns="four">
            <MetricCard icon={<Eye />} label={t("analytics.views")} value={globalDashboard.overview.views} hint={comparisonLabel(globalDashboard.overview.views, globalDashboard.previousOverview.views)} />
            <MetricCard icon={<MousePointerClick />} label={t("analytics.visits")} value={globalDashboard.overview.visits} hint={comparisonLabel(globalDashboard.overview.visits, globalDashboard.previousOverview.visits)} />
            <MetricCard icon={<Globe2 />} label={t("analytics.activeSites")} value={globalDashboard.overview.activeSites} />
            <MetricCard icon={<PanelsTopLeft />} label={t("analytics.trackedSites")} value={globalDashboard.overview.trackedSites} />
          </MetricGrid> : <MetricGrid columns="four">{Array.from({ length: 4 }, (_, index) => <MetricCardSkeleton key={index} />)}</MetricGrid>}

          <AnalyticsAtAGlance
            title={t("analytics.atAGlance")}
            items={globalGlanceItems}
            emptyMessage={t("analytics.noSiteTrafficInPeriod")}
            loadingLabel={t("common.loading")}
            empty={Boolean(globalDashboard && globalDashboard.overview.trackedSites === 0)}
            loading={!globalDashboard}
          />

          <ChartCard title={t("analytics.trafficOverTime")}>
            {globalDashboard ? <>
              <div role="img" aria-label={t("analytics.trafficChartA11y")}>
                <ResponsiveContainer width="100%" height={isMobile ? 210 : 280}>
                  <LineChart data={globalDashboard.timeline} margin={{ top: 6, right: 8, bottom: 4, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="date" interval="preserveStartEnd" minTickGap={24} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickFormatter={(date: string) => date.slice(5)} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} width={calcYAxisWidth(globalDashboard.timeline, "views", "visits")} />
                    <Tooltip labelFormatter={(date) => String(date)} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "6px", fontSize: "12px" }} />
                    <Line type="monotone" dataKey="views" name={t("analytics.views")} stroke="var(--chart-1)" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="visits" name={t("analytics.visits")} stroke="var(--chart-2)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 pt-3 text-xs text-muted-foreground">
                {[["var(--chart-1)", t("analytics.views")], ["var(--chart-2)", t("analytics.visits")]].map(([color, label]) => <span key={label} className="inline-flex items-center gap-2"><span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: color }} />{label}</span>)}
              </div>
            </> : <div className="flex h-[210px] items-center justify-center text-sm text-muted-foreground">{t("common.loading")}</div>}
          </ChartCard>

          {globalDashboard ? <ChartCard title={t("analytics.visitorGeography")}>
            <AnalyticsWorldMap
              countries={globalDashboard.dimensions.countries}
              totalViews={globalDashboard.overview.views}
              locale={countryLocale}
              title={t("analytics.visitorGeography")}
              emptyMessage={t("analytics.noGeographicData")}
              lessLabel={t("analytics.less")}
              moreLabel={t("analytics.more")}
              viewsLabel={t("analytics.views")}
              zoomInLabel={t("analytics.zoomIn")}
              zoomOutLabel={t("analytics.zoomOut")}
              resetZoomLabel={t("analytics.resetMap")}
              interactionHelp={t("analytics.mapInteractionHelp")}
            />
          </ChartCard> : null}

          <ChartCard title={t("analytics.topSites")}>
            {globalDashboard && globalDashboard.overview.views === 0 ? <p className="mb-3 text-sm text-muted-foreground">{t("analytics.noSiteTrafficInPeriod")}</p> : null}
            {globalDashboard?.sites.length ? <ol className="divide-y">
              {globalDashboard.sites.slice(0, 10).map((site, index) => <li key={site.id} className="flex min-w-0 items-center gap-3 py-3 first:pt-0 last:pb-0">
                <span className="w-6 shrink-0 text-right text-sm text-muted-foreground">{index + 1}</span>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium" title={site.name}>{site.name}</p><p className="truncate text-xs text-muted-foreground" title={site.host}>{site.host}</p></div>
                <div className="shrink-0 text-right text-sm tabular-nums"><p>{summaryNumber.format(site.views)} {t("analytics.views")}</p><p className="text-xs text-muted-foreground">{summaryNumber.format(site.visits)} {t("analytics.visits")}</p></div>
              </li>)}
            </ol> : <p className="text-sm text-muted-foreground">{t("analytics.noSites")}</p>}
          </ChartCard>

          <div className="grid min-w-0 gap-4 lg:grid-cols-2">
            <AnalyticsDimensionCard totalValue={globalDashboard?.overview.views ?? 0} metricLabel={t("analytics.views")} shareLabel={t("analytics.share")} loadingLabel={t("common.loading")} loading={!globalDashboard} title={t("analytics.countries")} itemLabel={t("analytics.country")} emptyMessage={t("analytics.noCountryData")} items={(globalDashboard?.dimensions.countries ?? []).slice(0, 10).map((item) => ({ key: item.country, label: countryLabel(item.country, countryLocale, t("analytics.unknown")), title: item.country, value: item.views }))} />
            <AnalyticsDimensionCard totalValue={globalDashboard?.overview.views ?? 0} metricLabel={t("analytics.views")} shareLabel={t("analytics.share")} loadingLabel={t("common.loading")} loading={!globalDashboard} title={t("analytics.browsers")} itemLabel={t("analytics.browser")} emptyMessage={t("analytics.noBrowserData")} items={(globalDashboard?.dimensions.browsers ?? []).map((item) => ({ key: item.browser, label: item.browser, value: item.views }))} />
            <AnalyticsDimensionCard totalValue={globalDashboard?.overview.views ?? 0} metricLabel={t("analytics.views")} shareLabel={t("analytics.share")} loadingLabel={t("common.loading")} loading={!globalDashboard} title={t("analytics.operatingSystems")} itemLabel={t("analytics.operatingSystem")} emptyMessage={t("analytics.noOperatingSystemData")} items={(globalDashboard?.dimensions.operatingSystems ?? []).map((item) => ({ key: item.os, label: item.os, value: item.views }))} />
            <AnalyticsDimensionCard totalValue={globalDashboard?.overview.views ?? 0} metricLabel={t("analytics.views")} shareLabel={t("analytics.share")} loadingLabel={t("common.loading")} loading={!globalDashboard} title={t("analytics.devices")} itemLabel={t("analytics.device")} emptyMessage={t("analytics.noDeviceData")} items={(globalDashboard?.dimensions.devices ?? []).map((item) => ({ key: item.device, label: item.device, value: item.views }))} />
          </div>

          <section className="min-w-0 space-y-3" aria-labelledby="analytics-acquisition-heading">
            <h2 id="analytics-acquisition-heading" className="text-lg font-semibold">{t("analytics.acquisition")}</h2>
            <div className="grid min-w-0 gap-4 lg:grid-cols-2">
              <AnalyticsDimensionCard title={t("analytics.referrers")} itemLabel={t("analytics.referrer")} metricLabel={t("analytics.visits")} totalValue={globalDashboard?.acquisition.totalVisits ?? 0} shareLabel={t("analytics.share")} emptyMessage={t("analytics.noAcquisitionReferrerData")} loadingLabel={t("common.loading")} loading={!globalDashboard} items={(globalDashboard?.acquisition.referrers ?? []).map((item) => ({ key: item.referrer || "direct", label: item.referrer === "" ? t("analytics.direct") : item.referrer, title: item.referrer, value: item.visits }))} />
              <AnalyticsDimensionCard title={t("analytics.campaigns")} itemLabel={t("analytics.campaign")} metricLabel={t("analytics.visits")} totalValue={globalDashboard?.acquisition.totalVisits ?? 0} shareLabel={t("analytics.share")} emptyMessage={t("analytics.noCampaignData")} loadingLabel={t("common.loading")} loading={!globalDashboard} items={(globalDashboard?.acquisition.campaigns ?? []).map((item) => {
                const source = item.source || "—";
                const medium = item.medium || "—";
                const label = `${item.campaign || `${source} / ${medium}`} · ${item.siteName}`;
                return { key: `${item.siteId}\u0000${item.source}\u0000${item.medium}\u0000${item.campaign}`, label, title: `${item.siteHost} · ${label}`, value: item.visits };
              })} />
            </div>
          </section>
        </>}
      </> : null}

      {selectedSite ? <>
        {pageQuery.isError ? <Alert variant="destructive">
          <AlertTitle>{t("analytics.loadErrorTitle")}</AlertTitle>
          <AlertDescription>{t("analytics.dashboardUnavailable")}</AlertDescription>
        </Alert> : <>
        {dashboard ? <MetricGrid columns="three">
          <MetricCard icon={<Eye />} label={t("analytics.views")} value={dashboard.overview.views} hint={comparisonLabel(dashboard.overview.views, dashboard.previousOverview.views)} />
          <MetricCard icon={<UsersRound />} label={t("analytics.averageDailyVisitors")} value={Math.round(dashboard.overview.visitorDays / dashboard.period.days)} hint={comparisonLabel(dashboard.overview.visitorDays / dashboard.period.days, dashboard.previousOverview.visitorDays / dashboard.previousPeriod.days)} />
          <MetricCard icon={<MousePointerClick />} label={t("analytics.visits")} value={dashboard.overview.visits} hint={comparisonLabel(dashboard.overview.visits, dashboard.previousOverview.visits)} />
        </MetricGrid> : <MetricGrid columns="three">
          {Array.from({ length: 3 }, (_, index) => <MetricCardSkeleton key={index} />)}
        </MetricGrid>}

        <AnalyticsAtAGlance
          title={t("analytics.atAGlance")}
          items={glanceItems}
          emptyMessage={t("analytics.noAnalyticsDataInPeriod")}
          loadingLabel={t("common.loading")}
          empty={Boolean(dashboard && dashboard.overview.views === 0)}
          loading={!dashboard}
        />

        <ChartCard title={t("analytics.trafficOverTime")}>
          {dashboard ? (
            <>
              <div role="img" aria-label={t("analytics.trafficChartA11y")}>
              <ResponsiveContainer width="100%" height={isMobile ? 210 : 280}>
                <LineChart data={dashboard.timeline} margin={{ top: 6, right: 8, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" interval="preserveStartEnd" minTickGap={24} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickFormatter={(date: string) => date.slice(5)} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} width={calcYAxisWidth(dashboard.timeline, "views", "visitors", "visits")} />
                  <Tooltip
                    labelFormatter={(date) => String(date)}
                    contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "6px", fontSize: "12px" }}
                  />
                  <Line type="monotone" dataKey="views" name={t("analytics.views")} stroke="var(--chart-1)" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="visitors" name={t("analytics.visitors")} stroke="var(--chart-2)" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="visits" name={t("analytics.visits")} stroke="var(--chart-3)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 pt-3 text-xs text-muted-foreground">
                {[
                  ["var(--chart-1)", t("analytics.views")],
                  ["var(--chart-2)", t("analytics.visitors")],
                  ["var(--chart-3)", t("analytics.visits")],
                ].map(([color, label]) => <span key={label} className="inline-flex items-center gap-2">
                  <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: color }} />{label}
                </span>)}
              </div>
            </>
          ) : <div className="flex h-[210px] items-center justify-center text-sm text-muted-foreground">{t("common.loading")}</div>}
        </ChartCard>

        {dashboard ? <ChartCard title={t("analytics.visitorGeography")}>
          <AnalyticsWorldMap
            countries={dimensionData?.countries ?? []}
            totalViews={totalViews}
            locale={countryLocale}
            title={t("analytics.visitorGeography")}
            emptyMessage={t("analytics.noGeographicData")}
            lessLabel={t("analytics.less")}
            moreLabel={t("analytics.more")}
            viewsLabel={t("analytics.views")}
            zoomInLabel={t("analytics.zoomIn")}
            zoomOutLabel={t("analytics.zoomOut")}
            resetZoomLabel={t("analytics.resetMap")}
            interactionHelp={t("analytics.mapInteractionHelp")}
          />
        </ChartCard> : null}

        <div className="grid min-w-0 gap-4 lg:grid-cols-2">
          <AnalyticsDimensionCard
            {...dimensionCardLabels}
            title={t("analytics.topPages")}
            itemLabel={t("analytics.page")}
            emptyMessage={t("analytics.noPageViews")}
            items={(dashboard?.topPages ?? []).map((page) => ({ key: page.path, label: page.path, title: page.path, value: page.views }))}
          />
          <AnalyticsDimensionCard
            {...dimensionCardLabels}
            title={t("analytics.countries")}
            itemLabel={t("analytics.country")}
            emptyMessage={t("analytics.noCountryData")}
            items={(dimensionData?.countries ?? []).slice(0, 10).map((item) => ({
              key: item.country,
              label: countryLabel(item.country, countryLocale, t("analytics.unknown")),
              title: item.country,
              value: item.views,
            }))}
          />
        </div>
        <div className="grid min-w-0 gap-4 lg:grid-cols-2">
          <AnalyticsDimensionCard
            {...dimensionCardLabels}
            title={t("analytics.browsers")}
            itemLabel={t("analytics.browser")}
            emptyMessage={t("analytics.noBrowserData")}
            items={(dimensionData?.browsers ?? []).map((item) => ({ key: item.browser, label: item.browser, value: item.views }))}
          />
        </div>
        <div className="grid min-w-0 gap-4 lg:grid-cols-2">
          <AnalyticsDimensionCard
            {...dimensionCardLabels}
            title={t("analytics.operatingSystems")}
            itemLabel={t("analytics.operatingSystem")}
            emptyMessage={t("analytics.noOperatingSystemData")}
            items={(dimensionData?.operatingSystems ?? []).map((item) => ({ key: item.os, label: item.os, value: item.views }))}
          />
        </div>
        <div className="grid min-w-0 gap-4 lg:grid-cols-2">
          <AnalyticsDimensionCard
            {...dimensionCardLabels}
            title={t("analytics.devices")}
            itemLabel={t("analytics.device")}
            emptyMessage={t("analytics.noDeviceData")}
            items={(dimensionData?.devices ?? []).map((item) => ({ key: item.device, label: item.device, value: item.views }))}
          />
        </div>
        </>}

        <section className="min-w-0 space-y-3" aria-labelledby="analytics-acquisition-heading">
          <h2 id="analytics-acquisition-heading" className="text-lg font-semibold">{t("analytics.acquisition")}</h2>
          <div className="grid min-w-0 gap-4 lg:grid-cols-2">
            <AnalyticsDimensionCard
              title={t("analytics.referrers")}
              itemLabel={t("analytics.referrer")}
              metricLabel={t("analytics.visits")}
              totalValue={acquisition?.totalVisits ?? 0}
              shareLabel={t("analytics.share")}
              emptyMessage={t("analytics.noAcquisitionReferrerData")}
              loadingLabel={t("common.loading")}
              loading={!dashboard}
              items={(acquisition?.referrers ?? []).map((item) => ({
                key: item.referrer,
                label: item.referrer === "" ? t("analytics.direct") : item.referrer,
                title: item.referrer,
                value: item.visits,
              }))}
            />
          <AnalyticsDimensionCard
            title={t("analytics.entryPages")}
              itemLabel={t("analytics.entryPage")}
              metricLabel={t("analytics.visits")}
              totalValue={acquisition?.totalVisits ?? 0}
              shareLabel={t("analytics.share")}
              emptyMessage={t("analytics.noEntryPageData")}
              loadingLabel={t("common.loading")}
              loading={!dashboard}
              items={(acquisition?.entryPages ?? []).map((item) => ({
                key: item.path,
                label: item.path,
                title: item.path,
                value: item.visits,
              }))}
            />
          <AnalyticsDimensionCard
            title={t("analytics.campaigns")}
            itemLabel={t("analytics.campaign")}
            metricLabel={t("analytics.visits")}
            totalValue={acquisition?.totalVisits ?? 0}
            shareLabel={t("analytics.share")}
            emptyMessage={t("analytics.noCampaignData")}
            loadingLabel={t("common.loading")}
            loading={!dashboard}
            items={(acquisition?.campaigns ?? []).map((item) => {
              const source = item.source || "—";
              const medium = item.medium || "—";
              const label = item.campaign ? `${item.campaign} · ${source} / ${medium}` : `${source} / ${medium}`;
              return {
                key: `${item.source}\u0000${item.medium}\u0000${item.campaign}`,
                label,
                title: label,
                value: item.visits,
              };
            })}
          />
          </div>
        </section>

        <section className="min-w-0 space-y-4 rounded-xl border bg-card p-5" aria-labelledby="analytics-tracking-setup">
          <div>
            <h2 id="analytics-tracking-setup" className="text-lg font-semibold">{t("analytics.trackingSetup")}</h2>
            {dashboard ? <p className="mt-1 text-sm text-muted-foreground">{dashboard.overview.views ? t("analytics.receivingData") : t("analytics.noData")}</p> : null}
          </div>
          {pageQuery.isPending ? <p className="text-sm text-muted-foreground">{t("analytics.installationLoading")}</p> : null}
          {pageQuery.isError ? <Alert variant={publicOriginNotConfigured ? "default" : "destructive"}>
            <AlertTitle>{publicOriginNotConfigured ? t("analytics.publicOriginNotConfigured") : t("analytics.loadErrorTitle")}</AlertTitle>
            <AlertDescription>{publicOriginNotConfigured ? t("analytics.publicOriginNotConfiguredDescription") : t("analytics.installationLoadError")}</AlertDescription>
          </Alert> : null}
          {installation ? <div className="space-y-3">
            <p className="text-sm font-medium">{t("analytics.trackingCode")}</p>
            <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs"><code>{installation.snippet}</code></pre>
            <Button variant="outline" onClick={copyTrackingCode}>{t("analytics.copyCode")}</Button>
          </div> : null}
        </section>
      </> : null}
    </div>
  );
}
