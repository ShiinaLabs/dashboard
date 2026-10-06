// @ts-nocheck — existing business logic with loose types
import type { AccountRow } from "../repositories/accounts";
import { fetchContributions } from "./github-contributions";
import {
  upsertGithubRepo, insertGithubStats, upsertGithubContributions, updateAccount,
  upsertGithubRepoSnapshot,
  upsertGithubTrafficClones, upsertGithubTrafficViews,
  upsertGithubReferrer, upsertGithubPath,
  upsertGithubRelease, insertGithubReleaseAsset,
  upsertGithubReleaseAssetSnapshot,
} from "../db";
import { getDb } from "../db/connection";
import { eq, and } from "drizzle-orm";
import { github_releases, github_release_assets } from "@/db/schema";
import { getLogger } from "../logger";
import { fetchWithConfig, withNetworkRetry } from "../http";
import { toDownloadSnapshotTimestamp } from "../utils/download-growth";


const GITHUB_API = "https://api.github.com";

async function ghFetch(path: string, token?: string) {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "dashboard",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  // Retry only transport errors (e.g. "fetch failed"); HTTP status errors
  // (403/404/...) are handled below and must not be retried.
  const res = await withNetworkRetry(
    async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30_000);
      try {
        return await fetchWithConfig(`${GITHUB_API}${path}`, { headers, signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
    },
    { label: "GitHub" },
  );

  if (res.status === 403) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub API 403: ${body.slice(0, 200)}`);
  }
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const runningAccounts = new Set<number>();

export async function fetchGithubAccount(account: AccountRow) {
  if (!account.is_active) {
    getLogger().debug("GitHub", "@%s: inactive, skipping", account.screen_name);
    return false;
  }
  if (runningAccounts.has(account.id)) {
    getLogger().debug("GitHub", "@%s: already running, skipping", account.screen_name);
    return false;
  }
  runningAccounts.add(account.id);
  getLogger().info("GitHub", "Fetching @%s...", account.screen_name);
  let recordedCoreData = false;

  try {
    const token = account.auth_token;
    const username = account.screen_name;

    // 1. Fetch user profile
    const userData: Record<string, unknown> = await ghFetch(`/users/${username}`, token);
    await sleep(500);

    await insertGithubStats({
      account_id: account.id,
      public_repos: userData.public_repos || 0,
      public_gists: userData.public_gists || 0,
      followers: userData.followers || 0,
      following: userData.following || 0,
    });

    const ghId = String(userData.id);
    if (ghId && ghId !== account.user_id) {
      await updateAccount(account.id, { user_id: ghId });
    }

    getLogger().info("GitHub", "@%s: stats recorded (%d followers, %d repos)", username, userData.followers, userData.public_repos);
    recordedCoreData = true;

    // 2. Fetch repos (up to 100)
    await sleep(1000);
    const repos: Array<Record<string, unknown>> = await ghFetch(`/users/${username}/repos?per_page=100&sort=updated`, token);

    const today = new Date().toISOString().slice(0, 10);
    let trafficError: string | null = null;
    let releaseError: string | null = null;
    let trafficFailed = 0;
    let releaseFailed = 0;
    let issueSplitError: string | null = null;
    const issueSplits = new Map<number, { issues: number; pullRequests: number }>();

    if (token) {
      try {
        const { fetchGithubIssueSplits } = await import("./github-issue-split");
        const splits = await fetchGithubIssueSplits(
          repos.map(repo => ({ id: repo.id as number, full_name: repo.full_name as string })),
          token,
        );
        for (const [repoId, counts] of splits) issueSplits.set(repoId, counts);
        getLogger().info("GitHub", "@%s: issue/PR split fetched for %d repos", username, splits.size);
      } catch (e: unknown) {
        issueSplitError = e instanceof Error ? e.message : String(e);
        getLogger().warn("GitHub", "@%s: issue/PR split failed — %s", username, issueSplitError);
      }
    } else {
      issueSplitError = "No GitHub PAT configured; Issues and Pull Requests cannot be counted separately.";
      getLogger().warn("GitHub", "@%s: %s", username, issueSplitError);
    }

    for (const repo of repos) {
      const openIssuesAggregate = repo.open_issues_count || 0;
      const split = issueSplits.get(repo.id as number);
      const openPullRequests = split?.pullRequests ?? null;
      const openIssuesOnly = split ? Math.max(openIssuesAggregate - (openPullRequests ?? 0), 0) : null;
      await upsertGithubRepo({
        account_id: account.id,
        repo_id: repo.id,
        name: repo.name,
        full_name: repo.full_name,
        description: repo.description,
        language: repo.language,
        stars: repo.stargazers_count || 0,
        forks: repo.forks_count || 0,
        open_issues: openIssuesAggregate,
        open_issues_only: openIssuesOnly,
        open_pull_requests: openPullRequests,
        topics: JSON.stringify(repo.topics || []),
        homepage: repo.homepage,
        is_fork: repo.fork ? 1 : 0,
        created_at: repo.created_at,
        updated_at: repo.updated_at,
        pushed_at: repo.pushed_at,
      });

      await upsertGithubRepoSnapshot({
        account_id: account.id,
        repo_id: repo.id,
        stars: repo.stargazers_count || 0,
        forks: repo.forks_count || 0,
        open_issues: openIssuesAggregate,
        open_issues_only: openIssuesOnly,
        open_pull_requests: openPullRequests,
        snapshot_date: today,
      });
    }

    getLogger().info("GitHub", "@%s: %d repos saved + snapshots recorded", username, repos.length);

    const capabilityGaps: Array<{ capability: string; message?: string }> = [];

    // 3. Fetch traffic (L2-style telemetry) & releases (L1 timely) for each repo.
    //    Both require a classic PAT with repo scope.
    if (token) {
      let repoCount = 0;
      for (const repo of repos) {
        repoCount++;
        const err = await fetchRepoTraffic(account.id, repo.id, repo.full_name, token);
        if (err) { trafficFailed++; if (!trafficError) trafficError = err; getLogger().debug("GitHub", "@%s: traffic work item failed for %s", username, repo.full_name); }
        const releaseErr = await fetchRepoReleases(account.id, repo.id, repo.full_name, token);
        if (releaseErr) { releaseFailed++; if (!releaseError) releaseError = releaseErr; getLogger().debug("GitHub", "@%s: release work item failed for %s", username, repo.full_name); }
        if (repoCount % 5 === 0 || repoCount === repos.length) {
          getLogger().info("GitHub", "@%s: traffic + releases %d/%d done", username, repoCount, repos.length);
        }
        await sleep(200);
      }
      if (trafficError) {
        getLogger().warn("GitHub", "@%s: traffic sync partial (requested=%d saved=%d failed=%d)", username, repos.length, Math.max(0, repos.length - trafficFailed), trafficFailed);
        capabilityGaps.push({ capability: "github_traffic", message: trafficError });
      } else {
        getLogger().info("GitHub", "@%s: traffic + releases fetched", username);
      }
    } else {
      getLogger().info("GitHub", "@%s: no token — skipping traffic & releases", username);
      capabilityGaps.push({
        capability: "github_traffic",
        message: "No GitHub PAT configured; traffic, referrers, paths, releases, and download counts are unavailable.",
      });
    }
    if (releaseError) {
      getLogger().warn("GitHub", "@%s: release sync partial (requested=%d saved=%d failed=%d)", username, repos.length, Math.max(0, repos.length - releaseFailed), releaseFailed);
      capabilityGaps.push({ capability: "github_releases", message: releaseError });
    }
    if (issueSplitError) {
      capabilityGaps.push({ capability: "github_issue_split", message: issueSplitError });
    }

    // 4. Fetch contribution calendar
    await sleep(1000);
    try {
      const year = new Date().getFullYear();
      const contributions = await fetchContributions(username, token, year);
      await upsertGithubContributions(account.id, contributions);
      getLogger().info("GitHub", "@%s: %d contributions saved", username, contributions.length);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      getLogger().warn("GitHub", "@%s: contributions fetch skipped (%s)", username, message);
      capabilityGaps.push({ capability: "github_contributions", message });
    }

    await updateAccount(account.id, {
      last_fetched_at: new Date().toISOString(),
      error_message: capabilityGaps.map((gap) => gap.message).filter(Boolean).join("; ") || null,
    });

    getLogger().info("GitHub", "@%s: done", username);
    return {
      status: capabilityGaps.length > 0 ? "partial" : "success",
      capabilityGaps,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    getLogger().error("GitHub", "@%s error: %s", account.screen_name, msg);
    await updateAccount(account.id, { error_message: msg, last_fetched_at: new Date().toISOString() });
    const error = new Error(msg) as Error & { fetchRunStatus?: "failed" | "partial" };
    error.fetchRunStatus = recordedCoreData ? "partial" : "failed";
    throw error;
  } finally {
    runningAccounts.delete(account.id);
  }
}

async function fetchRepoTraffic(accountId: number, repoId: number, fullName: string, token: string): Promise<string | null> {
  const [owner, repo] = fullName.split("/");

  // Clones
  try {
    const clones: Record<string, unknown> = await ghFetch(`/repos/${owner}/${repo}/traffic/clones`, token);
    if (clones?.clones) {
      for (const day of clones.clones) {
        await upsertGithubTrafficClones({
          account_id: accountId,
          repo_id: repoId,
          date: day.timestamp?.slice(0, 10) || day.date,
          count: day.count || 0,
          uniques: day.uniques || 0,
        });
      }
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("403")) {
      if (msg.includes("blocked") || msg.includes("tos")) return null;
      return "GitHub API returned 403 — your PAT needs repo scope (classic token, not fine-grained)";
    }
    if (msg.includes("401")) return "GitHub API returned 401 — invalid token";
    return null;
  }

  // Views
  try {
    const views: Record<string, unknown> = await ghFetch(`/repos/${owner}/${repo}/traffic/views`, token);
    if (views?.views) {
      for (const day of views.views) {
        await upsertGithubTrafficViews({
          account_id: accountId,
          repo_id: repoId,
          date: day.timestamp?.slice(0, 10) || day.date,
          count: day.count || 0,
          uniques: day.uniques || 0,
        });
      }
    }
  } catch { /* views may be unavailable */ }

  // Referrers
  try {
    const referrers: Array<Record<string, unknown>> = await ghFetch(`/repos/${owner}/${repo}/traffic/popular/referrers`, token);
    const today = new Date().toISOString().slice(0, 10);
    if (referrers) {
      for (const r of referrers) {
        await upsertGithubReferrer({
          account_id: accountId,
          repo_id: repoId,
          referrer: r.referrer || "unknown",
          count: r.count || 0,
          uniques: r.uniques || 0,
          snapshot_date: today,
        });
      }
    }
  } catch { /* referrers may be unavailable */ }

  // Popular paths
  try {
    const paths: Array<Record<string, unknown>> = await ghFetch(`/repos/${owner}/${repo}/traffic/popular/paths`, token);
    const today = new Date().toISOString().slice(0, 10);
    if (paths) {
      for (const p of paths) {
        await upsertGithubPath({
          account_id: accountId,
          repo_id: repoId,
          path: p.path || "/",
          title: p.title || null,
          count: p.count || 0,
          uniques: p.uniques || 0,
          snapshot_date: today,
        });
      }
    }
  } catch { /* paths may be unavailable */ }

  return null;
}

async function fetchRepoReleases(
  accountId: number,
  repoId: number,
  fullName: string,
  token: string,
): Promise<string | null> {
  try {
    const releases: Array<Record<string, unknown>> = await ghFetch(`/repos/${fullName}/releases?per_page=30`, token);
    if (!releases) return null;

    for (const release of releases) {
      const totalDownloads = ((release.assets as Array<Record<string, unknown>>) || [])
        .reduce((s: number, a: Record<string, unknown>) => s + ((a.download_count as number) || 0), 0);

      await upsertGithubRelease({
        account_id: accountId,
        repo_id: repoId,
        release_id: release.id,
        tag_name: release.tag_name || null,
        name: release.name || null,
        body: release.body || null,
        prerelease: release.prerelease ? 1 : 0,
        published_at: release.published_at || null,
        html_url: release.html_url || null,
        total_downloads: totalDownloads,
      });

      // Get the local DB id of the inserted/updated release
      const [releaseRow] = await getDb().select({ id: github_releases.id })
        .from(github_releases)
        .where(and(
          eq(github_releases.account_id, accountId),
          eq(github_releases.repo_id, repoId),
          eq(github_releases.release_id, release.id),
        ));

      if (releaseRow) {
        await getDb().delete(github_release_assets)
          .where(eq(github_release_assets.release_id, releaseRow.id));

        const snapshotDate = toDownloadSnapshotTimestamp();
        for (const asset of (release.assets as Array<Record<string, unknown>>) || []) {
          const downloadCount = (asset.download_count as number) || 0;
          await insertGithubReleaseAsset({
            release_db_id: releaseRow.id,
            name: asset.name as string,
            download_count: downloadCount,
            size: (asset.size as number) || 0,
            content_type: (asset.content_type as string) || null,
            browser_download_url: (asset.browser_download_url as string) || null,
          });
          // Record a cumulative-count snapshot so download growth rate can be
          // derived from deltas between fetches (GitHub has no time-series API).
          await upsertGithubReleaseAssetSnapshot({
            account_id: accountId,
            repo_id: repoId,
            release_id: releaseRow.id,
            asset_name: asset.name as string,
            download_count: downloadCount,
            snapshot_date: snapshotDate,
          });
        }
      }
    }
  } catch (e: unknown) {
    return e instanceof Error ? e.message : String(e);
  }
  return null;
}
