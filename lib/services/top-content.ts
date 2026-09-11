// @ts-nocheck — cross-platform aggregate queries use dynamic PostgreSQL results
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "../db/connection";
import { githubWatchedReposFilter } from "../repositories/github-watchlist";
import { isMockMode } from "../config";
import * as mock from "../mock";
import {
  github_releases, github_repos,
  gitlab_releases, gitlab_projects,
} from "@/db/schema";
import {
  buildTopContent,
  type TopContentResponse,
} from "../top-content";

function intArray(ids: number[]) {
  if (ids.length === 0) return sql`ARRAY[]::int[]`;
  return sql`ARRAY[${sql.join(ids.map((id) => sql`${id}`), sql`, `)}]::int[]`;
}

async function readTopTweets(accountIds: number[], since: string, until: string) {
  if (accountIds.length === 0) return [];
  const { rows } = await getDb().execute<{
    id: string; account_id: number; full_text: string; created_at: string;
    favorite_count: number; retweet_count: number; reply_count: number;
  }>(sql`
    SELECT id, account_id, full_text, created_at,
           COALESCE(favorite_count, 0)::int AS favorite_count,
           COALESCE(retweet_count, 0)::int AS retweet_count,
           COALESCE(reply_count, 0)::int AS reply_count
    FROM tweets
    WHERE account_id = ANY(${intArray(accountIds)})
      AND created_at >= ${since}
      AND created_at < ${until}
      AND is_reply = 0 AND is_retweet = 0
    ORDER BY (COALESCE(favorite_count, 0) + COALESCE(retweet_count, 0) + COALESCE(reply_count, 0)) DESC
    LIMIT 10
  `);
  return rows;
}

async function readTopReddit(accountIds: number[], sinceEpoch: number, untilEpoch: number) {
  if (accountIds.length === 0) return { posts: [], comments: [] };
  const ids = intArray(accountIds);
  const [postRows, commentRows] = await Promise.all([
    getDb().execute<{
      id: string; account_id: number; title: string; subreddit: string;
      score: number; num_comments: number; permalink: string; created_utc: number;
    }>(sql`
      SELECT id, account_id, title, subreddit,
             COALESCE(score, 0)::int AS score,
             COALESCE(num_comments, 0)::int AS num_comments,
             permalink, created_utc
      FROM reddit_posts
      WHERE account_id = ANY(${ids})
        AND created_utc >= ${sinceEpoch} AND created_utc < ${untilEpoch}
      ORDER BY COALESCE(score, 0) DESC
      LIMIT 10
    `),
    getDb().execute<{
      id: string; account_id: number; body: string; subreddit: string;
      score: number; permalink: string; created_utc: number;
    }>(sql`
      SELECT id, account_id, body, subreddit,
             COALESCE(score, 0)::int AS score,
             permalink, created_utc
      FROM reddit_comments
      WHERE account_id = ANY(${ids})
        AND created_utc >= ${sinceEpoch} AND created_utc < ${untilEpoch}
      ORDER BY COALESCE(score, 0) DESC
      LIMIT 10
    `),
  ]);
  return { posts: postRows.rows, comments: commentRows.rows };
}

