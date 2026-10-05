import type { Account, OverviewStats, TimelineData } from "@/shared/types";
import type { AnalyticsPortfolioReport } from "@/lib/repositories/analytics-events";
import type { OverviewPageData } from "@shared/overview-page";
import type { getFetchHealth } from "./fetch-health";
import type { getOverviewReadModel } from "./overview";

export type OverviewReadModel = Awaited<ReturnType<typeof getOverviewReadModel>>;
export type OverviewFetchHealthReadModel = Awaited<ReturnType<typeof getFetchHealth>>;

type OverviewAccount = Omit<Account, "auth_token">;
type OverviewReadModelAccount = OverviewReadModel["accounts"][number];
type OverviewStatsReadModel = Awaited<ReturnType<typeof import("@/lib/services/twitter").getOverviewStats>>;
type OverviewTimelineReadModel = Awaited<ReturnType<typeof import("@/lib/services/twitter").getTimeline>>;
type OverviewTweetReadModel = Awaited<ReturnType<typeof import("@/lib/services/twitter").getTopTweets>>[number];

function projectOverviewAccount(account: OverviewReadModelAccount): OverviewAccount {
  const {
    id, screen_name, platform, user_id, instance_url, fetch_interval, is_active,
    last_fetched_at, error_message, auth_type, created_at, updated_at,
  } = account;
  return {
    id, screen_name, platform, user_id, instance_url, fetch_interval, is_active,
    last_fetched_at, error_message, auth_type, created_at, updated_at,
  };
}

function projectOverviewStats(stats: OverviewStatsReadModel): OverviewStats {
  return {
    tweet_count: stats.tweet_count,
    tweet_likes: stats.tweet_likes,
    tweet_retweets: stats.tweet_retweets,
    tweet_views: stats.tweet_views,
    reply_count: stats.reply_count,
    reply_likes: stats.reply_likes,
    reply_retweets: stats.reply_retweets,
    reply_views: stats.reply_views,
    followersCount: stats.followersCount,
    followingCount: stats.followingCount,
    userTweetCount: stats.userTweetCount,
    todayTweets: stats.todayTweets,
    todayLikes: stats.todayLikes,
    todayRetweets: stats.todayRetweets,
  };
}

function projectOverviewTimeline(timeline: OverviewTimelineReadModel): TimelineData {
  return {
    dailyTweets: timeline.dailyTweets.map((day) => ({
      date: day.date,
      tweets_count: day.tweets_count,
      total_likes: day.total_likes,
      total_retweets: day.total_retweets,
      total_replies: day.total_replies,
      total_views: day.total_views,
    })),
    followerGrowth: timeline.followerGrowth.map((day) => ({
      date: day.date,
      followers_count: day.followers_count,
      following_count: day.following_count,
      tweet_count: day.tweet_count,
    })),
  };
}

function projectOverviewTweet(tweet: OverviewTweetReadModel): OverviewPageData["topLiked"][number] {
  return { id: tweet.id, full_text: tweet.full_text, favorite_count: tweet.favorite_count ?? 0 };
}

function projectAnalyticsPortfolio(report: AnalyticsPortfolioReport): OverviewPageData["analyticsPortfolio"] {
  return {
    period: { ...report.period },
    previousPeriod: { ...report.previousPeriod },
    summary: { ...report.summary },
    previousSummary: { ...report.previousSummary },
    sites: report.sites.map(({ id, name, host, views, visits }) => ({ id, name, host, views, visits })),
  };
}

export function projectOverviewFetchHealth(health: OverviewFetchHealthReadModel): OverviewPageData["fetchHealth"] {
  return {
    summary: health.summary,
    unsupportedAccounts: health.unsupportedAccounts,
    issues: health.issues.slice(0, 5).map((issue) => ({
      accountId: issue.accountId,
      platform: issue.platform,
      screenName: issue.screenName,
      status: issue.status,
      latestError: issue.latestError,
      capabilityGaps: issue.capabilityGaps.map((gap) => ({
        capability: gap.capability,
        message: gap.message,
      })),
    })),
    issueCount: health.issues.length,
  };
}

export function projectOverviewGithub(readModel: OverviewReadModel): OverviewPageData["github"] {
  const summary = readModel.platforms.github;
  return {
    followers: summary.followers,
    itemCount: summary.repositoryCount,
    stars: summary.stars,
    forks: summary.forks,
    pinned: summary.pinnedRepositories.map((repo) => ({
      id: repo.id,
      account_id: repo.account_id,
      external_id: repo.repo_id,
      name: repo.name,
      language: repo.language,
      stars: repo.stars ?? 0,
      forks: repo.forks ?? 0,
    })),
  };
}

export function projectOverviewGitlab(readModel: OverviewReadModel): OverviewPageData["gitlab"] {
  const summary = readModel.platforms.gitlab;
  return {
    followers: summary.followers,
    itemCount: summary.projectCount,
    stars: summary.stars,
    forks: summary.forks,
    pinned: summary.pinnedProjects.map((project) => ({
      id: project.id,
      account_id: project.account_id,
      external_id: project.project_id,
      name: project.name,
      language: project.language,
      stars: project.stars ?? 0,
      forks: project.forks ?? 0,
    })),
  };
}

export function projectOverviewReddit(readModel: OverviewReadModel): OverviewPageData["reddit"] {
  return readModel.platforms.reddit;
}

export function projectOverviewReadModel(readModel: OverviewReadModel): OverviewPageData {
  return {
    accounts: readModel.accounts.map(projectOverviewAccount),
    stats: projectOverviewStats(readModel.stats),
    timeline: projectOverviewTimeline(readModel.timeline),
    topLiked: readModel.topLiked.map(projectOverviewTweet),
    github: projectOverviewGithub(readModel),
    gitlab: projectOverviewGitlab(readModel),
    reddit: projectOverviewReddit(readModel),
    pulse: readModel.pulse,
    topContent: readModel.topContent,
    fetchHealth: projectOverviewFetchHealth(readModel.fetchHealth),
    analyticsPortfolio: projectAnalyticsPortfolio(readModel.analyticsPortfolio),
  };
}
