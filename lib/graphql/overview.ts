import { getOverviewReadModel } from "@/lib/services/overview";
import { projectOverviewFetchHealth, projectOverviewGithub, projectOverviewGitlab, projectOverviewReddit } from "@/lib/services/overview-projection";
import { getPulse } from "@/lib/services/pulse";
import { getTopContent } from "@/lib/services/top-content";
import { getFetchHealth } from "@/lib/services/fetch-health";
import { getAnalyticsPortfolio } from "@/lib/services/analytics";
import { getOwnerId } from "@/lib/auth-helpers";
import { getAccounts } from "@/lib/services/accounts";
import type { GraphQLContext } from "./context";

export const overviewTypeDefs = /* GraphQL */ `
  extend type Query { overview: OverviewQuery! }
  type OverviewQuery {
    page(pulseDays: Int! = 7, contentDays: Int! = 7, analyticsRange: AnalyticsRange! = DAYS_7, timezone: String! = "UTC"): OverviewPage!
    pulse(days: Int! = 7): Pulse!
    topContent(days: Int! = 7): TopContent!
    fetchHealth: OverviewFetchHealth!
    analyticsPortfolio(range: AnalyticsRange! = DAYS_7, timezone: String! = "UTC"): AnalyticsPortfolio!
  }
  type OverviewPage {
    accounts: [AccountMetadata!]!
    stats: OverviewXStats!
    timeline: OverviewXTimeline!
    topLiked: [OverviewTweet!]!
    github: OverviewCodeSummary!
    gitlab: OverviewCodeSummary!
    reddit: OverviewRedditSummary!
    pulse: Pulse!
    topContent: TopContent!
    fetchHealth: OverviewFetchHealth!
    analyticsPortfolio: AnalyticsPortfolio!
  }
  type OverviewXStats {
    tweet_count: Int!, tweet_likes: Int!, tweet_retweets: Int!, tweet_views: Int!
    reply_count: Int!, reply_likes: Int!, reply_retweets: Int!, reply_views: Int!
    followersCount: Int!, followingCount: Int!, userTweetCount: Int!
    todayTweets: Int!, todayLikes: Int!, todayRetweets: Int!
  }
  type OverviewXTimeline {
    dailyTweets: [OverviewXDay!]!
    followerGrowth: [OverviewFollowerDay!]!
  }
  type OverviewXDay { date: String!, tweets_count: Int!, total_likes: Int!, total_retweets: Int!, total_replies: Int!, total_views: Int! }
  type OverviewFollowerDay { date: String!, followers_count: Int!, following_count: Int!, tweet_count: Int! }
  type OverviewTweet { id: String!, full_text: String!, favorite_count: Int! }
  type OverviewCodeSummary {
    followers: Int!, itemCount: Int!, stars: Int!, forks: Int!, pinned: [OverviewPinnedItem!]!
  }
  type OverviewPinnedItem { id: Int!, account_id: Int!, external_id: Int!, name: String!, language: String, stars: Int!, forks: Int! }
  type OverviewRedditSummary {
    postKarma: Int!, commentKarma: Int!, totalPosts: Int!, totalComments: Int!
    karmaTimeline: [OverviewRedditKarmaDay!]!
    dailyActivity: [OverviewRedditActivityDay!]!
    subreddits: [OverviewSubreddit!]!
  }
  type OverviewRedditKarmaDay { date: String!, post_karma: Int!, comment_karma: Int! }
  type OverviewRedditActivityDay { date: String!, posts: Int!, comments: Int! }
  type OverviewSubreddit { subreddit: String!, count: Int! }
  type Pulse { range: PulseRange!, totals: PulseTotals!, platforms: [PulsePlatformSummary!]!, content: PulseContent!, repositories: [PulseRepository!]! }
  type PulseRange { days: Int!, since: String!, until: String! }
  type PulseTotals { activity: PulseDelta!, traction: PulseTraction! }
  type PulseTraction { stars: PulseDelta!, forks: PulseDelta! }
  type PulseDelta { current: Int!, previous: Int!, change: Int! }
  type PulsePlatformSummary { platform: String!, audienceMetric: String!, audience: PulseDelta!, activity: PulseActivity! }
  type PulseActivity { current: Int!, previous: Int!, change: Int!, tweets: Int!, posts: Int!, comments: Int!, contributions: Int! }
  type PulseContent { tweets: [PulseContentItem!]!, redditPosts: [PulseContentItem!]!, redditComments: [PulseContentItem!]! }
  type PulseContentItem { id: String!, platform: String!, kind: String!, title: String!, subtitle: String, metricValue: Int!, secondaryValue: Int!, url: String!, accountId: Int!, accountName: String!, createdAt: String! }
  type PulseRepository { id: String!, platform: String!, kind: String!, accountId: Int!, accountName: String!, name: String!, fullName: String!, description: String, stars: Int!, starChange: Int!, forks: Int!, forkChange: Int!, url: String!, route: String! }
  type TopContent { range: PulseRange!, items: [TopContentItem!]! }
  type TopContentItem { id: String!, kind: String!, platform: String!, title: String!, subtitle: String, accountId: Int!, accountName: String!, createdAt: String!, url: String!, route: String, metricLabel: String!, metricValue: Float!, secondaryLabel: String, secondaryValue: Float, growthRate: Float }
  type OverviewFetchHealth { summary: FetchHealthSummary!, unsupportedAccounts: [OverviewUnsupportedAccount!]!, issues: [OverviewHealthIssue!]!, issueCount: Int! }
  type OverviewHealthIssue { accountId: Int!, platform: String!, screenName: String!, status: String!, latestError: String, capabilityGaps: [OverviewCapabilityGap!]! }
  type OverviewCapabilityGap { capability: String!, message: String }
  type FetchHealthSummary { totalAccounts: Int!, activeAccounts: Int!, healthy: Int!, stale: Int!, partial: Int!, failed: Int!, capabilityGap: Int!, running: Int! }
  type OverviewUnsupportedAccount { accountId: Int!, platform: String!, screenName: String! }
`;

