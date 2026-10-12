import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());
vi.mock("../lib/db/connection", () => ({ getPgPool: () => ({ query }) }));
import { getDueXTweetCandidates, markXTweetFailure, seedLegacyXTweetState, upsertDiscoveredXTweets } from "../lib/repositories/x-sync";

describe("X sync state repository", () => {
  beforeEach(() => { vi.clearAllMocks(); query.mockResolvedValue({ rows: [], rowCount: 2 }); });

  it("seeds legacy tweets idempotently in a bounded batch", async () => {
    expect(await seedLegacyXTweetState(7)).toBe(2);
    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain("ON CONFLICT (account_id, tweet_id) DO NOTHING");
    expect(sql).toContain("LIMIT $2");
    expect(parameters).toEqual([7, 250]);
  });

  it("stores discoveries without overwriting first-seen or retry state", async () => {
    await upsertDiscoveredXTweets(7, [{ id: "tweet-1", publishedAt: null, isPinned: true }]);
    const [sql] = query.mock.calls[0];
    expect(sql).toContain("ON CONFLICT (account_id,tweet_id) DO UPDATE");
    expect(sql).toContain("is_pinned=EXCLUDED.is_pinned");
    expect(sql).not.toContain("next_due_at=EXCLUDED");
  });

  it("returns bounded candidate groups and persists error retry scheduling", async () => {
    query.mockResolvedValueOnce({ rows: [{ id: "1", isPinned: false, metrics: null, kind: "retry" }] });
    await expect(getDueXTweetCandidates(7)).resolves.toMatchObject([{ id: "1", kind: "retry", metrics: null }]);
    expect(query.mock.calls[0][0]).toContain("rank_in_kind<=200");
    await markXTweetFailure(7, "1", "network", new Date("2026-10-13T00:00:00Z"));
    expect(query.mock.calls[1][0]).toContain("failure_count=failure_count+1");
  });
});
