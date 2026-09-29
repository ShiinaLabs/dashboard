import * as repository from "@/lib/repositories/github";

/** Application-level GitHub read use cases. Route adapters retain HTTP parsing and account ownership checks. */
export const getGithubOverview = (...args: Parameters<typeof repository.getGithubOverview>) => repository.getGithubOverview(...args);
export const getGithubTimeline = (...args: Parameters<typeof repository.getGithubTimeline>) => repository.getGithubTimeline(...args);
export const getGithubContributions = (...args: Parameters<typeof repository.getGithubContributions>) => repository.getGithubContributions(...args);
export const getGithubRepoSnapshots = (...args: Parameters<typeof repository.getGithubRepoSnapshots>) => repository.getGithubRepoSnapshots(...args);
export const getGithubTrafficClones = (...args: Parameters<typeof repository.getGithubTrafficClones>) => repository.getGithubTrafficClones(...args);
export const getGithubTrafficViews = (...args: Parameters<typeof repository.getGithubTrafficViews>) => repository.getGithubTrafficViews(...args);
export const getGithubReferrers = (...args: Parameters<typeof repository.getGithubReferrers>) => repository.getGithubReferrers(...args);
export const getGithubReferrerHistory = (...args: Parameters<typeof repository.getGithubReferrerHistory>) => repository.getGithubReferrerHistory(...args);
export const getGithubPaths = (...args: Parameters<typeof repository.getGithubPaths>) => repository.getGithubPaths(...args);
export const getGithubPathHistory = (...args: Parameters<typeof repository.getGithubPathHistory>) => repository.getGithubPathHistory(...args);
export const getGithubReleases = (...args: Parameters<typeof repository.getGithubReleases>) => repository.getGithubReleases(...args);
export const getGithubReleaseAssets = (...args: Parameters<typeof repository.getGithubReleaseAssets>) => repository.getGithubReleaseAssets(...args);
export const getGithubReleaseDownloadTimeline = (...args: Parameters<typeof repository.getGithubReleaseDownloadTimeline>) => repository.getGithubReleaseDownloadTimeline(...args);
export const setPinnedRepos = (...args: Parameters<typeof repository.setPinnedRepos>) => repository.setPinnedRepos(...args);
