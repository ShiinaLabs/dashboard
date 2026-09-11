import type { Account } from "../../domain/account";
import type { GithubSource, GithubTrackedRepository } from "../../domain/github-source";
import type { FetcherPort, RepoFetchedEvent } from "../../domain/ports";
import { toRepo } from "./GithubMapper";
import { getLogger } from "../../logger";

// Accepts any client exposing fetchAllRepos (real GithubClient or MockGithubClient)
interface RepoClient {
  fetchAllRepos(source: GithubSource | string, token?: string): Promise<unknown[]>;
  fetchRepositoryById?(githubId: number, token?: string): Promise<Record<string, unknown>>;
}

type SourceProvider = (account: Account) => Promise<GithubSource[]>;
type TrackingProvider = (account: Account) => Promise<GithubTrackedRepository[]>;

/** Outcome of one fetchRepoMeta call for an explicitly tracked repository. */
export interface GithubFetchDiagnostics {
  trackedTotal: number;
  failed: number;
  failures: Array<{ repositoryId: number; fullName: string; message: string }>;
}

export class GithubFetcher implements FetcherPort {
  private diagnostics: GithubFetchDiagnostics = { trackedTotal: 0, failed: 0, failures: [] };

  constructor(
    private client: RepoClient,
    private sourceProvider: SourceProvider = async (account) => [{ kind: "user", login: account.screenName }],
    private trackingProvider: TrackingProvider = async () => [],
    private discoverNewRepositories = false,
  ) {}

  /**
   * Per-repository outcome of the most recent fetchRepoMeta call. A tracked
   * repository that cannot be read is skipped instead of failing the run, so
   * callers must read this to report the gap; otherwise a lost permission
   * would look like a clean success with a shorter repo list.
   */
  getLastFetchDiagnostics(): GithubFetchDiagnostics {
    return this.diagnostics;
  }

  async fetchRepoMeta(account: Account): Promise<RepoFetchedEvent[]> {
    const logger = getLogger();
    this.diagnostics = { trackedTotal: 0, failed: 0, failures: [] };
    const token = (account as unknown as {authToken?: string; auth_token?: string}).authToken ?? (account as unknown as {authToken?: string; auth_token?: string}).auth_token ?? undefined;
    logger.info("GitHub", "Fetching tracked/discovered repos for @%s (token=%s)", account.screenName, token ? "set" : "NONE");
    let raws: unknown[];
    try {
      const tracked = await this.trackingProvider(account);
      if (tracked.length > 0 && this.client.fetchRepositoryById) {
        const resolved: unknown[] = [];
        const failures: GithubFetchDiagnostics["failures"] = [];
        for (const repository of tracked) {
          let accessOk = false;
          try {
            const raw = await this.client.fetchRepositoryById(repository.githubId, token);
            if (raw.id !== repository.githubId) throw new Error("GitHub repository identity mismatch");
            resolved.push(raw);
            accessOk = true;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            failures.push({ repositoryId: repository.repositoryId, fullName: repository.fullName, message });
            // A permission loss must not delete the tracking relation or any
            // history, and must not discard the repositories that could still
            // be read. Skip only this one and record it; the caller reports the
            // gap via getLastFetchDiagnostics() instead of losing the whole run.
            logger.warn("GitHub", "Repository %s could not be resolved: %s", repository.fullName, message);
            const { markGithubTrackingError } = await import("../../repositories/github-sources");
            await markGithubTrackingError(account.id, repository.repositoryId, message);
          }
          if (accessOk) {
            const { markGithubTrackingAccessOk } = await import("../../repositories/github-sources");
            await markGithubTrackingAccessOk(account.id, repository.repositoryId);
          }
        }
        this.diagnostics = { trackedTotal: tracked.length, failed: failures.length, failures };
        // Resolving nothing means the credential itself is unusable; an empty
        // list must not be reported as a clean success.
        if (failures.length === tracked.length) {
          throw new Error(`Unable to resolve ${failures.length} of ${tracked.length} tracked GitHub repositories`);
        }
        raws = resolved;
      } else {
        raws = [];
      }
      if (tracked.length === 0 || this.discoverNewRepositories) {
        const sources = await this.sourceProvider(account);
        const discovered = await Promise.all(sources.map(source => this.client.fetchAllRepos(source, token)));
        // `/user/repos` and an explicit org source can overlap. Deduplicate by
        // stable GitHub id before writes so discovery never creates duplicate
        // events for the same repository.
        const byId = new Map<number, unknown>();
        for (const raw of [...raws, ...discovered.flat()]) {
          const id = (raw as Record<string, unknown> | null)?.id;
          if (typeof id === "number") byId.set(id, raw);
        }
        raws = [...byId.values()];
      }
    } catch (e) {
      logger.warn("GitHub", "@%s: fetchAllRepos failed: %s", account.screenName, e instanceof Error ? e.message : String(e));
      throw e;
    }
    logger.info("GitHub", "@%s: fetched %d raw repos", account.screenName, raws.length);
    return raws.map(raw => ({
      type: "RepoMetaFetched" as const,
      repo: toRepo(raw as Record<string, unknown>, account.id),
    }));
  }
}
