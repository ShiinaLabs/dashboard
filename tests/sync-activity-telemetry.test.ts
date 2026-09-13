import { describe, it, expect, vi } from "vitest";
import { SyncActivity } from "../lib/application/usecases/SyncActivity";
import { SyncTelemetry } from "../lib/application/usecases/SyncTelemetry";
import { Stars, Forks } from "../lib/domain/repo";
import type { RepoRepository } from "../lib/domain/ports";

class InMemoryRepo implements RepoRepository {
  store = new Map<string, any>();
  snapshots: any[] = [];
  async findAllByAccountIds(ids: number[]) { return Array.from(this.store.values()).filter(r => ids.includes(r.accountId)); }
  async findSnapshotsBefore() { return new Map(); }
  async findSnapshotsInWindow() { return new Map(); }
  async upsertRepos(repos: any[]) { for (const r of repos) { const k = `${r.accountId}:${r.repoId}`; const prev = this.store.get(k) || {}; this.store.set(k, { ...prev, ...r }); } }
  async upsertSnapshots(s: any[]) { this.snapshots.push(...s); }
}

const account = { id: 1, screenName: "alice", platform: "github" as const, ownerId: 1, instanceUrl: null, isActive: 1, authToken: "pat", authType: null };

describe("GitHub L1 issue/PR split (new arch, mock client, no PG)", () => {
  it("does not throw when client returns empty splits (PGA-free path)", async () => {
    const repo = new InMemoryRepo();
    const fakeFetcher = { fetchRepoMeta: async () => [{ type: "RepoMetaFetched" as const, repo: { accountId: 1, repoId: 1, fullName: "alice/r", stars: new Stars(1), forks: new Forks(1), isFork: 0, language: null, description: null, homepage: null, topics: "[]" } }] };
    const mockClient = {
      fetchUserStats: async () => ({ public_repos: 1, public_gists: 0, followers: 1, following: 1 }),
      fetchContributions: async () => [],
      fetchIssueSplits: async () => new Map([[1, { issues: 3, pullRequests: 2 }]]),
      fetchRepoReleases: async () => [],
    };
    const uc = new SyncActivity(repo as any, fakeFetcher as any, undefined, mockClient as any);
    await expect(uc.execute(account as any)).resolves.not.toThrow();
  });

  it("writes release downloads and asset snapshots during L1", async () => {
    const repo = new InMemoryRepo();
    repo.store.set("1:1", { accountId: 1, repoId: 1, fullName: "alice/r", stars: new Stars(1), forks: new Forks(1), isFork: 0, language: null, description: null, homepage: null, topics: "[]" });
    const fakeFetcher = { fetchRepoMeta: async () => [{ type: "RepoMetaFetched" as const, repo: { accountId: 1, repoId: 1, fullName: "alice/r", stars: new Stars(1), forks: new Forks(1), isFork: 0, language: null, description: null, homepage: null, topics: "[]" } }] };
    const mockClient = {
      fetchUserStats: async () => ({ public_repos: 1, public_gists: 0, followers: 1, following: 1 }),
      fetchContributions: async () => [],
      fetchIssueSplits: async () => new Map(),
      fetchRepoReleases: async () => [{
        id: 9001,
        tag_name: "v1.0.0",
        name: "v1",
        body: null,
        prerelease: false,
        published_at: "2026-08-01T00:00:00.000Z",
        html_url: "https://github.com/alice/r/releases/v1.0.0",
        assets: [
          { name: "app.zip", download_count: 120, size: 100, content_type: "application/zip", browser_download_url: "https://example.com/app.zip" },
          { name: "app.dmg", download_count: 80, size: 200, content_type: "application/x-apple-diskimage", browser_download_url: "https://example.com/app.dmg" },
        ],
      }],
    };
    const nextReleaseId = 10;
    const releases: Array<Record<string, unknown>> = [];
    const assetSnapshots: Array<Record<string, unknown>> = [];
    const write = {
      upsertRelease: async (r: Record<string, unknown>) => { releases.push(r); },
      findReleaseDbId: async () => nextReleaseId,
      replaceAssets: async () => {},
      insertAssetSnapshot: async (s: Record<string, unknown>) => { assetSnapshots.push(s); },
    };
    const uc = new SyncActivity(repo as any, fakeFetcher as any, undefined, mockClient as any, write as any);
    await uc.execute(account as any);

    expect(releases).toHaveLength(1);
    expect(releases[0].total_downloads).toBe(200);
    expect(assetSnapshots).toHaveLength(2);
    expect(assetSnapshots.map(s => s.download_count)).toEqual([120, 80]);
  });

  it("logs repo-level release failures and continues with other repos", async () => {
    const repo = new InMemoryRepo();
    repo.store.set("1:1", { accountId: 1, repoId: 1, fullName: "alice/ok", stars: new Stars(1), forks: new Forks(1), isFork: 0, language: null, description: null, homepage: null, topics: "[]" });
    repo.store.set("1:2", { accountId: 1, repoId: 2, fullName: "alice/bad", stars: new Stars(1), forks: new Forks(1), isFork: 0, language: null, description: null, homepage: null, topics: "[]" });
    const fakeFetcher = { fetchRepoMeta: async () => [
      { type: "RepoMetaFetched" as const, repo: { accountId: 1, repoId: 1, fullName: "alice/ok", stars: new Stars(1), forks: new Forks(1), isFork: 0, language: null, description: null, homepage: null, topics: "[]" } },
      { type: "RepoMetaFetched" as const, repo: { accountId: 1, repoId: 2, fullName: "alice/bad", stars: new Stars(1), forks: new Forks(1), isFork: 0, language: null, description: null, homepage: null, topics: "[]" } },
    ] };
    const mockClient = {
      fetchUserStats: async () => ({ public_repos: 1, public_gists: 0, followers: 1, following: 1 }),
      fetchContributions: async () => [],
      fetchIssueSplits: async () => new Map(),
      fetchRepoReleases: async (fullName: string) => {
        if (fullName === "alice/bad") throw new Error("GitHub releases 403: rate limited");
        return [{ id: 9002, tag_name: "v1.0.0", name: "v1", body: null, prerelease: false, published_at: "2026-08-01T00:00:00.000Z", html_url: "https://github.com/alice/ok/releases/v1.0.0", assets: [{ name: "app.zip", download_count: 5, size: 1, content_type: "application/zip", browser_download_url: "https://example.com/app.zip" }] }];
      },
    };
    const releases: Array<Record<string, unknown>> = [];
    const write = {
      upsertRelease: async (r: Record<string, unknown>) => { releases.push(r); },
      findReleaseDbId: async () => 10,
      replaceAssets: async () => {},
      insertAssetSnapshot: async () => {},
    };
    const warn = vi.fn();
    vi.spyOn(await import("../lib/logger"), "getLogger").mockReturnValue({
      info: vi.fn(), warn, error: vi.fn(), debug: vi.fn(),
    } as any);

    const uc = new SyncActivity(repo as any, fakeFetcher as any, undefined, mockClient as any, write as any);
    await uc.execute(account as any);

    expect(releases).toHaveLength(1);
    expect(releases[0].total_downloads).toBe(5);
    expect(warn).toHaveBeenCalledWith(
      "GitHub",
      "L1 @%s: release fetch failed for %s (%s)",
      "alice",
      expect.any(String),
      expect.any(String),
    );
    warn.mockRestore();
  });

  it("stops the release pass after a 401/403 so bad tokens do not hammer every repo", async () => {
    const repo = new InMemoryRepo();
    repo.store.set("1:1", { accountId: 1, repoId: 1, fullName: "alice/one", stars: new Stars(1), forks: new Forks(1), isFork: 0, language: null, description: null, homepage: null, topics: "[]" });
    repo.store.set("1:2", { accountId: 1, repoId: 2, fullName: "alice/two", stars: new Stars(1), forks: new Forks(1), isFork: 0, language: null, description: null, homepage: null, topics: "[]" });
    const fakeFetcher = { fetchRepoMeta: async () => [
      { type: "RepoMetaFetched" as const, repo: { accountId: 1, repoId: 1, fullName: "alice/one", stars: new Stars(1), forks: new Forks(1), isFork: 0, language: null, description: null, homepage: null, topics: "[]" } },
      { type: "RepoMetaFetched" as const, repo: { accountId: 1, repoId: 2, fullName: "alice/two", stars: new Stars(1), forks: new Forks(1), isFork: 0, language: null, description: null, homepage: null, topics: "[]" } },
    ] };
    const fetchRepoReleases = vi.fn(async () => { throw new Error("GitHub releases 401: Unauthorized"); });
    const mockClient = {
      fetchUserStats: async () => ({ public_repos: 1, public_gists: 0, followers: 1, following: 1 }),
      fetchContributions: async () => [],
      fetchIssueSplits: async () => new Map(),
      fetchRepoReleases,
    };
    const write = {
      upsertRelease: async () => {},
      findReleaseDbId: async () => 10,
      replaceAssets: async () => {},
      insertAssetSnapshot: async () => {},
    };
    const logger = {
      info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
    };
    vi.spyOn(await import("../lib/logger"), "getLogger").mockReturnValue(logger as any);

    const uc = new SyncActivity(repo as any, fakeFetcher as any, undefined, mockClient as any, write as any);
    await uc.execute(account as any);

    expect(fetchRepoReleases).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      "GitHub",
      expect.stringContaining("stopping release sync"),
      "alice",
    );
  });
});