async function readReleases(
  platform: "github" | "gitlab",
  accountIds: number[],
  sinceDay: string,
) {
  if (accountIds.length === 0) return [];
  const db = getDb();

  if (platform === "github") {
    const rows = await db.select({
      id: github_releases.id,
      accountId: github_releases.account_id,
      repoOrProjectId: github_releases.repo_id,
      tagName: github_releases.tag_name,
      title: github_releases.name,
      publishedAt: github_releases.published_at,
      htmlUrl: github_releases.html_url,
      totalDownloads: github_releases.total_downloads,
      repoName: github_repos.name,
    }).from(github_releases).leftJoin(
      github_repos,
      and(eq(github_releases.repo_id, github_repos.repo_id), eq(github_releases.account_id, github_repos.account_id)),
    ).where(and(
      inArray(github_releases.account_id, accountIds),
      gte(github_releases.published_at, sinceDay),
    ));

    return rows.map((row) => ({
      ...row,
      platform: "github" as const,
      totalDownloads: row.totalDownloads ?? 0,
    }));
  }

  {
    const rows = await db.select({
      id: gitlab_releases.id,
      accountId: gitlab_releases.account_id,
      repoOrProjectId: gitlab_releases.project_id,
      tagName: gitlab_releases.release_tag,
      title: gitlab_releases.name,
      publishedAt: gitlab_releases.released_at,
      repoName: gitlab_projects.name,
    }).from(gitlab_releases).leftJoin(
      gitlab_projects,
      and(eq(gitlab_releases.project_id, gitlab_projects.project_id), eq(gitlab_releases.account_id, gitlab_projects.account_id)),
    ).where(and(
      inArray(gitlab_releases.account_id, accountIds),
      gte(gitlab_releases.released_at, sinceDay),
    ));

    const assetRows = await db.execute<{
      release_id: number; total_downloads: number;
    }>(sql`
      SELECT ra.release_id, COALESCE(SUM(ra.download_count), 0)::int AS total_downloads
      FROM gitlab_release_assets ra
      JOIN gitlab_releases gr ON gr.id = ra.release_id
      WHERE gr.account_id = ANY(${intArray(accountIds)})
      GROUP BY ra.release_id
    `);
    const downloadsByReleaseId = new Map(assetRows.rows.map((r) => [r.release_id, r.total_downloads]));

    return rows.map((row) => ({
      ...row,
      platform: "gitlab" as const,
      htmlUrl: "",
      totalDownloads: downloadsByReleaseId.get(row.id) ?? 0,
    }));
  }
}

async function readRepoGrowth(
  platform: "github" | "gitlab",
  accounts: Array<{ id: number; screen_name: string; instance_url?: string | null }>,
  accountIds: number[],
  sinceDay: string,
) {
  if (accountIds.length === 0) return [];
  const db = getDb();
  const isGithub = platform === "github";
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const snapshotTable = isGithub ? "github_repo_snapshots" : "gitlab_project_snapshots";
  const idColumn = isGithub ? "repo_id" : "project_id";

  // 1. Most recent snapshot BEFORE the time window (true baseline)
  // 2. Earliest snapshot EVER (fallback when the repo was first tracked within the window)
  const [baselineResult, oldestResult] = await Promise.all([
    db.execute<{ account_id: number; external_id: number; stars: number; forks: number; }>(sql`
      SELECT DISTINCT ON (account_id, ${sql.raw(idColumn)})
        account_id,
        ${sql.raw(idColumn)} AS external_id, stars, forks
      FROM ${sql.raw(snapshotTable)}
      WHERE account_id = ANY(${intArray(accountIds)})
        AND snapshot_date < ${sinceDay}
      ORDER BY account_id, ${sql.raw(idColumn)}, snapshot_date DESC
    `),
    db.execute<{ account_id: number; external_id: number; stars: number; forks: number; }>(sql`
      SELECT DISTINCT ON (account_id, ${sql.raw(idColumn)})
        account_id,
        ${sql.raw(idColumn)} AS external_id, stars, forks
      FROM ${sql.raw(snapshotTable)}
      WHERE account_id = ANY(${intArray(accountIds)})
      ORDER BY account_id, ${sql.raw(idColumn)}, snapshot_date ASC
    `),
  ]);

  const baselines = new Map(baselineResult.rows.map((r) => [`${r.account_id}:${r.external_id}`, r]));
  const oldest = new Map(oldestResult.rows.map((r) => [`${r.account_id}:${r.external_id}`, r]));

  let repoRows: Array<{
    accountId: number; externalId: number; name: string; fullName: string | null;
    stars: number | null; forks: number | null; isFork: number | null;
  }>;

  if (isGithub) {
    const rows = await db.select({
      accountId: github_repos.account_id,
      externalId: github_repos.repo_id,
      name: github_repos.name,
      fullName: github_repos.full_name,
      stars: github_repos.stars,
      forks: github_repos.forks,
      isFork: github_repos.is_fork,
    }).from(github_repos).where(await githubWatchedReposFilter(accountIds));
    repoRows = rows;
  } else {
    const rows = await db.select({
      accountId: gitlab_projects.account_id,
      externalId: gitlab_projects.project_id,
      name: gitlab_projects.name,
      fullName: gitlab_projects.path_with_namespace,
      stars: gitlab_projects.stars,
      forks: gitlab_projects.forks,
      isFork: gitlab_projects.is_fork,
    }).from(gitlab_projects).where(inArray(gitlab_projects.account_id, accountIds));
    repoRows = rows;
  }

  return repoRows.flatMap((row) => {
    if (row.isFork) return [];
    const key = `${row.accountId}:${row.externalId}`;
    // Priority: baseline before window > oldest ever recorded
    const baseline = baselines.get(key) ?? oldest.get(key);
    const account = accountById.get(row.accountId);
    if (!account) return [];
    const url = isGithub
      ? `https://github.com/${row.fullName}`
      : account.instance_url
        ? `${account.instance_url.replace(/\/$/, "")}/${row.fullName}`
        : `https://gitlab.com/${row.fullName}`;
    return [{
      platform,
      accountId: row.accountId,
      externalId: row.externalId,
      accountName: account.screen_name,
      name: row.name,
      fullName: row.fullName,
      stars: row.stars ?? 0,
      forks: row.forks ?? 0,
      baselineStars: baseline?.stars ?? row.stars ?? 0,
      baselineForks: baseline?.forks ?? row.forks ?? 0,
      url,
    }];
  });
}

