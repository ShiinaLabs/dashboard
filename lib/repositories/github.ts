// @ts-nocheck — Drizzle ORM types are complex
import { eq, and, or, desc, sql, inArray, gte, type SQL } from "drizzle-orm";
import { getDb } from "../db/connection";
import { latestSnapshotRows } from "../utils/latest-snapshot";
import { computeReleaseDownloadTimeline, type DownloadSnapshot } from "../utils/download-growth";
import { isMockMode } from "../config";
import * as mock from "../mock";
import {
  github_stats, github_repos, github_contributions,
  github_repo_snapshots, github_traffic_clones, github_traffic_views,
  github_referrers, github_paths, github_releases, github_release_assets,
  github_release_asset_snapshots,
  github_repository_tracking,
} from "@/db/schema";


export async function getGithubOverview(accountId: number) {
  if (isMockMode()) return mock.githubOverview;
  const [latest] = await getDb().select().from(github_stats)
    .where(eq(github_stats.account_id, accountId))
    .orderBy(desc(github_stats.recorded_at)).limit(1);
  let allRepos = [] as Awaited<ReturnType<typeof getDb>["select"]>;
  try {
    const tracked = await getDb().select({ repo: github_repos, pinned: github_repository_tracking.pinned })
      .from(github_repository_tracking)
      .innerJoin(github_repos, eq(github_repository_tracking.repository_id, github_repos.id))
      .where(and(eq(github_repository_tracking.account_id, accountId), eq(github_repository_tracking.enabled, 1)))
      .orderBy(desc(github_repos.stars));
    // The legacy query is a compatibility fallback for a database that has not
    // run the additive tracking backfill yet. An account that HAS tracking rows
    // but none enabled has simply selected nothing to monitor, and must show an
    // empty list rather than every repository it ever saw.
    allRepos = tracked.length > 0 || await hasGithubTrackingRelation(accountId)
      ? tracked.map(({ repo, pinned }) => ({ ...repo, pinned }))
      : await getDb().select().from(github_repos).where(eq(github_repos.account_id, accountId)).orderBy(desc(github_repos.stars));
  } catch {
    allRepos = await getDb().select().from(github_repos)
      .where(eq(github_repos.account_id, accountId)).orderBy(desc(github_repos.stars));
  }
  const pinnedRepos = allRepos.filter(r => r.pinned);
  const repos = pinnedRepos.length > 0 ? pinnedRepos : allRepos;
  const totalStars = allRepos.reduce((s, r) => s + (r.stars ?? 0), 0);
  const totalForks = allRepos.reduce((s, r) => s + (r.forks ?? 0), 0);
  const languages = allRepos.filter(r => r.language).reduce((acc: Record<string, number>, r) => { acc[r.language!] = (acc[r.language!] || 0) + 1; return acc; }, {});
  const topRepos = [...allRepos].sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0)).slice(0, 10);
  return { stats: latest, repos, allRepos, totalStars, totalForks, totalRepos: allRepos.length, languages, topRepos };
}

export async function getGithubTimeline(accountId: number, days = 30) {
  if (isMockMode()) return mock.githubTimeline;
  const since = new Date(); since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString();
  const { rows } = await getDb().execute<{
    date: string;
    public_repos: number;
    followers: number;
    following: number;
  }>(sql`SELECT DISTINCT ON (SUBSTRING(${github_stats.recorded_at}, 1, 10))
    SUBSTRING(${github_stats.recorded_at}, 1, 10) AS date,
    ${github_stats.public_repos},
    ${github_stats.followers},
    ${github_stats.following}
  FROM ${github_stats}
  WHERE ${github_stats.account_id} = ${accountId}
    AND ${github_stats.recorded_at} >= ${sinceStr}
  ORDER BY SUBSTRING(${github_stats.recorded_at}, 1, 10), ${github_stats.recorded_at} DESC`);
  return rows;
}

