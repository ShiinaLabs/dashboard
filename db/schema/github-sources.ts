import { pgTable, text, integer, serial, bigint, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { accounts } from "./accounts";
import { github_repos } from "./github";

/** PAT discovery namespaces. This is not repository ownership. */
export const github_sources = pgTable("github_sources", {
  id: serial("id").primaryKey(),
  account_id: integer("account_id").notNull().references(() => accounts.id),
  source_type: text("source_type").notNull(),
  login: text("login").notNull(),
  github_id: bigint("github_id", { mode: "number" }),
  node_id: text("node_id"),
  enabled: integer("enabled").notNull().default(1),
  last_discovered_at: text("last_discovered_at"),
  last_success_at: text("last_success_at"),
  last_error: text("last_error"),
  created_at: text("created_at").notNull().default(sql`NOW()`),
  updated_at: text("updated_at").notNull().default(sql`NOW()`),
}, (table) => ({
  accountSource: uniqueIndex("idx_github_sources_account_type_login").on(table.account_id, table.source_type, table.login),
  accountEnabled: index("idx_github_sources_account_enabled").on(table.account_id, table.enabled),
}));

/** A PAT/account's explicit monitoring relation to a stable repository row. */
export const github_repository_tracking = pgTable("github_repository_tracking", {
  id: serial("id").primaryKey(),
  account_id: integer("account_id").notNull().references(() => accounts.id),
  repository_id: integer("repository_id").notNull().references(() => github_repos.id),
  enabled: integer("enabled").notNull().default(1),
  pinned: integer("pinned").notNull().default(0),
  first_seen_at: text("first_seen_at").notNull().default(sql`NOW()`),
  last_seen_at: text("last_seen_at"),
  last_synced_at: text("last_synced_at"),
  last_access_ok_at: text("last_access_ok_at"),
  last_error: text("last_error"),
  created_at: text("created_at").notNull().default(sql`NOW()`),
  updated_at: text("updated_at").notNull().default(sql`NOW()`),
}, (table) => ({
  accountRepository: uniqueIndex("idx_github_tracking_account_repository").on(table.account_id, table.repository_id),
  accountEnabled: index("idx_github_tracking_account_enabled").on(table.account_id, table.enabled),
  repository: index("idx_github_tracking_repository").on(table.repository_id),
}));
