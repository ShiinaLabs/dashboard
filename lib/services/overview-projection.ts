import type { getFetchHealth } from "./fetch-health";
import type { getOverviewReadModel } from "./overview";

export type OverviewReadModel = Awaited<ReturnType<typeof getOverviewReadModel>>;
export type OverviewFetchHealthReadModel = Awaited<ReturnType<typeof getFetchHealth>>;

export function projectOverviewFetchHealth(health: OverviewFetchHealthReadModel) {
  return {
    summary: health.summary,
    unsupportedAccounts: health.unsupportedAccounts,
    issues: health.issues.slice(0, 5),
    issueCount: health.issues.length,
  };
}

export function projectOverviewGithub(readModel: OverviewReadModel) {
  return {
    followers: readModel.platforms.github.followers,
    itemCount: readModel.platforms.github.repositoryCount,
    stars: readModel.platforms.github.stars,
    forks: readModel.platforms.github.forks,
    pinned: readModel.platforms.github.pinnedRepositories,
  };
}

export function projectOverviewGitlab(readModel: OverviewReadModel) {
  return {
    followers: readModel.platforms.gitlab.followers,
    itemCount: readModel.platforms.gitlab.projectCount,
    stars: readModel.platforms.gitlab.stars,
    forks: readModel.platforms.gitlab.forks,
    pinned: readModel.platforms.gitlab.pinnedProjects,
  };
}

export function projectOverviewReddit(readModel: OverviewReadModel) {
  return readModel.platforms.reddit;
}

export function projectOverviewReadModel(readModel: OverviewReadModel) {
  const { platforms: _platforms, fetchHealth, ...page } = readModel;
  return {
    ...page,
    github: projectOverviewGithub(readModel),
    gitlab: projectOverviewGitlab(readModel),
    reddit: projectOverviewReddit(readModel),
    fetchHealth: projectOverviewFetchHealth(fetchHealth),
  };
}
