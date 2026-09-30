import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  fetchWithConfigMock,
  withNetworkRetryMock,
  insertRedditStatsMock,
  upsertRedditPostMock,
  upsertRedditCommentMock,
  updateAccountMock,
  loggerErrorMock,
} = vi.hoisted(() => ({
  fetchWithConfigMock: vi.fn(),
  withNetworkRetryMock: vi.fn((request: () => Promise<unknown>) => request()),
  insertRedditStatsMock: vi.fn(),
  upsertRedditPostMock: vi.fn(),
  upsertRedditCommentMock: vi.fn(),
  updateAccountMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

vi.mock("../lib/http", () => ({
  fetchWithConfig: fetchWithConfigMock,
  withNetworkRetry: withNetworkRetryMock,
}));

vi.mock("../lib/db", () => ({
  insertRedditStats: insertRedditStatsMock,
  upsertRedditPost: upsertRedditPostMock,
  upsertRedditComment: upsertRedditCommentMock,
  updateAccount: updateAccountMock,
}));

vi.mock("../lib/logger", () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: loggerErrorMock,
  }),
}));

import { fetchRedditPublicAccount } from "../lib/fetchers/reddit";
import { RedditClient } from "../lib/infra/fetchers/RedditClient";

const account = {
  id: 42,
  is_active: true,
  auth_token: JSON.stringify({ loid: "cookie-fixture" }),
  screen_name: "fixture-user",
} as never;

describe("Reddit public fetch transport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    fetchWithConfigMock.mockReset();
    withNetworkRetryMock.mockImplementation((request: () => Promise<unknown>) => request());
    insertRedditStatsMock.mockResolvedValue(undefined);
    upsertRedditPostMock.mockResolvedValue(undefined);
    upsertRedditCommentMock.mockResolvedValue(undefined);
    updateAccountMock.mockResolvedValue(undefined);
  });

  it("fetches profile, posts, and comments with the existing cookies and request headers", async () => {
    fetchWithConfigMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { name: "fixture-user", link_karma: 4, comment_karma: 7 } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { children: [], after: null } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { children: [], after: null } })));

    await expect(fetchRedditPublicAccount(account)).resolves.toEqual({ posts: 0, comments: 0 });

    expect(fetchWithConfigMock.mock.calls.map(([url]) => url)).toEqual([
      "https://www.reddit.com/user/fixture-user/about.json",
      "https://www.reddit.com/user/fixture-user/submitted.json?limit=25&sort=new",
      "https://www.reddit.com/user/fixture-user/comments.json?limit=25&sort=new",
    ]);
    for (const [, init] of fetchWithConfigMock.mock.calls) {
      expect(init.headers).toEqual({
        "User-Agent": "Safari/537.36",
        Accept: "application/json",
        Cookie: "loid=cookie-fixture",
      });
      expect(init.signal).toBeInstanceOf(AbortSignal);
    }
    expect(withNetworkRetryMock).toHaveBeenCalledTimes(3);
    expect(withNetworkRetryMock).toHaveBeenCalledWith(expect.any(Function), { label: "Reddit" });
    expect(insertRedditStatsMock).toHaveBeenCalledWith(expect.objectContaining({ account_id: 42, post_karma: 4, comment_karma: 7 }));
  });

  it("uses the same configured fetch transport in RedditClient public mode", async () => {
    fetchWithConfigMock.mockResolvedValue(new Response(JSON.stringify({ data: { name: "fixture-user" } })));

    await expect(new RedditClient("reddit_public").fetchUser("fixture-user", JSON.stringify({ loid: "cookie-fixture" })))
      .resolves.toEqual({ data: { name: "fixture-user" } });

    expect(fetchWithConfigMock).toHaveBeenCalledWith("https://www.reddit.com/user/fixture-user/about.json", expect.objectContaining({
      headers: {
        "User-Agent": "Safari/537.36",
        Accept: "application/json",
        Cookie: "loid=cookie-fixture",
      },
      signal: expect.any(AbortSignal),
    }));
    expect(withNetworkRetryMock).toHaveBeenCalledWith(expect.any(Function), { label: "Reddit" });
  });

  it("records a Reddit HTTP error without logging the cookie value", async () => {
    fetchWithConfigMock.mockResolvedValue(new Response("forbidden body", { status: 403 }));

    await expect(fetchRedditPublicAccount(account)).rejects.toThrow(/HTTP 403/);

    expect(updateAccountMock).toHaveBeenCalledWith(42, expect.objectContaining({ error_message: expect.stringContaining("HTTP 403") }));
    expect(JSON.stringify(loggerErrorMock.mock.calls)).not.toContain("cookie-fixture");
  });

  it("reports invalid JSON and limits the response excerpt to 200 characters", async () => {
    const body = `${"x".repeat(200)}tail`;
    fetchWithConfigMock.mockResolvedValue(new Response(body));

    await expect(fetchRedditPublicAccount(account)).rejects.toThrow(`invalid JSON for /user/fixture-user/about.json: ${"x".repeat(200)}`);
    expect(updateAccountMock).toHaveBeenCalledWith(42, expect.objectContaining({ error_message: expect.not.stringContaining("tail") }));
  });

  it("aborts a stalled public request after 30 seconds", async () => {
    vi.useFakeTimers();
    fetchWithConfigMock.mockImplementation((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new Error("request timed out")), { once: true });
    }));

    const fetch = fetchRedditPublicAccount(account);
    const failure = expect(fetch).rejects.toThrow("request timed out");
    await vi.advanceTimersByTimeAsync(30_000);

    await failure;
    vi.useRealTimers();
  });
});