export async function getGithubContributions(accountId: number, yr?: number) {
  if (isMockMode()) return mock.githubContributions;
  const conditions: SQL<unknown>[] = [eq(github_contributions.account_id, accountId)];
  if (yr) conditions.push(sql`EXTRACT(YEAR FROM ${github_contributions.date}) = ${String(yr)}`);
  return getDb().select().from(github_contributions).where(and(...conditions)).orderBy(github_contributions.date);
}

/**
 * Whether the account has any tracking rows at all, enabled or not. This is
 * what tells "the user selected nothing to monitor" (show nothing) apart from
 * "this database predates the additive tracking backfill" (legacy fallback).
 */
export async function hasGithubTrackingRelation(accountId: number, db = getDb()): Promise<boolean> {
  const [row] = await db.select({ id: github_repository_tracking.id })
    .from(github_repository_tracking)
    .where(eq(github_repository_tracking.account_id, accountId))
    .limit(1);
  return Boolean(row);
}

export async function upsertGithubRepo(value: Parameters<typeof upsertGithubRepoLocked>[0]) {
  return getDb().transaction(async (tx) => {
    // Serialize all writers of the same GitHub repository across processes.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(74219, hashtext(${String(value.repo_id)}))`);
    return upsertGithubRepoLocked(value, tx);
  });
}

async function upsertGithubRepoLocked(repo: { account_id: number; repo_id: number; github_id?: number | null; node_id?: string | null; instance?: string; owner_github_id?: number | null; owner_node_id?: string | null; owner_login?: string | null; owner_type?: string | null; html_url?: string | null; is_private?: number | null; is_archived?: number | null; default_branch?: string | null; name: string; full_name: string; description: string | null; language: string | null; stars: number; forks: number; open_issues: number; open_issues_only?: number | null; open_pull_requests?: number | null; topics: string; homepage: string | null; is_fork: number; created_at: string | null; updated_at: string | null; pushed_at: string | null }, db: ReturnType<typeof getDb>) {
  const identity = repo.github_id ?? repo.repo_id;
  const instance = repo.instance ?? "github.com";

  // Prefer the stable GitHub identity when it is available. This lets a
  // second PAT track the same repository without creating a second repository
  // row, while the old account/repo conflict key remains as a compatibility
  // fallback for rows not yet backfilled.
  const [canonical] = await db.select({ id: github_repos.id, pinned: github_repos.pinned })
    .from(github_repos)
    .where(and(eq(github_repos.instance, instance), eq(github_repos.github_id, identity)))
    .limit(1);
  if (canonical) {
    await db.update(github_repos).set({
      github_id: identity,
      node_id: repo.node_id ?? null,
      instance,
      owner_github_id: repo.owner_github_id ?? null,
      owner_node_id: repo.owner_node_id ?? null,
      owner_login: repo.owner_login ?? null,
      owner_type: repo.owner_type ?? null,
      html_url: repo.html_url ?? null,
      is_private: repo.is_private ?? 0,
      is_archived: repo.is_archived ?? 0,
      default_branch: repo.default_branch ?? null,
      name: repo.name, full_name: repo.full_name, stars: repo.stars, forks: repo.forks,
      open_issues: repo.open_issues, open_issues_only: repo.open_issues_only ?? null,
      open_pull_requests: repo.open_pull_requests ?? null, topics: repo.topics,
      language: repo.language, description: repo.description, homepage: repo.homepage,
      is_fork: repo.is_fork, pushed_at: repo.pushed_at, updated_at: repo.updated_at,
      fetched_at: sql`NOW()`,
    }).where(eq(github_repos.id, canonical.id));
    await ensureGithubRepositoryTracking(repo.account_id, canonical.id, canonical.pinned ?? 0, db);
    return;
  }

  await db.insert(github_repos).values({
    ...repo,
    github_id: identity,
    instance,
    fetched_at: sql`NOW()`,
  }).onConflictDoUpdate({
    target: [github_repos.account_id, github_repos.repo_id],
    set: { github_id: identity, node_id: repo.node_id ?? null, instance, owner_github_id: repo.owner_github_id ?? null, owner_node_id: repo.owner_node_id ?? null, owner_login: repo.owner_login ?? null, owner_type: repo.owner_type ?? null, html_url: repo.html_url ?? null, is_private: repo.is_private ?? 0, is_archived: repo.is_archived ?? 0, default_branch: repo.default_branch ?? null, name: repo.name, full_name: repo.full_name, stars: repo.stars, forks: repo.forks, open_issues: repo.open_issues, open_issues_only: repo.open_issues_only ?? null, open_pull_requests: repo.open_pull_requests ?? null, topics: repo.topics, language: repo.language, description: repo.description, homepage: repo.homepage, is_fork: repo.is_fork, pushed_at: repo.pushed_at, updated_at: repo.updated_at, fetched_at: sql`NOW()` },
  });
  const [row] = await db.select({ id: github_repos.id, pinned: github_repos.pinned })
    .from(github_repos)
    .where(and(eq(github_repos.account_id, repo.account_id), eq(github_repos.repo_id, repo.repo_id)))
    .limit(1);
  await ensureGithubRepositoryTracking(repo.account_id, row?.id, row?.pinned ?? 0, db);
}

