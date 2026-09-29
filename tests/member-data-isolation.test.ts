import { beforeEach, describe, expect, it, vi } from "vitest";

const requireSession = vi.fn();
const getAccounts = vi.fn();
vi.mock("@/lib/auth-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/auth-helpers")>();
  return { ...actual, requireSession: (...args: unknown[]) => requireSession(...args) };
});
vi.mock("@/lib/services/accounts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/services/accounts")>();
  return { ...actual, getAccounts: (...args: unknown[]) => getAccounts(...args) };
});

const getOverviewStats = vi.fn();
const getTimeline = vi.fn();
const getTweets = vi.fn();
const getTopTweets = vi.fn();
const getCalendarData = vi.fn();
vi.mock("@/lib/services/twitter", () => ({
  getOverviewStats: (...args: unknown[]) => getOverviewStats(...args),
  getTimeline: (...args: unknown[]) => getTimeline(...args),
  getTweets: (...args: unknown[]) => getTweets(...args),
  getTopTweets: (...args: unknown[]) => getTopTweets(...args),
  getCalendarData: (...args: unknown[]) => getCalendarData(...args),
}));

const { loader: overview } = await import("../app/api/stats/overview/route");
const { loader: timeline } = await import("../app/api/stats/timeline/route");
const { loader: tweets } = await import("../app/api/tweets/route");
const { loader: top } = await import("../app/api/stats/top/route");
const { loader: calendar } = await import("../app/api/stats/calendar/route");

const ownUser = { id: 1, username: "member-a", role: "user" };
const emptyUser = { id: 3, username: "member-c", role: "user" };
const admin = { id: 4, username: "admin", role: "admin" };
const accounts = [
  { id: 10, platform: "twitter", owner_id: 1 },
  { id: 20, platform: "twitter", owner_id: 2 },
  { id: 30, platform: "github", owner_id: 3 },
];

function call(loader: unknown, path: string) {
  return (loader as (args: { request: Request }) => Promise<Response>)({
    request: new Request(`http://dashboard.test${path}`),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireSession.mockResolvedValue({ user: ownUser });
  getAccounts.mockImplementation(async (ownerId?: number) =>
    ownerId === undefined ? accounts : accounts.filter((account) => account.owner_id === ownerId),
  );
  getOverviewStats.mockImplementation(async (accountIds?: number[]) => accountIds?.length === 0 ? {
    tweet_count: 0, tweet_likes: 0, tweet_retweets: 0, tweet_views: 0,
    reply_count: 0, reply_likes: 0, reply_retweets: 0, reply_views: 0,
    followersCount: 0, followingCount: 0, userTweetCount: 0,
    todayLikes: 0, todayRetweets: 0, todayTweets: 0,
  } : { tweet_count: 1 });
  getTimeline.mockImplementation(async (_days, accountIds?: number[]) => accountIds?.length === 0
    ? { dailyTweets: [], followerGrowth: [] }
    : { dailyTweets: [{ date: "2026-01-01" }], followerGrowth: [] },
  );
  getTweets.mockImplementation(async (_page, _limit, _sort, _order, _search, accountIds) => ({
    data: accountIds?.length === 0 ? [] : [{ id: "tweet" }], total: accountIds?.length === 0 ? 0 : 1,
    page: 1, limit: 20, totalPages: accountIds?.length === 0 ? 0 : 1,
  }));
  getTopTweets.mockResolvedValue([]);
  getCalendarData.mockResolvedValue([]);
});

describe("member data isolation for aggregate Twitter APIs", () => {
  it("scopes default requests to the member's Twitter accounts on all five endpoints", async () => {
    await call(overview, "/api/stats/overview");
    await call(timeline, "/api/stats/timeline");
    await call(tweets, "/api/tweets");
    await call(top, "/api/stats/top");
    await call(calendar, "/api/stats/calendar");

    expect(getOverviewStats).toHaveBeenCalledWith([10]);
    expect(getTimeline).toHaveBeenCalledWith(30, [10]);
    expect(getTweets.mock.calls[0]?.[5]).toEqual([10]);
    expect(getTopTweets).toHaveBeenCalledWith("favorite_count", 10, [10]);
    expect(getCalendarData.mock.calls[0]?.[1]).toEqual([10]);
  });

  it("intersects explicit account filters with the member's ownership", async () => {
    await call(overview, "/api/stats/overview?accountIds=10,20");
    await call(timeline, "/api/stats/timeline?accountIds=10,20");
    await call(tweets, "/api/tweets?accountIds=10,20");
    expect(getOverviewStats).toHaveBeenCalledWith([10]);
    expect(getTimeline).toHaveBeenCalledWith(30, [10]);
    expect(getTweets.mock.calls[0]?.[5]).toEqual([10]);
  });

  it("passes an explicit empty scope for foreign-only and no-Twitter-account users", async () => {
    await call(overview, "/api/stats/overview?accountIds=20");
    await call(timeline, "/api/stats/timeline?accountIds=20");
    await call(tweets, "/api/tweets?accountIds=20");
    expect(getOverviewStats).toHaveBeenLastCalledWith([]);
    expect(getTimeline).toHaveBeenLastCalledWith(30, []);
    expect(getTweets.mock.calls.at(-1)?.[5]).toEqual([]);

    requireSession.mockResolvedValue({ user: emptyUser });
    const emptyOverview = await call(overview, "/api/stats/overview");
    const emptyTimeline = await call(timeline, "/api/stats/timeline");
    const emptyTweets = await call(tweets, "/api/tweets");
    const emptyTop = await call(top, "/api/stats/top");
    const emptyCalendar = await call(calendar, "/api/stats/calendar");

    expect(getOverviewStats).toHaveBeenLastCalledWith([]);
    expect(getTimeline).toHaveBeenLastCalledWith(30, []);
    expect(getTweets.mock.calls.at(-1)?.[5]).toEqual([]);
    expect(getTopTweets).toHaveBeenLastCalledWith("favorite_count", 10, []);
    expect(getCalendarData.mock.calls.at(-1)?.[1]).toEqual([]);
    expect(await emptyOverview.json()).toMatchObject({
      tweet_count: 0, tweet_likes: 0, tweet_retweets: 0, tweet_views: 0,
      reply_count: 0, reply_likes: 0, reply_retweets: 0, reply_views: 0,
      followersCount: 0, followingCount: 0, userTweetCount: 0,
      todayLikes: 0, todayRetweets: 0, todayTweets: 0,
    });
    expect(await emptyTimeline.json()).toEqual({ dailyTweets: [], followerGrowth: [] });
    expect(await emptyTweets.json()).toEqual({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });
    expect(await emptyTop.json()).toEqual([]);
    expect(await emptyCalendar.json()).toEqual([]);
  });

  it("preserves admin-wide defaults across all five endpoints", async () => {
    requireSession.mockResolvedValue({ user: admin });
    await call(overview, "/api/stats/overview");
    await call(timeline, "/api/stats/timeline");
    await call(tweets, "/api/tweets");
    await call(top, "/api/stats/top");
    await call(calendar, "/api/stats/calendar");

    expect(getOverviewStats).toHaveBeenCalledWith(undefined);
    expect(getTimeline).toHaveBeenCalledWith(30, undefined);
    expect(getTweets.mock.calls[0]?.[5]).toBeUndefined();
    expect(getTopTweets).toHaveBeenCalledWith("favorite_count", 10, undefined);
    expect(getCalendarData.mock.calls[0]?.[1]).toBeUndefined();
  });
});
