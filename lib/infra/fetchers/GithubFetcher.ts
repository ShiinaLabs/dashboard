import type { Account } from "../../domain/account";
import type { GithubTrackedRepository } from "../../domain/github-source";
import type { FetcherPort, RepoFetchedEvent } from "../../domain/ports";
import { toRepo } from "./GithubMapper";
import { getLogger } from "../../logger";

/**
 * Only the stable-id lookup is required. Discovery is deliberately NOT part of
 * the fetch pipeline: what gets fetched is exactly the watchlist, and candidate
 * repositories are listed on demand by the watchlist UI.
 */
interface RepoClient {
  fetchRepositoryById(githubId: number, token?: string): Promise<Record<string, unknown>>;
}

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
    private trackingProvider: TrackingProvider = async () => [],
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
    logger.info("GitHub", "Fetching tracked repos for @%s (token=%s)", account.screenName, token ? "set" : "NONE");

    const tracked = await this.trackingProvider(account);
    // An empty watchlist means an empty run, NOT a discovery sweep. Everything
    // is tracked only because the user selected it, so "nothing selected" must
    // fetch nothing.
    if (tracked.length === 0) {
      logger.info("GitHub", "@%s: no tracked repositories; nothing to fetch", account.screenName);
      return [];
    }

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

    logger.info("GitHub", "@%s: fetched %d tracked repos", account.screenName, resolved.length);
    return resolved.map(raw => ({
      type: "RepoMetaFetched" as const,
      repo: toRepo(raw as Record<string, unknown>, account.id),
    }));
  }
}
