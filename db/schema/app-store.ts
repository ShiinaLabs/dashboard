import { boolean, index, integer, jsonb, pgTable, serial, text, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";

export const app_store_connections = pgTable("app_store_connections", {
  id: serial("id").primaryKey(),
  owner_id: integer("owner_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  issuer_id: text("issuer_id").notNull(),
  key_id: text("key_id").notNull(),
  private_key_encrypted: text("private_key_encrypted").notNull(),
  vendor_number: text("vendor_number"),
  is_active: boolean("is_active").notNull().default(true),
  created_at: text("created_at").notNull().default(sql`NOW()`),
  updated_at: text("updated_at").notNull().default(sql`NOW()`),
  deleted_at: text("deleted_at"),
}, (table) => [index("idx_app_store_connections_owner").on(table.owner_id)]);

export const app_store_apps = pgTable("app_store_apps", {
  id: serial("id").primaryKey(),
  connection_id: integer("connection_id").notNull().references(() => app_store_connections.id),
  apple_id: text("apple_id").notNull(),
  bundle_id: text("bundle_id").notNull(),
  sku: text("sku").notNull(),
  name: text("name").notNull(),
  is_enabled: boolean("is_enabled").notNull().default(false),
  created_at: text("created_at").notNull().default(sql`NOW()`),
  updated_at: text("updated_at").notNull().default(sql`NOW()`),
}, (table) => [uniqueIndex("idx_app_store_apps_connection_apple").on(table.connection_id, table.apple_id)]);

export const app_store_sync_runs = pgTable("app_store_sync_runs", {
  id: serial("id").primaryKey(),
  connection_id: integer("connection_id").notNull().references(() => app_store_connections.id),
  kind: text("kind").$type<"metadata" | "analytics" | "sales" | "finance">().notNull(),
  scope: text("scope"),
  trigger: text("trigger").$type<"manual" | "scheduler">().notNull(),
  status: text("status").$type<"running" | "success" | "partial" | "error">().notNull(),
  started_at: text("started_at").notNull().default(sql`NOW()`),
  finished_at: text("finished_at"),
  duration_ms: integer("duration_ms"),
  error_message: text("error_message"),
  diagnostic_summary: jsonb("diagnostic_summary").$type<AppStoreDiagnosticSummary | null>(),
}, (table) => [index("idx_app_store_sync_runs_connection_started").on(table.connection_id, table.started_at.desc())]);

export interface AppStoreDiagnosticSummary {
  version: 1;
  checkpoint: "request" | "catalog" | "instance" | "download" | "parse" | "map" | "commit" | "verify" | "finished";
  checkpointAt: string;
  source: string;
  scope: string | null;
  trigger: "manual" | "scheduler";
  counters: Record<string, number>;
  reports: import("../../shared/app-store").AppStoreDiagnosticReport[];
  before: Record<string, string | number | null>;
  after: Record<string, string | number | null>;
  issues: Array<{ severity: "info" | "warn" | "error"; stage: string; code: string; appId?: number; reportKind?: string }>;
}

export const app_store_analytics_requests = pgTable("app_store_analytics_requests", {
  id: serial("id").primaryKey(),
  app_id: integer("app_id").notNull().references(() => app_store_apps.id),
  apple_request_id: text("apple_request_id").notNull(),
  access_type: text("access_type").$type<"ONE_TIME_SNAPSHOT" | "ONGOING">().notNull(),
  stopped_due_to_inactivity: boolean("stopped_due_to_inactivity").notNull().default(false),
  created_at: text("created_at").notNull().default(sql`NOW()`),
  updated_at: text("updated_at").notNull().default(sql`NOW()`),
  last_seen_at: text("last_seen_at").notNull().default(sql`NOW()`),
}, (table) => [uniqueIndex("idx_app_store_analytics_requests_apple").on(table.apple_request_id), index("idx_app_store_analytics_requests_app").on(table.app_id)]);

export const app_store_report_imports = pgTable("app_store_report_imports", {
  id: serial("id").primaryKey(),
  app_id: integer("app_id").notNull().references(() => app_store_apps.id),
  analytics_request_id: integer("analytics_request_id").notNull().references(() => app_store_analytics_requests.id),
  report_name: text("report_name").notNull(),
  report_category: text("report_category").notNull(),
  apple_report_id: text("apple_report_id").notNull(),
  apple_instance_id: text("apple_instance_id").notNull(),
  apple_segment_id: text("apple_segment_id").notNull(),
  granularity: text("granularity").$type<"DAILY">().notNull(),
  processing_date: text("processing_date").notNull(),
  checksum: text("checksum").notNull(),
  status: text("status").$type<"pending" | "imported" | "error">().notNull(),
  error_message: text("error_message"),
  imported_at: text("imported_at"),
}, (table) => [uniqueIndex("idx_app_store_imports_app_segment").on(table.app_id, table.apple_instance_id, table.apple_segment_id), index("idx_app_store_imports_app_processing").on(table.app_id, table.processing_date)]);
