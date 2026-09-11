// @ts-nocheck — cross-platform aggregate queries use dynamic PostgreSQL results
import { and, eq, gte, inArray, lt, lte, sql } from "drizzle-orm";
import { getDb } from "../db/connection";
import { githubWatchedReposFilter } from "../repositories/github-watchlist";
import { isMockMode } from "../config";
import * as mock from "../mock";
import {
  github_contributions, github_repo_snapshots, github_repos,
  gitlab_contributions, gitlab_project_snapshots, gitlab_projects,
  reddit_comments, reddit_posts, tweets,
} from "@/db/schema";
import {
  buildPulse,
  type PulseAccount,
  type PulseAudienceSample,
  type PulseResponse,
} from "../domain/pulse";

function intArray(ids: number[]) {
  if (ids.length === 0) return sql`ARRAY[]::int[]`;
  return sql`ARRAY[${sql.join(ids.map((id) => sql`${id}`), sql`, `)}]::int[]`;
}

function countValue(value: unknown): number {
  return Number(value ?? 0);
}

async function readAudience(
  table: string,
  expression: string,
  accountIds: number[],
  boundary: string,
  inclusive: boolean,
): Promise<PulseAudienceSample[]> {
  if (accountIds.length === 0) return [];
  const operator = inclusive ? "<=" : "<";
  // Stats timestamps are text and contain both PostgreSQL NOW() output and
  // JavaScript ISO strings. Compare a normalized UTC second instead of relying
  // on lexicographic ordering across the two formats.
  const normalizedTimestamp = sql.raw(
    "REPLACE(SUBSTRING(recorded_at, 1, 19), ' ', 'T')",
  );
  const boundarySecond = boundary.slice(0, 19);
  const { rows } = await getDb().execute<{ account_id: number; value: number }>(sql`
    SELECT DISTINCT ON (account_id)
      account_id,
      ${sql.raw(expression)}::int AS value
    FROM ${sql.raw(table)}
    WHERE account_id = ANY(${intArray(accountIds)})
      AND ${normalizedTimestamp} ${sql.raw(operator)} ${boundarySecond}
    ORDER BY account_id, ${normalizedTimestamp} DESC, recorded_at DESC
  `);
  return rows;
}

async function readCount(query: Promise<{ count: number }[]>): Promise<number> {
  const [row] = await query;
  return countValue(row?.count);
}

