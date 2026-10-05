import { beforeEach, describe, expect, it, vi } from "vitest";
import { action as graphqlAction } from "@/app/api/graphql/route";
import { getOverviewReadModel } from "@/lib/services/overview";
import { projectOverviewReadModel } from "@/lib/services/overview-projection";

const viewer = { id: 12, username: "member", role: "user" };
vi.mock("@/lib/auth-helpers", () => ({ requireSession: vi.fn(async () => ({ user: viewer, session: viewer })) }));
vi.mock("@/lib/services/overview", () => ({ getOverviewReadModel: vi.fn() }));

async function query(source: string, variables: Record<string, unknown>) {
  return graphqlAction({ request: new Request("http://localhost/api/graphql", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: source, variables }) }), params: {}, context: {} } as never);
}

describe("Overview page query", () => {
  beforeEach(() => vi.clearAllMocks());

  it("composes a page read model once with viewer and page parameters", async () => {
    vi.mocked(getOverviewReadModel).mockResolvedValue({ accounts: [{ id: 4, screen_name: "x" }] } as never);
    const response = await query(`query OverviewPage($pulseDays: Int!, $contentDays: Int!, $analyticsRange: AnalyticsRange!, $timezone: String!) {
      overview { page(pulseDays: $pulseDays, contentDays: $contentDays, analyticsRange: $analyticsRange, timezone: $timezone) { accounts { id screen_name } } }
    }`, { pulseDays: 7, contentDays: 14, analyticsRange: "DAYS_30", timezone: "Europe/Paris" });

    expect((await response.json()).data.overview.page.accounts).toEqual([{ id: 4, screen_name: "x" }]);
    expect(getOverviewReadModel).toHaveBeenCalledTimes(1);
    expect(getOverviewReadModel).toHaveBeenCalledWith(viewer, { pulseDays: 7, contentDays: 14, analyticsRange: "DAYS_30", timezone: "Europe/Paris" });
  });

  it("projects the shared read model into the existing page shape", () => {
    const projected = projectOverviewReadModel({
      accounts: [],
      stats: {
        tweet_count: 0, tweet_likes: 0, tweet_retweets: 0, tweet_views: 0,
        reply_count: 0, reply_likes: 0, reply_retweets: 0, reply_views: 0,
        followersCount: 0, followingCount: 0, userTweetCount: 0,
        todayTweets: 0, todayLikes: 0, todayRetweets: 0,
      },
      timeline: { dailyTweets: [], followerGrowth: [] },
      topLiked: [],
      pulse: {},
      topContent: {},
      analyticsPortfolio: {
        period: { days: 7, timezone: "UTC", startDate: "2026-10-01", endDate: "2026-10-07" },
        previousPeriod: { days: 7, timezone: "UTC", startDate: "2026-09-24", endDate: "2026-09-30" },
        summary: { trackedSites: 0, activeSites: 0, views: 0, visits: 0 },
        previousSummary: { views: 0, visits: 0 },
        sites: [],
      },
      platforms: {
        github: { followers: 1, repositoryCount: 2, stars: 3, forks: 4, pinnedRepositories: [] },
        gitlab: { followers: 5, projectCount: 6, stars: 7, forks: 8, pinnedProjects: [] },
        reddit: { postKarma: 9 },
      },
      fetchHealth: { summary: {}, unsupportedAccounts: [], issues: [{}, {}, {}, {}, {}, {}] },
    } as never);
    expect(projected).toMatchObject({
      github: { followers: 1, itemCount: 2, stars: 3, forks: 4, pinned: [] },
      gitlab: { followers: 5, itemCount: 6, stars: 7, forks: 8, pinned: [] },
      reddit: { postKarma: 9 },
      fetchHealth: { issueCount: 6, issues: [{}, {}, {}, {}, {}] },
    });
    expect(projected).not.toHaveProperty("platforms");
  });
});
