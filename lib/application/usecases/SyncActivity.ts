// L1 90m — timely metrics: stars/forks/issues/PRs/release downloads + followers/contributions
import type { RepoRepository, FetcherPort, Clock } from "../../domain/ports";
import type { Account } from "../../domain/account";
import { getLogger } from "../../logger";

interface GithubActivityClient {
  fetchUserStats(username: string, token?: string): Promise<Record<string, unknown>>;
  fetchContributions(username: string, token?: string, year?: number): Promise<Array<{ date: string; count: number; level: number }>>;
  fetchIssueSplits(repos: Array<{ id: number; full_name: string }>, token?: string): Promise<Map<number, { issues: number; pullRequests: number }>>;
  fetchRepoReleases(fullName: string, token?: string): Promise<Array<Record<string, unknown>>>;
}

export interface ReleaseWrite {
  upsertRelease(r: {
    account_id: number; repo_id: number; release_id: number; tag_name: string | null; name: string | null; body: string | null;
    prerelease: number; published_at: string | null; html_url: string | null; total_downloads: number;
  }): Promise<void>;
  replaceAssets(releaseDbId: number, assets: Array<Record<string, unknown>>): Promise<void>;
  insertAssetSnapshot(s: { account_id: number; repo_id: number; release_id: number; asset_name: string; download_count: number; snapshot_date: string }): Promise<void>;
  findReleaseDbId(accountId: number, repoId: number, releaseId: number): Promise<number | null>;
}

export class SyncActivity {
  constructor(
    private repos: RepoRepository,
    private fetcher: FetcherPort,
    private clock: Clock = { now: () => new Date() },
    private githubClient?: GithubActivityClient,
    private releaseWrite?: ReleaseWrite,
  ) {}

  async execute(account: Account): Promise<void> {
    const events = await this.fetcher.fetchRepoMeta(account);
    const repos = events.map((e) => e.repo);
    // Update timely counters
    await this.repos.upsertRepos(repos);
    const snapshotDate = this.clock.now().toISOString().slice(0, 10);
    const snapshots = repos.map((r) => ({
      accountId: r.accountId,
      repoId: r.repoId,
      stars: r.stars.value,
      forks: r.forks.value,
      snapshotDate,
    }));
    if (snapshots.length > 0) {
      await this.repos.upsertSnapshots(snapshots);
    }
    getLogger().info("GitHub", "L1 @%s: upsert %d repos + %d snapshots", account.screenName, repos.length, snapshots.length);

    await this.syncReleaseDownloads(account, repos);

    // Pure new: also refresh followers and contributions (L1 timely) to keep pulse audience compatible
    try {
      const client = this.githubClient;
      if (client && account.platform === "github") {
        const token = (account as unknown as { authToken?: string }).authToken ?? undefined;
        const stats = await client.fetchUserStats(account.screenName, token);
        const { insertGithubStats } = await import("../../repositories/github");
        await insertGithubStats({
          account_id: account.id,
          public_repos: (stats["public_repos"] as number) ?? 0,
          public_gists: (stats["public_gists"] as number) ?? 0,
          followers: (stats["followers"] as number) ?? 0,
          following: (stats["following"] as number) ?? 0,
        });
        const contribs = await client.fetchContributions(account.screenName, token);
        if (contribs.length > 0) {
          const { upsertGithubContributions } = await import("../../repositories/github");
          for (const c of contribs) {
            await upsertGithubContributions(account.id, [c]);
          }
        }
      }
    } catch { /* stats is best-effort, repos already updated */ }

    // Issue/PR split — precisely separate open_issues vs open_pull_requests (needs PAT).
    try {
      const client = this.githubClient;
      if (client && account.platform === "github") {
        const token = (account as unknown as { authToken?: string }).authToken ?? undefined;
        const splitInput = repos.filter(r => r.fullName).map(r => ({ id: r.repoId, full_name: r.fullName }));
        const splits = await client.fetchIssueSplits(splitInput, token);
        if (splits.size > 0) {
          const { getDb } = await import("../../db/connection");
          const { github_repos } = await import("@/db/schema");
          const { and, eq } = await import("drizzle-orm");
          const db = getDb();
          for (const [repoId, counts] of splits) {
            await db.update(github_repos).set({ open_issues_only: counts.issues, open_pull_requests: counts.pullRequests })
              .where(and(eq(github_repos.account_id, account.id), eq(github_repos.repo_id, repoId)));
          }
          getLogger().info("GitHub", "L1 @%s: issue/PR split updated for %d repos", account.screenName, splits.size);
        }
      }
    } catch { /* issue split best-effort; requires PAT, non-fatal */ }
  }

  private async syncReleaseDownloads(account: Account, repos: Array<{ fullName: string; repoId: number }>): Promise<void> {
    const client = this.githubClient;
    const write = this.releaseWrite;
    if (!client || !write || account.platform !== "github") return;

    const token = (account as unknown as { authToken?: string }).authToken ?? undefined;
    const snapshotDate = new Date().toISOString();
    let updatedReleases = 0;
    let failedRepos = 0;
    let aborted = false;

    for (const repo of repos) {
      if (aborted) break;
      const fullName = repo.fullName;
      if (!fullName) continue;
      let releases: Array<Record<string, unknown>> = [];
      try {
        releases = await client.fetchRepoReleases(fullName, token);
      } catch (e) {
        failedRepos++;
        const message = e instanceof Error ? e.message : String(e);
        getLogger().debug(
          "GitHub",
          "L1 @%s: release fetch failed for %s (%s)",
          account.screenName,
          fullName,
          message,
        );
        if (message.includes("401") || message.includes("403")) {
          aborted = true;
          getLogger().warn(
            "GitHub",
            "L1 @%s: stopping release sync for this run (token/scope issue)",
            account.screenName,
          );
        }
        continue;
      }
      for (const release of releases) {
        const totalDownloads = ((release.assets as Array<Record<string, unknown>>) || []).reduce((s: number, a: Record<string, unknown>) => s + ((a.download_count as number) || 0), 0);
        await write.upsertRelease({
          account_id: account.id, repo_id: repo.repoId, release_id: release.id as number,
          tag_name: (release.tag_name as string) || null, name: (release.name as string) || null, body: (release.body as string) || null,
          prerelease: release.prerelease ? 1 : 0, published_at: (release.published_at as string) || null, html_url: (release.html_url as string) || null, total_downloads: totalDownloads,
        });
        const releaseDbId = await write.findReleaseDbId(account.id, repo.repoId, release.id as number);
        if (releaseDbId) {
          await write.replaceAssets(releaseDbId, (release.assets as Array<Record<string, unknown>>) || []);
          for (const asset of (release.assets as Array<Record<string, unknown>>) || []) {
            const downloadCount = (asset.download_count as number) || 0;
            await write.insertAssetSnapshot({ account_id: account.id, repo_id: repo.repoId, release_id: releaseDbId, asset_name: asset.name as string, download_count: downloadCount, snapshot_date: snapshotDate });
          }
        }
        updatedReleases++;
      }
    }

    if (failedRepos) getLogger().warn("GitHub", "L1 @%s: release sync partial (%d releases saved, %d repos failed)", account.screenName, updatedReleases, failedRepos);
    else getLogger().info("GitHub", "L1 @%s: release downloads refreshed (%d releases)", account.screenName, updatedReleases);
  }
}