async function ensureGithubRepositoryTracking(accountId: number, repositoryId: number | undefined, pinned: number, db = getDb()) {
  if (!repositoryId) return;
  try {
    const { github_repository_tracking } = await import("@/db/schema");
    await db.insert(github_repository_tracking).values({
      account_id: accountId,
      repository_id: repositoryId,
      enabled: 1,
      pinned: pinned ? 1 : 0,
      last_seen_at: sql`NOW()`,
      updated_at: sql`NOW()`,
    }).onConflictDoUpdate({
      target: [github_repository_tracking.account_id, github_repository_tracking.repository_id],
      set: { last_seen_at: sql`NOW()`, updated_at: sql`NOW()` },
    });
  } catch {
    // The table is created by additive bootstrap. Keep old deployments
    // writable if they are running one process before the bootstrap cycle.
  }
}

export async function setPinnedRepos(accountId: number, repoIds: number[]) {
  if (isMockMode()) return;
  const db = getDb();
  try {
    await db.execute(sql`UPDATE ${github_repository_tracking} SET pinned = 0, updated_at = NOW() WHERE account_id = ${accountId}`);
    if (repoIds.length > 0) {
      await db.execute(sql`UPDATE ${github_repository_tracking} t
        SET pinned = 1, updated_at = NOW()
        FROM ${github_repos} r
        WHERE t.repository_id = r.id
          AND t.account_id = ${accountId}
          AND r.repo_id IN (${sql.join(repoIds.map(id => sql`${id}`), sql`, `)})`);
    }
  } catch {
    // Legacy installations have no tracking table until bootstrap completes.
  }
  await db.update(github_repos).set({ pinned: 0 }).where(eq(github_repos.account_id, accountId));
  if (repoIds.length > 0) {
    await db.update(github_repos).set({ pinned: 1 })
      .where(and(eq(github_repos.account_id, accountId), sql`repo_id IN (${sql.join(repoIds.map(id => sql`${id}`), sql`, `)})`));
  }
}

export async function insertGithubStats(stats: { account_id: number; public_repos: number; public_gists: number; followers: number; following: number }) {
  await getDb().insert(github_stats).values({ ...stats, recorded_at: sql`NOW()` });
}

/** Resolve the local stable repository row while old account/repo columns are
 * still present. The lookup intentionally accepts both keys so dual-write is
 * safe before and after the identity backfill. */
export async function resolveGithubRepositoryId(accountId: number, repoId: number, db = getDb()): Promise<number | null> {
    const [row] = await db.select({ id: github_repos.id }).from(github_repos)
      .where(and(
        eq(github_repos.instance, "github.com"),
        eq(github_repos.repo_id, repoId),
        or(
          eq(github_repos.account_id, accountId),
          sql`EXISTS (SELECT 1 FROM ${github_repository_tracking} t WHERE t.repository_id = ${github_repos.id} AND t.account_id = ${accountId} AND t.enabled = 1)`,
        ),
      )).limit(1);
    return row?.id ?? null;
}