async function readActivityCounts(accountIds: number[], since: string, until: string) {
  if (accountIds.length === 0) {
    return {
      tweets: { current: 0, previous: 0 },
      redditPosts: { current: 0, previous: 0 },
      redditComments: { current: 0, previous: 0 },
      githubContributions: { current: 0, previous: 0 },
      gitlabContributions: { current: 0, previous: 0 },
    };
  }

  const windowMs = Date.parse(until) - Date.parse(since);
  const previousSince = new Date(Date.parse(since) - windowMs).toISOString();
  const sinceDay = since.slice(0, 10);
  const untilDay = until.slice(0, 10);
  const previousSinceDay = previousSince.slice(0, 10);
  const sinceEpoch = Math.floor(Date.parse(since) / 1000);
  const untilEpoch = Math.floor(Date.parse(until) / 1000);
  const previousSinceEpoch = Math.floor(Date.parse(previousSince) / 1000);
  const db = getDb();

  const [
    currentTweets, previousTweets,
    currentPosts, previousPosts,
    currentComments, previousComments,
    currentGithubContributions, previousGithubContributions,
    currentGitlabContributions, previousGitlabContributions,
  ] = await Promise.all([
    readCount(db.select({ count: sql<number>`COUNT(*)::int` }).from(tweets).where(and(
      inArray(tweets.account_id, accountIds), gte(tweets.created_at, since), lt(tweets.created_at, until),
      eq(tweets.is_reply, 0), eq(tweets.is_retweet, 0),
    ))),
    readCount(db.select({ count: sql<number>`COUNT(*)::int` }).from(tweets).where(and(
      inArray(tweets.account_id, accountIds), gte(tweets.created_at, previousSince), lt(tweets.created_at, since),
      eq(tweets.is_reply, 0), eq(tweets.is_retweet, 0),
    ))),
    readCount(db.select({ count: sql<number>`COUNT(*)::int` }).from(reddit_posts).where(and(
      inArray(reddit_posts.account_id, accountIds),
      gte(reddit_posts.created_utc, sinceEpoch), lt(reddit_posts.created_utc, untilEpoch),
    ))),
    readCount(db.select({ count: sql<number>`COUNT(*)::int` }).from(reddit_posts).where(and(
      inArray(reddit_posts.account_id, accountIds),
      gte(reddit_posts.created_utc, previousSinceEpoch), lt(reddit_posts.created_utc, sinceEpoch),
    ))),
    readCount(db.select({ count: sql<number>`COUNT(*)::int` }).from(reddit_comments).where(and(
      inArray(reddit_comments.account_id, accountIds),
      gte(reddit_comments.created_utc, sinceEpoch), lt(reddit_comments.created_utc, untilEpoch),
    ))),
    readCount(db.select({ count: sql<number>`COUNT(*)::int` }).from(reddit_comments).where(and(
      inArray(reddit_comments.account_id, accountIds),
      gte(reddit_comments.created_utc, previousSinceEpoch), lt(reddit_comments.created_utc, sinceEpoch),
    ))),
    readCount(db.select({ count: sql<number>`COALESCE(SUM(${github_contributions.count}), 0)::int` }).from(github_contributions).where(and(
      inArray(github_contributions.account_id, accountIds),
      gte(github_contributions.date, sinceDay), lte(github_contributions.date, untilDay),
    ))),
    readCount(db.select({ count: sql<number>`COALESCE(SUM(${github_contributions.count}), 0)::int` }).from(github_contributions).where(and(
      inArray(github_contributions.account_id, accountIds),
      gte(github_contributions.date, previousSinceDay), lt(github_contributions.date, sinceDay),
    ))),
    readCount(db.select({ count: sql<number>`COALESCE(SUM(${gitlab_contributions.count}), 0)::int` }).from(gitlab_contributions).where(and(
      inArray(gitlab_contributions.account_id, accountIds),
      gte(gitlab_contributions.date, sinceDay), lte(gitlab_contributions.date, untilDay),
    ))),
    readCount(db.select({ count: sql<number>`COALESCE(SUM(${gitlab_contributions.count}), 0)::int` }).from(gitlab_contributions).where(and(
      inArray(gitlab_contributions.account_id, accountIds),
      gte(gitlab_contributions.date, previousSinceDay), lt(gitlab_contributions.date, sinceDay),
    ))),
  ]);

  return {
    tweets: { current: currentTweets, previous: previousTweets },
    redditPosts: { current: currentPosts, previous: previousPosts },
    redditComments: { current: currentComments, previous: previousComments },
    githubContributions: { current: currentGithubContributions, previous: previousGithubContributions },
    gitlabContributions: { current: currentGitlabContributions, previous: previousGitlabContributions },
  };
}

async function readTopTweets(accountIds: number[], since: string, until: string) {
  if (accountIds.length === 0) return [];
  const { rows } = await getDb().execute<{
    id: string; account_id: number; full_text: string; created_at: string;
    favorite_count: number; retweet_count: number; reply_count: number;
  }>(sql`
    SELECT id, account_id, full_text, created_at, favorite_count, retweet_count, reply_count
    FROM tweets
    WHERE account_id = ANY(${intArray(accountIds)})
      AND created_at >= ${since}
      AND created_at < ${until}
      AND is_reply = 0
      AND is_retweet = 0
    ORDER BY (COALESCE(favorite_count, 0) + COALESCE(retweet_count, 0) + COALESCE(reply_count, 0)) DESC
    LIMIT 5
  `);
  return rows;
}

async function readTopRedditContent(accountIds: number[], sinceEpoch: number, untilEpoch: number) {
  if (accountIds.length === 0) return { posts: [], comments: [] };
  const ids = intArray(accountIds);
  const [postRows, commentRows] = await Promise.all([
    getDb().execute<{
      id: string; account_id: number; title: string; subreddit: string; score: number;
      num_comments: number; permalink: string; created_utc: number;
    }>(sql`
      SELECT id, account_id, title, subreddit, score, num_comments, permalink, created_utc
      FROM reddit_posts
      WHERE account_id = ANY(${ids})
        AND created_utc >= ${sinceEpoch}
        AND created_utc < ${untilEpoch}
      ORDER BY COALESCE(score, 0) DESC
      LIMIT 5
    `),
    getDb().execute<{
      id: string; account_id: number; body: string; subreddit: string; score: number;
      permalink: string; created_utc: number;
    }>(sql`
      SELECT id, account_id, body, subreddit, score, permalink, created_utc
      FROM reddit_comments
      WHERE account_id = ANY(${ids})
        AND created_utc >= ${sinceEpoch}
        AND created_utc < ${untilEpoch}
      ORDER BY COALESCE(score, 0) DESC
      LIMIT 5
    `),
  ]);
  return { posts: postRows.rows, comments: commentRows.rows };
}