function mockTopContent(days: number): TopContentResponse {
  const generatedAt = new Date().toISOString();
  const sinceMs = Date.parse(generatedAt) - days * 86_400_000;
  const sinceEpoch = Math.floor(sinceMs / 1000);
  const accountName = mock.accounts[0].screen_name;

  const tweetRows = mock.tweets
    .filter((t) => t.is_reply === 0 && t.is_retweet === 0)
    .filter((t) => Date.parse(t.created_at) >= sinceMs)
    .sort((a, b) =>
      (b.favorite_count + b.retweet_count + b.reply_count)
      - (a.favorite_count + a.retweet_count + a.reply_count))
    .slice(0, 10)
    .map((t) => ({
      id: t.id, account_id: t.account_id, accountName,
      full_text: t.full_text, created_at: t.created_at,
      favorite_count: t.favorite_count, retweet_count: t.retweet_count,
      reply_count: t.reply_count,
    }));

  const postRows = [...mock.redditPosts]
    .filter((p) => p.created_utc >= sinceEpoch)
    .sort((a, b) => b.score - a.score).slice(0, 10)
    .map((p) => ({ ...p, accountName }));
  const commentRows = [...mock.redditComments]
    .filter((c) => c.created_utc >= sinceEpoch)
    .sort((a, b) => b.score - a.score).slice(0, 10)
    .map((c) => ({ ...c, accountName }));

  const releaseRows = [
    ...mock.githubReleases.map((rel) => ({
      id: String(rel.id), platform: "github" as const, accountId: rel.account_id,
      accountName, repoOrProjectId: rel.repo_id, repoName: "mockuser/repo-1",
      tagName: rel.tag_name, title: rel.name,
      publishedAt: rel.published_at, totalDownloads: rel.total_downloads,
      htmlUrl: rel.html_url,
    })),
    ...mock.gitlabReleases.map((rel) => ({
      id: String(rel.id), platform: "gitlab" as const, accountId: 3,
      accountName, repoOrProjectId: rel.project_id, repoName: "mockuser/project",
      tagName: rel.release_tag, title: rel.name,
      publishedAt: rel.released_at, totalDownloads: 300 + (rel.id % 3) * 100,
      htmlUrl: "",
    })),
  ].filter((rel) => rel.publishedAt && Date.parse(rel.publishedAt) >= sinceMs);

  const repoRows = [
    ...mock.githubRepos.slice(0, 6).map((repo) => ({
      platform: "github" as const, accountId: repo.account_id,
      externalId: repo.repo_id, accountName,
      name: repo.name, fullName: repo.full_name,
      stars: repo.stars, forks: repo.forks,
      baselineStars: Math.max(0, repo.stars - 12 - (repo.repo_id % 8)),
      baselineForks: Math.max(0, repo.forks - 2),
      url: `https://github.com/${repo.full_name}`,
    })),
    ...mock.gitlabProjects.slice(0, 4).map((proj) => ({
      platform: "gitlab" as const, accountId: proj.account_id,
      externalId: proj.project_id, accountName,
      name: proj.name, fullName: proj.path_with_namespace,
      stars: proj.stars, forks: proj.forks,
      baselineStars: Math.max(0, proj.stars - 7),
      baselineForks: Math.max(0, proj.forks - 1),
      url: `https://gitlab.com/${proj.path_with_namespace}`,
    })),
  ];

  return buildTopContent({
    generatedAt,
    days,
    tweets: tweetRows,
    redditPosts: postRows,
    redditComments: commentRows,
    releases: releaseRows,
    repositories: repoRows,
  });
}

