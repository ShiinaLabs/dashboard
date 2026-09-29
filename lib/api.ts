import { apiJson, apiRequest } from "@/lib/client/api-transport";
export { ApiError } from "@/lib/client/api-transport";

// Keep transport helpers available for callers that need a streaming response.
export { apiRequest, apiUrl } from "@/lib/client/api-transport";

import type {
  Account, AccountWithStats, AccountsResponse, OverviewStats,
  Tweet, PaginatedTweets, TimelineData, CalendarDay,
  GithubContribution, GithubOverview, GithubRepo, GithubRelease, GithubReleaseAsset,
  GithubReleaseDownloadTimeline, GithubWatchlistResponse, GithubWatchlistCandidate, GithubWatchlistSource, GithubAvailableOrgsResponse,
  GitlabContribution, GitlabOverview, GitlabProject, GitlabRelease,
  RedditOverview, RedditPost, RedditComment, PaginatedRedditPosts, PaginatedRedditComments,
  PulseResponse,
  TopContentResponse,
  FetchHealthResponse,
  LoginResponse, AuthCheckResponse, UserPublic,
} from "@/shared/types";

export interface AnalyticsTrafficPoint {
  date: string;
  views: number;
  visitors: number;
  visits: number;
}

export interface AnalyticsTopPage {
  path: string;
  views: number;
}

export interface AnalyticsReferrerDimension {
  referrer: string;
  views: number;
}

export interface AnalyticsCountryDimension {
  country: string;
  views: number;
}

export interface AnalyticsBrowserDimension {
  browser: string;
  views: number;
}

export interface AnalyticsOperatingSystemDimension {
  os: string;
  views: number;
}

export interface AnalyticsDeviceDimension {
  device: string;
  views: number;
}

export interface AnalyticsTrafficDimensions {
  referrers: AnalyticsReferrerDimension[];
  countries: AnalyticsCountryDimension[];
  browsers: AnalyticsBrowserDimension[];
  operatingSystems: AnalyticsOperatingSystemDimension[];
  devices: AnalyticsDeviceDimension[];
}

export interface AnalyticsTraffic {
  period: { days: 7; timezone: string };
  overview: { views: number; visitors: number; visits: number };
  timeline: AnalyticsTrafficPoint[];
  topPages: AnalyticsTopPage[];
  dimensions: AnalyticsTrafficDimensions;
}

export interface AnalyticsSite {
  id: number;
  name: string;
  site_key: string;
  host: string;
  created_at: string;
  updated_at: string;
}

export interface AnalyticsInstallation {
  trackerUrl: string;
  snippet: string;
}

export type {
  Account, AccountWithStats, AccountsResponse, OverviewStats,
  Tweet, PaginatedTweets, TimelineData, CalendarDay,
  GithubContribution, GithubOverview, GithubRepo, GithubRelease, GithubReleaseAsset,
  GithubReleaseDownloadTimeline, GithubWatchlistResponse, GithubWatchlistCandidate, GithubWatchlistSource, GithubAvailableOrgsResponse,
  GitlabContribution, GitlabOverview, GitlabProject, GitlabRelease,
  RedditOverview, RedditPost, RedditComment, PaginatedRedditPosts, PaginatedRedditComments,
  PulseResponse,
  TopContentResponse,
  FetchHealthResponse,
  LoginResponse, AuthCheckResponse, UserPublic,
};

// ─── API methods ────────────────────────────────────────────────