async function readProjectBaselines(
  platform: "github" | "gitlab",
  accountIds: number[],
  sinceDay: string,
  untilDay: string,
) {
  if (accountIds.length === 0) return { baselines: new Map(), earliest: new Map(), oldest: new Map() };
  const db = getDb();
  const isGithub = platform === "github";
  const snapshotTable = isGithub ? github_repo_snapshots : gitlab_project_snapshots;
  const externalIdColumn = isGithub ? snapshotTable.repo_id : snapshotTable.project_id;
  const key = (row: { account_id: number; external_id: number }) =>
    `${row.account_id}:${row.external_id}`;

  // 1. Most recent snapshot BEFORE the time window (true baseline)
  // 2. Earliest snapshot WITHIN the time window (fallback when no prior snapshot exists)
  // 3. Earliest snapshot EVER (fallback when the repo was first tracked within the window)
  const [priorRows, windowRows, oldestRows] = await Promise.all([
    db.execute<{
      account_id: number; external_id: number; stars: number; forks: number; snapshot_date: string;
    }>(sql`
      SELECT DISTINCT ON (account_id, ${sql.raw(isGithub ? "repo_id" : "project_id")})
        account_id,
        ${sql.raw(isGithub ? "repo_id" : "project_id")} AS external_id,
        stars, forks, snapshot_date
      FROM ${sql.raw(isGithub ? "github_repo_snapshots" : "gitlab_project_snapshots")}
      WHERE account_id = ANY(${intArray(accountIds)})
        AND snapshot_date < ${sinceDay}
      ORDER BY account_id, ${sql.raw(isGithub ? "repo_id" : "project_id")}, snapshot_date DESC
    `),
    db.select({
      account_id: snapshotTable.account_id,
      external_id: externalIdColumn,
      stars: snapshotTable.stars,
      forks: snapshotTable.forks,
      snapshot_date: snapshotTable.snapshot_date,
    }).from(snapshotTable).where(and(
      inArray(snapshotTable.account_id, accountIds),
      gte(snapshotTable.snapshot_date, sinceDay),
      lte(snapshotTable.snapshot_date, untilDay),
    )).orderBy(snapshotTable.snapshot_date),
    db.execute<{
      account_id: number; external_id: number; stars: number; forks: number; snapshot_date: string;
    }>(sql`
      SELECT DISTINCT ON (account_id, ${sql.raw(isGithub ? "repo_id" : "project_id")})
        account_id,
        ${sql.raw(isGithub ? "repo_id" : "project_id")} AS external_id,
        stars, forks, snapshot_date
      FROM ${sql.raw(isGithub ? "github_repo_snapshots" : "gitlab_project_snapshots")}
      WHERE account_id = ANY(${intArray(accountIds)})
      ORDER BY account_id, ${sql.raw(isGithub ? "repo_id" : "project_id")}, snapshot_date ASC
    `),
  ]);

  const baselines = new Map(priorRows.rows.map((row) => [key(row), row]));
  const earliest = new Map();
  for (const row of windowRows) {
    const rowKey = key(row);
    if (!earliest.has(rowKey)) earliest.set(rowKey, row);
  }
  const oldest = new Map(oldestRows.rows.map((row) => [key(row), row]));
  return { baselines, earliest, oldest };
}

