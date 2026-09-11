const API_BASE = "/api";

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "ApiError";
  }
}

let redirecting401 = false;
async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    ...options,
  });
  if (!res.ok) {
    // Centralised 401 handling: a single expired/invalid session would
    // otherwise make every parallel overview query throw independently.
    // Hard-navigate to login once (preserving the intended destination)
    // instead of letting each component retry and potentially trigger
    // a render loop on the homepage.
    if (res.status === 401 && typeof window !== "undefined" && !redirecting401) {
      const onLogin = window.location.pathname === "/login";
      const isAuthCheck = url.startsWith("/auth/");
      if (!onLogin && !isAuthCheck) {
        redirecting401 = true;
        const from = window.location.pathname + window.location.search;
        // Avoid self-redirect loops: never set ?from=/login
        const safeFrom = from.startsWith("/login") ? "/overview" : from;
        window.location.replace(`/login?from=${encodeURIComponent(safeFrom)}`);
      }
    }
    const body = await res.json().catch(() => ({})) as Record<string, string>;
    const msg = body.error || `API error: ${res.status}`;
    throw new ApiError(msg, res.status);
  }
  return res.json() as T;
}

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
  getAccounts: () => fetchJSON<AccountsResponse>("/accounts"),
  getAccount: (id: number) => fetchJSON<AccountWithStats>(`/accounts/${id}`),
  createAccount: (data: { screenName: string; authToken?: string; fetchInterval?: number; platform?: string; instanceUrl?: string | null; authType?: string | null }) =>
    fetchJSON<Account>("/accounts", { method: "POST", body: JSON.stringify(data) }),
  updateAccount: (id: number, data: { screenName?: string; authToken?: string; fetchInterval?: number; isActive?: boolean; instanceUrl?: string; authType?: string }) =>
    fetchJSON<Account>(`/accounts/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  triggerFetch: (id: number, level?: string) => fetchJSON<{ message: string }>(`/fetch/${id}`, { method: "POST", body: level ? JSON.stringify({ level }) : undefined }),
  getFetchHealth: () => fetchJSON<FetchHealthResponse>("/fetch-health"),

  // Twitter
  getOverview: () => fetchJSON<OverviewStats>("/stats/overview"),
  getTweets: (page = 1, limit = 20, sort = "created_at", order = "desc", search?: string, accountIds?: number[], isReply?: number) => {
    let url = `/tweets?page=${page}&limit=${limit}&sort=${sort}&order=${order}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    if (accountIds?.length) url += `&accountIds=${accountIds.join(",")}`;
    if (isReply !== undefined) url += `&isReply=${isReply}`;
    return fetchJSON<PaginatedTweets>(url);
  },
  getTweet: (id: string) => fetchJSON<Tweet>(`/tweets/${id}`),
  getTimeline: (days = 30, accountId?: number) => {
    let url = `/stats/timeline?days=${days}`;
    if (accountId) url += `&accountIds=${accountId}`;
    return fetchJSON<TimelineData>(url);
  },
  getTopTweets: (metric = "favorite_count", limit = 10) =>
    fetchJSON<Tweet[]>(`/stats/top?metric=${metric}&limit=${limit}`),
  getPulse: (days = 7) => fetchJSON<PulseResponse>(`/pulse?days=${days}`),
  getTopContent: (days = 7) => fetchJSON<TopContentResponse>(`/top-content?days=${days}`),
  getCalendar: (year?: number) =>
    fetchJSON<CalendarDay[]>(`/stats/calendar?year=${year || new Date().getFullYear()}`),

  // GitHub
  getGithubOverview: (accountId: number) => fetchJSON<GithubOverview>(`/github/overview/${accountId}`),
  getGithubTimeline: (accountId: number, days = 30) => fetchJSON<{ date: string; public_repos: number; followers: number; following: number }[]>(`/github/timeline/${accountId}?days=${days}`),
  getGithubContributions: (accountId: number, year?: number) =>
    fetchJSON<GithubContribution[]>(`/github/contributions/${accountId}${year ? `?year=${year}` : ""}`),

  // GitHub Repo Insights
  getGithubRepoSnapshots: (accountId: number, repoId: number, days = 30) =>
    fetchJSON<{ stars: number; forks: number; open_issues: number; open_issues_only: number | null; open_pull_requests: number | null; date: string }[]>(`/github/${accountId}/repos/${repoId}/snapshots?days=${days}`),
  getGithubTrafficClones: (accountId: number, repoId: number, days = 30) =>
    fetchJSON<{ date: string; count: number; uniques: number }[]>(`/github/${accountId}/repos/${repoId}/clones?days=${days}`),
  getGithubTrafficViews: (accountId: number, repoId: number, days = 30) =>
    fetchJSON<{ date: string; count: number; uniques: number }[]>(`/github/${accountId}/repos/${repoId}/views?days=${days}`),
  getGithubReferrers: (accountId: number, repoId: number) =>
    fetchJSON<{ snapshot_date: string; referrer: string; count: number; uniques: number }[]>(`/github/${accountId}/repos/${repoId}/referrers`),
  getGithubReferrerHistory: (accountId: number, repoId: number, days = 30) =>
    fetchJSON<{ snapshot_date: string; referrer: string; count: number; uniques: number }[]>(`/github/${accountId}/repos/${repoId}/referrers/history?days=${days}`),
  getGithubPaths: (accountId: number, repoId: number) =>
    fetchJSON<{ snapshot_date: string; path: string; title: string | null; count: number; uniques: number }[]>(`/github/${accountId}/repos/${repoId}/paths`),
  getGithubPathHistory: (accountId: number, repoId: number, days = 30) =>
    fetchJSON<{ snapshot_date: string; path: string; title: string | null; count: number; uniques: number }[]>(`/github/${accountId}/repos/${repoId}/paths/history?days=${days}`),
  getGithubReleases: (accountId: number, repoId: number) =>
    fetchJSON<GithubRelease[]>(`/github/${accountId}/repos/${repoId}/releases`),
  getGithubReleaseAssets: (accountId: number, repoId: number, releaseId: number) =>
    fetchJSON<GithubReleaseAsset[]>(`/github/${accountId}/repos/${repoId}/releases/${releaseId}/assets`),
  getGithubReleaseDownloadTimeline: (accountId: number, repoId: number, days = 30) =>
    fetchJSON<GithubReleaseDownloadTimeline[]>(`/github/${accountId}/repos/${repoId}/releases/growth?days=${days}`),
  getGithubWatchlist: (accountId: number) =>
    fetchJSON<GithubWatchlistResponse>(`/github/watchlist/${accountId}`),
  saveGithubWatchlist: (accountId: number, input: { orgs: string[]; watched: number[] }) =>
    fetchJSON<GithubWatchlistResponse>(`/github/watchlist/${accountId}`, { method: "PUT", body: JSON.stringify(input) }),
  getGithubAvailableOrgs: (accountId: number) =>
    fetchJSON<GithubAvailableOrgsResponse>(`/github/sources/${accountId}/available`),
  setPinnedRepos: (accountId: number, repoIds: number[]) =>
    fetchJSON<{ ok: boolean }>(`/github/repos/pin`, { method: "PUT", body: JSON.stringify({ accountId, repoIds }) }),

  // GitLab
  getGitlabOverview: (accountId: number) => fetchJSON<GitlabOverview>(`/gitlab/overview/${accountId}`),
  getGitlabTimeline: (accountId: number, days = 30) => fetchJSON<{ date: string; public_projects: number; followers: number; following: number }[]>(`/gitlab/timeline/${accountId}?days=${days}`),
  getGitlabContributions: (accountId: number, year?: number) =>
    fetchJSON<GitlabContribution[]>(`/gitlab/contributions/${accountId}${year ? `?year=${year}` : ""}`),

  // GitLab Project Insights
  getGitlabProjectSnapshots: (accountId: number, projectId: number, days = 30) =>
    fetchJSON<{ stars: number; forks: number; open_issues: number; date: string }[]>(`/gitlab/${accountId}/projects/${projectId}/snapshots?days=${days}`),
  getGitlabReleases: (accountId: number, projectId: number) =>
    fetchJSON<GitlabRelease[]>(`/gitlab/${accountId}/projects/${projectId}/releases`),
  setPinnedGitlabProjects: (accountId: number, projectIds: number[]) =>
    fetchJSON<{ ok: boolean }>(`/gitlab/projects/pin`, { method: "PUT", body: JSON.stringify({ accountId, projectIds }) }),

  // Reddit
  getRedditOverview: (accountId: number) => fetchJSON<RedditOverview>(`/reddit/overview/${accountId}`),
  getRedditTimeline: (accountId: number, days = 30) => fetchJSON<{ date: string; post_karma: number; comment_karma: number }[]>(`/reddit/timeline/${accountId}?days=${days}`),
  getRedditPosts: (accountId: number, page = 1, limit = 20, sort = "score") =>
    fetchJSON<PaginatedRedditPosts>(`/reddit/posts/${accountId}?page=${page}&limit=${limit}&sort=${sort}`),
  getRedditComments: (accountId: number, page = 1, limit = 20) =>
    fetchJSON<PaginatedRedditComments>(`/reddit/comments/${accountId}?page=${page}&limit=${limit}`),
  getRedditActivity: (accountId: number, days = 30) =>
    fetchJSON<{ posts: { date: string; count: number }[]; comments: { date: string; count: number }[] }>(`/reddit/activity/${accountId}?days=${days}`),
  getRedditSubreddits: (accountId: number) =>
    fetchJSON<{ subreddit: string; count: number }[]>(`/reddit/subreddits/${accountId}`),

  login: (username: string, password: string) =>
    fetchJSON<{ ok: boolean; user?: string; role?: string }>("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  checkAuth: () =>
    fetchJSON<{ authenticated: boolean; username?: string; role?: string }>("/auth/me"),
  logout: () => fetchJSON<{ ok: boolean }>("/auth/logout", { method: "POST" }),
  changePassword: (currentPassword: string, newPassword: string) =>
    fetchJSON<{ ok: boolean }>("/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) }),

  // Users (admin only)
  getUsers: () => fetchJSON<{ users: { id: number; username: string; role: string; created_at: string }[] }>("/users"),
  createUser: (data: { username: string; password: string; role?: string }) =>
    fetchJSON("/users", { method: "POST", body: JSON.stringify(data) }),
  deleteUser: (id: number, confirmToken: string) =>
    fetchJSON<{ ok: boolean }>(`/users/${id}`, { method: "DELETE", body: JSON.stringify({ confirmToken }) }),

  // Confirmation tokens
  getConfirmToken: (target: number, action = "delete") =>
    fetchJSON<{ token: string }>("/confirm/token", { method: "POST", body: JSON.stringify({ target, action }) }),
  deleteAccount: (id: number, confirmToken?: string) =>
    fetchJSON<{ success: boolean }>(`/accounts/${id}`, { method: "DELETE", body: JSON.stringify({ confirmToken: confirmToken ?? "" }) }),
};
