import { beforeEach, describe, expect, it, vi } from "vitest";

const mockXClient = vi.hoisted(() => vi.fn());
vi.mock("../scripts/utils", () => ({ _xClient: mockXClient }));
import { XClient } from "../lib/infra/fetchers/XClient";

function apiClient(timeline = vi.fn().mockResolvedValue({ data: { data: [] } })) {
  const profile = { data: { user: { restId: "99", legacy: { idStr: "99", pinnedTweetIdsStr: ["pinned-old"] } } } };
  const result = { data: { data: [{ views: { count: 42 }, tweet: { restId: "tweet-1", legacy: { idStr: "tweet-1", createdAt: "2026-01-01" } } }] } };
  return {
    getUserApi: () => ({ getUserByScreenName: vi.fn().mockResolvedValue(profile) }),
    getTweetApi: () => ({ getTweetDetail: vi.fn().mockResolvedValue(result), getUserTweetsAndReplies: timeline }),
  };
}

describe("XClient session and profile", () => {
  beforeEach(() => { vi.clearAllMocks(); mockXClient.mockResolvedValue(apiClient()); });

  it("initializes one client per instance and returns verified pinned IDs", async () => {
    const client = new XClient("credential", "alice", "");
    const profile = await client.fetchProfile();
    await client.fetchTweetDetail("tweet-1");
    await client.fetchTweetDetail("tweet-1");
    expect(profile.pinnedIds).toEqual(["pinned-old"]);
    expect(mockXClient).toHaveBeenCalledTimes(1);
    expect(mockXClient).toHaveBeenCalledWith("credential");
  });

  it("retries initialization after a rejected session promise", async () => {
    mockXClient.mockRejectedValueOnce(new Error("bootstrap failed")).mockResolvedValueOnce(apiClient());
    const client = new XClient("credential", "alice", "");
    await expect(client.fetchProfile()).rejects.toThrow("bootstrap failed");
    await expect(client.fetchProfile()).resolves.toMatchObject({ userId: "99" });
    expect(mockXClient).toHaveBeenCalledTimes(2);
  });

  it("returns the outer detail entry so views metadata remains available", async () => {
    const client = new XClient("credential", "alice", "");
    await expect(client.fetchTweetDetail("tweet-1")).resolves.toMatchObject({ views: { count: 42 }, tweet: { restId: "tweet-1" } });
  });

  it("keeps an old pinned ID and continues regular scanning after known recent IDs", async () => {
    vi.useFakeTimers();
    try {
      const timeline = vi.fn()
        .mockResolvedValueOnce({ data: { data: [{
          tweet: { restId: "known-1", legacy: { idStr: "known-1", userIdStr: "99", createdAt: new Date().toISOString() } },
          replies: [{ tweet: { restId: "reply-1", legacy: { idStr: "reply-1", userIdStr: "99", createdAt: new Date().toISOString() } },
            replies: [{ tweet: { restId: "reply-2", legacy: { idStr: "reply-2", userIdStr: "99", createdAt: new Date().toISOString() } } }] }],
        }], cursor: { bottom: { value: "page-2" } } } })
        .mockResolvedValueOnce({ data: { data: [{ tweet: { restId: "known-2", legacy: { idStr: "known-2", userIdStr: "99", createdAt: new Date().toISOString() } } }] } });
      mockXClient.mockResolvedValue(apiClient(timeline));
      const client = new XClient("credential", "alice", "");
      const resultPromise = client.discoverOwnTweetIds("99", Date.now() - 90 * 86_400_000, 800, ["old-pinned"], 2);
      await vi.runAllTimersAsync();
      const result = await resultPromise;
      expect(timeline).toHaveBeenCalledTimes(2);
      expect(result.tweets).toContainEqual({ id: "old-pinned", publishedAt: null, isPinned: true });
      expect(result.ids).toEqual(expect.arrayContaining(["known-1", "known-2", "reply-1", "reply-2", "old-pinned"]));
    } finally { vi.useRealTimers(); }
  });

  it("reports a tweet-limit stop so a capped walk cannot be recorded as complete", async () => {
    vi.useFakeTimers();
    try {
      const timeline = vi.fn().mockResolvedValue({ data: { data: [{ tweet: { restId: "known", legacy: { idStr: "known", userIdStr: "99", createdAt: new Date().toISOString() } } }] } });
      mockXClient.mockResolvedValue(apiClient(timeline));
      const client = new XClient("credential", "alice", "");
      const resultPromise = client.discoverOwnTweetIds("99", Date.now() - 90 * 86_400_000, 1, [], 8);
      await vi.runAllTimersAsync();
      await expect(resultPromise).resolves.toMatchObject({ stopReason: "tweet_limit" });
    } finally { vi.useRealTimers(); }
  });
});