async function readRepositories(accounts: PulseAccount[], accountIds: number[], sinceDay: string, untilDay: string) {
  if (accountIds.length === 0) return [];
  const db = getDb();
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  // Only repositories the user still monitors: an unselected one must not
  // resurface here just because its historical rows are intact.
  const watchedGithubRepos = await githubWatchedReposFilter(accountIds);
  const [githubRepoRows, gitlabProjectRows, githubBaselines, gitlabBaselines] = await Promise.all([
    db.select({
      account_id: github_repos.account_id, external_id: github_repos.repo_id,
      name: github_repos.name, fullName: github_repos.full_name,
      description: github_repos.description, stars: github_repos.stars,
      forks: github_repos.forks, isFork: github_repos.is_fork,
    }).from(github_repos).where(watchedGithubRepos),
    db.select({
      account_id: gitlab_projects.account_id, external_id: gitlab_projects.project_id,
      name: gitlab_projects.name, fullName: gitlab_projects.path_with_namespace,
      description: gitlab_projects.description, stars: gitlab_projects.stars,
      forks: gitlab_projects.forks, isFork: gitlab_projects.is_fork,
    }).from(gitlab_projects).where(inArray(gitlab_projects.account_id, accountIds)),
    readProjectBaselines("github", accountIds, sinceDay, untilDay),
    readProjectBaselines("gitlab", accountIds, sinceDay, untilDay),
  ]);

  const result = [];
  for (const row of [...githubRepoRows, ...gitlabProjectRows]) {
    if (row.isFork) continue;
    const account = accountById.get(row.account_id);
    if (!account) continue;
    const platform = githubRepoRows.includes(row) ? "github" : "gitlab";
    const baselineSet = platform === "github" ? githubBaselines : gitlabBaselines;
    const projectKey = `${row.account_id}:${row.external_id}`;
    // Priority: baseline before window > earliest in window > oldest ever recorded
    const baseline = baselineSet.baselines.get(projectKey) ?? baselineSet.earliest.get(projectKey) ?? baselineSet.oldest.get(projectKey);
    const url = platform === "github"
      ? `https://github.com/${row.fullName}`
      : account.instance_url
        ? `${account.instance_url.replace(/\/$/, "")}/${row.fullName}`
        : `https://gitlab.com/${row.fullName}`;

    result.push({
      account_id: row.account_id,
      platform,
      externalId: row.external_id,
      accountName: account.screen_name,
      name: row.name,
      fullName: row.fullName,
      description: row.description,
      stars: row.stars ?? 0,
      forks: row.forks ?? 0,
      baselineStars: baseline?.stars ?? row.stars ?? 0,
      baselineForks: baseline?.forks ?? row.forks ?? 0,
      url,
    });
  }
  return result;
}

function mockPulse(days: number): PulseResponse {
  const generatedAt = new Date().toISOString();
  const since = new Date(Date.parse(generatedAt) - days * 86_400_000).toISOString();
  const sinceEpoch = Math.floor(Date.parse(since) / 1000);
  const accountName = mock.accounts[0].screen_name;
  const tweetRows = mock.tweets.filter((tweet) => Date.parse(tweet.created_at) >= Date.parse(since))
    .sort((a, b) => b.favorite_count - a.favorite_count).slice(0, 5)
    .map((tweet) => ({ ...tweet, accountName }));
  const postRows = [...mock.redditPosts].sort((a, b) => b.score - a.score).filter((post) => post.created_utc >= sinceEpoch).slice(0, 5)
    .map((post) => ({ ...post, accountName }));
  const commentRows = [...mock.redditComments].sort((a, b) => b.score - a.score).filter((comment) => comment.created_utc >= sinceEpoch).slice(0, 5)
    .map((comment) => ({ ...comment, accountName }));
  const repositories = [
    ...mock.githubRepos.slice(0, 3).map((repo) => ({
      account_id: repo.account_id,
      platform: "github" as const,
      externalId: repo.repo_id,
      accountName,
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description,
      stars: repo.stars,
      forks: repo.forks,
      baselineStars: Math.max(0, repo.stars - 8),
      baselineForks: Math.max(0, repo.forks - 2),
      url: `https://github.com/${repo.full_name}`,
    })),
    ...mock.gitlabProjects.slice(0, 2).map((project) => ({
      account_id: project.account_id,
      platform: "gitlab" as const,
      externalId: project.project_id,
      accountName,
      name: project.name,
      fullName: project.path_with_namespace,
      description: project.description,
      stars: project.stars,
      forks: project.forks,
      baselineStars: Math.max(0, project.stars - 5),
      baselineForks: Math.max(0, project.forks - 1),
      url: `https://gitlab.com/${project.path_with_namespace}`,
    })),
  ];

  return buildPulse({
    generatedAt,
    days,
    accounts: mock.accounts,
    audience: {
      twitter: {
        current: [{ account_id: 1, value: mock.overviewStats.followersCount }],
        previous: [{ account_id: 1, value: mock.overviewStats.followersCount - 120 }],
      },
      github: {
        current: [{ account_id: 2, value: mock.githubOverview.stats.followers }],
        previous: [{ account_id: 2, value: mock.githubOverview.stats.followers - 18 }],
      },
      gitlab: {
        current: [{ account_id: 3, value: mock.gitlabOverview.stats.followers }],
        previous: [{ account_id: 3, value: mock.gitlabOverview.stats.followers - 9 }],
      },
      reddit: {
        current: [{
          account_id: 4,
          value: mock.redditStats.post_karma + mock.redditStats.comment_karma,
        }],
        previous: [{
          account_id: 4,
          value: mock.redditStats.post_karma + mock.redditStats.comment_karma - 240,
        }],
      },
    },
    activity: {
      tweets: { current: 7, previous: 5 },
      redditPosts: { current: 4, previous: 3 },
      redditComments: { current: 11, previous: 8 },
      githubContributions: { current: 14, previous: 11 },
      gitlabContributions: { current: 6, previous: 7 },
    },
    tweets: tweetRows,
    redditPosts: postRows,
    redditComments: commentRows,
    repositories,
  });
}

