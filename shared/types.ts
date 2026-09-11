// ─── Account types ────────────────────────────────────────────────

import type { FetchRun } from "../lib/fetch-health";

export interface Account {
  id: number;
  screen_name: string;
  platform: string;
  user_id: string | null;
  instance_url: string | null;
  fetch_interval: number;
  is_active: number;
  last_fetched_at: string | null;
  error_message: string | null;
  auth_type: string | null;
  auth_token?: string;
  created_at: string;
  updated_at: string;
  stats?: {
    followers_count: number;
    following_count: number;
    tweet_count: number;
  } | null;
}

export interface AccountWithStats extends Account {
  stats: NonNullable<Account["stats"]>;
  recentFetchRuns?: FetchRun[];
}

export interface AccountsResponse {
  accounts: Account[];
  overview: OverviewStats;
}

// ─── Twitter / X types ───────────────────────────────────────────

export interface OverviewStats {
  // tweets (is_reply=0 AND is_retweet=0)
  tweet_count: number;
  tweet_likes: number;
  tweet_retweets: number;
  tweet_views: number;
  // replies (is_reply=1)
  reply_count: number;
  reply_likes: number;
  reply_retweets: number;
  reply_views: number;
  // profile
  followersCount: number;
  followingCount: number;
  userTweetCount: number;
  // today
  todayTweets: number;
  todayLikes: number;
  todayRetweets: number;
}

export interface Tweet {
  id: string;
  account_id: number;
  full_text: string;
  created_at: string;
  favorite_count: number;
  retweet_count: number;
  reply_count: number;
  view_count: number;
  bookmark_count: number;
  is_quote: number;
  is_reply: number;
  is_retweet: number;
  media_urls: string;
  urls: string;
  hashtags: string;
  mentions: string;
  lang: string;
}