export const api = {
  // Accounts
  getAccounts: () => apiJson<AccountsResponse>("/accounts"),
  getAccount: (id: number) => apiJson<AccountWithStats>(`/accounts/${id}`),
  createAccount: (data: { screenName: string; authToken?: string; fetchInterval?: number; platform?: string; instanceUrl?: string | null; authType?: string | null }) =>
    apiJson<Account>("/accounts", { method: "POST", body: JSON.stringify(data) }),
  updateAccount: (id: number, data: { screenName?: string; authToken?: string; fetchInterval?: number; isActive?: boolean; instanceUrl?: string; authType?: string }) =>
    apiJson<Account>(`/accounts/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  triggerFetch: (id: number, level?: string) => apiJson<{ message: string }>(`/fetch/${id}`, { method: "POST", body: level ? JSON.stringify({ level }) : undefined }),
  getFetchHealth: () => apiJson<FetchHealthResponse>("/fetch-health"),

  // Twitter
  getOverview: () => apiJson<OverviewStats>("/stats/overview"),
  getTweets: (page = 1, limit = 20, sort = "created_at", order = "desc", search?: string, accountIds?: number[], isReply?: number) => {
    let url = `/tweets?page=${page}&limit=${limit}&sort=${sort}&order=${order}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    if (accountIds?.length) url += `&accountIds=${accountIds.join(",")}`;
    if (isReply !== undefined) url += `&isReply=${isReply}`;
    return apiJson<PaginatedTweets>(url);
  },
  getTweet: (id: string) => apiJson<Tweet>(`/tweets/${id}`),
  getTimeline: (days = 30, accountId?: number) => {
    let url = `/stats/timeline?days=${days}`;
    if (accountId) url += `&accountIds=${accountId}`;
    return apiJson<TimelineData>(url);
  },
  getTopTweets: (metric = "favorite_count", limit = 10) =>
    apiJson<Tweet[]>(`/stats/top?metric=${metric}&limit=${limit}`),
  getPulse: (days = 7) => apiJson<PulseResponse>(`/pulse?days=${days}`),
  getTopContent: (days = 7) => apiJson<TopContentResponse>(`/top-content?days=${days}`),
  getCalendar: (year?: number) =>
    apiJson<CalendarDay[]>(`/stats/calendar?year=${year || new Date().getFullYear()}`),

  // GitHub
  getGithubOverview: (accountId: number) => apiJson<GithubOverview>(`/github/overview/${accountId}`),
  getGithubTimeline: (accountId: number, days = 30) => apiJson<{ date: string; public_repos: number; followers: number; following: number }[]>(`/github/timeline/${accountId}?days=${days}`),
  getGithubContributions: (accountId: number, year?: number) =>
    apiJson<GithubContribution[]>(`/github/contributions/${accountId}${year ? `?year=${year}` : ""}`),

  // GitHub Repo Insights
  getGithubRepoSnapshots: (accountId: number, repoId: number, days = 30) =>
    apiJson<{ stars: number; forks: number; open_issues: number; open_issues_only: number | null; open_pull_requests: number | null; date: string }[]>(`/github/${accountId}/repos/${repoId}/snapshots?days=${days}`),
  getGithubTrafficClones: (accountId: number, repoId: number, days = 30) =>
    apiJson<{ date: string; count: number; uniques: number }[]>(`/github/${accountId}/repos/${repoId}/clones?days=${days}`),
  getGithubTrafficViews: (accountId: number, repoId: number, days = 30) =>
    apiJson<{ date: string; count: number; uniques: number }[]>(`/github/${accountId}/repos/${repoId}/views?days=${days}`),
  getGithubReferrers: (accountId: number, repoId: number) =>
    apiJson<{ snapshot_date: string; referrer: string; count: number; uniques: number }[]>(`/github/${accountId}/repos/${repoId}/referrers`),
  getGithubReferrerHistory: (accountId: number, repoId: number, days = 30) =>
    apiJson<{ snapshot_date: string; referrer: string; count: number; uniques: number }[]>(`/github/${accountId}/repos/${repoId}/referrers/history?days=${days}`),
  getGithubPaths: (accountId: number, repoId: number) =>
    apiJson<{ snapshot_date: string; path: string; title: string | null; count: number; uniques: number }[]>(`/github/${accountId}/repos/${repoId}/paths`),
  getGithubPathHistory: (accountId: number, repoId: number, days = 30) =>
    apiJson<{ snapshot_date: string; path: string; title: string | null; count: number; uniques: number }[]>(`/github/${accountId}/repos/${repoId}/paths/history?days=${days}`),
  getGithubReleases: (accountId: number, repoId: number) =>
    apiJson<GithubRelease[]>(`/github/${accountId}/repos/${repoId}/releases`),
  getGithubReleaseAssets: (accountId: number, repoId: number, releaseId: number) =>
    apiJson<GithubReleaseAsset[]>(`/github/${accountId}/repos/${repoId}/releases/${releaseId}/assets`),
  getGithubReleaseDownloadTimeline: (accountId: number, repoId: number, days = 30) =>
    apiJson<GithubReleaseDownloadTimeline[]>(`/github/${accountId}/repos/${repoId}/releases/growth?days=${days}`),
  getGithubWatchlist: (accountId: number) =>
    apiJson<GithubWatchlistResponse>(`/github/watchlist/${accountId}`),
  saveGithubWatchlist: (accountId: number, input: { orgs: string[]; watched: number[] }) =>
    apiJson<GithubWatchlistResponse>(`/github/watchlist/${accountId}`, { method: "PUT", body: JSON.stringify(input) }),
  getGithubAvailableOrgs: (accountId: number) =>
    apiJson<GithubAvailableOrgsResponse>(`/github/sources/${accountId}/available`),
  setPinnedRepos: (accountId: number, repoIds: number[]) =>
    apiJson<{ ok: boolean }>(`/github/repos/pin`, { method: "PUT", body: JSON.stringify({ accountId, repoIds }) }),

  // GitLab
  getGitlabOverview: (accountId: number) => apiJson<GitlabOverview>(`/gitlab/overview/${accountId}`),
  getGitlabTimeline: (accountId: number, days = 30) => apiJson<{ date: string; public_projects: number; followers: number; following: number }[]>(`/gitlab/timeline/${accountId}?days=${days}`),
  getGitlabContributions: (accountId: number, year?: number) =>
    apiJson<GitlabContribution[]>(`/gitlab/contributions/${accountId}${year ? `?year=${year}` : ""}`),

  // GitLab Project Insights
  getGitlabProjectSnapshots: (accountId: number, projectId: number, days = 30) =>
    apiJson<{ stars: number; forks: number; open_issues: number; date: string }[]>(`/gitlab/${accountId}/projects/${projectId}/snapshots?days=${days}`),
  getGitlabReleases: (accountId: number, projectId: number) =>
    apiJson<GitlabRelease[]>(`/gitlab/${accountId}/projects/${projectId}/releases`),
  setPinnedGitlabProjects: (accountId: number, projectIds: number[]) =>
    apiJson<{ ok: boolean }>(`/gitlab/projects/pin`, { method: "PUT", body: JSON.stringify({ accountId, projectIds }) }),

  // Reddit
  getRedditOverview: (accountId: number) => apiJson<RedditOverview>(`/reddit/overview/${accountId}`),
  getRedditTimeline: (accountId: number, days = 30) => apiJson<{ date: string; post_karma: number; comment_karma: number }[]>(`/reddit/timeline/${accountId}?days=${days}`),
  getRedditPosts: (accountId: number, page = 1, limit = 20, sort = "score") =>
    apiJson<PaginatedRedditPosts>(`/reddit/posts/${accountId}?page=${page}&limit=${limit}&sort=${sort}`),
  getRedditComments: (accountId: number, page = 1, limit = 20) =>
    apiJson<PaginatedRedditComments>(`/reddit/comments/${accountId}?page=${page}&limit=${limit}`),
  getRedditActivity: (accountId: number, days = 30) =>
    apiJson<{ posts: { date: string; count: number }[]; comments: { date: string; count: number }[] }>(`/reddit/activity/${accountId}?days=${days}`),
  getRedditSubreddits: (accountId: number) =>
    apiJson<{ subreddit: string; count: number }[]>(`/reddit/subreddits/${accountId}`),

  login: (username: string, password: string) =>
    apiJson<{ ok: boolean; user?: string; role?: string }>("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  checkAuth: () =>
    apiJson<{ authenticated: boolean; username?: string; role?: string }>("/auth/me"),
  logout: () => apiJson<{ ok: boolean }>("/auth/logout", { method: "POST" }),
  changePassword: (currentPassword: string, newPassword: string) =>
    apiJson<{ ok: boolean }>("/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) }),

  // Users (admin only)
  getUsers: () => apiJson<{ users: { id: number; username: string; role: string; created_at: string }[] }>("/users"),
  createUser: (data: { username: string; password: string; role?: string }) =>
    apiJson("/users", { method: "POST", body: JSON.stringify(data) }),
  deleteUser: (id: number, confirmToken: string) =>
    apiJson<{ ok: boolean }>(`/users/${id}`, { method: "DELETE", body: JSON.stringify({ confirmToken }) }),

  // Web Analytics
  getAnalyticsSites: () => apiJson<{ sites: AnalyticsSite[] }>("/analytics/sites"),
  createAnalyticsSite: (data: { name: string; host: string }) =>
    apiJson<AnalyticsSite>("/analytics/sites", { method: "POST", body: JSON.stringify(data) }),
  getAnalyticsTraffic: (siteId: number, timezone: string) =>
    apiJson<AnalyticsTraffic>(`/analytics/sites/${siteId}/traffic?timezone=${encodeURIComponent(timezone)}`),
  getAnalyticsInstallation: (siteId: number) => apiJson<AnalyticsInstallation>(`/analytics/sites/${siteId}/installation`),

  // AI and Settings
  getAiStatus: () => apiJson<{ configured: boolean; quota: { used: number; limit: number } }>("/ai/chat"),
  streamAiChat: (messages: { role: "user" | "assistant"; content: string }[]) =>
    apiRequest("/ai/chat", { method: "POST", body: JSON.stringify({ messages }) }),
  getSettings: () => apiJson<{ ai: { baseUrl: string; apiKey: string; model: string } }>("/settings"),
  updateSettings: (data: { baseUrl?: string; apiKey?: string; model?: string }) =>
    apiJson<{ ok: boolean }>("/settings", { method: "PUT", body: JSON.stringify(data) }),

  // Confirmation tokens
  getConfirmToken: (target: number, action = "delete") =>
    apiJson<{ token: string }>("/confirm/token", { method: "POST", body: JSON.stringify({ target, action }) }),
  deleteAccount: (id: number, confirmToken?: string) =>
    apiJson<{ success: boolean }>(`/accounts/${id}`, { method: "DELETE", body: JSON.stringify({ confirmToken: confirmToken ?? "" }) }),
};
