import { describe, expect, it } from "vitest";
import { extractTweet, toISO } from "../lib/infra/fetchers/XMapper";

const response = (overrides: Record<string, unknown> = {}) => ({
  views: { count: 41 },
  tweet: { restId: "123", legacy: { idStr: "123", createdAt: "2026-01-02T03:04:05Z", favoriteCount: 0,
    retweetCount: 2, quoteCount: 3, replyCount: 0, bookmarkCount: 0, fullText: "post" , ...overrides } },
});

describe("X mapper", () => {
  it("rejects absent or invalid publication dates instead of inventing now", () => {
    expect(toISO(undefined)).toBeNull();
    expect(toISO("not a date")).toBeNull();
    expect(extractTweet(response({ createdAt: "not a date" }), 1)).toBeNull();
  });

  it("keeps real zeros, treats missing metrics as unknown, and requires both repost components", () => {
    const tweet = extractTweet(response({ retweetCount: 2, quoteCount: undefined, bookmarkCount: undefined }), 1, "123");
    expect(tweet).toMatchObject({ favorite_count: 0, reply_count: 0, retweet_count: null, bookmark_count: null, view_count: 41 });
  });

  it("does not map a response whose identity differs from the requested tweet", () => {
    expect(extractTweet(response(), 1, "other-id")).toBeNull();
  });
});
