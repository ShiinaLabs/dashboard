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

export class GithubFetcher implements FetcherPort {
  constructor(
    private client: RepoClient,
    private sourceProvider: SourceProvider = async (account) => [{ kind: "user", login: account.screenName }],
    private trackingProvider: TrackingProvider = async () => [],
    private discoverNewRepositories = false,
  ) {}

  async fetchRepoMeta(account: Account): Promise<RepoFetchedEvent[]> {
    const logger = getLogger();
    const token = (account as unknown as {authToken?: string; auth_token?: string}).authToken ?? (account as unknown as {authToken?: string; auth_token?: string}).auth_token ?? undefined;
    logger.info("GitHub", "Fetching tracked/discovered repos for @%s (token=%s)", account.screenName, token ? "set" : "NONE");
    let raws: unknown[];
    try {
      const tracked = await this.trackingProvider(account);
      if (tracked.length > 0 && this.client.fetchRepositoryById) {
        const resolved: unknown[] = [];
        let failures = 0;
        for (const repository of tracked) {
          let accessOk = false;
          try {
            const raw = await this.client.fetchRepositoryById(repository.githubId, token);
            if (raw.id !== repository.githubId) throw new Error("GitHub repository identity mismatch");
            resolved.push(raw);
            accessOk = true;
          } catch (error) {
            failures++;
            // A permission loss must not delete the tracking relation or any
            // history. Skip only this repository and let the run report the
            // remaining repositories it could still read.
            logger.warn("GitHub", "Repository %s could not be resolved: %s", repository.fullName, error instanceof Error ? error.message : String(error));
            const { markGithubTrackingError } = await import("../../repositories/github-sources");
            await markGithubTrackingError(account.id, repository.repositoryId, error instanceof Error ? error.message : String(error));
          }
          if (accessOk) {
            const { markGithubTrackingAccessOk } = await import("../../repositories/github-sources");
            await markGithubTrackingAccessOk(account.id, repository.repositoryId);
          }
        }
        if (failures > 0) {
          throw new Error(`Unable to resolve ${failures} of ${tracked.length} tracked GitHub repositories`);
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
