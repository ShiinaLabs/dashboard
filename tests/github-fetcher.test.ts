import { describe, it, expect } from "vitest";
import { GithubFetcher } from "../lib/infra/fetchers/GithubFetcher";
import { GithubClient } from "../lib/infra/fetchers/GithubClient";

const account = { id: 1, screenName: "alice", platform: "github", ownerId: 1, instanceUrl: null, isActive: 1 } as any;

/**
 * Discovery must never run in the fetch pipeline. Any client that gets asked to
 * list repositories fails loudly, so reintroducing a discovery sweep breaks the
 * tests rather than silently fetching repositories the user did not select.
 */
class TrackingClient {
  discoveryCalls = 0;
  trackedCalls: number[] = [];
  async fetchAllRepos() {
    this.discoveryCalls++;
    throw new Error("discovery must not run in the fetch pipeline");
  }
  async fetchRepositoryById(id: number) {
    this.trackedCalls.push(id);
    return {
      id,
      node_id: `R_${id}`,
      name: "wifi-lens",
      full_name: "ShiinaLabs/wifi-lens",
      owner: { id: 99, node_id: "O_99", login: "ShiinaLabs", type: "Organization" },
      stargazers_count: 10,
      forks_count: 2,
      fork: false,
      topics: [],
    };
  }
}

describe("GithubFetcher", () => {
  it("fetches nothing and discovers nothing when the watchlist is empty", async () => {
    const client = new TrackingClient();
    const fetcher = new GithubFetcher(client as unknown as GithubClient, async () => []);
    const events = await fetcher.fetchRepoMeta(account);
    expect(events).toEqual([]);
    expect(client.discoveryCalls).toBe(0);
    expect(client.trackedCalls).toEqual([]);
    expect(fetcher.getLastFetchDiagnostics()).toEqual({ trackedTotal: 0, failed: 0, failures: [] });
  });

  it("fails the run when tracked access fails instead of reporting an empty success", async () => {
    const client = { fetchRepositoryById: async () => { throw new Error("GitHub repository 403"); } };
    const fetcher = new GithubFetcher(client, async () => [{ repositoryId: 7, githubId: 42, fullName: "alice/private" }]);
    await expect(fetcher.fetchRepoMeta(account)).rejects.toThrow("Unable to resolve 1 of 1");
  });

  it("keeps the readable repositories and reports the gap when only some tracked repos fail", async () => {
    const client = {
      fetchRepositoryById: async (id: number) => {
        if (id === 42) throw new Error("GitHub repository 404");
        return { id, name: "wifi-lens", full_name: "ShiinaLabs/wifi-lens", stargazers_count: 1, forks_count: 0, fork: false, topics: [] };
      },
    };
    const fetcher = new GithubFetcher(client, async () => [
      { repositoryId: 7, githubId: 42, fullName: "SHIINASAMA/transferred-away" },
      { repositoryId: 8, githubId: 43, fullName: "ShiinaLabs/wifi-lens" },
    ]);
    const events = await fetcher.fetchRepoMeta(account);
    // The reachable repository is still written; only the unreachable one is dropped.
    expect(events.map((event) => event.repo.repoId)).toEqual([43]);
    expect(fetcher.getLastFetchDiagnostics()).toEqual({
      trackedTotal: 2,
      failed: 1,
      failures: [{ repositoryId: 7, fullName: "SHIINASAMA/transferred-away", message: "GitHub repository 404" }],
    });
  });

  it("resets diagnostics between runs so a run that read everything reports no gap", async () => {
    let failFirst = true;
    const client = {
      fetchRepositoryById: async (id: number) => {
        if (failFirst && id === 42) throw new Error("GitHub repository 403");
        return { id, name: "r", full_name: "ShiinaLabs/r", stargazers_count: 1, forks_count: 0, fork: false, topics: [] };
      },
    };
    const fetcher = new GithubFetcher(client, async () => [
      { repositoryId: 7, githubId: 42, fullName: "ShiinaLabs/r" },
      { repositoryId: 8, githubId: 43, fullName: "ShiinaLabs/other" },
    ]);
    await fetcher.fetchRepoMeta(account);
    expect(fetcher.getLastFetchDiagnostics().failed).toBe(1);
    failFirst = false;
    await fetcher.fetchRepoMeta(account);
    expect(fetcher.getLastFetchDiagnostics()).toEqual({ trackedTotal: 2, failed: 0, failures: [] });
  });

  it("rejects metadata for a different repository before producing write events", async () => {
    const client = { fetchRepositoryById: async () => ({ id: 99 }) };
    const fetcher = new GithubFetcher(client, async () => [{ repositoryId: 7, githubId: 42, fullName: "alice/private" }]);
    await expect(fetcher.fetchRepoMeta(account)).rejects.toThrow("Unable to resolve");
  });

  it("maps fork to is_fork and does not write DB", async () => {
    const raws: Record<number, unknown> = {
      1: { id: 1, name: "orig", full_name: "alice/orig", description: null, language: "TS", stargazers_count: 100, forks_count: 20, fork: false, topics: [], homepage: null, pushed_at: null, updated_at: null, created_at: null },
      2: { id: 2, name: "forked", full_name: "alice/forked", description: null, language: null, stargazers_count: 5, forks_count: 1, fork: true, topics: [], homepage: null, pushed_at: null, updated_at: null, created_at: null },
    };
    const client = { fetchRepositoryById: async (id: number) => raws[id] as Record<string, unknown> };
    const f = new GithubFetcher(client, async () => [
      { repositoryId: 1, githubId: 1, fullName: "alice/orig" },
      { repositoryId: 2, githubId: 2, fullName: "alice/forked" },
    ]);
    const events = await f.fetchRepoMeta(account);
    expect(events.length).toBe(2);
    expect(events[0].repo.isFork).toBe(0);
    expect(events[0].repo.stars.value).toBe(100);
    expect(events[1].repo.isFork).toBe(1);
  });

  it("resolves tracked repositories by stable GitHub id without rediscovering from the old username", async () => {
    const client = new TrackingClient();
    const f = new GithubFetcher(
      client as unknown as GithubClient,
      async () => [{ repositoryId: 7, githubId: 1241734389, fullName: "old-personal-login/wifi-lens" }],
    );
    const events = await f.fetchRepoMeta({ ...account, screenName: "old-personal-login" });
    expect(client.discoveryCalls).toBe(0);
    expect(client.trackedCalls).toEqual([1241734389]);
    expect(events[0].repo.fullName).toBe("ShiinaLabs/wifi-lens");
    expect(events[0].repo.ownerLogin).toBe("ShiinaLabs");
  });
});
