import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Eye, MousePointerClick, Plus, UsersRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MetricCard, MetricCardSkeleton } from "@/components/domain/shared/MetricCard";
import { MetricGrid } from "@/components/domain/shared/MetricGrid";
import { ApiError, api } from "@/lib/api";
import { notifications } from "@/components/ui/notifications";
import { pageMeta, type PageTitleKey, type TitleHandle } from "@/lib/page-titles";

const titleKey = "nav.analytics" satisfies PageTitleKey;
export const meta = pageMeta(titleKey);
export const handle = { titleKey } satisfies TitleHandle;

export default function WebAnalyticsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [selectedSiteId, setSelectedSiteId] = useState<number>();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const sitesQuery = useQuery({ queryKey: ["analytics", "sites"], queryFn: api.getAnalyticsSites });
  const sites = sitesQuery.data?.sites ?? [];
  const selectedSite = sites.find((site) => site.id === selectedSiteId) ?? sites[0];
  const createSite = useMutation({
    mutationFn: api.createAnalyticsSite,
    onSuccess: async (site) => {
      setSelectedSiteId(site.id);
      setShowForm(false);
      setName(""); setHost("");
      await queryClient.invalidateQueries({ queryKey: ["analytics", "sites"] });
    },
  });
  const { data, isPending, isError } = useQuery({
    queryKey: ["analytics", "overview", selectedSite?.id, "7d"],
    queryFn: () => api.getAnalyticsOverview(selectedSite!.id),
    enabled: Boolean(selectedSite),
    staleTime: 5 * 60 * 1000,
  });
  const installationQuery = useQuery({
    queryKey: ["analytics", "installation", selectedSite?.id],
    queryFn: () => api.getAnalyticsInstallation(selectedSite!.id),
    enabled: Boolean(selectedSite),
  });
  const publicOriginNotConfigured = installationQuery.error instanceof ApiError
    && installationQuery.error.message === "Analytics public URL is not configured";

  async function copyTrackingCode() {
    try {
      await navigator.clipboard.writeText(installationQuery.data!.snippet);
      notifications.show({ message: t("analytics.copySuccess"), color: "green" });
    } catch {
      notifications.show({ message: t("analytics.copyError"), color: "red" });
    }
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">{t("analytics.heading")}</h1>
        <p className="text-sm text-muted-foreground">{t("analytics.period")}</p>
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
        {sites.length > 1 ? <Select value={String(selectedSite?.id ?? "")} onValueChange={(value) => setSelectedSiteId(Number(value))}>
          <SelectTrigger className="w-full sm:w-72" aria-label={t("analytics.selectSite")}><SelectValue placeholder={t("analytics.selectSite")} /></SelectTrigger>
          <SelectContent>{sites.map((site) => <SelectItem key={site.id} value={String(site.id)}>{site.name} · {site.host}</SelectItem>)}</SelectContent>
        </Select> : <div className="text-sm font-medium">{selectedSite?.name} <span className="text-muted-foreground">· {selectedSite?.host}</span></div>}
        <Button variant="outline" onClick={() => setShowForm((visible) => !visible)}><Plus />{t("analytics.addSite")}</Button>
      </div> : null}

      {showForm ? <form className="grid gap-4 rounded-xl border bg-card p-5 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); createSite.mutate({ name, host }); }}>
        <div className="space-y-2"><Label htmlFor="analytics-site-name">{t("analytics.name")}</Label><Input id="analytics-site-name" value={name} onChange={(event) => setName(event.target.value)} required /></div>
        <div className="space-y-2"><Label htmlFor="analytics-site-host">{t("analytics.host")}</Label><Input id="analytics-site-host" value={host} onChange={(event) => setHost(event.target.value)} placeholder="example.com" required /></div>
        {createSite.isError ? <p className="text-sm text-destructive sm:col-span-3">{t("analytics.createError")}</p> : null}
        <div className="flex gap-2 sm:col-span-3"><Button type="submit" disabled={createSite.isPending}>{createSite.isPending ? t("analytics.saving") : t("analytics.saveSite")}</Button><Button type="button" variant="outline" onClick={() => setShowForm(false)}>{t("common.cancel")}</Button></div>
      </form> : null}

      {selectedSite && isPending ? (
        <MetricGrid columns="three">
          {Array.from({ length: 3 }, (_, index) => <MetricCardSkeleton key={index} />)}
        </MetricGrid>
      ) : selectedSite && isError ? (
        <Alert variant="destructive">
          <AlertTitle>{t("analytics.loadErrorTitle")}</AlertTitle>
          <AlertDescription>{t("analytics.loadErrorDescription")}</AlertDescription>
        </Alert>
      ) : selectedSite && data ? (
        <MetricGrid columns="three">
          <MetricCard icon={<Eye />} label={t("analytics.views")} value={data.views} />
          <MetricCard icon={<UsersRound />} label={t("analytics.visitors")} value={data.visitors} />
          <MetricCard icon={<MousePointerClick />} label={t("analytics.visits")} value={data.visits} />
        </MetricGrid>
      ) : null}

      {selectedSite ? <section className="space-y-4 rounded-xl border bg-card p-5" aria-labelledby="analytics-tracking-setup">
        <div>
          <h2 id="analytics-tracking-setup" className="text-lg font-semibold">{t("analytics.trackingSetup")}</h2>
          {!isPending && !isError ? <p className="mt-1 text-sm text-muted-foreground">{data?.views ? t("analytics.receivingData") : t("analytics.noData")}</p> : null}
        </div>
        {installationQuery.isPending ? <p className="text-sm text-muted-foreground">{t("analytics.installationLoading")}</p> : null}
        {installationQuery.isError ? <Alert variant={publicOriginNotConfigured ? "default" : "destructive"}>
          <AlertTitle>{publicOriginNotConfigured ? t("analytics.publicOriginNotConfigured") : t("analytics.loadErrorTitle")}</AlertTitle>
          <AlertDescription>{publicOriginNotConfigured ? t("analytics.publicOriginNotConfiguredDescription") : t("analytics.installationLoadError")}</AlertDescription>
        </Alert> : null}
        {installationQuery.data ? <div className="space-y-3">
          <p className="text-sm font-medium">{t("analytics.trackingCode")}</p>
          <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs"><code>{installationQuery.data.snippet}</code></pre>
          <Button variant="outline" onClick={copyTrackingCode}>{t("analytics.copyCode")}</Button>
        </div> : null}
      </section> : null}
    </div>
  );
}
