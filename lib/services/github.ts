import * as repository from "@/lib/repositories/github";
import { getAccountByIdWithCredential } from "@/lib/services/accounts";

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

export type GithubAvailableOrgsResult =
  | { status: "ok"; orgs: { login: string; githubId: number | null; nodeId: string | null }[]; unavailable: string | null }
  | { status: "not-found" }
  | { status: "credential-error" };

/** Load a GitHub account credential and enumerate organizations for its PAT. */
export async function getGithubAvailableOrgs(accountId: number): Promise<GithubAvailableOrgsResult> {
  let account;
  try {
    account = await getAccountByIdWithCredential(accountId);
  } catch {
    return { status: "credential-error" };
  }
  if (!account) return { status: "not-found" };

  try {
    const { GithubClient } = await import("@/lib/infra/fetchers/GithubClient");
    const rawOrgs = await new GithubClient().fetchAuthenticatedOrgs(account.auth_token);
    const orgs = rawOrgs
      .map((raw) => {
        const org = raw as { login?: unknown; id?: unknown; node_id?: unknown };
        return typeof org?.login === "string"
          ? { login: org.login, githubId: typeof org.id === "number" ? org.id : null, nodeId: typeof org.node_id === "string" ? org.node_id : null }
          : null;
      })
      .filter((org): org is NonNullable<typeof org> => org !== null);
    return { status: "ok", orgs, unavailable: null };
  } catch (error) {
    return { status: "ok", orgs: [], unavailable: error instanceof Error ? error.message : String(error) };
  }
}
