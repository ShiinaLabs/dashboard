import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { latestSalesReportDate } from "@/shared/app-store-revenue";

export function RevenueSyncPanel({ connectionId, isActive, vendorNumber, onEdit }: { connectionId: number; isActive: boolean; vendorNumber: string | null; onEdit: () => void }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [range, setRange] = useState(7);
  const [month, setMonth] = useState(() => new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 1, 1)).toISOString().slice(0, 7));
  const [result, setResult] = useState<Awaited<ReturnType<typeof api.syncAppStoreRevenue>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sync = async () => {
    setBusy(true); setError(null); setResult(null);
    const to = latestSalesReportDate();
    const from = new Date(Date.parse(to) - (range - 1) * 86400000).toISOString().slice(0, 10);
    try {
      setResult(await api.syncAppStoreRevenue(connectionId, { from, to, fiscalMonth: month, regionCode: "ZZ" }));
      await Promise.all([client.invalidateQueries({ queryKey: ["app-store-revenue"] }), client.invalidateQueries({ queryKey: ["app-store-connection", connectionId] })]);
    } catch (e) { setError(e instanceof Error ? e.message : t("revenue.syncError")); }
    finally { setBusy(false); }
  };
  return <Card><CardContent className="space-y-4 p-5">
    <h3 className="font-semibold">{t("nav.revenue")}</h3>
    {vendorNumber && <dl className="grid gap-3 text-sm sm:grid-cols-3"><div><dt className="text-muted-foreground">{t("appStore.vendorNumber")}</dt><dd>{vendorNumber}</dd></div>{["sales", "finance"].map((source) => <div key={source}><dt className="text-muted-foreground">{t(`revenue.sources.${source}`)}</dt><dd>{t("revenue.vendorReady")}</dd></div>)}</dl>}
    {!vendorNumber && <div className="space-y-2"><p className="text-sm text-muted-foreground">{t("revenue.setupRequired")}</p><Button variant="outline" onClick={onEdit}>{t("revenue.addVendor")}</Button></div>}
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-2"><Label>{t("revenue.salesDates")}</Label><div className="flex gap-1">{[7, 30, 90].map((days) => <Button key={days} size="sm" variant={range === days ? "secondary" : "ghost"} aria-pressed={range === days} onClick={() => setRange(days)}>{days}D</Button>)}</div></div>
      <div className="space-y-2"><Label htmlFor={`finance-month-${connectionId}`}>{t("revenue.fiscalMonth")}</Label><Input id={`finance-month-${connectionId}`} type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></div>
      <Button disabled={busy || !isActive || !month} onClick={() => void sync()}>{t(busy ? "revenue.syncing" : "revenue.sync")}</Button>
    </div>
    <p className="text-xs text-muted-foreground">{t("revenue.syncHelp")}</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {result && <div role="status" className="space-y-2 text-sm"><p>{t(`revenue.status.${result.status}`)}</p>{Object.entries(result.sources).map(([source, outcome]) => <div key={source}><p>{t(`revenue.sources.${source}`)}: {t(`revenue.status.${outcome.status}`)} · {t("revenue.imported")}: {outcome.imported} · {t("revenue.skipped")}: {outcome.skipped} · {t("revenue.waiting")}: {outcome.waiting}</p>{outcome.waitingReasons?.map((reason, index) => <p key={`waiting-${index}`} className="text-muted-foreground">{reason}</p>)}{outcome.errors.map((message, index) => <p key={index} className="text-destructive">{message}</p>)}</div>)}</div>}
  </CardContent></Card>;
}
