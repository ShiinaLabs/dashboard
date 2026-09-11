import { fetchWithConfig, withNetworkRetry } from "../../http";
import type { GithubSource } from "../../domain/github-source";

type FetchFn = typeof fetchWithConfig;

function parseLink(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  // Link: <https://api.github.com/users/alice/repos?page=2>; rel="next", <...>; rel="last"
  const parts = linkHeader.split(",");
  for (const part of parts) {
    const m = part.match(/<([^>]+)>\s*;\s*rel="next"/);
    if (m) return m[1];
  }
  return null;
}

export class GithubClient {
  constructor(private fetchFn: FetchFn = fetchWithConfig) {}


  async fetchUserStats(username: string, token?: string): Promise<Record<string, unknown>> {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "dashboard",
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await this.fetchFn(`https://api.github.com/users/${username}`, { headers } as unknown as RequestInit);
    if (!res.ok) throw new Error(`GitHub user ${res.status}`);
    return (await res.json()) as Record<string, unknown>;
  }

  async fetchContributions(username: string, token?: string, year?: number): Promise<Array<{ date: string; count: number; level: number }>> {
    const y = year ?? new Date().getFullYear();
    // Use GitHub contributions via old fetcher's GraphQL or REST fallback; for pure new we delegate to existing service
    // Keep compatible: import existing fetchContributions logic lazily
    const mod = await import("../../fetchers/github");
    // @ts-ignore - reuse internal helper if exported, else return empty
    if ((mod as unknown as { fetchContributions?: unknown })["fetchContributions"]) {
      return await (mod as unknown as { fetchContributions: (u:string,t:string|undefined,y:number)=>Promise<Array<{date:string;count:number;level:number}>> }).fetchContributions(username, token, y);
    }
    return [];
  }

  async fetchAllRepos(source: GithubSource | string, token?: string): Promise<unknown[]> {
    const isLegacyUsername = typeof source === "string";
    const login = isLegacyUsername ? source : source.login;
    const path = isLegacyUsername
      ? `/users/${encodeURIComponent(login)}/repos?per_page=100&sort=updated`
      : source.kind === "organization"
        ? `/orgs/${encodeURIComponent(login)}/repos?per_page=100&sort=updated`
        // /user/repos is based on the authenticated PAT principal, so it
        // continues to see repositories after a transfer away from the old
        // username.  The legacy string form remains for compatibility with
        // existing callers and fixtures.
        : `/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member`;
    let url: string | null = `https://api.github.com${path}`;
    const all: unknown[] = [];
    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "dashboard",
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    while (url) {
      const res = await this.fetchFn(url, { headers } as unknown as RequestInit);
      if (!res.ok) {
        const body = await res.text?.().catch(() => "") ?? "";
        throw new Error(`GitHub API ${res.status}: ${body.slice(0,200)}`);
      }
      const data = (await res.json()) as unknown;
      if (!Array.isArray(data)) {
        throw new Error("GitHub API returned an invalid repository list");
      }
      all.push(...data);
      const link = res.headers?.get?.("link") ?? res.headers?.get?.("Link") ?? null;
      url = parseLink(link);
    }
    return all;
  }

