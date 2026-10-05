import { beforeEach, describe, expect, it, vi } from "vitest";
import { loader } from "@/app/(dashboard)/overview/page";
import { requireSession } from "@/lib/auth-helpers";
import { getOverviewReadModel } from "@/lib/services/overview";

const viewer = { id: 12, username: "member", role: "user" };
vi.mock("@/lib/auth-helpers", () => ({ requireSession: vi.fn() }));
vi.mock("@/lib/services/overview", () => ({ getOverviewReadModel: vi.fn() }));

const rawOverview = {
  accounts: [{
    id: 3,
    owner_id: 12,
    screen_name: "member",
    platform: "github",
    user_id: "github-member",
    auth_token: "server-only-token",
    fetch_interval: 3600,
    is_active: 1,
    last_fetched_at: null,
    error_message: null,
    instance_url: null,
    auth_type: null,
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
  }],
  stats: {
    tweet_count: 0, tweet_likes: 0, tweet_retweets: 0, tweet_views: 0,
    reply_count: 0, reply_likes: 0, reply_retweets: 0, reply_views: 0,
    followersCount: 0, followingCount: 0, userTweetCount: 0,
    todayTweets: 0, todayLikes: 0, todayRetweets: 0,
  },
  timeline: { dailyTweets: [], followerGrowth: [] },
  topLiked: [],
  platforms: {
    github: {
      followers: 1,
      repositoryCount: 2,
      stars: 3,
      forks: 4,
      pinnedRepositories: [{ id: 21, account_id: 3, repo_id: 321, name: "member/repo", language: "TypeScript", stars: 13, forks: 2 }],
    },
    gitlab: {
      followers: 5,
      projectCount: 6,
      stars: 7,
      forks: 8,
      pinnedProjects: [{ id: 22, account_id: 3, project_id: 654, name: "member/project", language: "Go", stars: 17, forks: 3 }],
    },
    reddit: { postKarma: 9, commentKarma: 10, totalPosts: 11, totalComments: 12, karmaTimeline: [], dailyActivity: [], subreddits: [] },
  },
  pulse: {},
  topContent: {},
  analyticsPortfolio: {
    period: { days: 7, timezone: "UTC", startDate: "2026-10-01", endDate: "2026-10-07" },
    previousPeriod: { days: 7, timezone: "UTC", startDate: "2026-09-24", endDate: "2026-09-30" },
    summary: { trackedSites: 0, activeSites: 0, views: 0, visits: 0 },
    previousSummary: { views: 0, visits: 0 },
    sites: [],
  },
  fetchHealth: {
    summary: {},
    unsupportedAccounts: [],
    issues: [{
      accountId: 3,
      platform: "github",
      screenName: "member",
      isActive: true,
      status: "failed",
      lastAttemptAt: "2026-10-05T00:00:00.000Z",
      lastSuccessAt: "2026-10-04T00:00:00.000Z",
      nextDueAt: "2026-10-05T01:00:00.000Z",
      consecutiveFailures: 3,
      latestError: "boom",
      capabilityGaps: [{ capability: "github_traffic", message: "unavailable", internalCode: "private" }],
      recentRuns: [{ id: 99, status: "failed" }],
    }, ...Array.from({ length: 5 }, (_, index) => ({
      accountId: index + 4,
      platform: "github",
      screenName: `member-${index + 1}`,
      isActive: true,
      status: "stale",
      lastAttemptAt: null,
      lastSuccessAt: null,
      nextDueAt: null,
      consecutiveFailures: 0,
      latestError: null,
      capabilityGaps: [],
      recentRuns: [],
    }))],
  },
};

function args(request: Request) {
  return { request, params: {}, context: {} } as never;
}

describe("Overview route loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireSession).mockResolvedValue({ user: viewer, session: viewer } as never);
    vi.mocked(getOverviewReadModel).mockResolvedValue(rawOverview as never);
  });

  it("starts one shared read model with the authenticated viewer and request timezone", async () => {
    const result = await loader(args(new Request("http://localhost/overview", {
      headers: { cookie: "dash_timezone=Asia%2FTokyo" },
    })));

    expect(getOverviewReadModel).toHaveBeenCalledTimes(1);
    expect(getOverviewReadModel).toHaveBeenCalledWith(viewer, {
      pulseDays: 7,
      contentDays: 7,
      analyticsRange: "DAYS_7",
      timezone: "Asia/Tokyo",
    });
    const data = await result.overviewData;
    expect(data).toMatchObject({
      github: { followers: 1, itemCount: 2, pinned: [{ external_id: 321 }] },
      gitlab: { followers: 5, itemCount: 6, pinned: [{ external_id: 654 }] },
      fetchHealth: {
        issueCount: 6,
        issues: [{
          accountId: 3,
          platform: "github",
          screenName: "member",
          status: "failed",
          latestError: "boom",
          capabilityGaps: [{ capability: "github_traffic", message: "unavailable" }],
        }, ...Array.from({ length: 4 }, (_, index) => ({
          accountId: index + 4,
          platform: "github",
          screenName: `member-${index + 1}`,
          status: "stale",
          latestError: null,
          capabilityGaps: [],
        }))],
      },
    });
    expect(data.fetchHealth.issues[0]).not.toHaveProperty("recentRuns");
    expect(data.fetchHealth.issues[0]).not.toHaveProperty("lastAttemptAt");
    expect(data.fetchHealth.issues[0]).not.toHaveProperty("lastSuccessAt");
    expect(data.fetchHealth.issues[0]).not.toHaveProperty("nextDueAt");
    expect(data.fetchHealth.issues[0]).not.toHaveProperty("consecutiveFailures");
    expect(data.fetchHealth.issues[0]).not.toHaveProperty("isActive");
    expect(data.accounts[0]).not.toHaveProperty("owner_id");
    expect(data.accounts[0]).not.toHaveProperty("auth_token");
  });

  it("returns before the shared read model resolves", async () => {
    let resolveReadModel!: (value: typeof rawOverview) => void;
    vi.mocked(getOverviewReadModel).mockReturnValue(new Promise((resolve) => { resolveReadModel = resolve; }) as never);
    const result = await loader(args(new Request("http://localhost/overview")));

    expect(result.overviewData).toBeInstanceOf(Promise);
    expect(getOverviewReadModel).toHaveBeenCalledTimes(1);
    resolveReadModel(rawOverview);
    await expect(result.overviewData).resolves.toHaveProperty("github.itemCount", 2);
  });

  it("uses UTC when the request timezone is invalid", async () => {
    await loader(args(new Request("http://localhost/overview", {
      headers: { cookie: "dash_timezone=Not%2FAZone" },
    })));
    expect(getOverviewReadModel).toHaveBeenCalledWith(viewer, expect.objectContaining({ timezone: "UTC" }));
  });

  it("redirects unauthenticated requests to login with the requested path", async () => {
    vi.mocked(requireSession).mockResolvedValue(null);
    await expect(loader(args(new Request("http://localhost/overview?tab=activity"))))
      .rejects.toMatchObject({ status: 302, headers: expect.any(Headers) });
    expect(getOverviewReadModel).not.toHaveBeenCalled();
  });
});
