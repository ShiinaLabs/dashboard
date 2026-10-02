import { and, eq, inArray, gte, lte } from "drizzle-orm";
import * as s from "@/db/schema";
import { getDb } from "../db/connection";
import { isMockMode } from "../config";
import { AppStoreConflictError } from "./app-store";
import type { PreparedAnalyticsInstance } from "../infra/app-store/analytics-instance";
import type { MappedAnalytics } from "../infra/app-store/report-mapping";

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
export const factTables = { discovery: s.app_store_discovery_daily, downloads: s.app_store_downloads_daily, purchases: s.app_store_purchases_daily, subscriptionState: s.app_store_subscription_state_daily, subscriptionEvent: s.app_store_subscription_event_daily };
async function lockConnection(tx: Tx, connectionId: number, version: string) {
  const [connection] = await tx.select().from(s.app_store_connections).where(eq(s.app_store_connections.id, connectionId)).for("update");
  if (!connection?.is_active || connection.deleted_at || connection.updated_at !== version) throw new AppStoreConflictError();
}
async function insertFacts(tx: Tx, mapped: MappedAnalytics, date: string) {
  // Narrow each concrete insert to its typed fact table; batch below PostgreSQL's parameter limit.
  for (let offset = 0; offset < mapped.rows.length; offset += 500) {
    switch (mapped.kind) {
      case "discovery": { const rows = mapped.rows.slice(offset, offset + 500).filter((r) => r.date === date); if (rows.length) await tx.insert(s.app_store_discovery_daily).values(rows); break; }
      case "downloads": { const rows = mapped.rows.slice(offset, offset + 500).filter((r) => r.date === date); if (rows.length) await tx.insert(s.app_store_downloads_daily).values(rows); break; }
      case "purchases": { const rows = mapped.rows.slice(offset, offset + 500).filter((r) => r.date === date); if (rows.length) await tx.insert(s.app_store_purchases_daily).values(rows); break; }
      case "subscriptionState": { const rows = mapped.rows.slice(offset, offset + 500).filter((r) => r.date === date); if (rows.length) await tx.insert(s.app_store_subscription_state_daily).values(rows); break; }
      case "subscriptionEvent": { const rows = mapped.rows.slice(offset, offset + 500).filter((r) => r.date === date); if (rows.length) await tx.insert(s.app_store_subscription_event_daily).values(rows); break; }
    }
  }
}
export async function commitAnalyticsInstance(context: { appId: number; connectionId: number; version: string; requestId: number; reportId: string; reportName: string; reportCategory: string }, prepared: PreparedAnalyticsInstance, mapped: MappedAnalytics): Promise<"imported" | "skipped"> {
  return getDb().transaction(async (tx) => {
    await lockConnection(tx, context.connectionId, context.version);
    const [app] = await tx.select().from(s.app_store_apps).where(eq(s.app_store_apps.id, context.appId)).for("update");
    const [request] = await tx.select().from(s.app_store_analytics_requests).where(eq(s.app_store_analytics_requests.id, context.requestId));
    if (!app?.is_enabled || app.connection_id !== context.connectionId || request?.app_id !== app.id) throw new AppStoreConflictError();
    const imports = await tx.select().from(s.app_store_report_imports).where(and(eq(s.app_store_report_imports.app_id, app.id), eq(s.app_store_report_imports.apple_instance_id, prepared.instanceId)));
    if (imports.length === prepared.segments.length && prepared.segments.every((segment) => imports.some((r) => r.apple_segment_id === segment.id && r.checksum.toLowerCase() === segment.checksum.toLowerCase() && r.status === "imported"))) return "skipped";
    const partitions = await tx.select().from(s.app_store_report_partitions).where(and(eq(s.app_store_report_partitions.app_id, app.id), eq(s.app_store_report_partitions.report_kind, mapped.kind)));
    const dates = new Set([...mapped.rows.map((r) => r.date), ...partitions.filter((p) => p.source_instance_id === prepared.instanceId).map((p) => p.date)]);
    let replaced = false;
    for (const date of dates) {
      const old = partitions.find((p) => p.date === date);
      // Equal-date replacement is allowed only for a changed checksum on the SAME instance.
      if (old && (old.processing_date > prepared.processingDate || (old.processing_date === prepared.processingDate && old.source_instance_id !== prepared.instanceId))) continue;
      replaced = true;
      const table = factTables[mapped.kind];
      await tx.delete(table).where(and(eq(table.app_id, app.id), eq(table.date, date)));
      await insertFacts(tx, mapped, date);
      const partition = { app_id: app.id, report_kind: mapped.kind, date, granularity: "DAILY", source_instance_id: prepared.instanceId, processing_date: prepared.processingDate, updated_at: new Date().toISOString() };
      await tx.insert(s.app_store_report_partitions).values(partition).onConflictDoUpdate({ target: [s.app_store_report_partitions.app_id, s.app_store_report_partitions.report_kind, s.app_store_report_partitions.date, s.app_store_report_partitions.granularity], set: partition });
    }
    await tx.delete(s.app_store_report_imports).where(and(eq(s.app_store_report_imports.app_id, app.id), eq(s.app_store_report_imports.apple_instance_id, prepared.instanceId)));
    for (const segment of prepared.segments) await tx.insert(s.app_store_report_imports).values({ app_id: app.id, analytics_request_id: context.requestId, report_name: context.reportName, report_category: context.reportCategory, apple_report_id: context.reportId, apple_instance_id: prepared.instanceId, apple_segment_id: segment.id, granularity: "DAILY", processing_date: prepared.processingDate, checksum: segment.checksum.toLowerCase(), status: "imported", imported_at: new Date().toISOString() });
    return replaced ? "imported" : "skipped";
  });
}
export async function readAnalyticsPartitions(appIds: number[]) {
  if (!appIds.length || isMockMode()) return [];
  return getDb().select().from(s.app_store_report_partitions).where(inArray(s.app_store_report_partitions.app_id, appIds));
}
export async function readAnalyticsFacts(appIds: number[], range?: { from: string; to: string }) {
  if (!appIds.length || isMockMode()) return { discovery: [], downloads: [], purchases: [], subscriptionState: [], subscriptionEvent: [], partitions: [] };
  const db = getDb();
  const filter = (table: typeof s.app_store_discovery_daily | typeof s.app_store_downloads_daily | typeof s.app_store_purchases_daily | typeof s.app_store_subscription_state_daily | typeof s.app_store_subscription_event_daily | typeof s.app_store_report_partitions) => and(inArray(table.app_id, appIds), range ? gte(table.date, range.from) : undefined, range ? lte(table.date, range.to) : undefined);
  const [discovery, downloads, purchases, subscriptionState, subscriptionEvent, partitions] = await Promise.all([
    db.select().from(s.app_store_discovery_daily).where(filter(s.app_store_discovery_daily)),
    db.select().from(s.app_store_downloads_daily).where(filter(s.app_store_downloads_daily)),
    db.select().from(s.app_store_purchases_daily).where(filter(s.app_store_purchases_daily)),
    db.select().from(s.app_store_subscription_state_daily).where(filter(s.app_store_subscription_state_daily)),
    db.select().from(s.app_store_subscription_event_daily).where(filter(s.app_store_subscription_event_daily)),
    db.select().from(s.app_store_report_partitions).where(filter(s.app_store_report_partitions)),
  ]);
  return { discovery, downloads, purchases, subscriptionState, subscriptionEvent, partitions };
}
export async function commitSalesReport(connectionId: number, version: string, date: string, checksum: string, rows: (typeof s.app_store_sales_daily.$inferInsert)[]) {
  return getDb().transaction(async (tx) => {
    await lockConnection(tx, connectionId, version);
    const [old] = await tx.select().from(s.app_store_sales_imports).where(and(eq(s.app_store_sales_imports.connection_id, connectionId), eq(s.app_store_sales_imports.report_date, date)));
    if (old?.checksum === checksum) return "skipped";
    await tx.delete(s.app_store_sales_daily).where(and(eq(s.app_store_sales_daily.connection_id, connectionId), eq(s.app_store_sales_daily.report_date, date)));
    for (let i = 0; i < rows.length; i += 500) await tx.insert(s.app_store_sales_daily).values(rows.slice(i, i + 500));
    await tx.insert(s.app_store_sales_imports).values({ connection_id: connectionId, report_date: date, checksum }).onConflictDoUpdate({ target: [s.app_store_sales_imports.connection_id, s.app_store_sales_imports.report_date], set: { checksum, imported_at: new Date().toISOString() } });
    return "imported";
  });
}
export async function commitFinanceReport(connectionId: number, version: string, month: string, region: string, checksum: string, rows: (typeof s.app_store_finance_rows.$inferInsert)[]) {
  return getDb().transaction(async (tx) => {
    await lockConnection(tx, connectionId, version);
    const filter = and(eq(s.app_store_finance_imports.connection_id, connectionId), eq(s.app_store_finance_imports.fiscal_month, month), eq(s.app_store_finance_imports.region_code, region));
    const [old] = await tx.select().from(s.app_store_finance_imports).where(filter);
    if (old?.checksum === checksum) return "skipped";
    await tx.delete(s.app_store_finance_rows).where(and(eq(s.app_store_finance_rows.connection_id, connectionId), eq(s.app_store_finance_rows.fiscal_month, month), eq(s.app_store_finance_rows.region_code, region)));
    for (let i = 0; i < rows.length; i += 500) await tx.insert(s.app_store_finance_rows).values(rows.slice(i, i + 500));
    await tx.insert(s.app_store_finance_imports).values({ connection_id: connectionId, fiscal_month: month, region_code: region, checksum }).onConflictDoUpdate({ target: [s.app_store_finance_imports.connection_id, s.app_store_finance_imports.fiscal_month, s.app_store_finance_imports.region_code], set: { checksum, imported_at: new Date().toISOString() } });
    return "imported";
  });
}
export async function readCommerceFacts(connectionIds: number[], range?: { from: string; to: string; fiscalMonth?: string }) {
  if (!connectionIds.length || isMockMode()) return { sales: [], finance: [] };
  const [sales, finance] = await Promise.all([
    getDb().select().from(s.app_store_sales_daily).where(and(inArray(s.app_store_sales_daily.connection_id, connectionIds), range ? gte(s.app_store_sales_daily.report_date, range.from) : undefined, range ? lte(s.app_store_sales_daily.report_date, range.to) : undefined)),
    getDb().select().from(s.app_store_finance_rows).where(and(inArray(s.app_store_finance_rows.connection_id, connectionIds), range?.fiscalMonth ? eq(s.app_store_finance_rows.fiscal_month, range.fiscalMonth) : undefined)),
  ]);
  return { sales, finance };
}