// During backfill, a repository can have both migrated and legacy history.
// Keep legacy rows visible, but only within the original account and repo.
function githubHistoryIdentity(table, repositoryId: number | null, accountId: number, repoId: number) {
  const legacy = and(eq(table.account_id, accountId), eq(table.repo_id, repoId));
  return repositoryId === null ? legacy : or(
    eq(table.repository_id, repositoryId),
    and(sql`${table.repository_id} IS NULL`, legacy),
  );
}

export async function upsertGithubContribution(c: { account_id: number; date: string; count: number; level: number }) {
  await getDb().insert(github_contributions).values({ ...c, fetched_at: sql`NOW()` }).onConflictDoUpdate({
    target: [github_contributions.account_id, github_contributions.date],
    set: { count: c.count, level: c.level },
  });
}

export async function upsertGithubContributions(accountId: number, contributions: { date: string; count: number; level: number }[]) {
  if (contributions.length === 0) return;
  await getDb().insert(github_contributions).values(
    contributions.map(c => ({ ...c, account_id: accountId, fetched_at: sql`NOW()` })),
  ).onConflictDoUpdate({
    target: [github_contributions.account_id, github_contributions.date],
    set: { count: sql.raw("excluded.count"), level: sql.raw("excluded.level") },
  });
}

export async function upsertGithubRepoSnapshot(value: Parameters<typeof upsertGithubRepoSnapshotLocked>[0]) {
  return getDb().transaction(async (tx) => {
    // Serialize all writers of the same GitHub repository across processes.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(74219, hashtext(${String(value.repo_id)}))`);
    return upsertGithubRepoSnapshotLocked(value, tx);
  });
}

async function upsertGithubRepoSnapshotLocked(s: { account_id: number; repo_id: number; repository_id?: number | null; stars: number; forks: number; open_issues: number; open_issues_only?: number | null; open_pull_requests?: number | null; snapshot_date: string }, db: ReturnType<typeof getDb>) {
  const repository_id = s.repository_id ?? await resolveGithubRepositoryId(s.account_id, s.repo_id, db);
  if (repository_id) {
    const [existing] = await db.select({ id: github_repo_snapshots.id }).from(github_repo_snapshots)
      .where(and(eq(github_repo_snapshots.repository_id, repository_id), eq(github_repo_snapshots.snapshot_date, s.snapshot_date))).limit(1);
    if (existing) {
      await db.update(github_repo_snapshots).set({ repository_id, stars: s.stars, forks: s.forks, open_issues: s.open_issues, open_issues_only: s.open_issues_only ?? null, open_pull_requests: s.open_pull_requests ?? null })
        .where(eq(github_repo_snapshots.id, existing.id));
      return;
    }
  }
  await db.insert(github_repo_snapshots).values({ ...s, repository_id }).onConflictDoUpdate({
    target: [github_repo_snapshots.account_id, github_repo_snapshots.repo_id, github_repo_snapshots.snapshot_date],
    set: { repository_id, stars: s.stars, forks: s.forks, open_issues: s.open_issues, open_issues_only: s.open_issues_only ?? null, open_pull_requests: s.open_pull_requests ?? null },
  });
}

export async function getGithubRepoSnapshots(accountId: number, repoId: number, days = 30) {
  if (isMockMode()) return mock.githubSnapshots;
  const since = new Date(); since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString();
  const repositoryId = await resolveGithubRepositoryId(accountId, repoId);
  const identity = githubHistoryIdentity(github_repo_snapshots, repositoryId, accountId, repoId);
  return getDb().select({
    stars: github_repo_snapshots.stars, forks: github_repo_snapshots.forks,
    open_issues: github_repo_snapshots.open_issues,
    open_issues_only: github_repo_snapshots.open_issues_only,
    open_pull_requests: github_repo_snapshots.open_pull_requests,
    date: github_repo_snapshots.snapshot_date,
  }).from(github_repo_snapshots)
    .where(and(identity, gte(github_repo_snapshots.snapshot_date, sinceStr)))
    .orderBy(github_repo_snapshots.snapshot_date);
}

