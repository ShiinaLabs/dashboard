import { z } from "zod";
import type * as schema from "@/db/schema/app-store-facts";
import type { AnalyticsTsv } from "./analytics-tsv";
import { AppStoreReportError } from "./analytics-segment";

export const analyticsReportDefinitions = {
  discovery: { baseName: "App Store Discovery and Engagement", standardName: "App Store Discovery and Engagement Standard" },
  downloads: { baseName: "App Store Downloads", standardName: "App Store Downloads Standard" },
  purchases: { baseName: "App Store Purchases", standardName: "App Store Purchases Standard" },
  subscriptionState: { baseName: "App Store Subscription State", standardName: "App Store Subscription State Report Standard" },
  subscriptionEvent: { baseName: "App Store Subscription Event", standardName: "App Store Subscription Event Report Standard" },
} as const;
export type AnalyticsReportKind = keyof typeof analyticsReportDefinitions;
export function identifyStandardAnalyticsReport(name: string): AnalyticsReportKind | undefined {
  return (Object.keys(analyticsReportDefinitions) as AnalyticsReportKind[]).find((kind) => analyticsReportDefinitions[kind].standardName === name);
}
export const completionDays: Record<AnalyticsReportKind, number> = { discovery: 3, downloads: 2, purchases: 2, subscriptionState: 3, subscriptionEvent: 3 };
const SCALE = 10n ** 12n;
export function decimal(value: string): string {
  if (!/^-?(?:\d{1,26}(?:\.\d{1,12})?|\.\d{1,12})$/.test(value)) throw new AppStoreReportError("invalid_decimal", "Invalid numeric report field");
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = value.replace(/^-/, "").split(".");
  return formatDecimal((BigInt(whole || "0") * SCALE + BigInt(fraction.padEnd(12, "0"))) * (negative ? -1n : 1n));
}
function scaled(value: string): bigint {
  const canonical = decimal(value);
  const [whole, fraction = ""] = canonical.replace(/^-/, "").split(".");
  return (BigInt(whole || "0") * SCALE + BigInt(fraction.padEnd(12, "0"))) * (canonical.startsWith("-") ? -1n : 1n);
}
function formatDecimal(value: bigint): string {
  const magnitude = value < 0n ? -value : value;
  const fraction = (magnitude % SCALE).toString().padStart(12, "0").replace(/0+$/, "");
  return `${value < 0n ? "-" : ""}${magnitude / SCALE}${fraction ? `.${fraction}` : ""}`;
}
export function sumDecimals(values: (string | null)[]): string | null {
  if (!values.length || values.some((v) => v === null)) return null;
  return formatDecimal(values.reduce<bigint>((total, value) => total + scaled(value!), 0n));
}
export function multiplyDecimals(left: string | null, right: string | null): string | null {
  if (left === null || right === null) return null;
  const product = scaled(left) * scaled(right);
  if (product % SCALE !== 0n) throw new AppStoreReportError("decimal_precision", "Report calculation exceeds supported precision");
  return formatDecimal(product / SCALE);
}
/** Apple signs Customer Price on refunds; multiplying two negative signs would invent positive sales. */
export function salesAmount(units: string | null, perUnit: string | null, customerPrice = false): string | null {
  if (units === null || perUnit === null) return null;
  const quantity = decimal(units), amount = decimal(perUnit);
  // Zero-unit partial-refund rows have no trustworthy per-unit total. Keep the reported prices separately.
  if (quantity === "0" && amount !== "0") return null;
  return multiplyDecimals(customerPrice ? quantity.replace(/^-/, "") : quantity, amount);
}
function isoDate(value: string | null, us = false): string {
  const converted = us && value ? value.replace(/^(\d{2})\/(\d{2})\/(\d{4})$/, "$3-$1-$2") : value;
  if (!z.iso.date().safeParse(converted).success) throw new AppStoreReportError("invalid_date", "Invalid report date field");
  return converted!;
}
function normalized(table: AnalyticsTsv): AnalyticsTsv {
  const names = table.headers.map((h) => h.replace(/\u00a0/g, " ").trim());
  if (new Set(names).size !== names.length) throw new AppStoreReportError("invalid_headers", "Duplicated normalized report headers");
  return { headers: names, rows: table.rows.map((r) => Object.fromEntries(table.headers.map((h, i) => [names[i], r[h]]))) };
}
function requireHeaders(table: AnalyticsTsv, required: string[]) {
  const missing = required.filter((h) => !table.headers.includes(h));
  if (missing.length) throw new AppStoreReportError("missing_headers", `Missing headers: ${missing.join(", ")}; received headers: ${table.headers.join(", ")}`);
}
function number(row: Record<string, string | null>, header: string): string | null { return row[header] === null ? null : decimal(row[header]); }
export type MappedAnalytics =
  | { kind: "discovery"; rows: (typeof schema.app_store_discovery_daily.$inferInsert)[] }
  | { kind: "downloads"; rows: (typeof schema.app_store_downloads_daily.$inferInsert)[] }
  | { kind: "purchases"; rows: (typeof schema.app_store_purchases_daily.$inferInsert)[] }
  | { kind: "subscriptionState"; rows: (typeof schema.app_store_subscription_state_daily.$inferInsert)[] }
  | { kind: "subscriptionEvent"; rows: (typeof schema.app_store_subscription_event_daily.$inferInsert)[] };
