import { graphqlRequest } from "../graphql";
import type { Account, OverviewStats, TimelineData, Tweet, PulseResponse, TopContentResponse } from "@/shared/types";
import type { AnalyticsPortfolio, AnalyticsRange } from "../analytics-graphql";

export interface OverviewCodeSummary {
  followers: number;
  itemCount: number;
  stars: number;
  forks: number;
  pinned: Array<{ id: number; account_id: number; external_id: number; name: string; language: string | null; stars: number; forks: number }>;
}

export interface OverviewRedditSummary {
  postKarma: number;
  commentKarma: number;
  totalPosts: number;
  totalComments: number;
  karmaTimeline: Array<{ date: string; post_karma: number; comment_karma: number }>;
  dailyActivity: Array<{ date: string; posts: number; comments: number }>;
  subreddits: Array<{ subreddit: string; count: number }>;
}

export interface OverviewFetchHealth {
  summary: { totalAccounts: number; activeAccounts: number; healthy: number; stale: number; partial: number; failed: number; capabilityGap: number; running: number };
  unsupportedAccounts: Array<{ accountId: number; platform: string; screenName: string }>;
  issues: Array<{ accountId: number; platform: string; screenName: string; status: string; latestError: string | null; capabilityGaps: Array<{ capability: string; message?: string }> }>;
  issueCount: number;
}

export interface OverviewPageData {
  accounts: Account[];
  stats: OverviewStats;
  timeline: TimelineData;
  topLiked: Pick<Tweet, "id" | "full_text" | "favorite_count">[];
  github: OverviewCodeSummary;
  gitlab: OverviewCodeSummary;
  reddit: OverviewRedditSummary;
  pulse: PulseResponse;
  topContent: TopContentResponse;
  fetchHealth: OverviewFetchHealth;
  analyticsPortfolio: AnalyticsPortfolio;
  aiStatus: { configured: boolean; quota: { used: number; limit: number } };
}

const pageQuery = /* GraphQL */ `
  query OverviewPage($pulseDays: Int!, $contentDays: Int!, $analyticsRange: AnalyticsRange!, $timezone: String!) {
    overview { page(pulseDays: $pulseDays, contentDays: $contentDays, analyticsRange: $analyticsRange, timezone: $timezone) {
      accounts { id screen_name platform user_id instance_url fetch_interval is_active last_fetched_at error_message auth_type created_at updated_at }
      stats { tweet_count tweet_likes tweet_retweets tweet_views reply_count reply_likes reply_retweets reply_views followersCount followingCount userTweetCount todayTweets todayLikes todayRetweets }
      timeline { dailyTweets { date tweets_count total_likes total_retweets total_replies total_views } followerGrowth { date followers_count following_count tweet_count } }
      topLiked { id full_text favorite_count }
      github { followers itemCount stars forks pinned { id account_id external_id name language stars forks } }
      gitlab { followers itemCount stars forks pinned { id account_id external_id name language stars forks } }
      reddit { postKarma commentKarma totalPosts totalComments karmaTimeline { date post_karma comment_karma } dailyActivity { date posts comments } subreddits { subreddit count } }
      pulse {
        range { days since until }
        totals { activity { current previous change } traction { stars { current previous change } forks { current previous change } } }
        platforms { platform audienceMetric audience { current previous change } activity { current previous change tweets posts comments contributions } }
        content { tweets { id platform kind title subtitle metricValue secondaryValue url accountId accountName createdAt } redditPosts { id platform kind title subtitle metricValue secondaryValue url accountId accountName createdAt } redditComments { id platform kind title subtitle metricValue secondaryValue url accountId accountName createdAt } }
        repositories { id platform kind accountId accountName name fullName description stars starChange forks forkChange url route }
      }
      topContent { range { days since until } items { id kind platform title subtitle accountId accountName createdAt url route metricLabel metricValue secondaryLabel secondaryValue growthRate } }
      fetchHealth { summary { totalAccounts activeAccounts healthy stale partial failed capabilityGap running } unsupportedAccounts { accountId platform screenName } issues { accountId platform screenName status latestError capabilityGaps { capability message } } issueCount }
      analyticsPortfolio { period { days timezone startDate endDate } previousPeriod { days timezone startDate endDate } summary { trackedSites activeSites views visits } previousSummary { views visits } sites { id name host views visits } }
    } }
    ai { status { configured quota { used limit } } }
  }
`;

