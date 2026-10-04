import { graphqlRequest } from "../graphql";
import type { AccountWithStats, GithubContribution, GithubOverview, GithubRepo, GithubRelease, GithubWatchlistResponse, GithubAvailableOrgsResponse, GithubReleaseDownloadTimeline } from "@/shared/types";

export interface GithubAccountPage {
  account: AccountWithStats;
  overview: Omit<GithubOverview, "topRepos" | "allRepos"> & { repos: GithubRepo[]; allRepos: { id: number; repo_id: number; full_name: string; language: string | null; pinned: boolean }[] };
  contributions: GithubContribution[];
}

const accountPage = /* GraphQL */ `query GithubAccountPage($accountId: Int!) {
  github { accountPage(accountId: $accountId) {
    account { id screen_name platform user_id fetch_interval is_active last_fetched_at error_message instance_url auth_type created_at updated_at stats { followers_count following_count tweet_count } recentFetchRuns { id trigger status started_at finished_at duration_ms error_message capability_gaps { capability message } } }
    overview { stats { public_repos public_gists followers following } repos { id account_id repo_id name full_name description language stars forks open_issues open_issues_only open_pull_requests topics homepage is_fork pinned created_at } allRepos { id repo_id full_name language pinned } totalStars totalForks totalRepos languages { language count } }
    contributions { date count }
  } }
}`;

export async function getGithubAccountPage(accountId: number, signal?: AbortSignal) {
  const result = await graphqlRequest<{ github: { accountPage: GithubAccountPage } }, { accountId: number }>(accountPage, { accountId }, signal);
  return result.github.accountPage;
}

const repoPageQuery = /* GraphQL */ `query GithubRepoPage($accountId: Int!, $repoId: Int!, $days: Int!, $growthDays: Int!) { github { repoPage(accountId: $accountId, repoId: $repoId, days: $days, growthDays: $growthDays) {
 account { id screen_name platform user_id fetch_interval is_active last_fetched_at error_message instance_url auth_type created_at updated_at stats { followers_count following_count tweet_count } recentFetchRuns { id trigger status started_at finished_at duration_ms error_message capability_gaps { capability message } } }
 repo { id account_id repo_id name full_name description language stars forks open_issues open_issues_only open_pull_requests topics homepage is_fork pinned created_at }
 snapshots { stars forks open_issues open_issues_only open_pull_requests date }
 clones { date count uniques } views { date count uniques }
 referrers { snapshot_date referrer count uniques } referrerHistory { snapshot_date referrer count uniques }
 paths { snapshot_date path title count uniques } pathHistory { snapshot_date path title count uniques }
 releases { id account_id repo_id release_id tag_name name prerelease published_at html_url total_downloads fetched_at assets { id release_id name download_count size content_type } }
 downloadTimeline { release_id tag_name name published_at points { day download_count snapshot_date assets { name downloadCount } } }
} } }`;

export interface GithubRepoPage {
  account: AccountWithStats; repo: GithubRepo;
  snapshots: { stars: number; forks: number; open_issues: number; open_issues_only: number | null; open_pull_requests: number | null; date: string }[];
  clones: { date: string; count: number; uniques: number }[]; views: { date: string; count: number; uniques: number }[];
  referrers: { snapshot_date: string; referrer: string; count: number; uniques: number }[];
  referrerHistory: { snapshot_date: string; referrer: string; count: number; uniques: number }[];
  paths: { snapshot_date: string; path: string; title: string | null; count: number; uniques: number }[];
  pathHistory: { snapshot_date: string; path: string; title: string | null; count: number; uniques: number }[];
  releases: GithubRelease[]; downloadTimeline: GithubReleaseDownloadTimeline[];
}

interface GithubRepoPageWire extends Omit<GithubRepoPage, "downloadTimeline"> {
  downloadTimeline: {
    release_id: number; tag_name: string | null; name: string | null; published_at: string | null;
    points: { day: number; download_count: number; snapshot_date: string; assets: { name: string; downloadCount: number }[] }[];
  }[];
}

export async function getGithubRepoPage(variables: { accountId: number; repoId: number; days: number; growthDays: number }, signal?: AbortSignal) {
  const result = await graphqlRequest<{ github: { repoPage: GithubRepoPageWire } }, typeof variables>(repoPageQuery, variables, signal);
  const page = result.github.repoPage;
  return { ...page, downloadTimeline: page.downloadTimeline.map((release) => ({ ...release, points: release.points.map((point) => ({ ...point, asset_downloads: Object.fromEntries(point.assets.map((asset) => [asset.name, asset.downloadCount])) })) })) as GithubReleaseDownloadTimeline[] };
}

const watchlistManager = /* GraphQL */ `query GithubWatchlistManager($accountId: Int!) {
  github { watchlistManager(accountId: $accountId) {
    watchlist { accountId sources { login enabled lastError } candidates { githubId githubReposId fullName ownerLogin ownerType isPrivate listedFrom watched lastError } warnings }
    availableOrganizations { login githubId nodeId }
    unavailable
  } }
}`;

export async function getGithubWatchlistManager(accountId: number, signal?: AbortSignal) {
  const result = await graphqlRequest<{ github: { watchlistManager: { watchlist: GithubWatchlistResponse; availableOrganizations: GithubAvailableOrgsResponse["orgs"]; unavailable: string | null } } }, { accountId: number }>(watchlistManager, { accountId }, signal);
  return result.github.watchlistManager;
}