export async function getTopContent(
  accounts: Array<{ id: number; screen_name: string; platform: string; instance_url?: string | null; is_active?: number }>,
  days = 7,
): Promise<TopContentResponse> {
  const normalizedDays = Math.min(365, Math.max(1, Number(days) || 7));
  if (isMockMode()) return mockTopContent(normalizedDays);

  const activeAccounts = accounts.filter((a) => a.is_active !== 0);
  const ids = activeAccounts.map((a) => a.id);
  if (ids.length === 0) {
    return buildTopContent({ generatedAt: new Date().toISOString(), days: normalizedDays, tweets: [], redditPosts: [], redditComments: [], releases: [], repositories: [] });
  }

  const generatedAt = new Date().toISOString();
  const since = new Date(Date.parse(generatedAt) - normalizedDays * 86_400_000).toISOString();
  const sinceDay = since.slice(0, 10);
  const sinceEpoch = Math.floor(Date.parse(since) / 1000);
  const untilEpoch = Math.floor(Date.parse(generatedAt) / 1000);

  const byPlatform = (platform: string) =>
    activeAccounts.filter((a) => a.platform === platform).map((a) => a.id);

  const [
    tweetRows, redditData,
    ghReleases, glReleases,
    ghRepos, glRepos,
  ] = await Promise.all([
    readTopTweets(byPlatform("twitter"), since, generatedAt),
    readTopReddit(byPlatform("reddit"), sinceEpoch, untilEpoch),
    readReleases("github", byPlatform("github"), sinceDay),
    readReleases("gitlab", byPlatform("gitlab"), sinceDay),
    readRepoGrowth("github", byPlatform("github").map(id => activeAccounts.find(a => a.id === id)!), byPlatform("github"), sinceDay),
    readRepoGrowth("gitlab", byPlatform("gitlab").map(id => activeAccounts.find(a => a.id === id)!), byPlatform("gitlab"), sinceDay),
  ]);

  const nameById = new Map(activeAccounts.map((a) => [a.id, a.screen_name]));

  return buildTopContent({
    generatedAt,
    days: normalizedDays,
    tweets: tweetRows.map((r) => ({ ...r, accountName: nameById.get(r.account_id) ?? "" })),
    redditPosts: redditData.posts.map((r) => ({ ...r, accountName: nameById.get(r.account_id) ?? "" })),
    redditComments: redditData.comments.map((r) => ({ ...r, accountName: nameById.get(r.account_id) ?? "" })),
    releases: [...ghReleases, ...glReleases].map((r) => ({ ...r, accountName: nameById.get(r.accountId) ?? "" })),
    repositories: [...ghRepos, ...glRepos],
  });
}
