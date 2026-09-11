// @ts-nocheck — compatibility repository helpers intentionally accept rows
// from databases that may be one bootstrap step behind.
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../db/connection";
import { github_repos, github_repository_tracking, github_sources } from "@/db/schema";
import type { GithubSource } from "../domain/github-source";

export async function listGithubSources(accountId: number): Promise<GithubSource[]> {
  try {
    const rows = await getDb().select({
      kind: github_sources.source_type,
      login: github_sources.login,
    }).from(github_sources)
      .where(and(eq(github_sources.account_id, accountId), eq(github_sources.enabled, 1)))
      .orderBy(asc(github_sources.id));
    return rows
      .filter((row) => row.kind === "user" || row.kind === "organization")
      .map((row) => ({ kind: row.kind as GithubSource["kind"], login: row.login }));
  } catch {
    // Existing installations can enter this code path before the additive
    // bootstrap has run. The caller falls back to PAT user discovery.
    return [];
  }
}

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

export async function upsertGithubSource(source: {
  account_id: number;
  source_type: "user" | "organization";
  login: string;
  github_id?: number | null;
  node_id?: string | null;
}) {
  await getDb().insert(github_sources).values({
    ...source,
    enabled: 1,
    updated_at: new Date().toISOString(),
  }).onConflictDoUpdate({
    target: [github_sources.account_id, github_sources.source_type, github_sources.login],
    set: {
      github_id: source.github_id ?? null,
      node_id: source.node_id ?? null,
      enabled: 1,
      updated_at: new Date().toISOString(),
    },
  });
}