export function overviewPageQueryKey(variables: { pulseDays: number; contentDays: number; analyticsRange: AnalyticsRange; timezone: string }) {
  return ["overview-page", variables.pulseDays, variables.contentDays, variables.analyticsRange, variables.timezone] as const;
}

export async function getOverviewPage(variables: { pulseDays: number; contentDays: number; analyticsRange: AnalyticsRange; timezone: string }, signal?: AbortSignal) {
  const result = await graphqlRequest<{ overview: { page: Omit<OverviewPageData, "aiStatus"> }; ai: { status: OverviewPageData["aiStatus"] } }, typeof variables>(pageQuery, variables, signal);
  return { ...result.overview.page, aiStatus: result.ai.status };
}

const pulseQuery = /* GraphQL */ `query OverviewPulse($days: Int!) { overview { pulse(days: $days) { range { days since until } totals { activity { current previous change } traction { stars { current previous change } forks { current previous change } } } platforms { platform audienceMetric audience { current previous change } activity { current previous change tweets posts comments contributions } } content { tweets { id platform kind title subtitle metricValue secondaryValue url accountId accountName createdAt } redditPosts { id platform kind title subtitle metricValue secondaryValue url accountId accountName createdAt } redditComments { id platform kind title subtitle metricValue secondaryValue url accountId accountName createdAt } } repositories { id platform kind accountId accountName name fullName description stars starChange forks forkChange url route } } } }`;
const topContentQuery = /* GraphQL */ `query OverviewTopContent($days: Int!) { overview { topContent(days: $days) { range { days since until } items { id kind platform title subtitle accountId accountName createdAt url route metricLabel metricValue secondaryLabel secondaryValue growthRate } } } }`;
const fetchHealthQuery = /* GraphQL */ `query OverviewFetchHealth { overview { fetchHealth { summary { totalAccounts activeAccounts healthy stale partial failed capabilityGap running } unsupportedAccounts { accountId platform screenName } issues { accountId platform screenName status latestError capabilityGaps { capability message } } issueCount } } }`;
const portfolioQuery = /* GraphQL */ `query OverviewAnalyticsPortfolio($range: AnalyticsRange!, $timezone: String!) { overview { analyticsPortfolio(range: $range, timezone: $timezone) { period { days timezone startDate endDate } previousPeriod { days timezone startDate endDate } summary { trackedSites activeSites views visits } previousSummary { views visits } sites { id name host views visits } } } }`;

export async function getOverviewPulse(days: number, signal?: AbortSignal) {
  const result = await graphqlRequest<{ overview: { pulse: PulseResponse } }, { days: number }>(pulseQuery, { days }, signal);
  return result.overview.pulse;
}
export async function getOverviewTopContent(days: number, signal?: AbortSignal) {
  const result = await graphqlRequest<{ overview: { topContent: TopContentResponse } }, { days: number }>(topContentQuery, { days }, signal);
  return result.overview.topContent;
}
export async function getOverviewFetchHealth(signal?: AbortSignal) {
  const result = await graphqlRequest<{ overview: { fetchHealth: OverviewPageData["fetchHealth"] } }, Record<string, never>>(fetchHealthQuery, {}, signal);
  return result.overview.fetchHealth;
}
export async function getOverviewAnalyticsPortfolio(range: AnalyticsRange, timezone: string, signal?: AbortSignal) {
  const variables = { range, timezone };
  const result = await graphqlRequest<{ overview: { analyticsPortfolio: AnalyticsPortfolio } }, typeof variables>(portfolioQuery, variables, signal);
  return result.overview.analyticsPortfolio;
}