export async function upsertGithubTrafficClones(value: Parameters<typeof upsertGithubTrafficClonesLocked>[0]) {
  return getDb().transaction(async (tx) => {
    // Serialize all writers of the same GitHub repository across processes.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(74219, hashtext(${String(value.repo_id)}))`);
    return upsertGithubTrafficClonesLocked(value, tx);
  });
}

async function upsertGithubTrafficClonesLocked(t: { account_id: number; repo_id: number; repository_id?: number | null; date: string; count: number; uniques: number }, db: ReturnType<typeof getDb>) {
  const repository_id = t.repository_id ?? await resolveGithubRepositoryId(t.account_id, t.repo_id, db);
  if (repository_id) {
    const [existing] = await db.select({ id: github_traffic_clones.id }).from(github_traffic_clones)
      .where(and(eq(github_traffic_clones.repository_id, repository_id), eq(github_traffic_clones.date, t.date))).limit(1);
    if (existing) {
      await db.update(github_traffic_clones).set({ repository_id, count: t.count, uniques: t.uniques }).where(eq(github_traffic_clones.id, existing.id));
      return;
    }
  }
  await db.insert(github_traffic_clones).values({ ...t, repository_id }).onConflictDoUpdate({
    target: [github_traffic_clones.account_id, github_traffic_clones.repo_id, github_traffic_clones.date],
    set: { repository_id, count: t.count, uniques: t.uniques },
  });
}

export async function getGithubTrafficClones(accountId: number, repoId: number, days = 30) {
  if (isMockMode()) return mock.githubClones;
  const since = new Date(); since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString();
  const repositoryId = await resolveGithubRepositoryId(accountId, repoId);
  const identity = githubHistoryIdentity(github_traffic_clones, repositoryId, accountId, repoId);
  return getDb().select().from(github_traffic_clones)
    .where(and(identity, gte(github_traffic_clones.date, sinceStr)))
    .orderBy(github_traffic_clones.date);
}

export async function upsertGithubTrafficViews(value: Parameters<typeof upsertGithubTrafficViewsLocked>[0]) {
  return getDb().transaction(async (tx) => {
    // Serialize all writers of the same GitHub repository across processes.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(74219, hashtext(${String(value.repo_id)}))`);
    return upsertGithubTrafficViewsLocked(value, tx);
  });
}

async function upsertGithubTrafficViewsLocked(t: { account_id: number; repo_id: number; repository_id?: number | null; date: string; count: number; uniques: number }, db: ReturnType<typeof getDb>) {
  const repository_id = t.repository_id ?? await resolveGithubRepositoryId(t.account_id, t.repo_id, db);
  if (repository_id) {
    const [existing] = await db.select({ id: github_traffic_views.id }).from(github_traffic_views)
      .where(and(eq(github_traffic_views.repository_id, repository_id), eq(github_traffic_views.date, t.date))).limit(1);
    if (existing) {
      await db.update(github_traffic_views).set({ repository_id, count: t.count, uniques: t.uniques }).where(eq(github_traffic_views.id, existing.id));
      return;
    }
  }
  await db.insert(github_traffic_views).values({ ...t, repository_id }).onConflictDoUpdate({
    target: [github_traffic_views.account_id, github_traffic_views.repo_id, github_traffic_views.date],
    set: { repository_id, count: t.count, uniques: t.uniques },
  });
}