type AnalyticsRange = "DAYS_7" | "DAYS_30" | "DAYS_90";
function rangeDays(range: AnalyticsRange) { return range === "DAYS_90" ? 90 : range === "DAYS_30" ? 30 : 7; }
export const overviewResolvers = {
  Query: { overview: () => ({}) },
  OverviewQuery: {
    page: (_parent: unknown, args: { pulseDays: number; contentDays: number; analyticsRange: AnalyticsRange; timezone: string }, context: GraphQLContext) =>
      getOverviewReadModel(context.user, args),
    pulse: async (_parent: unknown, args: { days: number }, context: GraphQLContext) => getPulse(await getAccounts(getOwnerId(context.user)), args.days),
    topContent: async (_parent: unknown, args: { days: number }, context: GraphQLContext) => {
      const accounts = await getAccounts(getOwnerId(context.user));
      return getTopContent(accounts.filter((account) => account.is_active === 1), args.days);
    },
    fetchHealth: async (_parent: unknown, _args: unknown, context: GraphQLContext) => projectOverviewFetchHealth(await getFetchHealth(getOwnerId(context.user))),
    analyticsPortfolio: (_parent: unknown, args: { range: AnalyticsRange; timezone: string }, context: GraphQLContext) =>
      getAnalyticsPortfolio(context.user, args.timezone, rangeDays(args.range)),
  },
  OverviewPage: {
    github: (parent: Awaited<ReturnType<typeof getOverviewReadModel>>) => projectOverviewGithub(parent),
    gitlab: (parent: Awaited<ReturnType<typeof getOverviewReadModel>>) => projectOverviewGitlab(parent),
    reddit: (parent: Awaited<ReturnType<typeof getOverviewReadModel>>) => projectOverviewReddit(parent),
    fetchHealth: (parent: Awaited<ReturnType<typeof getOverviewReadModel>>) => projectOverviewFetchHealth(parent.fetchHealth),
  },
  OverviewPinnedItem: {
    external_id: (parent: { external_id?: number; repo_id?: number; project_id?: number }) => parent.external_id ?? parent.repo_id ?? parent.project_id ?? 0,
  },
};