export async function getPulse(accounts: PulseAccount[], days = 7): Promise<PulseResponse> {
  const normalizedDays = Math.min(365, Math.max(1, Number(days) || 7));
  if (isMockMode()) return mockPulse(normalizedDays);

  const activeAccounts = accounts.filter((account) => account.is_active !== 0);
  const accountIds = activeAccounts.map((account) => account.id);
  if (accountIds.length === 0) {
    return buildPulse({
      generatedAt: new Date().toISOString(),
      days: normalizedDays,
      accounts: [],
      audience: {},
      activity: {
        tweets: { current: 0, previous: 0 },
        redditPosts: { current: 0, previous: 0 },
        redditComments: { current: 0, previous: 0 },
        githubContributions: { current: 0, previous: 0 },
        gitlabContributions: { current: 0, previous: 0 },
      },
      tweets: [],
      redditPosts: [],
      redditComments: [],
      repositories: [],
    });
  }

  const generatedAt = new Date().toISOString();
  const since = new Date(Date.parse(generatedAt) - normalizedDays * 86_400_000).toISOString();
  const sinceDay = since.slice(0, 10);
  const untilDay = generatedAt.slice(0, 10);
  const accountByPlatform = (platform: string) => accountIds.filter((id) =>
    activeAccounts.find((account) => account.id === id)?.platform === platform,
  );

  const [
    twitterCurrent, twitterPrevious,
    githubCurrent, githubPrevious,
    gitlabCurrent, gitlabPrevious,
    redditCurrent, redditPrevious,
    activity,
    topTweets,
    redditContent,
    repositories,
  ] = await Promise.all([
    readAudience("user_stats", "followers_count", accountByPlatform("twitter"), generatedAt, true),
    readAudience("user_stats", "followers_count", accountByPlatform("twitter"), since, false),
    readAudience("github_stats", "followers", accountByPlatform("github"), generatedAt, true),
    readAudience("github_stats", "followers", accountByPlatform("github"), since, false),
    readAudience("gitlab_stats", "followers", accountByPlatform("gitlab"), generatedAt, true),
    readAudience("gitlab_stats", "followers", accountByPlatform("gitlab"), since, false),
    readAudience("reddit_stats", "COALESCE(post_karma, 0) + COALESCE(comment_karma, 0)", accountByPlatform("reddit"), generatedAt, true),
    readAudience("reddit_stats", "COALESCE(post_karma, 0) + COALESCE(comment_karma, 0)", accountByPlatform("reddit"), since, false),
    readActivityCounts(accountIds, since, generatedAt),
    readTopTweets(accountIds, since, generatedAt),
    readTopRedditContent(accountIds, Math.floor(Date.parse(since) / 1000), Math.floor(Date.parse(generatedAt) / 1000)),
    readRepositories(activeAccounts, accountIds, sinceDay, untilDay),
  ]);

  const accountNameById = new Map(activeAccounts.map((account) => [account.id, account.screen_name]));
  return buildPulse({
    generatedAt,
    days: normalizedDays,
    accounts: activeAccounts,
    audience: {
      twitter: { current: twitterCurrent, previous: twitterPrevious },
      github: { current: githubCurrent, previous: githubPrevious },
      gitlab: { current: gitlabCurrent, previous: gitlabPrevious },
      reddit: { current: redditCurrent, previous: redditPrevious },
    },
    activity,
    tweets: topTweets.map((row) => ({
      ...row,
      accountName: accountNameById.get(row.account_id) ?? "",
    })),
    redditPosts: redditContent.posts.map((row) => ({
      ...row,
      accountName: accountNameById.get(row.account_id) ?? "",
    })),
    redditComments: redditContent.comments.map((row) => ({
      ...row,
      accountName: accountNameById.get(row.account_id) ?? "",
    })),
    repositories,
  });
}
