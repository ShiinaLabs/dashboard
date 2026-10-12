import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const onConflictDoUpdate = vi.hoisted(() => vi.fn());
vi.mock("../lib/db/connection", () => ({ getDb: () => ({ insert: () => ({ values: () => ({ onConflictDoUpdate }) }) }) }));
import { upsertTweet } from "../lib/repositories/twitter";

describe("upsertTweet refresh semantics", () => {
  it("merges nullable metrics, writes real zero values, advances fetched_at, and preserves created_at", async () => {
    await upsertTweet({ id: "tweet-1", account_id: 1, full_text: "text", created_at: "2026-01-01T00:00:00Z",
      favorite_count: 0, retweet_count: null, reply_count: 1, view_count: null, bookmark_count: 0,
      is_quote: 0, is_reply: 0, is_retweet: 0, media_urls: "[]", urls: "[]", hashtags: "[]", mentions: "[]", lang: "en" });
    const config = onConflictDoUpdate.mock.calls[0][0];
    const dialect = new PgDialect();
    expect(dialect.sqlToQuery(config.set.favorite_count).sql).toContain("COALESCE(EXCLUDED.favorite_count");
    expect(dialect.sqlToQuery(config.set.view_count).sql).toContain("COALESCE(EXCLUDED.view_count");
    expect(dialect.sqlToQuery(config.set.fetched_at).sql).toContain("NOW()");
    expect(config.set).not.toHaveProperty("created_at");
  });
});