export async function getGithubTrafficViews(accountId: number, repoId: number, days = 30) {
  if (isMockMode()) return mock.githubViews;
  const since = new Date(); since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString();
  const repositoryId = await resolveGithubRepositoryId(accountId, repoId);
  const identity = githubHistoryIdentity(github_traffic_views, repositoryId, accountId, repoId);
  return getDb().select().from(github_traffic_views)
    .where(and(identity, gte(github_traffic_views.date, sinceStr)))
    .orderBy(github_traffic_views.date);
}

export async function upsertGithubReferrer(value: Parameters<typeof upsertGithubReferrerLocked>[0]) {
  return getDb().transaction(async (tx) => {
    // Serialize all writers of the same GitHub repository across processes.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(74219, hashtext(${String(value.repo_id)}))`);
    return upsertGithubReferrerLocked(value, tx);
  });
}

async function upsertGithubReferrerLocked(t: { account_id: number; repo_id: number; repository_id?: number | null; referrer: string; count: number; uniques: number; snapshot_date: string }, db: ReturnType<typeof getDb>) {
  const repository_id = t.repository_id ?? await resolveGithubRepositoryId(t.account_id, t.repo_id, db);
  if (repository_id) {
    const [existing] = await db.select({ id: github_referrers.id }).from(github_referrers)
      .where(and(eq(github_referrers.repository_id, repository_id), eq(github_referrers.referrer, t.referrer), eq(github_referrers.snapshot_date, t.snapshot_date))).limit(1);
    if (existing) {
      await db.update(github_referrers).set({ repository_id, count: t.count, uniques: t.uniques }).where(eq(github_referrers.id, existing.id));
      return;
    }
  }
  await db.insert(github_referrers).values({ ...t, repository_id }).onConflictDoUpdate({
    target: [github_referrers.account_id, github_referrers.repo_id, github_referrers.referrer, github_referrers.snapshot_date],
    set: { repository_id, count: t.count, uniques: t.uniques },
  });
}

export async function getGithubReferrers(accountId: number, repoId: number) {
  if (isMockMode()) return mock.githubReferrers;
  const repositoryId = await resolveGithubRepositoryId(accountId, repoId);
  const identity = githubHistoryIdentity(github_referrers, repositoryId, accountId, repoId);
  const all = await getDb().select().from(github_referrers)
    .where(identity)
    .orderBy(desc(github_referrers.count));
  return latestSnapshotRows(all);
}

export async function getGithubReferrerHistory(accountId: number, repoId: number, days = 30) {
  if (isMockMode()) return mock.githubReferrerHistory;
  const since = new Date(); since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString();
  const repositoryId = await resolveGithubRepositoryId(accountId, repoId);
  const identity = githubHistoryIdentity(github_referrers, repositoryId, accountId, repoId);
  return getDb().select().from(github_referrers)
    .where(and(identity, gte(github_referrers.snapshot_date, sinceStr)))
    .orderBy(github_referrers.referrer, github_referrers.snapshot_date);
}

export async function upsertGithubPath(value: Parameters<typeof upsertGithubPathLocked>[0]) {
  return getDb().transaction(async (tx) => {
    // Serialize all writers of the same GitHub repository across processes.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(74219, hashtext(${String(value.repo_id)}))`);
    return upsertGithubPathLocked(value, tx);
  });
}

async function upsertGithubPathLocked(t: { account_id: number; repo_id: number; repository_id?: number | null; path: string; title: string | null; count: number; uniques: number; snapshot_date: string }, db: ReturnType<typeof getDb>) {
  const repository_id = t.repository_id ?? await resolveGithubRepositoryId(t.account_id, t.repo_id, db);
  if (repository_id) {
    const [existing] = await db.select({ id: github_paths.id }).from(github_paths)
      .where(and(eq(github_paths.repository_id, repository_id), eq(github_paths.path, t.path), eq(github_paths.snapshot_date, t.snapshot_date))).limit(1);
    if (existing) {
      await db.update(github_paths).set({ repository_id, title: t.title, count: t.count, uniques: t.uniques }).where(eq(github_paths.id, existing.id));
      return;
    }
  }
  await db.insert(github_paths).values({ ...t, repository_id }).onConflictDoUpdate({
    target: [github_paths.account_id, github_paths.repo_id, github_paths.path, github_paths.snapshot_date],
    set: { repository_id, count: t.count, uniques: t.uniques, title: t.title },
  });
}

