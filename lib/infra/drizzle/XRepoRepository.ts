import type { XWrite, XTweet } from "../../application/usecases/XWrite";
import { getDb } from "../../db/connection";
import { tweets, xTweetSyncState } from "@/db/schema";
import { sql } from "drizzle-orm";

export class XRepoRepository implements XWrite {
  async insertStats(s: { account_id: number; followers_count: number; following_count: number; tweet_count: number; listed_count: number }): Promise<void> {
    const { insertUserStats } = await import("../../repositories/twitter");
    await insertUserStats(s);
  }
  async upsertTweet(t: XTweet): Promise<void> {
    const { upsertTweet } = await import("../../repositories/twitter");
    await upsertTweet(t);
  }
  async upsertTweetAndSyncState(t: XTweet, nextDueAt: string, metricDelta: number | null): Promise<void> {
    await getDb().transaction(async (tx) => {
      await tx.insert(tweets).values({ ...t, fetched_at: sql`NOW()` }).onConflictDoUpdate({
        target: tweets.id,
        set: {
          favorite_count: sql`COALESCE(EXCLUDED.favorite_count, ${tweets.favorite_count})`,
          retweet_count: sql`COALESCE(EXCLUDED.retweet_count, ${tweets.retweet_count})`,
          reply_count: sql`COALESCE(EXCLUDED.reply_count, ${tweets.reply_count})`,
          view_count: sql`COALESCE(EXCLUDED.view_count, ${tweets.view_count})`,
          bookmark_count: sql`COALESCE(EXCLUDED.bookmark_count, ${tweets.bookmark_count})`,
          fetched_at: sql`NOW()`,
        },
      });
      await tx.update(xTweetSyncState).set({ lastAttemptAt: sql`NOW()::text`, failureCount: 0, lastErrorKind: null,
        nextDueAt, lastMetricDelta: metricDelta }).where(sql`${xTweetSyncState.accountId} = ${t.account_id} AND ${xTweetSyncState.tweetId} = ${t.id}`);
    });
  }
  async updateAccount(id: number, updates: Record<string, unknown>): Promise<void> {
    const { updateAccount } = await import("../../repositories/accounts");
    await updateAccount(id, updates as never);
  }
}
