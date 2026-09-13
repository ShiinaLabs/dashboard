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
    /** Per-endpoint failures. An empty list means "read fine, possibly no data". */
    errors: string[];
  }>;
}

export interface SyncTelemetryResult {
  /** Repositories the watchlist asked for. */
  repos: number;
  /** Repositories whose traffic could not be read, with the reason. */
  trafficFailures: Array<{ fullName: string; message: string }>;
}

export class SyncTelemetry {
  constructor(
    private repos: RepoRepository,
    private fetcher: FetcherPort,
    private githubClient?: GithubTelemetryClient,
  ) {}

  async execute(account: Account): Promise<SyncTelemetryResult> {
    const client = this.githubClient;
    if (!client) return { repos: 0, trafficFailures: [] };
    const events = await this.fetcher.fetchRepoMeta(account);
    const repos = events.map(e => e.repo);
    if (repos.length === 0) return { repos: 0, trafficFailures: [] };

    const token = (account as unknown as { authToken?: string }).authToken ?? undefined;
    const { getDb } = await import("../../db/connection");
    const { resolveGithubRepositoryId } = await import("../../repositories/github");
    const { github_traffic_clones, github_traffic_views, github_referrers, github_paths } = await import("@/db/schema");
    let db: ReturnType<typeof getDb>;
    try { db = getDb(); } catch { return { repos: repos.length, trafficFailures: [] }; }

    const today = new Date().toISOString().slice(0, 10);
    const logger = getLogger();
    const trafficFailures: SyncTelemetryResult["trafficFailures"] = [];
    let read = 0;

    for (const repo of repos) {
      // Everything for one repository stays inside this try. A repository whose
      // identity cannot be resolved, or whose traffic call blows up, must not
      // stop the remaining repositories from being collected — previously the
      // resolution happened outside the guard, so one bad repository silently
      // truncated the whole run and left a fixed subset of repositories stale.
      try {
        const repositoryId = await resolveGithubRepositoryId(account.id, repo.repoId);
        const traffic = await client.fetchRepoTraffic(repo.fullName, token);
        read++;
        // Empty arrays are normal (GitHub omits days with no traffic, and
        // returns no referrers at all for a quiet repository); only reported
        // endpoint failures are worth surfacing.
        if (traffic.errors.length > 0) {
          trafficFailures.push({ fullName: repo.fullName, message: traffic.errors.join("; ") });
          logger.warn("GitHub", "L2 traffic incomplete for %s: %s", repo.fullName, traffic.errors.join("; "));
        }
        for (const d of traffic.clones) await db.insert(github_traffic_clones).values({ account_id: account.id, repo_id: repo.repoId, repository_id: repositoryId, date: d.date, count: d.count, uniques: d.uniques }).onConflictDoNothing();
        for (const d of traffic.views) await db.insert(github_traffic_views).values({ account_id: account.id, repo_id: repo.repoId, repository_id: repositoryId, date: d.date, count: d.count, uniques: d.uniques }).onConflictDoNothing();
        for (const r of traffic.referrers) await db.insert(github_referrers).values({ account_id: account.id, repo_id: repo.repoId, repository_id: repositoryId, referrer: r.referrer, count: r.count, uniques: r.uniques, snapshot_date: today }).onConflictDoNothing();
        for (const p of traffic.paths) await db.insert(github_paths).values({ account_id: account.id, repo_id: repo.repoId, repository_id: repositoryId, path: p.path, title: p.title, count: p.count, uniques: p.uniques, snapshot_date: today }).onConflictDoNothing();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        trafficFailures.push({ fullName: repo.fullName, message });
        logger.warn("GitHub", "L2 traffic failed for %s: %s", repo.fullName, message);
      }
    }

    logger.info("GitHub", "L2 @%s: telemetry read for %d/%d repos (%d with traffic errors)", account.screenName, read, repos.length, trafficFailures.length);
    return { repos: repos.length, trafficFailures };
  }
}