export async function getGithubPaths(accountId: number, repoId: number) {
  if (isMockMode()) return mock.githubPaths;
  const repositoryId = await resolveGithubRepositoryId(accountId, repoId);
  const identity = githubHistoryIdentity(github_paths, repositoryId, accountId, repoId);
  const all = await getDb().select().from(github_paths)
    .where(identity)
    .orderBy(desc(github_paths.count));
  return latestSnapshotRows(all);
}

export async function getGithubPathHistory(accountId: number, repoId: number, days = 30) {
  if (isMockMode()) return mock.githubPathHistory;
  const since = new Date(); since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString();
  const repositoryId = await resolveGithubRepositoryId(accountId, repoId);
  const identity = githubHistoryIdentity(github_paths, repositoryId, accountId, repoId);
  return getDb().select().from(github_paths)
    .where(and(identity, gte(github_paths.snapshot_date, sinceStr)))
    .orderBy(github_paths.path, github_paths.snapshot_date);
}

export async function upsertGithubRelease(value: Parameters<typeof upsertGithubReleaseLocked>[0]) {
  return getDb().transaction(async (tx) => {
    // Serialize all writers of the same GitHub repository across processes.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(74219, hashtext(${String(value.repo_id)}))`);
    return upsertGithubReleaseLocked(value, tx);
  });
}

async function upsertGithubReleaseLocked(r: { account_id: number; repo_id: number; repository_id?: number | null; release_id: number; tag_name: string | null; name: string | null; body: string | null; prerelease: number; published_at: string | null; html_url: string | null; total_downloads: number }, db: ReturnType<typeof getDb>) {
  const repository_id = r.repository_id ?? await resolveGithubRepositoryId(r.account_id, r.repo_id, db);
  const releaseSet = { repository_id, tag_name: r.tag_name, name: r.name, body: r.body, prerelease: r.prerelease, published_at: r.published_at, html_url: r.html_url, total_downloads: r.total_downloads, fetched_at: sql`NOW()` };
  if (repository_id) {
    const [existing] = await db.select({ id: github_releases.id }).from(github_releases)
      .where(and(eq(github_releases.repository_id, repository_id), eq(github_releases.release_id, r.release_id))).limit(1);
    if (existing) {
      await db.update(github_releases).set(releaseSet).where(eq(github_releases.id, existing.id));
      return;
    }
  }
  await db.insert(github_releases).values({ ...r, repository_id, fetched_at: sql`NOW()` }).onConflictDoUpdate({
    target: [github_releases.account_id, github_releases.repo_id, github_releases.release_id],
    set: releaseSet,
  });
}

async function latestGithubReleases(accountId: number, repoId: number) {
  const repositoryId = await resolveGithubRepositoryId(accountId, repoId);
  const identity = githubHistoryIdentity(github_releases, repositoryId, accountId, repoId);
  const all = await getDb().select().from(github_releases)
    .where(identity);
  const latest = new Map<string, typeof all[0]>();
  for (const r of all) {
    const key = r.tag_name || String(r.release_id);
    if (!latest.has(key) || r.release_id > latest.get(key)!.release_id) {
      latest.set(key, r);
    }
  }
  return [...latest.values()].sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""));
}

export async function getGithubReleases(accountId: number, repoId: number) {
  if (isMockMode()) return mock.githubReleases;
  const releases = await latestGithubReleases(accountId, repoId);

  const releaseIds = releases.map((r) => r.id);
  const allAssets = releaseIds.length > 0
    ? await getDb().select().from(github_release_assets)
        .where(inArray(github_release_assets.release_id, releaseIds))
    : [];

  const assetsMap = new Map<number, typeof allAssets>();
  for (const a of allAssets) {
    if (!assetsMap.has(a.release_id)) assetsMap.set(a.release_id, []);
    assetsMap.get(a.release_id)!.push(a);
  }

  return releases.map((r) => ({
    ...r,
    assets: assetsMap.get(r.id) || [],
  }));
}

