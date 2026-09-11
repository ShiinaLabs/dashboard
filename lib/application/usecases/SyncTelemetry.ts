// L2 8h — telemetry trends: traffic clones/views, referrers, paths
import type { RepoRepository, FetcherPort } from "../../domain/ports";
import type { Account } from "../../domain/account";
import { getLogger } from "../../logger";

interface GithubTelemetryClient {
  fetchRepoTraffic(fullName: string, token?: string): Promise<{
    clones: Array<{ date: string; count: number; uniques: number }>;
    views: Array<{ date: string; count: number; uniques: number }>;
    referrers: Array<{ referrer: string; count: number; uniques: number }>;
    paths: Array<{ path: string; title: string | null; count: number; uniques: number }>;
  }>;
}

export class SyncTelemetry {
  constructor(
    private repos: RepoRepository,
    private fetcher: FetcherPort,
    private githubClient?: GithubTelemetryClient,
  ) {}

  async execute(account: Account): Promise<void> {
    const client = this.githubClient;
    if (!client) return;
    const events = await this.fetcher.fetchRepoMeta(account);
    const repos = events.map(e => e.repo);
    if (repos.length === 0) return;

    const token = (account as unknown as { authToken?: string }).authToken ?? undefined;
    const { getDb } = await import("../../db/connection");
    const { resolveGithubRepositoryId } = await import("../../repositories/github");
    const { github_traffic_clones, github_traffic_views, github_referrers, github_paths } = await import("@/db/schema");
    let db: ReturnType<typeof getDb>;
    try { db = getDb(); } catch { return; }

    const today = new Date().toISOString().slice(0, 10);
    const logger = getLogger();

    for (const repo of repos) {
      const fullName = repo.fullName;
      const repositoryId = await resolveGithubRepositoryId(account.id, repo.repoId);
      // Traffic (clones/views/referrers/paths)
      try {
        const traffic = await client.fetchRepoTraffic(fullName, token);
        for (const d of traffic.clones) await db.insert(github_traffic_clones).values({ account_id: account.id, repo_id: repo.repoId, repository_id: repositoryId, date: d.date, count: d.count, uniques: d.uniques }).onConflictDoNothing();
        for (const d of traffic.views) await db.insert(github_traffic_views).values({ account_id: account.id, repo_id: repo.repoId, repository_id: repositoryId, date: d.date, count: d.count, uniques: d.uniques }).onConflictDoNothing();
        for (const r of traffic.referrers) await db.insert(github_referrers).values({ account_id: account.id, repo_id: repo.repoId, repository_id: repositoryId, referrer: r.referrer, count: r.count, uniques: r.uniques, snapshot_date: today }).onConflictDoNothing();
        for (const p of traffic.paths) await db.insert(github_paths).values({ account_id: account.id, repo_id: repo.repoId, repository_id: repositoryId, path: p.path, title: p.title, count: p.count, uniques: p.uniques, snapshot_date: today }).onConflictDoNothing();
      } catch { void 0; }
    }
    logger.info("GitHub", "L2 @%s: telemetry (traffic) fetched for %d repos", account.screenName, repos.length);
  }
}
