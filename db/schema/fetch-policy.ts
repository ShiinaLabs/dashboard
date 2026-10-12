import { pgTable, text, integer, serial, uniqueIndex } from "drizzle-orm/pg-core";
import { accounts } from "./accounts";

export const fetchPolicy = pgTable("fetch_policy", {
  platform: text("platform").notNull(),
  level: text("level").notNull(), // l0|l1|l2
  intervalMinutes: integer("interval_minutes").notNull(),
}, (table) => ({
  pk: uniqueIndex("idx_fetch_policy_platform_level").on(table.platform, table.level),
}));

export const accountFetchState = pgTable("account_fetch_state", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  level: text("level").notNull(),
  lastFetchedAt: text("last_fetched_at"),
  nextDueAt: text("next_due_at"),
  failureCount: integer("failure_count").notNull().default(0),
  nextRetryAt: text("next_retry_at"),
  lastErrorKind: text("last_error_kind"),
}, (table) => ({
  uniq: uniqueIndex("idx_account_fetch_state_account_level").on(table.accountId, table.level),
}));
