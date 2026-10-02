import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/client/datetime";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function AppStoreAnalyticsStatusPanel({ connectionId, isActive }: { connectionId: number; isActive: boolean }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const status = useQuery({ queryKey: ["app-store-analytics-status", connectionId], queryFn: () => api.getAppStoreAnalyticsStatus(connectionId) });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof api.syncAppStoreAnalytics>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const setup = async () => {
    setBusy(true); setError(null); setResult(null);
    try {
      const next = await api.setupAppStoreAnalytics(connectionId);
      queryClient.setQueryData(["app-store-analytics-status", connectionId], next);
      await queryClient.invalidateQueries({ queryKey: ["app-store-connection", connectionId] });
    } catch (error) { setError(error instanceof Error ? error.message : t("appStoreAnalytics.operationError")); }
    finally { setBusy(false); }
  };
  const sync = async () => {
    setBusy(true); setError(null); setResult(null);
    try {
      const result = await api.syncAppStoreAnalytics(connectionId);
      setResult(result);
      if (result.errors.length) setError(result.errors.join("; "));
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["app-store-analytics"] }), queryClient.invalidateQueries({ queryKey: ["app-store-analytics-status", connectionId] }), queryClient.invalidateQueries({ queryKey: ["app-store-connection", connectionId] })]);
    } catch (e) { setError(e instanceof Error ? e.message : t("appStoreAnalytics.operationError")); }
    finally { setBusy(false); }
  };
  const data = status.data;
  return <Card><CardContent className="space-y-4 p-5">
    <h3 className="font-semibold">{t("appStoreAnalytics.analytics")}</h3>
    {status.isLoading ? <p role="status">{t("common.loading")}</p> : status.isError ? <p role="alert" className="text-sm text-destructive">{status.error.message}</p> : data && <>
      <p className="text-sm">{t(`appStoreAnalytics.state.${data.state}`)}</p>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="text-muted-foreground">{t("appStoreAnalytics.enabledApps")}</dt><dd>{data.enabledApps}</dd></div>
        <div><dt className="text-muted-foreground">{t("appStoreAnalytics.snapshot")}</dt><dd>{t(`appStoreAnalytics.requestState.${data.snapshot}`)}</dd></div>
        <div><dt className="text-muted-foreground">{t("appStoreAnalytics.ongoing")}</dt><dd>{t(`appStoreAnalytics.requestState.${data.ongoing}`)}</dd></div>
        <div><dt className="text-muted-foreground">{t("appStoreAnalytics.latestData")}</dt><dd>{data.latestData ?? "—"}</dd></div>
        <div><dt className="text-muted-foreground">{t("appStoreAnalytics.completeThrough")}</dt><dd>{data.completeThrough ?? "—"}</dd></div>
        <div><dt className="text-muted-foreground">{t("appStoreAnalytics.lastSync")}</dt><dd>{data.lastSync?.finished_at ? formatDateTime(data.lastSync.finished_at) : "—"}</dd></div>
      </dl>
      {data.state === "waiting" && !data.latestData && <p className="text-sm text-muted-foreground">{t("appStoreAnalytics.waitingHelp")}</p>}
      {data.message && <p role={data.state === "error" || data.state === "partial" ? "alert" : "status"} className={`text-sm ${data.state === "error" || data.state === "partial" ? "text-destructive" : "text-muted-foreground"}`}>{data.message}</p>}
    </>}
    {result && <div role="status" className="space-y-1 text-sm"><p>{t(`revenue.status.${result.status}`)}</p>{result.waitingReasons?.map((reason, index) => <p key={index} className="text-muted-foreground">{reason}</p>)}</div>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="flex flex-wrap gap-2">
      <Button disabled={busy || !isActive || !data?.enabledApps} onClick={() => void sync()}>{t("appStoreAnalytics.sync")}</Button>
      <Button variant="outline" disabled={busy || !isActive || !data?.enabledApps} onClick={() => void setup()}>{t(busy ? "appStoreAnalytics.settingUp" : "appStoreAnalytics.setup")}</Button>
    </div>
  </CardContent></Card>;
}
