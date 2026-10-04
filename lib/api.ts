import type { ReportSyncResult } from "@/lib/services/app-store-sync";
import { apiJson, apiRequest } from "@/lib/client/api-transport";
import type { AppStoreConnection, AppStoreConnectionDetail, AppStoreConnectionInput, AppStoreConnectionUpdate, AppStoreApp } from "@/shared/app-store";
import type { AppStoreAnalyticsStatus } from "@/shared/app-store-analytics";
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

export interface AnalyticsSite {
  id: number;
  name: string;
  site_key: string;
  host: string;
  created_at: string;
  updated_at: string;
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
  backfillAppStoreAnalytics: (id: number) => apiJson<ReportSyncResult>(`/app-store/connections/${id}/backfill`, { method: "POST", body: JSON.stringify({ kind: "analytics" }) }),
  backfillAppStoreRevenue: (id: number, input: { from: string; to: string; fiscalMonthFrom: string; fiscalMonthTo: string; regionCode: "ZZ" }) => apiJson<{ status: ReportSyncResult["status"]; sources: Record<"analytics" | "sales" | "finance", ReportSyncResult> }>(`/app-store/connections/${id}/backfill`, { method: "POST", body: JSON.stringify({ kind: "revenue", ...input }) }),
  syncAppStoreAnalytics: (id: number) => apiJson<ReportSyncResult>(`/app-store/connections/${id}/analytics/sync`, { method: "POST" }),
  syncAppStoreRevenue: (id: number, input: { from: string; to: string; fiscalMonth: string; regionCode: "ZZ" }) => apiJson<{ status: ReportSyncResult["status"]; sources: Record<"analytics" | "sales" | "finance", ReportSyncResult> }>(`/app-store/connections/${id}/revenue/sync`, { method: "POST", body: JSON.stringify(input) }),
  setupAppStoreAnalytics: (id: number) => apiJson<AppStoreAnalyticsStatus>(`/app-store/connections/${id}/analytics`, { method: "POST" }),
  createAppStoreConnection: (data: AppStoreConnectionInput) => apiJson<AppStoreConnection>("/app-store/connections", { method: "POST", body: JSON.stringify(data) }),
  updateAppStoreConnection: (id: number, data: AppStoreConnectionUpdate) => apiJson<AppStoreConnection>(`/app-store/connections/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  refreshAppStoreApps: (id: number) => apiJson<AppStoreConnectionDetail>(`/app-store/connections/${id}/refresh`, { method: "POST" }),
  setAppStoreAppEnabled: (id: number, appId: number, isEnabled: boolean) => apiJson<AppStoreApp>(`/app-store/connections/${id}/apps/${appId}`, { method: "PUT", body: JSON.stringify({ isEnabled }) }),
  deleteAppStoreConnection: (id: number, confirmToken: string) => apiJson<{ success: boolean }>(`/app-store/connections/${id}`, { method: "DELETE", body: JSON.stringify({ confirmToken }) }),
  // Accounts
  createAccount: (data: { screenName: string; authToken?: string; fetchInterval?: number; platform?: string; instanceUrl?: string | null; authType?: string | null }) =>
    apiJson<Account>("/accounts", { method: "POST", body: JSON.stringify(data) }),
  updateAccount: (id: number, data: { screenName?: string; authToken?: string; fetchInterval?: number; isActive?: boolean; instanceUrl?: string; authType?: string }) =>
    apiJson<Account>(`/accounts/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  triggerFetch: (id: number, level?: string) => apiJson<{ message: string }>(`/fetch/${id}`, { method: "POST", body: level ? JSON.stringify({ level }) : undefined }),

  // Twitter

  // GitHub
  saveGithubWatchlist: (accountId: number, input: { orgs: string[]; watched: number[] }) =>
    apiJson<GithubWatchlistResponse>(`/github/watchlist/${accountId}`, { method: "PUT", body: JSON.stringify(input) }),
  setPinnedRepos: (accountId: number, repoIds: number[]) =>
    apiJson<{ ok: boolean }>(`/github/repos/pin`, { method: "PUT", body: JSON.stringify({ accountId, repoIds }) }),

  // GitLab
  setPinnedGitlabProjects: (accountId: number, projectIds: number[]) =>
    apiJson<{ ok: boolean }>(`/gitlab/projects/pin`, { method: "PUT", body: JSON.stringify({ accountId, projectIds }) }),

  // Reddit

  login: (username: string, password: string) =>
    apiJson<{ ok: boolean; user?: string; role?: string }>("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  checkAuth: () =>
    apiJson<{ authenticated: boolean; username?: string; role?: string }>("/auth/me"),
  logout: () => apiJson<{ ok: boolean }>("/auth/logout", { method: "POST" }),
  changePassword: (currentPassword: string, newPassword: string) =>
    apiJson<{ ok: boolean }>("/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) }),

  // Users (admin only)
  createUser: (data: { username: string; password: string; role?: string }) =>
    apiJson("/users", { method: "POST", body: JSON.stringify(data) }),
  deleteUser: (id: number, confirmToken: string) =>
    apiJson<{ ok: boolean }>(`/users/${id}`, { method: "DELETE", body: JSON.stringify({ confirmToken }) }),

  // Web Analytics
  createAnalyticsSite: (data: { name: string; host: string }) =>
    apiJson<AnalyticsSite>("/analytics/sites", { method: "POST", body: JSON.stringify(data) }),
  renameAnalyticsSite: (siteId: number, data: { name: string }) =>
    apiJson<AnalyticsSite>(`/analytics/sites/${siteId}`, { method: "PUT", body: JSON.stringify(data) }),

  // AI and Settings
  streamAiChat: (messages: { role: "user" | "assistant"; content: string }[]) =>
    apiRequest("/ai/chat", { method: "POST", body: JSON.stringify({ messages }) }),
  updateSettings: (data: { baseUrl?: string; apiKey?: string; model?: string }) =>
    apiJson<{ ok: boolean }>("/settings", { method: "PUT", body: JSON.stringify(data) }),

  // Confirmation tokens
  getConfirmToken: (target: number, action = "delete") =>
    apiJson<{ token: string }>("/confirm/token", { method: "POST", body: JSON.stringify({ target, action }) }),
  deleteAccount: (id: number, confirmToken?: string) =>
    apiJson<{ success: boolean }>(`/accounts/${id}`, { method: "DELETE", body: JSON.stringify({ confirmToken: confirmToken ?? "" }) }),
};
