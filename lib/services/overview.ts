import { getOwnerId } from "@/lib/auth-helpers";
import type { AuthUser } from "@/lib/auth-helpers";
import { getAccounts } from "@/lib/services/accounts";
import { getGithubOverviewSummary } from "@/lib/services/github";
import { getGitlabOverviewSummary } from "@/lib/services/gitlab";
import { getRedditOverviewSummary } from "@/lib/services/reddit";
import { getOverviewStats, getTimeline, getTopTweets } from "@/lib/services/twitter";
import { getPulse } from "@/lib/services/pulse";
import { getTopContent } from "@/lib/services/top-content";
import { getFetchHealth } from "@/lib/services/fetch-health";
import { getAnalyticsPortfolio } from "@/lib/services/analytics";

type AnalyticsRange = "DAYS_7" | "DAYS_30" | "DAYS_90";

/**
 * One viewer-scoped read model for the initial Overview page. Platform summaries
 * use bulk repository reads; time-series/content services already accept the
 * complete visible account set and aggregate in the database.
 */
export async function getOverviewReadModel(
  viewer: AuthUser,
  input: { pulseDays: number; contentDays: number; analyticsRange: AnalyticsRange; timezone: string },
) {
  const analyticsDays = input.analyticsRange === "DAYS_90" ? 90 : input.analyticsRange === "DAYS_30" ? 30 : 7;
  const ownerId = getOwnerId(viewer);
  const accounts = await getAccounts(ownerId);
  const activeAccounts = accounts.filter((account) => account.is_active === 1);
  const byPlatform = (platform: string) => accounts.filter((account) => account.platform === platform);
  const twitter = byPlatform("twitter");
  const github = byPlatform("github");
  const gitlab = byPlatform("gitlab");
  const reddit = byPlatform("reddit");

  const [stats, timeline, topLiked, githubSummary, gitlabSummary, redditSummary, pulse, topContent, fetchHealth, analyticsPortfolio] = await Promise.all([
    twitter.length ? getOverviewStats(twitter.map((account) => account.id)) : Promise.resolve({ tweet_count: 0, tweet_likes: 0, tweet_retweets: 0, tweet_views: 0, reply_count: 0, reply_likes: 0, reply_retweets: 0, reply_views: 0, followersCount: 0, followingCount: 0, userTweetCount: 0, todayTweets: 0, todayLikes: 0, todayRetweets: 0 }),
    twitter.length ? getTimeline(30, twitter.map((account) => account.id)) : Promise.resolve({ dailyTweets: [], followerGrowth: [] }),
    twitter.length ? getTopTweets("favorite_count", 5, twitter.map((account) => account.id)) : Promise.resolve([]),
    getGithubOverviewSummary(github.map((account) => account.id)),
    getGitlabOverviewSummary(gitlab.map((account) => account.id)),
    getRedditOverviewSummary(reddit.map((account) => account.id), 30),
    getPulse(accounts, input.pulseDays),
    getTopContent(activeAccounts, input.contentDays),
    getFetchHealth(ownerId),
    getAnalyticsPortfolio({ id: viewer.id, role: viewer.role }, input.timezone, analyticsDays),
  ]);

  const compactText = (value: string, max = 500) => value.length > max ? `${value.slice(0, max)}…` : value;
  return {
    accounts,
    stats,
    timeline,
    topLiked: topLiked.slice(0, 5).map((tweet) => ({ ...tweet, full_text: compactText(tweet.full_text, 280) })),
    platforms: { github: githubSummary, gitlab: gitlabSummary, reddit: redditSummary },
    pulse: {
      ...pulse,
      content: Object.fromEntries(Object.entries(pulse.content).map(([key, items]) => [key, items.map((item) => ({ ...item, title: compactText(item.title) }))])) as typeof pulse.content,
      repositories: pulse.repositories.map((item) => ({ ...item, description: item.description ? compactText(item.description, 280) : null })),
    },
    topContent: { ...topContent, items: topContent.items.slice(0, 15).map((item) => ({ ...item, title: compactText(item.title) })) },
    fetchHealth,
    analyticsPortfolio,
  };
}