  async fetchRepositoryById(githubId: number, token?: string): Promise<Record<string, unknown>> {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "dashboard",
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await this.fetchFn(
      `https://api.github.com/repositories/${encodeURIComponent(String(githubId))}`,
      { headers } as unknown as RequestInit,
    );
    if (!res.ok) {
      const body = await res.text?.().catch(() => "") ?? "";
      throw new Error(`GitHub repository ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = await res.json() as unknown;
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("GitHub API returned an invalid repository");
    }
    return data as Record<string, unknown>;
  }

  // TODO: real L2 telemetry (traffic/referrers/paths) not yet migrated into new arch.
  // Placeholders return empty so pure-new L2 is a safe no-op on real accounts.
  async fetchTraffic(_repoFullName: string): Promise<{ clones: { count: number; uniques: number }; views: { count: number; uniques: number } }> {
    return { clones: { count: 0, uniques: 0 }, views: { count: 0, uniques: 0 } };
  }
  async fetchReferrers(_repoFullName: string): Promise<Array<{ referrer: string; count: number; uniques: number }>> {
    return [];
  }
  async fetchPaths(_repoFullName: string): Promise<Array<{ path: string; count: number; uniques: number }>> {
    return [];
  }

  async fetchIssueSplits(repos: Array<{ id: number; full_name: string }>, token?: string): Promise<Map<number, { issues: number; pullRequests: number }>> {
    const { fetchGithubIssueSplits } = await import("../../fetchers/github-issue-split");
    return fetchGithubIssueSplits(repos, token ?? "");
  }

  async fetchRepoTraffic(fullName: string, token?: string): Promise<{
    clones: Array<{ date: string; count: number; uniques: number }>;
    views: Array<{ date: string; count: number; uniques: number }>;
    referrers: Array<{ referrer: string; count: number; uniques: number }>;
    paths: Array<{ path: string; title: string | null; count: number; uniques: number }>;
  }> {
    const [owner, repo] = fullName.split("/");
    const headers: Record<string, string> = { Accept: "application/vnd.github.v3+json", "User-Agent": "dashboard" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const get = async (p: string) => {
      try {
        const res = await this.fetchFn(`https://api.github.com${p}`, { headers } as unknown as RequestInit);
        if (!res.ok) {
          if (res.status === 403 || res.status === 401) return null;
          return null;
        }
        return await res.json();
      } catch { return null; }
    };
    const today = new Date().toISOString().slice(0, 10);
    const clones = (await get(`/repos/${owner}/${repo}/traffic/clones`)) as { clones?: Array<Record<string, unknown>> } | null;
    const views = (await get(`/repos/${owner}/${repo}/traffic/views`)) as { views?: Array<Record<string, unknown>> } | null;
    const referrers = (await get(`/repos/${owner}/${repo}/traffic/popular/referrers`)) as Array<Record<string, unknown>> | null;
    const paths = (await get(`/repos/${owner}/${repo}/traffic/popular/paths`)) as Array<Record<string, unknown>> | null;
    return {
      clones: (clones?.clones ?? []).map((d) => ({ date: (d.timestamp as string || d.date as string)?.slice(0, 10) ?? today, count: (d.count as number) || 0, uniques: (d.uniques as number) || 0 })),
      views: (views?.views ?? []).map((d) => ({ date: (d.timestamp as string || d.date as string)?.slice(0, 10) ?? today, count: (d.count as number) || 0, uniques: (d.uniques as number) || 0 })),
      referrers: (referrers ?? []).map((r) => ({ referrer: (r.referrer as string) || "unknown", count: (r.count as number) || 0, uniques: (r.uniques as number) || 0 })),
      paths: (paths ?? []).map((p) => ({ path: (p.path as string) || "/", title: (p.title as string) || null, count: (p.count as number) || 0, uniques: (p.uniques as number) || 0 })),
    };
  }

  async fetchRepoReleases(fullName: string, token?: string): Promise<Array<Record<string, unknown>>> {
    const headers: Record<string, string> = { Accept: "application/vnd.github.v3+json", "User-Agent": "dashboard" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await withNetworkRetry(
      async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 30_000);
        try {
          return await this.fetchFn(
            `https://api.github.com/repos/${fullName}/releases?per_page=30`,
            { headers, signal: controller.signal } as unknown as RequestInit,
          );
        } finally {
          clearTimeout(timer);
        }
      },
      { label: "GitHub" },
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`GitHub releases ${res.status}: ${detail.slice(0, 200)}`);
    }
    const data = await res.json();
    if (!Array.isArray(data)) {
      throw new Error("GitHub releases returned an invalid response");
    }
    return data as Array<Record<string, unknown>>;
  }
}