export async function insertGithubReleaseAsset(a: { release_db_id: number; name: string; download_count: number; size: number; content_type: string | null; browser_download_url: string | null }) {
  await getDb().insert(github_release_assets).values({
    release_id: a.release_db_id, name: a.name, download_count: a.download_count,
    size: a.size, content_type: a.content_type, browser_download_url: a.browser_download_url,
  });
}

export async function getGithubReleaseAssets(accountId: number, repoId: number, releaseDbId: number) {
  if (isMockMode()) return mock.githubReleaseAssets;
  // Ownership guard: the release's DB row must belong to this account + repo.
  // github_release_assets only carries release_id, so we verify via the
  // github_releases table before returning any asset. This prevents a user
  // from enumerating another account's release assets via a foreign releaseId.
  const repositoryId = await resolveGithubRepositoryId(accountId, repoId);
  const identity = githubHistoryIdentity(github_releases, repositoryId, accountId, repoId);
  const [owner] = await getDb().select({ id: github_releases.id })
    .from(github_releases)
    .where(and(
      eq(github_releases.id, releaseDbId),
      identity,
    ))
    .limit(1);
  if (!owner) return [];
  return getDb().select().from(github_release_assets)
    .where(eq(github_release_assets.release_id, releaseDbId));
}

export async function upsertGithubReleaseAssetSnapshot(value: Parameters<typeof upsertGithubReleaseAssetSnapshotLocked>[0]) {
  return getDb().transaction(async (tx) => {
    // Serialize all writers of the same GitHub repository across processes.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(74219, hashtext(${String(value.repo_id)}))`);
    return upsertGithubReleaseAssetSnapshotLocked(value, tx);
  });
}

async function upsertGithubReleaseAssetSnapshotLocked(t: { account_id: number; repo_id: number; repository_id?: number | null; release_id: number; asset_name: string; download_count: number; snapshot_date: string }, db: ReturnType<typeof getDb>) {
  const repository_id = t.repository_id ?? await resolveGithubRepositoryId(t.account_id, t.repo_id, db);
  await db.insert(github_release_asset_snapshots).values({ ...t, repository_id, recorded_at: sql`NOW()` }).onConflictDoUpdate({
    target: [github_release_asset_snapshots.release_id, github_release_asset_snapshots.asset_name, github_release_asset_snapshots.snapshot_date],
    set: { repository_id, download_count: t.download_count, recorded_at: sql`NOW()` },
  });
}

export async function getGithubReleaseDownloadTimeline(accountId: number, repoId: number, days = 30) {
  if (isMockMode()) return mock.githubReleaseDownloadTimeline(days);
  const releases = await latestGithubReleases(accountId, repoId);
  if (releases.length === 0) return [];

  const releaseIds = releases.map((r) => r.id);
  const snapshots = await getDb().select().from(github_release_asset_snapshots)
    .where(inArray(github_release_asset_snapshots.release_id, releaseIds));

  const snapshotsByRelease = new Map<number, DownloadSnapshot[]>();
  for (const snapshot of snapshots as DownloadSnapshot[]) {
    const list = snapshotsByRelease.get(snapshot.release_id);
    if (list) list.push(snapshot);
    else snapshotsByRelease.set(snapshot.release_id, [snapshot]);
  }

  return releases.map((r) => ({
    release_id: r.id,
    tag_name: r.tag_name,
    name: r.name,
    published_at: r.published_at,
    points: r.published_at
      ? computeReleaseDownloadTimeline(snapshotsByRelease.get(r.id) ?? [], r.published_at, days)
      : [],
  }));
}
