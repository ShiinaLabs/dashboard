import { integer, pgTable, serial, text, uniqueIndex } from "drizzle-orm/pg-core";
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
  ownerSiteKey: uniqueIndex("idx_analytics_sites_owner_site_key").on(table.owner_id, table.site_key),
}));
