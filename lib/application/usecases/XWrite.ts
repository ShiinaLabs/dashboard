export interface XTweet {
  id: string; account_id: number; full_text: string; created_at: string;
  favorite_count: number | null; retweet_count: number | null; reply_count: number | null; view_count: number | null;
  bookmark_count: number | null; is_quote: number; is_reply: number; is_retweet: number;
  media_urls: string; urls: string; hashtags: string; mentions: string; lang: string;
}
export interface XWrite {
  insertStats(s: { account_id: number; followers_count: number; following_count: number; tweet_count: number; listed_count: number }): Promise<void>;
  upsertTweet(t: XTweet): Promise<void>;
  upsertTweetAndSyncState?(t: XTweet, nextDueAt: string, metricDelta: number | null): Promise<void>;
  updateAccount(id: number, updates: Record<string, unknown>): Promise<void>;
}
