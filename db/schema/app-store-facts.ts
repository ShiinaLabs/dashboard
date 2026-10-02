import { integer, numeric, pgTable, serial, text, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { app_store_apps, app_store_connections } from "./app-store";

export const app_store_discovery_daily = pgTable("app_store_discovery_daily", {
  id: serial("id").primaryKey(),
  app_id: integer("app_id").notNull().references(() => app_store_apps.id),
  date: text("date").notNull(),
  source_instance_id: text("source_instance_id").notNull(),
  processing_date: text("processing_date").notNull(),
  created_at: text("created_at").notNull().default(sql`NOW()`),
  updated_at: text("updated_at").notNull().default(sql`NOW()`),
  event: text("event"),
  page_type: text("page_type"),
  source_type: text("source_type"),
  territory: text("territory"),
  counts: numeric("counts", { precision: 38, scale: 12 }),
  unique_counts: numeric("unique_counts", { precision: 38, scale: 12 }),
}, (t) => [index("idx_app_store_discovery_daily_partition").on(t.app_id, t.date)]);

export const app_store_downloads_daily = pgTable("app_store_downloads_daily", {
  id: serial("id").primaryKey(),
  app_id: integer("app_id").notNull().references(() => app_store_apps.id),
  date: text("date").notNull(),
  source_instance_id: text("source_instance_id").notNull(),
  processing_date: text("processing_date").notNull(),
  created_at: text("created_at").notNull().default(sql`NOW()`),
  updated_at: text("updated_at").notNull().default(sql`NOW()`),
  download_type: text("download_type"),
  source_type: text("source_type"),
  territory: text("territory"),
  counts: numeric("counts", { precision: 38, scale: 12 }),
}, (t) => [index("idx_app_store_downloads_daily_partition").on(t.app_id, t.date)]);

export const app_store_purchases_daily = pgTable("app_store_purchases_daily", {
  id: serial("id").primaryKey(),
  app_id: integer("app_id").notNull().references(() => app_store_apps.id),
  date: text("date").notNull(),
  source_instance_id: text("source_instance_id").notNull(),
  processing_date: text("processing_date").notNull(),
  created_at: text("created_at").notNull().default(sql`NOW()`),
  updated_at: text("updated_at").notNull().default(sql`NOW()`),
  purchase_type: text("purchase_type"),
  content_name: text("content_name"),
  content_id: text("content_id"),
  source_type: text("source_type"),
  territory: text("territory"),
  purchases: numeric("purchases", { precision: 38, scale: 12 }),
  proceeds: numeric("proceeds", { precision: 38, scale: 12 }),
  sales: numeric("sales", { precision: 38, scale: 12 }),
  paying_users: numeric("paying_users", { precision: 38, scale: 12 }),
  currency: text("currency").notNull(),
}, (t) => [index("idx_app_store_purchases_daily_partition").on(t.app_id, t.date)]);

export const app_store_subscription_state_daily = pgTable("app_store_subscription_state_daily", {
  id: serial("id").primaryKey(),
  app_id: integer("app_id").notNull().references(() => app_store_apps.id),
  date: text("date").notNull(),
  source_instance_id: text("source_instance_id").notNull(),
  processing_date: text("processing_date").notNull(),
  created_at: text("created_at").notNull().default(sql`NOW()`),
  updated_at: text("updated_at").notNull().default(sql`NOW()`),
  subscription_name: text("subscription_name"),
  subscription_id: text("subscription_id"),
  subscription_group: text("subscription_group"),
  subscription_group_id: text("subscription_group_id"),
  state_metric: text("state_metric"),
  state_grouping: text("state_grouping"),
  territory: text("territory"),
  counts: numeric("counts", { precision: 38, scale: 12 }),
}, (t) => [index("idx_app_store_subscription_state_daily_partition").on(t.app_id, t.date)]);

export const app_store_subscription_event_daily = pgTable("app_store_subscription_event_daily", {
  id: serial("id").primaryKey(),
  app_id: integer("app_id").notNull().references(() => app_store_apps.id),
  date: text("date").notNull(),
  source_instance_id: text("source_instance_id").notNull(),
  processing_date: text("processing_date").notNull(),
  created_at: text("created_at").notNull().default(sql`NOW()`),
  updated_at: text("updated_at").notNull().default(sql`NOW()`),
  subscription_name: text("subscription_name"),
  subscription_id: text("subscription_id"),
  subscription_group: text("subscription_group"),
  subscription_group_id: text("subscription_group_id"),
  event_sub_type: text("event_sub_type"),
  event_grouping: text("event_grouping"),
  offer_type: text("offer_type"),
  territory: text("territory"),
  counts: numeric("counts", { precision: 38, scale: 12 }),
}, (t) => [index("idx_app_store_subscription_event_daily_partition").on(t.app_id, t.date)]);

export const app_store_report_partitions = pgTable("app_store_report_partitions", {
  id: serial("id").primaryKey(),
  app_id: integer("app_id").notNull().references(() => app_store_apps.id),
  report_kind: text("report_kind").notNull(),
  date: text("date").notNull(),
  granularity: text("granularity").notNull(),
  source_instance_id: text("source_instance_id").notNull(),
  processing_date: text("processing_date").notNull(),
  updated_at: text("updated_at").notNull().default(sql`NOW()`),
}, (t) => [uniqueIndex("idx_app_store_report_partitions_partition").on(t.app_id, t.report_kind, t.date, t.granularity)]);

export const app_store_sales_daily = pgTable("app_store_sales_daily", {
  id: serial("id").primaryKey(),
  connection_id: integer("connection_id").notNull().references(() => app_store_connections.id),
  report_date: text("report_date").notNull(),
  begin_date: text("begin_date").notNull(),
  end_date: text("end_date").notNull(),
  sku: text("sku"),
  apple_identifier: text("apple_identifier"),
  parent_identifier: text("parent_identifier"),
  product_type: text("product_type"),
  territory: text("territory"),
  units: numeric("units", { precision: 38, scale: 12 }),
  developer_proceeds: numeric("developer_proceeds", { precision: 38, scale: 12 }),
  proceeds_currency: text("proceeds_currency"),
  customer_price: numeric("customer_price", { precision: 38, scale: 12 }),
  customer_currency: text("customer_currency"),
  import_identity: text("import_identity").notNull(),
  created_at: text("created_at").notNull().default(sql`NOW()`),
  updated_at: text("updated_at").notNull().default(sql`NOW()`),
}, (t) => [index("idx_app_store_sales_daily_partition").on(t.connection_id, t.report_date)]);

export const app_store_finance_rows = pgTable("app_store_finance_rows", {
  id: serial("id").primaryKey(),
  connection_id: integer("connection_id").notNull().references(() => app_store_connections.id),
  fiscal_month: text("fiscal_month").notNull(),
  region_code: text("region_code").notNull(),
  start_date: text("start_date").notNull(),
  end_date: text("end_date").notNull(),
  vendor_identifier: text("vendor_identifier"),
  sku: text("sku"),
  product_id: text("product_id"),
  product_type: text("product_type"),
  territory: text("territory"),
  units: numeric("units", { precision: 38, scale: 12 }),
  earned_amount: numeric("earned_amount", { precision: 38, scale: 12 }),
  currency: text("currency"),
  import_identity: text("import_identity").notNull(),
  created_at: text("created_at").notNull().default(sql`NOW()`),
  updated_at: text("updated_at").notNull().default(sql`NOW()`),
}, (t) => [index("idx_app_store_finance_rows_partition").on(t.connection_id, t.fiscal_month)]);

export const app_store_sales_imports = pgTable("app_store_sales_imports", {
  id: serial("id").primaryKey(),
  connection_id: integer("connection_id").notNull().references(() => app_store_connections.id),
  report_date: text("report_date").notNull(),
  checksum: text("checksum").notNull(),
  imported_at: text("imported_at").notNull().default(sql`NOW()`),
}, (t) => [uniqueIndex("idx_app_store_sales_imports_partition").on(t.connection_id, t.report_date)]);

export const app_store_finance_imports = pgTable("app_store_finance_imports", {
  id: serial("id").primaryKey(),
  connection_id: integer("connection_id").notNull().references(() => app_store_connections.id),
  fiscal_month: text("fiscal_month").notNull(),
  region_code: text("region_code").notNull(),
  checksum: text("checksum").notNull(),
  imported_at: text("imported_at").notNull().default(sql`NOW()`),
}, (t) => [uniqueIndex("idx_app_store_finance_imports_partition").on(t.connection_id, t.fiscal_month, t.region_code)]);
