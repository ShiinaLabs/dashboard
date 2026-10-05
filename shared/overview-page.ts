import type { Account, OverviewStats, TimelineData, Tweet } from "./types";
import type { PulseResponse } from "../lib/pulse";
import type { TopContentResponse } from "../lib/top-content";

export interface OverviewCodeSummary {
  followers: number;
  itemCount: number;
  stars: number;
  forks: number;
  pinned: Array<{
    id: number;
    account_id: number;
    external_id: number;
    name: string;
    language: string | null;
    stars: number;
    forks: number;
  }>;
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

export interface OverviewAnalyticsPortfolio {
  period: { days: number; timezone: string; startDate: string; endDate: string };
  previousPeriod: { days: number; timezone: string; startDate: string; endDate: string };
  summary: { trackedSites: number; activeSites: number; views: number; visits: number };
  previousSummary: { views: number; visits: number };
  sites: Array<{ id: number; name: string; host: string; views: number; visits: number }>;
}

export interface OverviewPageData {
  accounts: Array<Omit<Account, "auth_token" | "stats">>;
  stats: OverviewStats;
  timeline: TimelineData;
  topLiked: Pick<Tweet, "id" | "full_text" | "favorite_count">[];
  github: OverviewCodeSummary;
  gitlab: OverviewCodeSummary;
  reddit: OverviewRedditSummary;
  pulse: PulseResponse;
  topContent: TopContentResponse;
  fetchHealth: OverviewFetchHealth;
  analyticsPortfolio: OverviewAnalyticsPortfolio;
}
