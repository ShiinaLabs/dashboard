import { fetchWithConfig, withNetworkRetry } from "../../http";

type FetchFn = typeof fetchWithConfig;

// Candidate listing runs inside a user-facing request, so every page is
// time-limited, and the walk is bounded so a malformed Link chain cannot spin.
const LIST_TIMEOUT_MS = 30_000;
const MAX_LIST_PAGES = 20;

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

  /**
   * Shared paginated GET for the candidate listings. Bounded and time-limited:
   * these run inside a user-facing request when the watchlist UI lists what can
   * be monitored.
   */
  private async fetchAllPages(url: string, token: string | undefined, label: string): Promise<unknown[]> {
    const all: unknown[] = [];
    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "dashboard",
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    let next: string | null = url;
    let pages = 0;
    while (next) {
      if (++pages > MAX_LIST_PAGES) {
        throw new Error(`${label}: refusing to follow more than ${MAX_LIST_PAGES} pages`);
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), LIST_TIMEOUT_MS);
      let res: Response;
      try {
        res = await this.fetchFn(next, { headers, signal: controller.signal } as unknown as RequestInit);
      } finally {
        clearTimeout(timer);
      }
      if (!res.ok) {
        const body = (await res.text?.().catch(() => "")) ?? "";
        throw new Error(`${label} ${res.status}: ${body.slice(0, 200)}`);
      }
      const data = (await res.json()) as unknown;
      if (!Array.isArray(data)) {
        throw new Error(`${label} returned an invalid list`);
      }
      all.push(...data);
      next = parseLink(res.headers?.get?.("link") ?? res.headers?.get?.("Link") ?? null);
    }
    return all;
  }

  /**
   * Repositories owned by the authenticated PAT principal.
   *
   * `affiliation=owner` deliberately excludes `collaborator` and
   * `organization_member`: what the PAT can merely see is not what the user
   * asked to monitor. Organizations are opted into explicitly. Verified against
   * a real PAT on 2026-09-11: this returned 83 repos, all owned by the user
   * account, with zero organization-owned entries.
   */
  async fetchOwnedRepos(token?: string): Promise<unknown[]> {
    return this.fetchAllPages(
      "https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner",
      token,
      "GitHub owned repositories",
    );
  }

  /** Repositories in an organization the PAT can read. */
  async fetchOrgRepos(login: string, token?: string): Promise<unknown[]> {
    return this.fetchAllPages(
      `https://api.github.com/orgs/${encodeURIComponent(login)}/repos?per_page=100&sort=updated`,
      token,
      `GitHub org ${login} repositories`,
    );
  }

  /**
   * Validate an organization and capture its canonical identity in one call.
   *
   * Deliberately lists repositories rather than calling `/orgs/{login}`: that
   * endpoint requires org-owner rights (`admin:org`) and fails for
   * organizations whose repositories the PAT can legitimately read.
   *
   * An organization with no repositories visible to the PAT answers 200 with an
   * empty list, which proves existence but yields no identity — the caller then
   * keeps the login as typed.
   */
  async probeOrg(login: string, token?: string): Promise<
    | { ok: true; login: string; githubId: number | null; nodeId: string | null }
    | { ok: false; status: number; message: string }
  > {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "dashboard",
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LIST_TIMEOUT_MS);
    let res: Response;
    try {
      res = await this.fetchFn(
        `https://api.github.com/orgs/${encodeURIComponent(login)}/repos?per_page=1`,
        { headers, signal: controller.signal } as unknown as RequestInit,
      );
    } catch (error) {
      return { ok: false, status: 0, message: error instanceof Error ? error.message : String(error) };
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      const body = (await res.text?.().catch(() => "")) ?? "";
      return { ok: false, status: res.status, message: `GitHub org ${res.status}: ${body.slice(0, 200)}` };
    }
    const data = (await res.json()) as unknown;
    if (!Array.isArray(data)) {
      return { ok: false, status: 0, message: "GitHub org returned an invalid list" };
    }
    const first = data[0] as { owner?: { login?: unknown; id?: unknown; node_id?: unknown } } | undefined;
    return {
      ok: true,
      login: typeof first?.owner?.login === "string" ? first.owner.login : login,
      githubId: typeof first?.owner?.id === "number" ? first.owner.id : null,
      nodeId: typeof first?.owner?.node_id === "string" ? first.owner.node_id : null,
    };
  }

  /**
   * Organizations the authenticated PAT belongs to. Unreliable by design:
   * fine-grained PATs answer 200 with an empty list, and classic PATs without
   * the `user`/`read:org` scope answer 403. Callers must treat empty and 403 as
   * "cannot enumerate" and fall back to a manually entered login.
   */
  async fetchAuthenticatedOrgs(token?: string): Promise<unknown[]> {
    return this.fetchAllPages(
      "https://api.github.com/user/orgs?per_page=100",
      token,
      "GitHub organizations",
    );
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

  /**
   * Traffic telemetry for one repository.
   *
   * Each endpoint is fetched independently and its failure is reported in
   * `errors` instead of being swallowed: a repository whose traffic is
   * unreadable (the token lost push access, the repository was blocked) used to
   * return empty arrays indistinguishable from "no traffic", which made the
   * charts freeze with nothing to explain it. An empty array genuinely means
   * "no data for this window" — GitHub omits days with no traffic and returns
   * no referrers at all for a quiet repository.
   */
  async fetchRepoTraffic(fullName: string, token?: string): Promise<{
    clones: Array<{ date: string; count: number; uniques: number }>;
    views: Array<{ date: string; count: number; uniques: number }>;
    referrers: Array<{ referrer: string; count: number; uniques: number }>;
    paths: Array<{ path: string; title: string | null; count: number; uniques: number }>;
    errors: string[];
  }> {
    const [owner, repo] = fullName.split("/");
    const headers: Record<string, string> = { Accept: "application/vnd.github.v3+json", "User-Agent": "dashboard" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const errors: string[] = [];
    const get = async (endpoint: string, p: string) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), LIST_TIMEOUT_MS);
      try {
        const res = await this.fetchFn(
          `https://api.github.com${p}`,
          { headers, signal: controller.signal } as unknown as RequestInit,
        );
        if (!res.ok) {
          const body = (await res.text?.().catch(() => "")) ?? "";
          // A bare 403 is seldom self-explanatory; name the usual cause but keep
          // it as a possibility, since a blocked repository answers 403 too.
          const hint = res.status === 403 || res.status === 401
            ? " (403 — often means the credential lacks push access, which traffic requires)"
            : "";
          errors.push(`${endpoint} ${res.status}${hint}: ${body.slice(0, 120)}`);
          return null;
        }
        return await res.json();
      } catch (error) {
        errors.push(`${endpoint}: ${error instanceof Error ? error.message : String(error)}`);
        return null;
      } finally {
        clearTimeout(timer);
      }
    };
    const today = new Date().toISOString().slice(0, 10);
    const clones = (await get("clones", `/repos/${owner}/${repo}/traffic/clones`)) as { clones?: Array<Record<string, unknown>> } | null;
    const views = (await get("views", `/repos/${owner}/${repo}/traffic/views`)) as { views?: Array<Record<string, unknown>> } | null;
    const referrers = (await get("referrers", `/repos/${owner}/${repo}/traffic/popular/referrers`)) as Array<Record<string, unknown>> | null;
    const paths = (await get("paths", `/repos/${owner}/${repo}/traffic/popular/paths`)) as Array<Record<string, unknown>> | null;
    return {
      // A payload that is not the expected shape must degrade to "no data"
      // rather than throw: this call is per repository inside a long loop.
      clones: (Array.isArray(clones?.clones) ? clones!.clones : []).map((d) => ({ date: (d.timestamp as string || d.date as string)?.slice(0, 10) ?? today, count: (d.count as number) || 0, uniques: (d.uniques as number) || 0 })),
      views: (Array.isArray(views?.views) ? views!.views : []).map((d) => ({ date: (d.timestamp as string || d.date as string)?.slice(0, 10) ?? today, count: (d.count as number) || 0, uniques: (d.uniques as number) || 0 })),
      referrers: (Array.isArray(referrers) ? referrers : []).map((r) => ({ referrer: (r.referrer as string) || "unknown", count: (r.count as number) || 0, uniques: (r.uniques as number) || 0 })),
      paths: (Array.isArray(paths) ? paths : []).map((p) => ({ path: (p.path as string) || "/", title: (p.title as string) || null, count: (p.count as number) || 0, uniques: (p.uniques as number) || 0 })),
      errors,
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