describe("GitHub L2 telemetry (new arch, mock client, no PG)", () => {
  it("does not throw with empty traffic", async () => {
    const repo = new InMemoryRepo();
    const fakeFetcher = { fetchRepoMeta: async () => [{ type: "RepoMetaFetched" as const, repo: { accountId: 1, repoId: 1, fullName: "alice/r", stars: new Stars(1), forks: new Forks(1), isFork: 0, language: null, description: null, homepage: null, topics: "[]" } }] };
    const mockClient = { fetchRepoTraffic: async () => ({ clones: [], views: [], referrers: [], paths: [], errors: [] }) };
    const uc = new SyncTelemetry(repo as any, fakeFetcher as any, mockClient as any);
    await expect(uc.execute(account as any)).resolves.not.toThrow();
  });

  it("does not call release endpoints in L2", async () => {
    const repo = new InMemoryRepo();
    const fakeFetcher = { fetchRepoMeta: async () => [{ type: "RepoMetaFetched" as const, repo: { accountId: 1, repoId: 1, fullName: "alice/r", stars: new Stars(1), forks: new Forks(1), isFork: 0, language: null, description: null, homepage: null, topics: "[]" } }] };
    const fetchRepoReleases = vi.fn();
    const mockClient = {
      fetchRepoTraffic: async () => ({ clones: [], views: [], referrers: [], paths: [], errors: [] }),
      fetchRepoReleases,
    };
    const uc = new SyncTelemetry(repo as any, fakeFetcher as any, mockClient as any);
    await uc.execute(account as any);
    expect(fetchRepoReleases).not.toHaveBeenCalled();
  });
});
