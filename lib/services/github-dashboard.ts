import type { AuthUser } from "@/lib/auth-helpers";
import { getAccountByIdWithCredential, getVisibleAccountDetails } from "@/lib/services/accounts";
import { getGithubAvailableOrgs, getGithubContributions, getGithubOverview, getGithubRepoSnapshots, getGithubTrafficClones, getGithubTrafficViews, getGithubReferrers, getGithubReferrerHistory, getGithubPaths, getGithubPathHistory, getGithubReleases, getGithubReleaseDownloadTimeline } from "@/lib/services/github";
import { GithubWatchlistService } from "@/lib/services/github-watchlist";
import type { GithubRepo, GithubWatchlistResponse } from "@/shared/types";

export class GithubDashboardError extends Error {
  constructor(readonly code: "not_found" | "forbidden" | "wrong_platform" | "credential_error") { super(code); }
}

async function visibleGithubAccount(viewer: AuthUser, accountId: number) {
  let account;
  try { account = await getVisibleAccountDetails(accountId, viewer); }
  catch (error) {
    if (error instanceof Error && error.name === "AccountForbiddenError") throw new GithubDashboardError("forbidden");
    throw error;
  }
  if (!account) throw new GithubDashboardError("not_found");
  if (account.platform !== "github") throw new GithubDashboardError("wrong_platform");
  return account;
}

export async function getGithubAccountPage(viewer: AuthUser, accountId: number) {
  const account = await visibleGithubAccount(viewer, accountId);
  const [overview, contributions] = await Promise.all([
    getGithubOverview(accountId),
    getGithubContributions(accountId, new Date().getFullYear()),
  ]);
  const compactRepo = (repo: GithubRepo) => ({
    id: repo.id, account_id: repo.account_id, repo_id: repo.repo_id, name: repo.name, full_name: repo.full_name,
    description: repo.description?.slice(0, 280) ?? null, language: repo.language, stars: repo.stars, forks: repo.forks,
    open_issues: repo.open_issues, open_issues_only: repo.open_issues_only, open_pull_requests: repo.open_pull_requests,
    topics: repo.topics, homepage: repo.homepage, is_fork: repo.is_fork, pinned: repo.pinned, created_at: repo.created_at,
  });
  const pinCandidate = (repo: GithubRepo) => ({ id: repo.id, repo_id: repo.repo_id, full_name: repo.full_name, language: repo.language, pinned: repo.pinned });
  return {
    account,
    overview: {
      stats: overview.stats,
      repos: overview.repos.slice(0, 500).map(compactRepo),
      allRepos: (overview.allRepos as GithubRepo[]).slice(0, 500).map(pinCandidate),
      totalStars: overview.totalStars,
      totalForks: overview.totalForks,
      totalRepos: overview.totalRepos,
      languages: Object.entries(overview.languages).map(([language, count]) => ({ language, count })),
    },
    contributions,
  };
}

export async function getGithubWatchlistManager(viewer: AuthUser, accountId: number) {
  await visibleGithubAccount(viewer, accountId);
  const [account, available] = await Promise.all([
    getAccountByIdWithCredential(accountId),
    getGithubAvailableOrgs(accountId),
  ]);
  if (!account) throw new GithubDashboardError("not_found");
  if (available.status === "credential-error") throw new GithubDashboardError("credential_error");
  const watchlist = await new GithubWatchlistService().get(account) as GithubWatchlistResponse;
  return {
    watchlist,
    availableOrganizations: available.status === "ok" ? available.orgs : [],
    unavailable: available.status === "ok" ? available.unavailable : null,
  };
}

export async function getGithubRepoPage(viewer: AuthUser, accountId: number, repoId: number, days: number, growthDays: number) {
  const account = await visibleGithubAccount(viewer, accountId);
  const [overview, snapshots, clones, views, referrers, referrerHistory, paths, pathHistory, releases, downloadTimeline] = await Promise.all([
    getGithubOverview(accountId), getGithubRepoSnapshots(accountId, repoId, days), getGithubTrafficClones(accountId, repoId, days),
    getGithubTrafficViews(accountId, repoId, days), getGithubReferrers(accountId, repoId), getGithubReferrerHistory(accountId, repoId, days),
    getGithubPaths(accountId, repoId), getGithubPathHistory(accountId, repoId, days), getGithubReleases(accountId, repoId),
    getGithubReleaseDownloadTimeline(accountId, repoId, growthDays),
  ]);
  const repo = (overview.repos as GithubRepo[]).find((item: GithubRepo) => item.repo_id === repoId);
  if (!repo) throw new GithubDashboardError("not_found");
  // Release bodies and asset URLs are not sent in the page query. The current
  // release chart only needs aggregate asset counters, not download links.
  const compactReleases = releases.slice(0, 50).map((release) => ({
    id: release.id, account_id: release.account_id, repo_id: release.repo_id, release_id: release.release_id,
    tag_name: release.tag_name, name: release.name, prerelease: release.prerelease, published_at: release.published_at,
    html_url: release.html_url, total_downloads: release.total_downloads, fetched_at: release.fetched_at,
    assets: release.assets.slice(0, 50).map((asset) => ({ id: asset.id, release_id: asset.release_id, name: asset.name, download_count: asset.download_count, size: asset.size, content_type: asset.content_type, browser_download_url: null })),
  }));
  const compactGrowth = downloadTimeline.map((release) => ({
    ...release,
    points: release.points.map((point) => ({ ...point, assets: Object.entries(point.asset_downloads ?? {}).map(([name, downloadCount]) => ({ name, downloadCount })) })),
  }));
  return { account, repo, snapshots, clones, views, referrers, referrerHistory, paths, pathHistory, releases: compactReleases, downloadTimeline: compactGrowth };
}
