import type { RepoRepository } from "../../domain/ports";
import type { Repo } from "../../domain/repo";
import { Stars, Forks } from "../../domain/repo";
import type { RepoSnapshot } from "../../domain/snapshot";
import { getDb } from "../../db/connection";
import { github_repos, github_repo_snapshots, github_repository_tracking, gitlab_projects, gitlab_project_snapshots } from "@/db/schema";
import { and, eq, inArray, or, sql } from "drizzle-orm";

// Parameterized int[] literal. Identical to the pulse/top-content helpers and
// preferred over string-concatenating ids into sql.raw(...), which is an
// injection risk if the ids ever carry user-controlled values.
function intArray(ids: number[]) {
  if (ids.length === 0) return sql`ARRAY[]::int[]`;
  return sql`ARRAY[${sql.join(ids.map((id) => sql`${id}`), sql`, `)}]::int[]`;
}

function toDomainRepo(row: Record<string, unknown>, accountId: number): Repo {
  return {
    accountId,
    repoId: (row.repo_id as number) ?? (row.project_id as number),
    githubId: (row.github_id as number | null) ?? (row.repo_id as number),
    nodeId: (row.node_id as string | null) ?? null,
    instance: (row.instance as string | null) ?? "github.com",
    ownerGithubId: (row.owner_github_id as number | null) ?? null,
    ownerNodeId: (row.owner_node_id as string | null) ?? null,
    ownerLogin: (row.owner_login as string | null) ?? null,
    ownerType: (row.owner_type as string | null) ?? null,
    htmlUrl: (row.html_url as string | null) ?? null,
    isPrivate: (row.is_private as number | null) ?? null,
    isArchived: (row.is_archived as number | null) ?? null,
    defaultBranch: (row.default_branch as string | null) ?? null,
    name: row.name as string,
    fullName: (row.full_name as string) ?? (row.path_with_namespace as string) ?? (row.name as string),
    stars: new Stars((row.stars as number) ?? 0),
    forks: new Forks((row.forks as number) ?? 0),
    isFork: (row.is_fork as number) ?? 0,
    language: (row.language as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    homepage: (row.homepage as string | null) ?? null,
    topics: (row.topics as string) ?? "[]",
  };
}

export class PgRepoRepository implements RepoRepository {
  // Allow injecting db for tests; fallback to global getDb()
  constructor(private db?: ReturnType<typeof getDb>) {}

  private get dbInstance(): ReturnType<typeof getDb> | null {
    if (this.db === null) return null as unknown as ReturnType<typeof getDb>;
    return (this.db as ReturnType<typeof getDb>) ?? getDb();
  }

  async findAllByAccountIds(ids: number[]): Promise<Repo[]> {
    if (ids.length === 0) return [];
    const db = this.dbInstance;
    if (!db) return [];
    // Query both GitHub and GitLab in parallel — compatible with existing schema
    let githubRows: unknown[];
    try {
      const trackedRows = await db.select({ repo: github_repos, account_id: github_repository_tracking.account_id })
        .from(github_repository_tracking)
        .innerJoin(github_repos, eq(github_repository_tracking.repository_id, github_repos.id))
        .where(and(inArray(github_repository_tracking.account_id, ids), eq(github_repository_tracking.enabled, 1)));
      githubRows = trackedRows.length > 0
        ? trackedRows.map((row) => ({ ...row.repo, account_id: row.account_id }))
        : await db.select().from(github_repos).where(inArray(github_repos.account_id, ids));
    } catch {
      githubRows = await db.select().from(github_repos).where(inArray(github_repos.account_id, ids));
    }
    const [gitlabRows] = await Promise.all([
      db.select().from(gitlab_projects).where(inArray(gitlab_projects.account_id, ids)),
    ]);
    const repos: Repo[] = [];
    for (const r of githubRows) repos.push(toDomainRepo(r as unknown as Record<string, unknown>, (r as unknown as { account_id: number }).account_id));
    for (const r of gitlabRows) repos.push(toDomainRepo(r as unknown as Record<string, unknown>, (r as unknown as { account_id: number }).account_id));
    return repos;
  }

  async findSnapshotsBefore(ids: number[], sinceDay: string): Promise<Map<string, RepoSnapshot>> {
    if (ids.length === 0) return new Map();
    const db = this.dbInstance;
    if (!db) return new Map();
    // Latest snapshot strictly before sinceDay per (account_id, repo_id)
    const result = new Map<string, RepoSnapshot>();
    const [gh, gl] = await Promise.all([
      db.execute(sql`SELECT DISTINCT ON (account_id, repo_id) account_id, repo_id, stars, forks, snapshot_date FROM ${github_repo_snapshots} WHERE account_id = ANY(${intArray(ids)}) AND snapshot_date < ${sinceDay} ORDER BY account_id, repo_id, snapshot_date DESC`),
      db.execute(sql`SELECT DISTINCT ON (account_id, project_id) account_id, project_id as repo_id, stars, forks, snapshot_date FROM ${gitlab_project_snapshots} WHERE account_id = ANY(${intArray(ids)}) AND snapshot_date < ${sinceDay} ORDER BY account_id, project_id, snapshot_date DESC`),
    ]);
    for (const row of (gh as unknown as { rows: Array<{ account_id: number; repo_id: number; stars: number; forks: number; snapshot_date: string }> }).rows ?? []) {
      const key = `${row.account_id}:${row.repo_id}`;
      result.set(key, { accountId: row.account_id, repoId: row.repo_id, stars: row.stars, forks: row.forks, snapshotDate: row.snapshot_date });
    }
    for (const row of (gl as unknown as { rows: Array<{ account_id: number; repo_id: number; stars: number; forks: number; snapshot_date: string }> }).rows ?? []) {
      const key = `${row.account_id}:${row.repo_id}`;
      if (!result.has(key)) result.set(key, { accountId: row.account_id, repoId: row.repo_id, stars: row.stars, forks: row.forks, snapshotDate: row.snapshot_date });
    }
    return result;
  }

  async findSnapshotsInWindow(ids: number[], sinceDay: string, untilDay: string): Promise<Map<string, RepoSnapshot>> {
    if (ids.length === 0) return new Map();
    const db = this.dbInstance;
    if (!db) return new Map();
    const result = new Map<string, RepoSnapshot>();
    const [gh, gl] = await Promise.all([
      db.execute(sql`SELECT DISTINCT ON (account_id, repo_id) account_id, repo_id, stars, forks, snapshot_date FROM ${github_repo_snapshots} WHERE account_id = ANY(${intArray(ids)}) AND snapshot_date >= ${sinceDay} AND snapshot_date <= ${untilDay} ORDER BY account_id, repo_id, snapshot_date DESC`),
      db.execute(sql`SELECT DISTINCT ON (account_id, project_id) account_id, project_id as repo_id, stars, forks, snapshot_date FROM ${gitlab_project_snapshots} WHERE account_id = ANY(${intArray(ids)}) AND snapshot_date >= ${sinceDay} AND snapshot_date <= ${untilDay} ORDER BY account_id, project_id, snapshot_date DESC`),
    ]);
    for (const row of (gh as unknown as { rows: Array<{ account_id: number; repo_id: number; stars: number; forks: number; snapshot_date: string }> }).rows ?? []) {
      const key = `${row.account_id}:${row.repo_id}`;
      result.set(key, { accountId: row.account_id, repoId: row.repo_id, stars: row.stars, forks: row.forks, snapshotDate: row.snapshot_date });
    }
    for (const row of (gl as unknown as { rows: Array<{ account_id: number; repo_id: number; stars: number; forks: number; snapshot_date: string }> }).rows ?? []) {
      const key = `${row.account_id}:${row.repo_id}`;
      if (!result.has(key)) result.set(key, { accountId: row.account_id, repoId: row.repo_id, stars: row.stars, forks: row.forks, snapshotDate: row.snapshot_date });
    }
    return result;
  }

  async upsertRepos(repos: Repo[]): Promise<void> {
    if (repos.length === 0) return;
    const { upsertGithubRepo } = await import("../../repositories/github");
    const db = getDb();

    // Fetch existing rows once so L0/partial objects don't clobber stars/forks or
    // wipe open_issues/open_pull_requests (which the pure-new path doesn't yet compute).
    const accountIds = [...new Set(repos.map(r => r.accountId))];
    const githubIds = [...new Set(repos.map(r => r.githubId ?? r.repoId))];
    const existing = new Map<string, { stars: number | null; forks: number | null; open_issues: number | null; open_issues_only: number | null; open_pull_requests: number | null }>();
    try {
      const rows = await db.select({
        account_id: github_repos.account_id,
        repo_id: github_repos.repo_id,
        github_id: github_repos.github_id,
        stars: github_repos.stars,
        forks: github_repos.forks,
        open_issues: github_repos.open_issues,
        open_issues_only: github_repos.open_issues_only,
        open_pull_requests: github_repos.open_pull_requests,
      }).from(github_repos).where(or(inArray(github_repos.account_id, accountIds), inArray(github_repos.github_id, githubIds)));
      for (const r of rows) {
        existing.set(`${r.account_id}:${r.repo_id}`, {
          stars: r.stars, forks: r.forks, open_issues: r.open_issues,
          open_issues_only: r.open_issues_only, open_pull_requests: r.open_pull_requests,
        });
        existing.set(`stable:${r.github_id ?? r.repo_id}`, {
          stars: r.stars, forks: r.forks, open_issues: r.open_issues,
          open_issues_only: r.open_issues_only, open_pull_requests: r.open_pull_requests,
        });
      }
    } catch { /* table may not exist yet */ }

    for (const repo of repos) {
      const ex = existing.get(`${repo.accountId}:${repo.repoId}`)
        ?? existing.get(`stable:${repo.githubId ?? repo.repoId}`);
      const starsVal = (repo as unknown as { stars?: { value: number } }).stars?.value ?? ex?.stars ?? 0;
      const forksVal = (repo as unknown as { forks?: { value: number } }).forks?.value ?? ex?.forks ?? 0;
      const openIssues = (repo as unknown as { openIssues?: number | null }).openIssues ?? ex?.open_issues ?? 0;
      // Pure-new path doesn't compute issue split yet -> retain existing rather than null it out
      const openIssuesOnly = ex?.open_issues_only ?? null;
      const openPullRequests = ex?.open_pull_requests ?? null;
      await upsertGithubRepo({
        account_id: repo.accountId,
        repo_id: repo.repoId,
        github_id: repo.githubId ?? repo.repoId,
        node_id: repo.nodeId ?? null,
        instance: repo.instance ?? "github.com",
        owner_github_id: repo.ownerGithubId ?? null,
        owner_node_id: repo.ownerNodeId ?? null,
        owner_login: repo.ownerLogin ?? null,
        owner_type: repo.ownerType ?? null,
        html_url: repo.htmlUrl ?? null,
        is_private: repo.isPrivate ?? 0,
        is_archived: repo.isArchived ?? 0,
        default_branch: repo.defaultBranch ?? null,
        name: repo.name,
        full_name: repo.fullName,
        description: repo.description,
        language: repo.language,
        stars: starsVal,
        forks: forksVal,
        open_issues: openIssues,
        open_issues_only: openIssuesOnly,
        open_pull_requests: openPullRequests,
        topics: repo.topics,
        homepage: repo.homepage,
        is_fork: repo.isFork,
        created_at: null,
        updated_at: null,
        pushed_at: null,
      });
    }
  }

  async upsertSnapshots(snapshots: RepoSnapshot[]): Promise<void> {
    if (snapshots.length === 0) return;
    const { upsertGithubRepoSnapshot } = await import("../../repositories/github");
    const db = getDb();
    const accountIds = [...new Set(snapshots.map(s => s.accountId))];
    // Retain existing open_issues for the (account, repo) so a stars-only snapshot
    // doesn't wipe the issue count in history.
    const openIssuesMap = new Map<string, number>();
    try {
      const rows = await db.execute(sql`SELECT DISTINCT ON (account_id, repo_id) account_id, repo_id, open_issues
        FROM ${github_repo_snapshots} WHERE account_id = ANY(${intArray(accountIds)})
        ORDER BY account_id, repo_id, snapshot_date DESC`);
      for (const row of (rows as unknown as { rows: Array<{ account_id: number; repo_id: number; open_issues: number | null }> }).rows ?? []) {
        openIssuesMap.set(`${row.account_id}:${row.repo_id}`, row.open_issues ?? 0);
      }
    } catch { /* table may not exist */ }
    for (const s of snapshots) {
      await upsertGithubRepoSnapshot({
        account_id: s.accountId,
        repo_id: s.repoId,
        stars: s.stars,
        forks: s.forks,
        open_issues: openIssuesMap.get(`${s.accountId}:${s.repoId}`) ?? 0,
        snapshot_date: s.snapshotDate,
      });
    }
  }
}
