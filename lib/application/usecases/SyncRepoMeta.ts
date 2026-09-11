// L0 24h — static repo metadata only (name/full_name/lang/desc/topics/homepage/is_fork/visibility)
// stars/forks/issues/PRs/downloads are L1 timely (90m), NOT here
import type { RepoRepository, FetcherPort, Clock } from "../../domain/ports";
import type { Account } from "../../domain/account";
import { getLogger } from "../../logger";

export class SyncRepoMeta {
  constructor(
    private repos: RepoRepository,
    private fetcher: FetcherPort,
    private clock: Clock = { now: () => new Date() },
  ) {}

  async execute(account: Account): Promise<void> {
    const events = await this.fetcher.fetchRepoMeta(account);
    // L0 only cares about static identity fields; stars/forks are handled by L1
    const staticRepos = events.map((e) => ({
      accountId: e.repo.accountId,
      repoId: e.repo.repoId,
      githubId: e.repo.githubId,
      nodeId: e.repo.nodeId,
      instance: e.repo.instance,
      ownerGithubId: e.repo.ownerGithubId,
      ownerNodeId: e.repo.ownerNodeId,
      ownerLogin: e.repo.ownerLogin,
      ownerType: e.repo.ownerType,
      htmlUrl: e.repo.htmlUrl,
      isPrivate: e.repo.isPrivate,
      isArchived: e.repo.isArchived,
      defaultBranch: e.repo.defaultBranch,
      name: e.repo.name,
      fullName: e.repo.fullName,
      language: e.repo.language,
      description: e.repo.description,
      homepage: e.repo.homepage,
      topics: e.repo.topics,
      isFork: e.repo.isFork,
    }));
    // Upsert static columns only — do not overwrite stars/forks/issues
    await this.repos.upsertRepos(staticRepos as unknown as import("../../domain/repo").Repo[]);
    getLogger().info("GitHub", "L0 @%s: upsert %d static repos (is_fork self-heal)", account.screenName, staticRepos.length);
  }
}
