import { z } from "zod";
import { isMockMode } from "../config";
import { AppStoreError } from "./app-store";
import { filterSchema, listEnabledAnalyticsApps, analyticsCompleteThrough } from "./app-store-analytics-reporting";
import { listConnections, getApps } from "../repositories/app-store";
import { readAnalyticsFacts, readCommerceFacts, readCommerceImportDates, readFinanceAppMappings } from "../repositories/app-store-facts";
import { sumDecimals, salesAmount } from "../infra/app-store/report-mapping";
import type { RevenueAmounts, RevenueDashboard } from "@/shared/app-store-revenue";

type AmountRow = { currency: string | null; proceeds?: string | null; sales?: string | null };
export function currencyAmounts(rows: AmountRow[]): RevenueAmounts[] {
  return [...new Set(rows.flatMap((r) => r.currency ? [r.currency] : []))].sort().map((currency) => {
    const matching = rows.filter((r) => r.currency === currency);
    // Distinct measure rows (Sales customer currency vs proceeds currency) are never mixed.
    const proceeds = matching.filter((r) => "proceeds" in r).map((r) => r.proceeds ?? null);
    const sales = matching.filter((r) => "sales" in r).map((r) => r.sales ?? null);
    return { currency, proceeds: sumDecimals(proceeds), sales: sumDecimals(sales) };
  });
}
export function reliablePayingUsers(rows: { paying_users: string | null }[]): string | null { return rows.length === 1 ? rows[0].paying_users : null; }
export function activeSubscriptionSnapshot(states: { app_id: number; date: string; state_grouping: string | null; counts: string | null }[], appIds: number[]): string | null {
  if (!appIds.length) return null;
  const latest = new Map(appIds.map((id) => [id, states.filter((r) => r.app_id === id).map((r) => r.date).sort().at(-1)]));
  if (appIds.some((id) => !latest.get(id))) return null;
  const current = states.filter((r) => r.date === latest.get(r.app_id));
  const known = ["Subscription offers", "Paid plans", "Billing issue", "Churned"];
  if (current.some((r) => !known.includes(r.state_grouping ?? ""))) return null;
  const active = current.filter((r) => ["Subscription offers", "Paid plans"].includes(r.state_grouping ?? ""));
  return active.length ? sumDecimals(active.map((r) => r.counts)) : "0";
}
function groups<T, K extends string>(rows: T[], key: (r: T) => string, label: K, amounts: (r: T) => AmountRow[]) {
  return [...new Set(rows.map(key))].sort().flatMap((name) => currencyAmounts(rows.filter((r) => key(r) === name).flatMap(amounts)).map((a) => ({ [label]: name, ...a } as RevenueAmounts & Record<K, string>)));
}
function completeThroughFromDates(datesByConnection: Map<number, Set<string>>, connectionIds: number[], from: string, to: string): string | null {
  if (!connectionIds.length) return null;
  let completeThrough: string | null = null;
  for (let time = Date.parse(`${from}T00:00:00Z`); time <= Date.parse(`${to}T00:00:00Z`); time += 86400000) {
    const date = new Date(time).toISOString().slice(0, 10);
    if (!connectionIds.every((connectionId) => datesByConnection.get(connectionId)?.has(date))) break;
    completeThrough = date;
  }
  return completeThrough;
}
function mockRevenueDashboard(f: z.infer<typeof filterSchema> & { fiscalMonth?: string }): RevenueDashboard {
  const app = "Demo App";
  const dateAt = (daysAgo: number) => new Date(Date.parse(`${f.to}T00:00:00Z`) - daysAgo * 86400000).toISOString().slice(0, 10);
  const sampleDays = [
    { date: dateAt(6), units: "2", proceeds: "6.98", sales: "9.98", unitProceeds: "3.49", unitPrice: "4.99", payingUsers: "2" },
    { date: dateAt(4), units: "1", proceeds: "3.49", sales: "4.99", unitProceeds: "3.49", unitPrice: "4.99", payingUsers: "1" },
    { date: dateAt(2), units: "3", proceeds: "10.47", sales: "14.97", unitProceeds: "3.49", unitPrice: "4.99", payingUsers: "3" },
    { date: dateAt(0), units: "1", proceeds: "3.49", sales: "4.99", unitProceeds: "3.49", unitPrice: "4.99", payingUsers: "1" },
  ].filter((row) => row.date >= f.from && row.date <= f.to && (!f.territory || f.territory === "US"));
  const purchaseAmounts = (row: typeof sampleDays[number]): AmountRow[] => [{ currency: "USD", proceeds: row.proceeds, sales: row.sales }];
  const saleAmounts = (row: typeof sampleDays[number]): AmountRow[] => [
    { currency: "USD", proceeds: salesAmount(row.units, row.unitProceeds) },
    { currency: "USD", sales: salesAmount(row.units, row.unitPrice, true) },
  ];
  const eventTrend = [
    { date: dateAt(5), starts: "2", renewals: "0", churn: "0" },
    { date: dateAt(3), starts: "0", renewals: "3", churn: "0" },
    { date: dateAt(1), starts: "1", renewals: "0", churn: "1" },
  ].filter((row) => row.date >= f.from && row.date <= f.to);
  const settlementMonth = f.fiscalMonth ?? (() => {
    const previousMonth = new Date(Date.parse(`${f.to}T00:00:00Z`));
    previousMonth.setUTCDate(1);
    previousMonth.setUTCMonth(previousMonth.getUTCMonth() - 1);
    return previousMonth.toISOString().slice(0, 7);
  })();
  const [year, month] = settlementMonth.split("-").map(Number);
  const monthEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  const purchased = currencyAmounts(sampleDays.flatMap(purchaseAmounts));
  const sold = currencyAmounts(sampleDays.flatMap(saleAmounts));
  return {
    updatedAt: sampleDays.at(-1)?.date ?? null,
    completeThrough: f.to,
    overview: { amounts: purchased, units: sumDecimals(sampleDays.map((row) => row.units)), payingUsers: sumDecimals(sampleDays.map((row) => row.payingUsers)) },
    trend: groups(sampleDays, (row) => row.date, "date", purchaseAmounts),
    byApp: sampleDays.length ? groups(sampleDays, () => app, "app", purchaseAmounts) : [],
    byTerritory: sampleDays.length ? groups(sampleDays, () => "US", "territory", purchaseAmounts) : [],
    sales: {
      completeThrough: f.to,
      rows: sampleDays.map((row) => ({ date: row.date, app, item: "1234567890", sku: "demo-app", productType: "Auto-Renewable Subscription", units: row.units, unitProceeds: row.unitProceeds, unitPrice: row.unitPrice, proceeds: salesAmount(row.units, row.unitProceeds), proceedsCurrency: "USD", sales: salesAmount(row.units, row.unitPrice, true), salesCurrency: "USD", territory: "US" })),
      amounts: sold, units: sumDecimals(sampleDays.map((row) => row.units)), trend: groups(sampleDays, (row) => row.date, "date", saleAmounts),
      byApp: sampleDays.length ? groups(sampleDays, () => app, "app", saleAmounts) : [], byTerritory: sampleDays.length ? groups(sampleDays, () => "US", "territory", saleAmounts) : [],
    },
    subscriptions: {
      completeThrough: f.to, active: "24", starts: "3", conversions: "1", renewals: "3", voluntaryChurn: "1", involuntaryChurn: "0",
      trend: eventTrend, bySubscription: [{ subscription: "Demo Plus Monthly", starts: "3", renewals: "3", churn: "1" }],
    },
    settlements: f.territory && f.territory !== "US" ? [] : [{ fiscalMonth: settlementMonth, region: "US", currency: "USD", startDate: `${settlementMonth}-01`, endDate: monthEnd, earned: "38.42", units: "8" }],
    territories: ["US"],
  };
}
export async function getAppStoreRevenueDashboard(viewer: { id: number; role: string }, input: unknown): Promise<RevenueDashboard> {
  const parsed = filterSchema.extend({ fiscalMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional() }).safeParse(input);
  if (!parsed.success) throw new AppStoreError("invalid_filters", 400, "Invalid Revenue filters");
  const f = parsed.data;
  const days = (Date.parse(f.to) - Date.parse(f.from)) / 86400000 + 1;
  if (days < 1 || days > 90) throw new AppStoreError("invalid_range", 400, "Select a date range of 1–90 days");
  const options = await listEnabledAnalyticsApps(viewer);
  if (f.appId && !options.some((a) => a.id === f.appId)) throw new AppStoreError("forbidden", 403, "App is not enabled or accessible");
  if (isMockMode()) return mockRevenueDashboard(f);
  const connections = (await listConnections(viewer.role === "admin" ? undefined : viewer.id)).filter((c) => c.is_active);
  const allApps = (await Promise.all(connections.map((c) => getApps(c.id)))).flat();
  const selected = allApps.filter((a) => a.is_enabled && (!f.appId || a.id === f.appId));
  const selectedConnectionIds = [...new Set(selected.map((app) => app.connection_id))];
  const [data, commerce, financeMappings, salesImportDates] = await Promise.all([
    readAnalyticsFacts(selected.map((a) => a.id), f),
    readCommerceFacts(connections.map((c) => c.id), f),
    f.appId ? readFinanceAppMappings(connections.map((c) => c.id)) : Promise.resolve([]),
    Promise.all(selectedConnectionIds.map(async (connectionId) => [connectionId, (await readCommerceImportDates(connectionId, f)).sales] as const)),
  ]);
  const salesCompleteThrough = completeThroughFromDates(new Map(salesImportDates.map(([connectionId, dates]) => [connectionId, new Set(dates)])), selectedConnectionIds, f.from, f.to);
  const matches = (r: { date: string; territory: string | null }) => r.date >= f.from && r.date <= f.to && (!f.territory || r.territory === f.territory);
  const purchases = data.purchases.filter(matches);
  const appName = (id: number) => selected.find((a) => a.id === id)?.name ?? "Unknown app";
  // Mapping is restricted to exact Apple app IDs, exact SKU, or a unique Sales parent SKU.
  const mappedApp = (connectionId: number, appleId: string | null, sku: string | null, parent: string | null = null) => {
    const candidates = allApps.filter((a) => a.connection_id === connectionId && ((appleId !== null && a.apple_id === appleId) || (sku !== null && a.sku === sku) || (parent !== null && a.sku === parent)));
    return candidates.length === 1 ? candidates[0] : undefined;
  };
  const sales = commerce.sales.flatMap((r) => {
    const app = mappedApp(r.connection_id, r.apple_identifier, r.sku, r.parent_identifier);
    return app && selected.some((a) => a.id === app.id) && matches({ date: r.report_date, territory: r.territory }) ? [{ ...r, app_id: app.id }] : [];
  });
  const purchaseAmounts = (r: typeof purchases[number]): AmountRow[] => [{ currency: r.currency, proceeds: r.proceeds, sales: r.sales }];
  const saleAmounts = (r: typeof sales[number]): AmountRow[] => [
    { currency: r.proceeds_currency, proceeds: salesAmount(r.units, r.developer_proceeds) },
    { currency: r.customer_currency, sales: salesAmount(r.units, r.customer_price, true) },
  ];
  const states = data.subscriptionState.filter(matches), events = data.subscriptionEvent.filter(matches);
  const active = activeSubscriptionSnapshot(states, selected.map((a) => a.id));
  const eventTotal = (rows: typeof events, groupings: string[]) => rows.length ? sumDecimals(rows.filter((r) => groupings.includes(r.event_grouping ?? "")).map((r) => r.counts)) ?? (rows.some((r) => groupings.includes(r.event_grouping ?? "")) ? null : "0") : null;
  const eventMetrics = (rows: typeof events) => ({ starts: eventTotal(rows, ["Offer Starts", "Paid Subscription Starts"]), renewals: eventTotal(rows, ["Renewals", "Offer Renewals"]), churn: eventTotal(rows, ["Voluntary Churn", "Involuntary Churn"]) });
  const finances = commerce.finance.filter((r) => {
    if (f.fiscalMonth && r.fiscal_month !== f.fiscalMonth) return false;
    if (f.territory && r.territory !== f.territory) return false;
    if (!f.appId) return true;
    let app = mappedApp(r.connection_id, r.product_id, r.vendor_identifier);
    if (!app) {
      const linked = financeMappings.filter((sale) => sale.connection_id === r.connection_id && sale.apple_identifier === r.product_id).flatMap((sale) => { const a = mappedApp(sale.connection_id, sale.apple_identifier, sale.sku, sale.parent_identifier); return a ? [a.id] : []; });
      const ids = [...new Set(linked)];
      if (ids.length === 1) app = allApps.find((a) => a.id === ids[0]);
    }
    return app?.id === f.appId;
  });
  const settlementKeys = [...new Set(finances.map((r) => `${r.fiscal_month}|${r.region_code}|${r.currency ?? ""}`))];
  const partitions = data.partitions.filter((p) => p.report_kind === "purchases");
  const subscriptionPartitions = data.partitions.filter((p) => p.report_kind === "subscriptionEvent");
  const dates = partitions.filter((p) => p.date >= f.from && p.date <= f.to).map((p) => p.date).sort();
  return {
    updatedAt: dates.at(-1) ?? null,
    completeThrough: analyticsCompleteThrough(partitions, selected.map((a) => a.id), ["purchases"], f.from, f.to),
    overview: { amounts: currencyAmounts(purchases.flatMap(purchaseAmounts)), units: sumDecimals(sales.map((r) => r.units)), payingUsers: reliablePayingUsers(purchases) },
    trend: groups(purchases, (r) => r.date, "date", purchaseAmounts),
    byApp: groups(purchases, (r) => String(r.app_id), "app", purchaseAmounts).map((r) => ({ ...r, app: appName(Number(r.app)) })),
    byTerritory: groups(purchases, (r) => r.territory ?? "Unknown", "territory", purchaseAmounts),
    sales: { completeThrough: salesCompleteThrough, rows: sales.map((r) => ({ date: r.report_date, app: appName(r.app_id), item: r.apple_identifier, sku: r.sku, productType: r.product_type, units: r.units, unitProceeds: r.developer_proceeds, unitPrice: r.customer_price, proceeds: salesAmount(r.units, r.developer_proceeds), proceedsCurrency: r.proceeds_currency, sales: salesAmount(r.units, r.customer_price, true), salesCurrency: r.customer_currency, territory: r.territory })), amounts: currencyAmounts(sales.flatMap(saleAmounts)), units: sumDecimals(sales.map((r) => r.units)), trend: groups(sales, (r) => r.report_date, "date", saleAmounts), byApp: groups(sales, (r) => String(r.app_id), "app", saleAmounts).map((r) => ({ ...r, app: appName(Number(r.app)) })), byTerritory: groups(sales, (r) => r.territory ?? "Unknown", "territory", saleAmounts) },
    subscriptions: { completeThrough: analyticsCompleteThrough(subscriptionPartitions, selected.map((a) => a.id), ["subscriptionEvent"], f.from, f.to), active, ...eventMetrics(events), conversions: eventTotal(events, ["Paid Subscriptions from Offers"]), voluntaryChurn: eventTotal(events, ["Voluntary Churn"]), involuntaryChurn: eventTotal(events, ["Involuntary Churn"]), trend: [...new Set(events.map((r) => r.date))].sort().map((date) => ({ date, ...eventMetrics(events.filter((r) => r.date === date)) })), bySubscription: [...new Set(events.map((r) => r.subscription_id ?? "Unknown"))].sort().map((subscription) => ({ subscription: events.find((r) => r.subscription_id === subscription)?.subscription_name ?? subscription, ...eventMetrics(events.filter((r) => (r.subscription_id ?? "Unknown") === subscription)) })) },
    settlements: settlementKeys.map((key) => {
      const [fiscalMonth, region, currency] = key.split("|");
      const rows = finances.filter((r) => r.fiscal_month === fiscalMonth && r.region_code === region && (r.currency ?? "") === currency);
      return { fiscalMonth, region, currency, startDate: rows.map((r) => r.start_date).sort()[0], endDate: rows.map((r) => r.end_date).sort().at(-1)!, earned: sumDecimals(rows.map((r) => r.earned_amount)), units: sumDecimals(rows.map((r) => r.units)) };
    }),
    territories: [...new Set([...data.purchases, ...data.subscriptionState, ...data.subscriptionEvent, ...commerce.sales, ...commerce.finance].flatMap((r) => r.territory ? [r.territory] : []))].sort(),
  };
}
