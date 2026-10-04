import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getRevenuePage } from "@/lib/client/graphql/app-store";
import { formatRevenueDecimal } from "@/lib/client/revenue-format";
import { pageMeta, type PageTitleKey, type TitleHandle } from "@/lib/page-titles";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { RevenueAmounts, RevenueDashboard } from "@/shared/app-store-revenue";

const titleKey = "nav.revenue" satisfies PageTitleKey;
export const meta = pageMeta(titleKey);
export const handle = { titleKey } satisfies TitleHandle;
const value = (amount: string | null | undefined) => amount ?? "—";
const decimalValue = formatRevenueDecimal;
function revenueChartRows(trend: RevenueDashboard["trend"], currency: string, from: string, to: string, completeThrough: string | null) {
  const rows = trend.filter((row) => row.currency === currency);
  const byDate = new Map(rows.map((row) => [row.date, row]));
  const hasProceeds = rows.some((row) => row.proceeds !== null), hasSales = rows.some((row) => row.sales !== null);
  const result: { date: string; proceeds: number | null; sales: number | null }[] = [];
  for (let time = Date.parse(`${from}T00:00:00Z`); time <= Date.parse(`${to}T00:00:00Z`); time += 86400000) {
    const date = new Date(time).toISOString().slice(0, 10), row = byDate.get(date);
    const covered = completeThrough !== null && date <= completeThrough;
    result.push(row
      ? { date, proceeds: row.proceeds === null ? null : Number(row.proceeds), sales: row.sales === null ? null : Number(row.sales) }
      : { date, proceeds: covered && hasProceeds ? 0 : null, sales: covered && hasSales ? 0 : null });
  }
  return result;
}
function subscriptionChartRows(trend: RevenueDashboard["subscriptions"]["trend"], from: string, to: string, completeThrough: string | null) {
  const byDate = new Map(trend.map((row) => [row.date, row]));
  const result: { date: string; starts: number | null; renewals: number | null; churn: number | null }[] = [];
  for (let time = Date.parse(`${from}T00:00:00Z`); time <= Date.parse(`${to}T00:00:00Z`); time += 86400000) {
    const date = new Date(time).toISOString().slice(0, 10), row = byDate.get(date);
    const covered = completeThrough !== null && date <= completeThrough;
    result.push(row
      ? { date, starts: row.starts === null ? null : Number(row.starts), renewals: row.renewals === null ? null : Number(row.renewals), churn: row.churn === null ? null : Number(row.churn) }
      : { date, starts: covered ? 0 : null, renewals: covered ? 0 : null, churn: covered ? 0 : null });
  }
  return result;
}
function AmountTable({ rows, label }: { rows: (RevenueAmounts & { label: string })[]; label: string }) {
  const { t } = useTranslation();
  return <div className="overflow-x-auto rounded-lg border"><table className="w-full whitespace-nowrap text-sm"><thead className="bg-muted/50"><tr>{[label, t("revenue.currency"), t("revenue.proceeds"), t("revenue.sales")].map((h) => <th key={h} className="p-3 text-left font-medium">{h}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={i} className="border-t"><th scope="row" className="p-3 text-left font-normal">{r.label}</th><td className="p-3">{r.currency}</td><td className="p-3 tabular-nums">{decimalValue(r.proceeds)}</td><td className="p-3 tabular-nums">{decimalValue(r.sales)}</td></tr>)}</tbody></table></div>;
}
function RevenueDetails({ trend, byApp, byTerritory, from, to, completeThrough }: Pick<RevenueDashboard, "trend" | "byApp" | "byTerritory"> & { from: string; to: string; completeThrough: string | null }) {
  const { t } = useTranslation();
  const currencies = [...new Set(trend.map((r) => r.currency))];
  return <div className="space-y-5"><h2 className="font-medium">{t("appStoreAnalytics.dailyTrend")}</h2>{currencies.map((currency) => <Card key={currency}><CardContent className="space-y-4 p-5"><h3 className="text-sm font-medium">{currency}</h3><div className="h-60"><ResponsiveContainer width="100%" height="100%"><LineChart data={revenueChartRows(trend, currency, from, to, completeThrough)}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Line dataKey="proceeds" name={t("revenue.proceeds")} stroke="var(--chart-1)" dot={{ r: 2 }} connectNulls={false} /><Line dataKey="sales" name={t("revenue.sales")} stroke="var(--chart-2)" dot={{ r: 2 }} connectNulls={false} /></LineChart></ResponsiveContainer></div></CardContent></Card>)}
    <AmountTable label={t("appStoreAnalytics.dateRange")} rows={trend.map((r) => ({ ...r, label: r.date }))} />
    <h2 className="font-medium">{t("revenue.byApp")}</h2><AmountTable label={t("appStoreAnalytics.app")} rows={byApp.map((r) => ({ ...r, label: r.app }))} />
    <h2 className="font-medium">{t("revenue.byTerritory")}</h2><AmountTable label={t("appStoreAnalytics.territory")} rows={byTerritory.map((r) => ({ ...r, label: r.territory }))} />
  </div>;
}
function AmountCards({ amounts }: { amounts: RevenueAmounts[] }) {
  const { t } = useTranslation();
  return <div className="grid gap-3 sm:grid-cols-2">{amounts.length ? amounts.map((r) => <Card key={r.currency}><CardContent className="space-y-3 p-5"><h3 className="text-sm font-medium">{r.currency}</h3><dl className="grid grid-cols-2 gap-3">{(["proceeds", "sales"] as const).map((key) => <div key={key}><dt className="text-xs text-muted-foreground">{t(`revenue.${key}`)}</dt><dd className="mt-2 text-xl font-semibold tabular-nums">{decimalValue(r[key])}</dd></div>)}</dl></CardContent></Card>) : <p className="text-sm text-muted-foreground">{t("revenue.noData")}</p>}</div>;
}
export default function RevenuePage() {
  const { t } = useTranslation();
  const [appId, setAppId] = useState("all"), [territory, setTerritory] = useState("all"), [range, setRange] = useState(7), [month, setMonth] = useState("");
  const [today] = useState(() => new Date().toISOString().slice(0, 10));
  const from = new Date(Date.parse(today) - (range - 1) * 86400000).toISOString().slice(0, 10);
  const query = useQuery({ queryKey: ["revenue-page", appId, from, today, territory, month], queryFn: ({ signal }) => getRevenuePage({ from, to: today, appId: appId === "all" ? undefined : Number(appId), territory: territory === "all" ? undefined : territory, fiscalMonth: month || undefined }, signal), staleTime: 5 * 60_000 });
  const data = query.data?.revenue;
  return <div className="space-y-6"><div className="space-y-2"><h1 className="text-2xl font-semibold tracking-tight">{t(titleKey)}</h1><p className="text-sm text-muted-foreground">{t("revenue.description")}</p></div>
    <div className="flex flex-wrap items-center gap-3"><Select value={appId} onValueChange={(v) => { setAppId(v); setTerritory("all"); }}><SelectTrigger aria-label={t("appStoreAnalytics.app")} className="w-full sm:w-56"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t("appStoreAnalytics.allApps")}</SelectItem>{(query.data?.enabledApps ?? []).map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}</SelectContent></Select>
      <div role="group" aria-label={t("appStoreAnalytics.dateRange")} className="flex gap-1 rounded-lg border p-1">{[7, 30, 90].map((days) => <Button key={days} size="sm" variant={range === days ? "secondary" : "ghost"} aria-pressed={range === days} onClick={() => setRange(days)}>{days}D</Button>)}</div>
      <Select value={territory} onValueChange={setTerritory}><SelectTrigger aria-label={t("appStoreAnalytics.territory")} className="w-full sm:w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t("appStoreAnalytics.allTerritories")}</SelectItem>{[...new Set([...(data?.territories ?? []), ...(territory === "all" ? [] : [territory])])].map((code) => <SelectItem key={code} value={code}>{code}</SelectItem>)}</SelectContent></Select>
    </div>
    <dl className="flex gap-6 text-xs text-muted-foreground"><div className="flex gap-2"><dt>{t("appStoreAnalytics.updated")}</dt><dd>{data?.updatedAt ?? "—"}</dd></div><div className="flex gap-2"><dt>{t("appStoreAnalytics.completeThrough")}</dt><dd>{data?.completeThrough ?? "—"}</dd></div></dl>
    {query.isError && <p role="alert" className="text-sm text-destructive">{query.error.message}</p>}
    {query.isLoading && <p role="status">{t("common.loading")}</p>}
    <p className="text-xs text-muted-foreground">{t("revenue.syncLocation")} <Link to="/accounts" className="underline">{t("nav.connections")}</Link></p>
    <Tabs defaultValue="overview"><TabsList className="h-auto max-w-full flex-wrap justify-start">{["overview", "sales", "subscriptions", "settlements"].map((tab) => <TabsTrigger key={tab} value={tab}>{t(`revenue.${tab}`)}</TabsTrigger>)}</TabsList>
      <TabsContent value="overview" className="space-y-5 pt-4"><section aria-labelledby="estimated-purchases-heading" className="space-y-4"><div><h2 id="estimated-purchases-heading" className="font-medium">{t("revenue.estimated")}</h2><p className="text-xs text-muted-foreground">{t("revenue.analyticsSource")}</p></div><AmountCards amounts={data?.overview.amounts ?? []} /><div className="grid gap-3 sm:grid-cols-2"><Card><CardContent className="p-5"><p className="text-xs text-muted-foreground">{t("revenue.payingUsers")}</p><p className="mt-2 text-2xl font-semibold">{decimalValue(data?.overview.payingUsers)}</p><p className="mt-2 text-xs text-muted-foreground">{t("revenue.payingUsersHelp")}</p></CardContent></Card></div><RevenueDetails trend={data?.trend ?? []} byApp={data?.byApp ?? []} byTerritory={data?.byTerritory ?? []} from={from} to={today} completeThrough={data?.completeThrough ?? null} /></section><section aria-labelledby="sales-activity-heading" className="space-y-3 border-t pt-5"><div><h2 id="sales-activity-heading" className="font-medium">{t("revenue.salesActivity")}</h2><p className="text-xs text-muted-foreground">{t("revenue.salesSource")}</p></div><Card><CardContent className="p-5"><p className="text-xs text-muted-foreground">{t("revenue.salesUnitsAllTypes")}</p><p className="mt-2 text-2xl font-semibold">{decimalValue(data?.overview.units)}</p></CardContent></Card></section></TabsContent>
      <TabsContent value="sales" className="space-y-5 pt-4"><p className="text-sm text-muted-foreground">{t("revenue.salesHelp")}</p><AmountCards amounts={data?.sales.amounts ?? []} /><p>{t("revenue.units")}: {decimalValue(data?.sales.units)}</p><div className="overflow-x-auto rounded-lg border"><table className="w-full whitespace-nowrap text-sm"><thead><tr>{["date", "appItem", "sku", "type", "units", "proceeds", "sales", "territory"].map((key) => <th key={key} className="p-3 text-left">{t(`revenue.${key}`)}</th>)}</tr></thead><tbody>{data?.sales.rows?.map((r, i) => <tr key={i} className="border-t"><th scope="row" className="p-3 text-left font-normal">{r.date}</th><td className="p-3">{r.app} · {value(r.item)}</td><td className="p-3">{value(r.sku)}</td><td className="p-3">{value(r.productType)}</td><td className="p-3">{decimalValue(r.units)}</td><td className="p-3">{r.proceedsCurrency ?? "—"} {decimalValue(r.proceeds)}<p className="text-xs text-muted-foreground">{t("revenue.perUnit")}: {decimalValue(r.unitProceeds)}</p></td><td className="p-3">{r.salesCurrency ?? "—"} {decimalValue(r.sales)}<p className="text-xs text-muted-foreground">{t("revenue.perUnit")}: {decimalValue(r.unitPrice)}</p></td><td className="p-3">{value(r.territory)}</td></tr>)}</tbody></table></div><RevenueDetails trend={data?.sales.trend ?? []} byApp={data?.sales.byApp ?? []} byTerritory={data?.sales.byTerritory ?? []} from={from} to={today} completeThrough={data?.sales.completeThrough ?? null} /></TabsContent>
      <TabsContent value="subscriptions" className="space-y-5 pt-4"><div className="grid gap-3 sm:grid-cols-3">{(["active", "starts", "conversions", "renewals", "voluntaryChurn", "involuntaryChurn"] as const).map((key) => <Card key={key}><CardContent className="p-5"><p className="text-xs text-muted-foreground">{t(`revenue.${key}`)}</p><p className="mt-2 text-2xl font-semibold">{decimalValue(data?.subscriptions[key])}</p></CardContent></Card>)}</div><p className="text-xs text-muted-foreground">{t("revenue.activeHelp")}</p>{!data?.subscriptions.trend.length && <p className="text-sm text-muted-foreground">{t("revenue.noSubscriptions")}</p>}{(!!data?.subscriptions.trend.length || !!data?.subscriptions.completeThrough) && <Card><CardContent className="space-y-3 p-5"><h2 className="font-medium">{t("appStoreAnalytics.dailyTrend")}</h2><div className="h-60"><ResponsiveContainer width="100%" height="100%"><LineChart data={subscriptionChartRows(data.subscriptions.trend, from, today, data.subscriptions.completeThrough ?? null)}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" tick={{ fontSize: 11 }} /><YAxis /><Tooltip />{["starts", "renewals", "churn"].map((key, i) => <Line key={key} dataKey={key} name={t(`revenue.${key}`)} stroke={["var(--chart-1)", "var(--chart-2)", "var(--chart-3)"][i]} dot={{ r: 2 }} connectNulls={false} />)}</LineChart></ResponsiveContainer></div></CardContent></Card>}<div className="overflow-x-auto rounded-lg border"><table className="w-full text-sm"><thead><tr>{[t("revenue.subscription"), t("revenue.starts"), t("revenue.renewals"), t("revenue.churn")].map((label) => <th className="p-3 text-left" key={label}>{label}</th>)}</tr></thead><tbody>{[...(data?.subscriptions.trend ?? []).map((r) => ({ ...r, subscription: r.date })), ...(data?.subscriptions.bySubscription ?? [])].map((r, i) => <tr className="border-t" key={i}><th className="p-3 text-left font-normal">{r.subscription}</th><td className="p-3">{decimalValue(r.starts)}</td><td className="p-3">{decimalValue(r.renewals)}</td><td className="p-3">{decimalValue(r.churn)}</td></tr>)}</tbody></table></div></TabsContent>
      <TabsContent value="settlements" className="space-y-4 pt-4"><h2 className="font-medium">{t("revenue.final")}</h2><div className="max-w-xs space-y-2"><Label htmlFor="settlement-month">{t("revenue.fiscalMonth")}</Label><Input id="settlement-month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></div><p className="text-sm text-muted-foreground">{t("revenue.settlementHelp")}</p>{!data?.settlements.length && <p className="text-sm text-muted-foreground">{t("revenue.noSettlements")}</p>}<div className="overflow-x-auto rounded-lg border"><table className="w-full whitespace-nowrap text-sm"><thead><tr>{["fiscalMonth", "region", "period", "currency", "earned", "units"].map((key) => <th key={key} className="p-3 text-left">{t(`revenue.${key}`)}</th>)}</tr></thead><tbody>{data?.settlements.map((r, i) => <tr key={i} className="border-t"><th className="p-3 text-left font-normal">{r.fiscalMonth}</th><td className="p-3">{r.region}</td><td className="p-3">{r.startDate} – {r.endDate}</td><td className="p-3">{r.currency || "—"}</td><td className="p-3">{decimalValue(r.earned)}</td><td className="p-3">{decimalValue(r.units)}</td></tr>)}</tbody></table></div></TabsContent>
    </Tabs>
  </div>;
}
