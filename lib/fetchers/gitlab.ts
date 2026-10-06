// @ts-nocheck — existing business logic with loose types
import type { AccountRow } from "../repositories/accounts";
import {
  insertGitlabStats,
  upsertGitlabProject,
  upsertGitlabProjectSnapshot,
  upsertGitlabContributions,
  upsertGitlabRelease,
  updateAccount,
} from "../db";
import { getLogger } from "../logger";
import { fetchWithConfig } from "../http";
import { validateUpstreamUrl } from "../ssrf-guard";

function getApiBase(account: AccountRow): string {
  if (account.instance_url) {
    const baseUrl = account.instance_url.replace(/\/+$/, "");
    const validation = validateUpstreamUrl(baseUrl);
    if (!validation.ok) {
      throw new Error(`Invalid GitLab instance URL: ${validation.error}`);
    }
    return baseUrl + "/api/v4";
  }
  return "https://gitlab.com/api/v4";
}

interface GlApiResponse<T> {
  data: T;
  nextPage: number | null;
}

async function glFetch<T>(apiBase: string, path: string, token: string): Promise<GlApiResponse<T>> {
  const url = `${apiBase}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  const res = await fetchWithConfig(url, {
    headers: {
      "PRIVATE-TOKEN": token,
      "User-Agent": "dashboard",
    },
    signal: controller.signal,
  }).catch((e: unknown) => {
    clearTimeout(timer);
    throw new Error(`GitLab network error: ${e instanceof Error ? e.message : String(e)}`);
  });
  clearTimeout(timer);

  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get("Retry-After") || "60", 10);
    throw new Error(`GitLab rate limited. Retry after ${retryAfter}s`);
  }

  if (res.status === 401) {
    throw new Error(`GitLab API 401: token invalid or expired. Check your PAT at ${apiBase.replace("/api/v4", "")}/-/user_settings/personal_access_tokens`);
  }

  if (!res.ok) {
    throw new Error(`GitLab API ${res.status}: ${res.statusText} for ${url}`);
  }

  const data = await res.json() as T;
  // GitLab uses RFC 5988 Link headers for pagination
  const linkHeader = res.headers.get("Link");
  let nextPage: number | null = null;
  if (linkHeader) {
    const match = linkHeader.match(/<[^>]*[?&]page=(\d+)[^>]*>;\s*rel="next"/);
    if (match) {
      nextPage = parseInt(match[1], 10);
    }
  }
  return { data, nextPage };
}

async function fetchAllPages<T>(
  apiBase: string,
  path: string,
  token: string,
  maxPages = 20,
): Promise<T[]> {
  let results: T[] = [];
  let page = 1;
  const sep = path.includes("?") ? "&" : "?";
  while (page <= maxPages) {
    const pagedPath = `${path}${sep}page=${page}&per_page=100`;
    const { data } = await glFetch<T[]>(apiBase, pagedPath, token);
    if (Array.isArray(data) && data.length > 0) {
      results = results.concat(data);
    }
    // Check if we got less than expected — this means we're done
    if (!Array.isArray(data) || data.length < 100) break;
    page++;
  }
  return results;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const runningGitlabAccounts = new Set<number>();

export async function fetchGitlabAccount(account: AccountRow) {
  if (!account.is_active) {
    getLogger().debug("GitLab", "%s: inactive, skipping", account.screen_name);
    return 0;
  }
  if (runningGitlabAccounts.has(account.id)) {
    getLogger().debug("GitLab", "%s: already running, skipping", account.screen_name);
    return 0;
  }
  runningGitlabAccounts.add(account.id);
  const apiBase = getApiBase(account);
  const token = account.auth_token;
  const errorMessages: string[] = [];
  let failedReleaseProjects = 0;
  let recordedCoreData = false;

  try {
    // 1. Fetch authenticated user profile
    getLogger().info("GitLab", "Fetching user profile from %s...", apiBase);
    const { data: user } = await glFetch<Record<string, unknown>>(apiBase, "/user", token);

    if (!user || !user.id) {
      throw new Error("Invalid GitLab token or user not found");
    }

    // Insert stats snapshot
    await insertGitlabStats({
      account_id: account.id,
      public_projects: 0, // will be updated after fetching projects
      followers: user.followers ?? 0,
      following: user.following ?? 0,
    });
    recordedCoreData = true;

    // 2. Fetch all projects for this user (membership=true for owned+contributed projects)
    getLogger().info("GitLab", "Fetching projects for %s...", account.screen_name);
    const projects = await fetchAllPages<Record<string, unknown>>(
      apiBase,
      `/users/${user.id}/projects?membership=true&order_by=updated_at`,
      token,
    );

    getLogger().info("GitLab", "Found %d projects for %s", projects.length, account.screen_name);
    let projCount = 0;

    for (const p of projects) {
      if (!p.id) continue;
      projCount++;

      const topics = JSON.stringify((p.topics as unknown[]) || []);
      const snapDate = new Date().toISOString().slice(0, 10);

      await upsertGitlabProject({
        account_id: account.id,
        project_id: p.id as number,
        name: p.name as string,
        path_with_namespace: (p.path_with_namespace as string) || (p.path as string),
        description: (p.description as string) || null,
        language: (p.language as string) || null,
        stars: (p.star_count as number) ?? 0,
        forks: (p.forks_count as number) ?? 0,
        open_issues: (p.open_issues_count as number) ?? 0,
        topics,
        homepage: (p.homepage as string) || null,
        is_fork: p.forked_from_project ? 1 : 0,
        visibility: (p.visibility as string) || "public",
        created_at: (p.created_at as string) || null,
        updated_at: (p.updated_at as string) || null,
        last_activity_at: (p.last_activity_at as string) || null,
      });

      await upsertGitlabProjectSnapshot({
        account_id: account.id,
        project_id: p.id as number,
        stars: (p.star_count as number) ?? 0,
        forks: (p.forks_count as number) ?? 0,
        open_issues: (p.open_issues_count as number) ?? 0,
        snapshot_date: snapDate,
      });

      // 3. Fetch releases for this project
      try {
        await sleep(200);
        const releases = await fetchAllPages<Record<string, unknown>>(
          apiBase,
          `/projects/${p.id}/releases`,
          token,
          3,
        );

        for (const rel of releases) {
          if (!rel.tag_name) continue;

          await upsertGitlabRelease({
            account_id: account.id,
            project_id: p.id as number,
            release_tag: rel.tag_name as string,
            name: (rel.name as string) || null,
            description: (rel.description as string) || null,
            released_at: (rel.released_at as string) || null,
            created_at: (rel.created_at as string) || null,
          });

          // We'd need the release row id to insert assets, but since releases
          // are keyed by (account_id, project_id, release_tag), we can just
          // store asset data at the same time. For now, we skip per-file assets
          // and just track the total download count on the release.
        }
      } catch (e: unknown) {
        failedReleaseProjects++;
        errorMessages.push(`Releases for ${p.name}: ${e instanceof Error ? e.message : String(e)}`);
      }

      if (projCount % 10 === 0 || projCount === projects.length) {
        getLogger().info("GitLab", "%s: projects %d/%d done", account.screen_name, projCount, projects.length);
      }
    }

    // Update stats with accurate project count
    await insertGitlabStats({
      account_id: account.id,
      public_projects: projects.length,
      followers: user.followers ?? 0,
      following: user.following ?? 0,
    });

    // 4. Fetch contribution data via events API
    try {
      getLogger().info("GitLab", "Fetching contribution events for %s...", account.screen_name);
      // We aggregate only push events (most likely to match GitHub-style contribution)
      const events = await fetchAllPages<Record<string, unknown>>(
        apiBase,
        `/users/${user.id}/events?action=pushed&after=${new Date().getFullYear() - 1}-01-01`,
        token,
        10,
      );

      const countByDate = new Map<string, number>();
      for (const event of events) {
        const date = (event.created_at as string)?.slice(0, 10);
        if (date) {
          countByDate.set(date, (countByDate.get(date) || 0) + 1);
        }
      }

      const entries = Array.from(countByDate.entries()).map(([date, count]) => ({ date, count }));
      await upsertGitlabContributions(account.id, entries);

      getLogger().info("GitLab", "Recorded %d contribution days for %s", countByDate.size, account.screen_name);
    } catch (e: unknown) {
      errorMessages.push(`Contributions: ${e instanceof Error ? e.message : String(e)}`);
    }

    // Update account with success
    await updateAccount(account.id, {
      last_fetched_at: new Date().toISOString(),
      user_id: String(user.id),
      error_message: errorMessages.length > 0 ? errorMessages.join("; ") : null,
    });

    const capabilityGaps: Array<{ capability: string; message?: string }> = [];
    if (errorMessages.some((message) => message.startsWith("Releases"))) {
      getLogger().warn("GitLab", "%s: release sync partial (requested=%d saved=%d failed=%d)", account.screen_name, projects.length, Math.max(0, projects.length - failedReleaseProjects), failedReleaseProjects);
      capabilityGaps.push({
        capability: "gitlab_releases",
        message: errorMessages.filter((message) => message.startsWith("Releases")).join("; "),
      });
    }
    if (errorMessages.some((message) => message.startsWith("Contributions"))) {
      capabilityGaps.push({
        capability: "gitlab_contributions",
        message: errorMessages.filter((message) => message.startsWith("Contributions")).join("; "),
      });
    }

    getLogger().info("GitLab", "Fetch complete for %s: %d projects", account.screen_name, projects.length);
    if (capabilityGaps.length > 0) {
      return { status: "partial", capabilityGaps };
    }
    return projects.length;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "GitLab fetch failed";
    await updateAccount(account.id, {
      last_fetched_at: new Date().toISOString(),
      error_message: msg,
    });
    getLogger().error("GitLab", "Fetch failed for %s: %s", account.screen_name, msg);
    const error = e instanceof Error ? e : new Error(msg) as Error & { fetchRunStatus?: "failed" | "partial" };
    error.fetchRunStatus = recordedCoreData ? "partial" : "failed";
    throw error;
  } finally {
    runningGitlabAccounts.delete(account.id);
  }
}
