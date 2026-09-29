import { boolean, index, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";

export const analytics_sites = pgTable("analytics_sites", {
  id: serial("id").primaryKey(),
  owner_id: integer("owner_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  site_key: text("site_key").notNull(),
  host: text("host").notNull(),
  created_at: text("created_at").notNull().default(sql`NOW()`),
  updated_at: text("updated_at").notNull().default(sql`NOW()`),
  deleted_at: text("deleted_at"),
}, (table) => ({
  siteKey: uniqueIndex("idx_analytics_sites_site_key").on(table.site_key),
}));

export const analytics_events = pgTable("analytics_events", {
  id: serial("id").primaryKey(),
  site_id: integer("site_id").notNull().references(() => analytics_sites.id),
  path: text("path").notNull(),
  referrer_host: text("referrer_host").notNull().default(""),
  os: text("os").notNull(),
  browser: text("browser").notNull(),
  country: text("country").notNull(),
  device_type: text("device_type").notNull(),
  visitor: boolean("visitor").notNull(),
  visit: boolean("visit").notNull(),
  recorded_at: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  siteRecorded: index("idx_analytics_events_site_recorded").on(table.site_id, table.recorded_at.desc()),
}));