export interface PaginatedTweets {
  data: Tweet[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface TimelineData {
  dailyTweets: {
    date: string;
    tweets_count: number;
    total_likes: number;
    total_retweets: number;
    total_replies: number;
    total_views: number;
  }[];
  followerGrowth: {
    date: string;
    followers_count: number;
    following_count: number;
    tweet_count: number;
  }[];
}

export interface CalendarDay {
  date: string;
  count: number;
}

// ─── GitHub types ────────────────────────────────────────────────

export interface GithubContribution {
  date: string;
  count: number;
}

export interface GithubOverview {
  stats: {
    public_repos: number;
    public_gists: number;
    followers: number;
    following: number;
  } | null;
  repos: GithubRepo[];
  allRepos: GithubRepo[];
  totalStars: number;
  totalForks: number;
  totalRepos: number;
  languages: Record<string, number>;
  topRepos: GithubRepo[];
}

export interface GithubRepo {
  id: number;
  account_id: number;
  repo_id: number;
  name: string;
  full_name: string;
  description: string | null;
  language: string | null;
  stars: number;
  forks: number;
  open_issues: number;
  open_issues_only: number | null;
  open_pull_requests: number | null;
  topics: string;
  homepage: string | null;
  is_fork: number;
  pinned: number;
  created_at: string;
}

/** A configured organization used to find candidate repositories. */
export interface GithubWatchlistSource {
  login: string;
  enabled: boolean;
  lastError: string | null;
}

/** A repository the user can choose to monitor. */
export interface GithubWatchlistCandidate {
  /** Stable GitHub repository id. */
  githubId: number | null;
  /** `github_repos.id` once a local row exists, else null. */
  githubReposId: number | null;
  fullName: string;
  ownerLogin: string | null;
  ownerType: string | null;
  isPrivate: boolean;
  /** "own", an organization login, or null when no source lists it any more. */
  listedFrom: string | null;
  watched: boolean;
  lastError: string | null;
}

export interface GithubWatchlistResponse {
  accountId: number;
  sources: GithubWatchlistSource[];
  candidates: GithubWatchlistCandidate[];
  /** Organizations that could not be listed, with the reason. */
  warnings: string[];
  /** Repositories that could not be added, present on save only. */
  errors?: string[];
}

export interface GithubAvailableOrgsResponse {
  orgs: Array<{ login: string; githubId: number | null; nodeId: string | null }>;
  /** Set when the PAT cannot enumerate organizations (scope or token type). */
  unavailable: string | null;
}

export interface GithubRelease {
  id: number;
  account_id: number;
  repo_id: number;
  release_id: number;
  tag_name: string | null;
  name: string | null;
  body: string | null;
  prerelease: number;
  published_at: string | null;
  html_url: string | null;
  total_downloads: number;
  fetched_at: string;
  assets: GithubReleaseAsset[];
}

export interface GithubReleaseAsset {
  id: number;
  release_id: number;
  name: string;
  download_count: number;
  size: number;
  content_type: string | null;
  browser_download_url: string | null;
}

export interface GithubReleaseDownloadPoint {
  day: number;
  download_count: number;
  asset_downloads: Record<string, number>;
  snapshot_date: string;
}

export interface GithubReleaseDownloadTimeline {
  release_id: number;
  tag_name: string | null;
  name: string | null;
  published_at: string | null;
  points: GithubReleaseDownloadPoint[];
}

// ─── GitLab types ────────────────────────────────────────────────

export interface GitlabContribution {
  date: string;
  count: number;
}

export interface GitlabOverview {
  stats: {
    public_projects: number;
    followers: number;
    following: number;
  } | null;
  projects: GitlabProject[];
  allProjects: GitlabProject[];
  totalStars: number;
  totalForks: number;
  totalProjects: number;
  languages: Record<string, number>;
  topProjects: GitlabProject[];
}

export interface GitlabProject {
  id: number;
  account_id: number;
  project_id: number;
  name: string;
  path_with_namespace: string;
  description: string | null;
  language: string | null;
  stars: number;
  forks: number;
  open_issues: number;
  topics: string;
  homepage: string | null;
  is_fork: number;
  pinned: number;
  visibility: string;
  created_at: string;
  updated_at: string;
  last_activity_at: string;
}

export interface GitlabRelease {
  id: number;
  account_id: number;
  project_id: number;
  release_tag: string;
  name: string | null;
  description: string | null;
  released_at: string | null;
  created_at: string | null;
  fetched_at: string;
}

// ─── Reddit types ────────────────────────────────────────────────

export interface RedditOverview {
  stats: { post_karma: number; comment_karma: number } | null;
  totalPosts: number;
  totalComments: number;
  totalScore: number;
  topPosts: RedditPost[];
}

export interface RedditPost {
  id: string;
  account_id: number;
  title: string;
  selftext: string;
  subreddit: string;
  score: number;
  upvote_ratio: number;
  num_comments: number;
  permalink: string;
  url: string;
  is_self: number;
  created_utc: number;
}

export interface RedditComment {
  id: string;
  account_id: number;
  body: string;
  subreddit: string;
  score: number;
  link_id: string;
  parent_id: string | null;
  depth: number;
  permalink: string;
  created_utc: number;
  is_submitter: number;
}

export interface PaginatedRedditPosts {
  data: RedditPost[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PaginatedRedditComments {
  data: RedditComment[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ─── Auth / User types ───────────────────────────────────────────

export interface LoginResponse {
  ok: boolean;
  user?: string;
  role?: string;
}

export interface AuthCheckResponse {
  authenticated: boolean;
  username?: string;
  role?: string;
}

export interface UserPublic {
  id: number;
  username: string;
  role: string;
  created_at: string;
}

export type {
  PulseContentItem,
  PulseMetricDelta,
  PulsePlatform,
  PulsePlatformSummary,
  PulseRepositoryItem,
  PulseResponse,
} from "../lib/pulse";
export type {
  CapabilityGap,
  FetchAccountHealth,
  FetchHealthResponse,
  FetchHealthSummary,
  FetchRun,
} from "../lib/fetch-health";
export type {
  TopContentItem,
  TopContentKind,
  TopContentPlatform,
  TopContentResponse,
} from "../lib/top-content";
