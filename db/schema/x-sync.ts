import { pgTable, text, integer, boolean, uniqueIndex, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { accounts } from "./accounts";

export const xTweetSyncState = pgTable("x_tweet_sync_state", {
  accountId: integer("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  tweetId: text("tweet_id").notNull(),
  publishedAt: text("published_at"),
  firstSeenAt: text("first_seen_at").notNull().default(sql`NOW()`),
  isPinned: boolean("is_pinned").notNull().default(false),
  lastAttemptAt: text("last_attempt_at"),
  nextDueAt: text("next_due_at").notNull().default(sql`NOW()`),
  failureCount: integer("failure_count").notNull().default(0),
  lastMetricDelta: integer("last_metric_delta"),
  lastErrorKind: text("last_error_kind"),
}, (table) => ({
  uniq: uniqueIndex("idx_x_tweet_sync_account_tweet").on(table.accountId, table.tweetId),
  due: index("idx_x_tweet_sync_due").on(table.accountId, table.nextDueAt),
}));

export const xAccountDiscoveryState = pgTable("x_account_discovery_state", {
  accountId: integer("account_id").primaryKey().references(() => accounts.id, { onDelete: "cascade" }),
  lastRegularSuccessAt: text("last_regular_success_at"),
  lastFullSuccessAt: text("last_full_success_at"),
});
