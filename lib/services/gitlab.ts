import * as repository from "@/lib/repositories/gitlab";

/** Application-level GitLab query and pinning use cases. HTTP parsing and ownership checks stay in route adapters. */
export const getGitlabOverview = (...args: Parameters<typeof repository.getGitlabOverview>) => repository.getGitlabOverview(...args);
export const getGitlabOverviewSummary = (...args: Parameters<typeof repository.getGitlabOverviewSummary>) => repository.getGitlabOverviewSummary(...args);
export const getGitlabTimeline = (...args: Parameters<typeof repository.getGitlabTimeline>) => repository.getGitlabTimeline(...args);
export const getGitlabContributions = (...args: Parameters<typeof repository.getGitlabContributions>) => repository.getGitlabContributions(...args);
export const getGitlabProjectSnapshots = (...args: Parameters<typeof repository.getGitlabProjectSnapshots>) => repository.getGitlabProjectSnapshots(...args);
export const getGitlabReleases = (...args: Parameters<typeof repository.getGitlabReleases>) => repository.getGitlabReleases(...args);
export const setPinnedGitlabProjects = (...args: Parameters<typeof repository.setPinnedGitlabProjects>) => repository.setPinnedGitlabProjects(...args);
