import { and, eq } from "drizzle-orm";
import { getDb } from "../db/connection";
import { github_repos, github_repository_tracking } from "@/db/schema";

export async function listGithubTrackedRepositories(accountId: number) {
  try {
    const rows = await getDb().select({
      repositoryId: github_repository_tracking.repository_id,
      githubId: github_repos.github_id,
      legacyRepoId: github_repos.repo_id,
      fullName: github_repos.full_name,
    }).from(github_repository_tracking)
      .innerJoin(github_repos, eq(github_repository_tracking.repository_id, github_repos.id))
      .where(and(
        eq(github_repository_tracking.account_id, accountId),
        eq(github_repository_tracking.enabled, 1),
      ));
    return rows
      .filter((row) => Number(row.githubId ?? row.legacyRepoId) > 0)
      .map((row) => ({
        repositoryId: row.repositoryId,
        githubId: Number(row.githubId ?? row.legacyRepoId),
        fullName: row.fullName,
      }));
  } catch {
    return [];
  }
}

export async function markGithubTrackingAccessOk(accountId: number, repositoryId: number) {
  try {
    await getDb().update(github_repository_tracking).set({
      last_access_ok_at: new Date().toISOString(),
      last_error: null,
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).where(and(
      eq(github_repository_tracking.account_id, accountId),
      eq(github_repository_tracking.repository_id, repositoryId),
    ));
  } catch {
    // Keep fetch compatibility while an older process is between schema steps.
  }
}

export async function markGithubTrackingError(accountId: number, repositoryId: number, message: string) {
  try {
    await getDb().update(github_repository_tracking).set({
      last_error: message.slice(0, 1000),
      updated_at: new Date().toISOString(),
    }).where(and(
      eq(github_repository_tracking.account_id, accountId),
      eq(github_repository_tracking.repository_id, repositoryId),
    ));
  } catch {
    // Keep fetch compatibility while an older process is between schema steps.
  }
}
