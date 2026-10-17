// GitLab REST client — pure data fetching with pagination/retry, mirrors GithubClient.
import { fetchGitlabWithSafety } from "../../gitlab-http";

type FetchFn = typeof fetchGitlabWithSafety;

interface Page<T> { data: T; nextPage: number | null; }

function parseNextPage(linkHeader: string | null): number | null {
  if (!linkHeader) return null;
  const m = linkHeader.match(/<[^>]*[?&]page=(\d+)[^>]*>;\s*rel="next"/);
  return m ? parseInt(m[1], 10) : null;
}

export class GitlabClient {
  constructor(
    private apiBase: string,
    private fetchFn: FetchFn = fetchGitlabWithSafety,
  ) {}

  private async fetch<T>(path: string, token: string, page?: number): Promise<Page<T>> {
    const sep = path.includes("?") ? "&" : "?";
    const url = `${this.apiBase}${path}${page ? `${sep}page=${page}` : ""}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    const res = await this.fetchFn(url, {
      headers: { "PRIVATE-TOKEN": token, "User-Agent": "dashboard" },
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (res.status === 401) throw new Error(`GitLab API 401: token invalid/expired`);
    if (res.status === 429) throw new Error(`GitLab rate limited (${res.headers.get("Retry-After") || "?"}s)`);
    if (!res.ok) throw new Error(`GitLab API ${res.status}: ${res.statusText} for ${url}`);
    const data = await res.json() as T;
    return { data, nextPage: parseNextPage(res.headers.get("Link")) };
  }

  async fetchUser(token: string): Promise<Record<string, unknown>> {
    return (await this.fetch<Record<string, unknown>>("/user", token)).data;
  }

  async fetchAllProjects(userId: number | string, token: string, limit = 1000): Promise<Array<Record<string, unknown>>> {
    const out: Array<Record<string, unknown>> = [];
    let page = 1;
    while (out.length < limit) {
      const { data, nextPage } = await this.fetch<Array<Record<string, unknown>>>(`/users/${userId}/projects?membership=true&order_by=updated_at&per_page=100`, token, page);
      out.push(...(Array.isArray(data) ? data : []));
      if (nextPage === null || nextPage === page) break;
      page = nextPage;
    }
    return out;
  }

  async fetchReleases(projectId: number | string, token: string): Promise<Array<Record<string, unknown>>> {
    return (await this.fetch<Array<Record<string, unknown>>>(`/projects/${projectId}/releases`, token)).data;
  }

  async fetchContributionEvents(userId: number | string, token: string): Promise<Array<Record<string, unknown>>> {
    const since = `${new Date().getFullYear() - 1}-01-01`;
    return (await this.fetch<Array<Record<string, unknown>>>(`/users/${userId}/events?action=pushed&after=${since}`, token)).data;
  }
}
