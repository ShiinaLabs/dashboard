import { boolean, index, integer, pgTable, serial, text, uniqueIndex } from "drizzle-orm/pg-core";
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
  trigger: text("trigger").$type<"manual" | "scheduler">().notNull(),
  status: text("status").$type<"running" | "success" | "error">().notNull(),
  started_at: text("started_at").notNull().default(sql`NOW()`),
  finished_at: text("finished_at"),
  duration_ms: integer("duration_ms"),
  error_message: text("error_message"),
}, (table) => [index("idx_app_store_sync_runs_connection_started").on(table.connection_id, table.started_at.desc())]);
