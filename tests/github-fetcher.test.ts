import { describe, it, expect } from "vitest";
import { GithubFetcher } from "../lib/infra/fetchers/GithubFetcher";
import { GithubClient } from "../lib/infra/fetchers/GithubClient";

class FakeClient {
  constructor(private raws: any[]) {}
  async fetchAllRepos(){ return this.raws; }
}

class TrackingClient {
  discoveryCalls = 0;
  trackedCalls: number[] = [];
  async fetchAllRepos(){ this.discoveryCalls++; return []; }
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
  it("fails the run when tracked access fails instead of reporting an empty success", async () => {
    const client = { fetchAllRepos: async () => [], fetchRepositoryById: async () => { throw new Error("GitHub repository 403"); } };
    const fetcher = new GithubFetcher(client, async () => [], async () => [{ repositoryId: 7, githubId: 42, fullName: "alice/private" }]);
    await expect(fetcher.fetchRepoMeta({ id: 1, screenName: "alice", platform: "github", ownerId: 1, instanceUrl: null, isActive: 1 })).rejects.toThrow("Unable to resolve 1 of 1");
  });
  it("keeps the readable repositories and reports the gap when only some tracked repos fail", async () => {
    const client = {
      fetchAllRepos: async () => [],
      fetchRepositoryById: async (id: number) => {
        if (id === 42) throw new Error("GitHub repository 404");
        return { id, name: "wifi-lens", full_name: "ShiinaLabs/wifi-lens", stargazers_count: 1, forks_count: 0, fork: false, topics: [] };
      },
    };
    const fetcher = new GithubFetcher(client as any, async () => [], async () => [
      { repositoryId: 7, githubId: 42, fullName: "SHIINASAMA/transferred-away" },
      { repositoryId: 8, githubId: 43, fullName: "ShiinaLabs/wifi-lens" },
    ]);
    const events = await fetcher.fetchRepoMeta({ id: 1, screenName: "alice", platform: "github", ownerId: 1, instanceUrl: null, isActive: 1 } as any);
    // The reachable repository is still written; only the unreachable one is dropped.
    expect(events.map((event) => event.repo.repoId)).toEqual([43]);
    expect(fetcher.getLastFetchDiagnostics()).toEqual({
      trackedTotal: 2,
      failed: 1,
      failures: [{ repositoryId: 7, fullName: "SHIINASAMA/transferred-away", message: "GitHub repository 404" }],
    });
  });

  it("resets diagnostics between runs so a run that read everything reports no gap", async () => {
    let failWifiLens = true;
    const client = {
      fetchAllRepos: async () => [],
      fetchRepositoryById: async (id: number) => {
        if (failWifiLens && id === 42) throw new Error("GitHub repository 403");
        return { id, name: "r", full_name: "ShiinaLabs/r", stargazers_count: 1, forks_count: 0, fork: false, topics: [] };
      },
    };
    const fetcher = new GithubFetcher(client as any, async () => [], async () => [
      { repositoryId: 7, githubId: 42, fullName: "ShiinaLabs/r" },
      { repositoryId: 8, githubId: 43, fullName: "ShiinaLabs/other" },
    ]);
    const account = { id: 1, screenName: "alice", platform: "github", ownerId: 1, instanceUrl: null, isActive: 1 } as any;
    await fetcher.fetchRepoMeta(account);
    expect(fetcher.getLastFetchDiagnostics().failed).toBe(1);
    failWifiLens = false;
    await fetcher.fetchRepoMeta(account);
    expect(fetcher.getLastFetchDiagnostics()).toEqual({ trackedTotal: 2, failed: 0, failures: [] });
  });

  it("rejects metadata for a different repository before producing write events", async () => {
    const client = { fetchAllRepos: async () => [], fetchRepositoryById: async () => ({ id: 99 }) };
    const fetcher = new GithubFetcher(client, async () => [], async () => [{ repositoryId: 7, githubId: 42, fullName: "alice/private" }]);
    await expect(fetcher.fetchRepoMeta({ id: 1, screenName: "alice", platform: "github", ownerId: 1, instanceUrl: null, isActive: 1 })).rejects.toThrow("Unable to resolve");
  });
  it("L0 continues discovery while retaining tracked repositories missing from discovery", async () => {
    const client = new TrackingClient();
    const fetcher = new GithubFetcher(client,
      async () => [{ kind: "user", login: "alice" }],
      async () => [{ repositoryId: 7, githubId: 42, fullName: "alice/old" }], true);
    const events = await fetcher.fetchRepoMeta({ id: 1, screenName: "alice", platform: "github", ownerId: 1, instanceUrl: null, isActive: 1 });
    expect(client.discoveryCalls).toBe(1);
    expect(events.map(event => event.repo.repoId)).toEqual([42]);
  });
  it("maps fork to is_fork and does not write DB", async () => {
    const raws = [
      {id:1, name:"orig", full_name:"alice/orig", description:null, language:"TS", stargazers_count:100, forks_count:20, fork:false, topics:[], homepage:null, pushed_at:null, updated_at:null, created_at:null},
      {id:2, name:"forked", full_name:"alice/forked", description:null, language:null, stargazers_count:5, forks_count:1, fork:true, topics:[], homepage:null, pushed_at:null, updated_at:null, created_at:null},
    ];
    const f = new GithubFetcher(new FakeClient(raws) as unknown as GithubClient);
    const events = await f.fetchRepoMeta({id:1, screenName:"alice", platform:"github", ownerId:1, instanceUrl:null, isActive:1} as any);
    expect(events.length).toBe(2);
    expect(events[0].repo.isFork).toBe(0);
    expect(events[0].repo.stars.value).toBe(100);
    expect(events[1].repo.isFork).toBe(1);
  });
  it("handles empty", async () => {
    const f = new GithubFetcher(new FakeClient([]) as unknown as GithubClient);
    const events = await f.fetchRepoMeta({id:1, screenName:"alice", platform:"github", ownerId:1, instanceUrl:null, isActive:1} as any);
    expect(events.length).toBe(0);
  });

  it("resolves tracked repositories by stable GitHub id without rediscovering from the old username", async () => {
    const client = new TrackingClient();
    const f = new GithubFetcher(
      client as unknown as GithubClient,
      async () => [{ kind: "user", login: "old-personal-login" }],
      async () => [{ repositoryId: 7, githubId: 1241734389, fullName: "old-personal-login/wifi-lens" }],
    );
    const events = await f.fetchRepoMeta({ id: 1, screenName: "old-personal-login", platform: "github", ownerId: 1, instanceUrl: null, isActive: 1 } as any);
    expect(client.discoveryCalls).toBe(0);
    expect(client.trackedCalls).toEqual([1241734389]);
    expect(events[0].repo.fullName).toBe("ShiinaLabs/wifi-lens");
    expect(events[0].repo.ownerLogin).toBe("ShiinaLabs");
  });
});
