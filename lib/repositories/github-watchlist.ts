import { and, asc, eq, inArray, notInArray, sql, type SQL } from "drizzle-orm";
import { getDb } from "../db/connection";
import { github_repos, github_repository_tracking } from "@/db/schema";

export interface GithubWatchlistRow {
  /**
   * `github_repos.id` — the local serial that
   * `github_repository_tracking.repository_id` references, and therefore the id
   * that read/write of the watchlist must use. Note this is NOT `repo_id`
   * (which holds the GitHub repository id, and which the pin route uses).
   */
  githubReposId: number;
  /** Stable GitHub repository id. */
  githubId: number | null;
  fullName: string;
  ownerLogin: string | null;
  ownerType: string | null;
  enabled: boolean;
  lastError: string | null;
}

/**
 * Every tracked repository for the account, enabled or not.
 *
 * Disabled rows are included on purpose: they are the user's previous selection
 * and must stay visible so they can be re-selected. Nothing here is ever
 * deleted, so history (snapshots, traffic, releases) survives.
 */
export async function listGithubWatchlist(accountId: number): Promise<GithubWatchlistRow[]> {
  const rows = await getDb().select({
    githubReposId: github_repos.id,
    githubId: github_repos.github_id,
    legacyRepoId: github_repos.repo_id,
    fullName: github_repos.full_name,
    ownerLogin: github_repos.owner_login,
    ownerType: github_repos.owner_type,
    enabled: github_repository_tracking.enabled,
    lastError: github_repository_tracking.last_error,
  }).from(github_repository_tracking)
    .innerJoin(github_repos, eq(github_repository_tracking.repository_id, github_repos.id))
    .where(eq(github_repository_tracking.account_id, accountId))
    .orderBy(asc(github_repos.full_name));
  return rows.map((row) => ({
    githubReposId: row.githubReposId,
    githubId: row.githubId ?? row.legacyRepoId ?? null,
    fullName: row.fullName,
    ownerLogin: row.ownerLogin ?? null,
    ownerType: row.ownerType ?? null,
    enabled: row.enabled === 1,
    lastError: row.lastError ?? null,
  }));
}

/**
 * Make the monitored set exactly `watchedGithubReposIds` (values of
 * `github_repos.id`). Everything else the account tracks is disabled.
 *
 * Rows are only ever flipped, never deleted: unselecting a repository stops it
 * being fetched, and re-selecting it resumes with its history intact. The
 * effect is immediate because every read path and the fetch pipeline filter on
 * `enabled = 1`.
 */
export async function setGithubWatchlist(accountId: number, watchedGithubReposIds: number[]): Promise<void> {
  const db = getDb();
  const scope = eq(github_repository_tracking.account_id, accountId);
  const now = new Date().toISOString();
  await db.update(github_repository_tracking)
    .set({ enabled: 0, updated_at: now })
    .where(watchedGithubReposIds.length > 0
      ? and(scope, notInArray(github_repository_tracking.repository_id, watchedGithubReposIds))
      : scope);
  if (watchedGithubReposIds.length > 0) {
    await db.update(github_repository_tracking)
      .set({ enabled: 1, updated_at: now })
      .where(and(scope, inArray(github_repository_tracking.repository_id, watchedGithubReposIds)));
  }
}

/**
 * `github_repos.id` values the given accounts still monitor.
 *
 * This is the single place the "only what the user selected counts" rule is
 * applied to surfaces that read `github_repos` directly (pulse, top content, AI
 * analysis). Without it an unselected repository keeps appearing there, which
 * makes unselecting look broken.
 */
export async function listGithubWatchedRepoIds(accountIds: number[]): Promise<number[]> {
  if (accountIds.length === 0) return [];
  const rows = await getDb().select({ id: github_repos.id })
    .from(github_repository_tracking)
    .innerJoin(github_repos, eq(github_repository_tracking.repository_id, github_repos.id))
    .where(and(
      inArray(github_repository_tracking.account_id, accountIds),
      eq(github_repository_tracking.enabled, 1),
    ));
  return rows.map((row) => row.id);
}

/**
 * WHERE condition selecting only monitored repositories of the given accounts.
 *
 * Use this INSTEAD of `inArray(github_repos.account_id, accountIds)` on every
 * surface that reads `github_repos`. An empty selection matches nothing: an
 * empty IN list is not valid SQL, so it degrades to FALSE.
 */
export async function githubWatchedReposFilter(accountIds: number[]): Promise<SQL<unknown>> {
  if (accountIds.length === 0) return sql`FALSE`;
  const watchedIds = await listGithubWatchedRepoIds(accountIds);
  if (watchedIds.length === 0) return sql`FALSE`;
  return and(
    inArray(github_repos.account_id, accountIds),
    inArray(github_repos.id, watchedIds),
  ) ?? sql`FALSE`;
}