const fields: Record<AnalyticsReportKind, Record<string, string>> = {
  discovery: { event: "Event", page_type: "Page Type", source_type: "Source Type", territory: "Territory", counts: "Counts", unique_counts: "Unique Counts" },
  downloads: { download_type: "Download Type", source_type: "Source Type", territory: "Territory", counts: "Counts" },
  purchases: { purchase_type: "Purchase Type", content_name: "Content Name", content_id: "Content Apple Identifier", source_type: "Source Type", territory: "Territory", purchases: "Purchases", proceeds: "Proceeds in USD", sales: "Sales in USD", paying_users: "Paying Users" },
  subscriptionState: { subscription_name: "Subscription Name", subscription_id: "Subscription Identifier", subscription_group: "Subscription Group", subscription_group_id: "Subscription Group Identifier", state_metric: "State Metric", state_grouping: "State Metric Grouping", territory: "Territory", counts: "Counts" },
  subscriptionEvent: { subscription_name: "Subscription Name", subscription_id: "Subscription Identifier", subscription_group: "Subscription Group", subscription_group_id: "Subscription Group Identifier", event_sub_type: "Event Sub Type", event_grouping: "Event Grouping", offer_type: "Offer Type", territory: "Territory", counts: "Counts" },
};
export function analyticsReportRequiredHeaders(kind: AnalyticsReportKind): string[] {
  return [kind === "subscriptionEvent" ? "Event Date" : "Date", "App Apple Identifier", ...Object.values(fields[kind])];
}
const numericFields = new Set(["counts", "unique_counts", "purchases", "proceeds", "sales", "paying_users"]);
export function mapAnalyticsReport(kind: AnalyticsReportKind, input: AnalyticsTsv, context: { appId: number; appleId: string; instanceId: string; processingDate: string }): MappedAnalytics {
  const table = normalized(input);
  requireHeaders(table, analyticsReportRequiredHeaders(kind));
  const dateHeader = kind === "subscriptionEvent" ? "Event Date" : "Date";
  isoDate(context.processingDate);
  const rows = table.rows.map((row, index) => {
    try {
      if (row["App Apple Identifier"] !== context.appleId) throw new AppStoreReportError("app_identity_mismatch", "Report app identity does not match requested app");
      const values = Object.fromEntries(Object.entries(fields[kind]).map(([key, header]) => [key, numericFields.has(key) ? number(row, header) : row[header]]));
      return { app_id: context.appId, date: isoDate(row[dateHeader]), source_instance_id: context.instanceId, processing_date: context.processingDate, ...values, ...(kind === "purchases" ? { currency: "USD" } : {}) };
    } catch (error) {
      throw new AppStoreReportError(error instanceof AppStoreReportError ? error.code : "invalid_row", `Report row ${index + 2}: ${error instanceof AppStoreReportError ? error.code : "invalid_row"}`);
    }
  });
  // The discriminant selects one concrete table; mapping keys are fixed above, never supplied by report data.
  return { kind, rows } as MappedAnalytics;
}
export function mapSalesReport(input: AnalyticsTsv, connectionId: number, reportDate: string, checksum: string): (typeof schema.app_store_sales_daily.$inferInsert)[] {
  const table = normalized(input);
  const proceedsHeader = table.headers.includes("Developer Proceeds") ? "Developer Proceeds" : "Developer Proceeds (per unit)";
  requireHeaders(table, ["Begin Date", "End Date", "SKU", "Apple Identifier", "Parent Identifier", "Product Type Identifier", "Country Code", "Units", proceedsHeader, "Currency of Proceeds", "Customer Price", "Customer Currency"]);
  return table.rows.map((r, index) => {
    try {
      const begin = isoDate(r["Begin Date"], true), end = isoDate(r["End Date"], true);
      if (begin !== reportDate || end !== reportDate) throw new AppStoreReportError("report_date_mismatch", "Sales report date mismatch");
      return { connection_id: connectionId, report_date: reportDate, begin_date: begin, end_date: end, sku: r.SKU, apple_identifier: r["Apple Identifier"], parent_identifier: r["Parent Identifier"], product_type: r["Product Type Identifier"], territory: r["Country Code"], units: number(r, "Units"), developer_proceeds: number(r, proceedsHeader), proceeds_currency: r["Currency of Proceeds"], customer_price: number(r, "Customer Price"), customer_currency: r["Customer Currency"], import_identity: checksum };
    } catch { throw new AppStoreReportError("invalid_sales_row", `Invalid Sales report row ${index + 2}`); }
  });
}
export function mapFinanceReport(input: AnalyticsTsv, connectionId: number, fiscalMonth: string, regionCode: string, checksum: string): (typeof schema.app_store_finance_rows.$inferInsert)[] {
  const table = normalized(input);
  const countryOfSaleHeader = table.headers.includes("Country Of Sale") ? "Country Of Sale" : "Country of Sale";
  requireHeaders(table, ["Start Date", "End Date", "Vendor Identifier", "Apple Identifier", "Product Type Identifier", countryOfSaleHeader, "Quantity", "Extended Partner Share", "Partner Share Currency"]);
  return table.rows.map((r, index) => {
    try {
      const start = isoDate(r["Start Date"], true), end = isoDate(r["End Date"], true);
      if (end < start) throw new AppStoreReportError("invalid_period", "Invalid financial period");
      return { connection_id: connectionId, fiscal_month: fiscalMonth, region_code: regionCode, start_date: start, end_date: end, vendor_identifier: r["Vendor Identifier"], sku: r["Vendor Identifier"], product_id: r["Apple Identifier"], product_type: r["Product Type Identifier"], territory: r[countryOfSaleHeader], units: number(r, "Quantity"), earned_amount: number(r, "Extended Partner Share"), currency: r["Partner Share Currency"], import_identity: checksum };
    } catch { throw new AppStoreReportError("invalid_finance_row", `Invalid Finance report row ${index + 2}`); }
  });
}