export async function readFinanceAppMappings(connectionIds: number[]) {
  if (!connectionIds.length || isMockMode()) return [];
  return getDb().selectDistinct({ connection_id: s.app_store_sales_daily.connection_id, apple_identifier: s.app_store_sales_daily.apple_identifier, sku: s.app_store_sales_daily.sku, parent_identifier: s.app_store_sales_daily.parent_identifier }).from(s.app_store_sales_daily).where(inArray(s.app_store_sales_daily.connection_id, connectionIds));
}

export async function readCommerceImportDates(connectionId: number, salesRange?: { from: string; to: string }) {
  if (isMockMode()) return { sales: [] as string[], finance: [] as string[] };
  const db = getDb();
  const [sales, finance] = await Promise.all([
    db.select({ date: s.app_store_sales_imports.report_date }).from(s.app_store_sales_imports).where(and(
      eq(s.app_store_sales_imports.connection_id, connectionId),
      salesRange ? gte(s.app_store_sales_imports.report_date, salesRange.from) : undefined,
      salesRange ? lte(s.app_store_sales_imports.report_date, salesRange.to) : undefined,
    )),
    salesRange ? Promise.resolve([] as { month: string }[]) : db.select({ month: s.app_store_finance_imports.fiscal_month }).from(s.app_store_finance_imports).where(eq(s.app_store_finance_imports.connection_id, connectionId)),
  ]);
  return { sales: sales.map((row) => row.date), finance: finance.map((row) => row.month) };
}

export async function hasFinanceImport(connectionId: number, fiscalMonth: string, regionCode: string) {
  if (isMockMode()) return false;
  const [importRecord] = await getDb().select({ fiscalMonth: s.app_store_finance_imports.fiscal_month })
    .from(s.app_store_finance_imports)
    .where(and(
      eq(s.app_store_finance_imports.connection_id, connectionId),
      eq(s.app_store_finance_imports.fiscal_month, fiscalMonth),
      eq(s.app_store_finance_imports.region_code, regionCode),
    ))
    .limit(1);
  return Boolean(importRecord);
}
