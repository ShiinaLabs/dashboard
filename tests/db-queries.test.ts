import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getTestDatabaseConfig, resetTestDb, getTestPool, closeTestPool } from "./setup";
import { closeDb, getDb, initPgPool } from "../lib/db/connection";
import { github_repos } from "@/db/schema";
import { hasGithubTrackingRelation, getGithubOverview } from "../lib/repositories/github";
import {
  listGithubWatchlist,
  listGithubWatchedRepoIds,
  setGithubWatchlist,
  githubWatchedReposFilter,
} from "../lib/repositories/github-watchlist";
import {
  listGithubSourceRows,
  setGithubSources,
  upsertGithubSource,
  markGithubTrackingError,
} from "../lib/repositories/github-sources";
import * as usersQ from "../lib/repositories/users";
import * as accountsQ from "../lib/repositories/accounts";
import * as twitterQ from "../lib/repositories/twitter";
import * as redditQ from "../lib/repositories/reddit";
import * as githubQ from "../lib/repositories/github";
import * as gitlabQ from "../lib/repositories/gitlab";
import {
  finishFetchRun,
  getFailureStreaks,
  getRecentRuns,
  startFetchRun,
} from "../lib/repositories/fetch-runs";
import { getTopContent } from "../lib/services/top-content";
import { SyncTelemetry } from "../lib/application/usecases/SyncTelemetry";
import { createUser } from "../lib/services/users";

beforeAll(async () => {
  const databaseConfig = getTestDatabaseConfig();
  await resetTestDb();
  await initPgPool(databaseConfig);
});

describe("fetch run queries", () => {
  let accountId: number;

  beforeAll(async () => {
    const user = await usersQ.insertUser({
      username: `fetch_runs_${Date.now()}`,
      password_hash: "hash",
      role: "user",
    });
    const pool = getTestPool();
    const { rows } = await pool.query(
      `INSERT INTO accounts (owner_id, screen_name, platform, auth_token, fetch_interval)
       VALUES ($1, 'fetch_runs_user', 'github', 'token', 30) RETURNING id`,
      [user.id],
    );
    accountId = rows[0].id;
  });

  it("records outcomes, capability gaps, ordering, and failure streaks", async () => {
    const success = await startFetchRun(accountId, "scheduler");
    await finishFetchRun({
      id: success.id,
      status: "success",
      capabilityGaps: [{ capability: "github_traffic", message: "PAT needs repo scope" }],
    });

    const failure = await startFetchRun(accountId, "manual");
    await finishFetchRun({ id: failure.id, status: "failed", errorMessage: "API failed" });

    const partial = await startFetchRun(accountId, "manual");
    await finishFetchRun({ id: partial.id, status: "partial", errorMessage: "Content partially refreshed" });

    const runs = (await getRecentRuns([accountId])).get(accountId);
    expect(runs?.map((run) => run.status)).toEqual(["partial", "failed", "success"]);
    expect(runs?.[2].capability_gaps).toEqual([
      { capability: "github_traffic", message: "PAT needs repo scope" },
    ]);
    expect(runs?.every((run) => typeof run.duration_ms === "number")).toBe(true);

    const streaks = await getFailureStreaks([accountId]);
    expect(streaks.has(accountId)).toBe(false);
  });
});

afterAll(async () => {
  await closeDb();
  await closeTestPool();
});

describe("users queries", () => {
  const testUsername = `testuser_${Date.now()}`;

  it("creates a user", async () => {
    const user = await usersQ.insertUser({ username: testUsername, password_hash: "hash123", role: "user" });
    expect(user).toBeDefined();
    expect(user.username).toBe(testUsername);
    expect(user.role).toBe("user");
    expect(user.id).toBeGreaterThan(0);
  });

  it("finds user by username", async () => {
    const user = await usersQ.getUserByUsername(testUsername);
    expect(user).toBeDefined();
    expect(user!.username).toBe(testUsername);
  });

  it("lists all users", async () => {
    const list = await usersQ.getUsers();
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list.some(u => u.username === testUsername)).toBe(true);
  });

  it("soft-deletes a user", async () => {
    const user = (await usersQ.getUserByUsername(testUsername))!;
    await usersQ.deleteUser(user.id);
    const deleted = await usersQ.getUserByUsername(testUsername);
    expect(deleted).toBeUndefined();
  });

  it("revives soft-deleted user on re-creation", async () => {
    const revived = await createUser(testUsername, "a-longer-test-password", "user");
    expect(revived).toBeDefined();
    expect(revived.username).toBe(testUsername);
  });
});

describe("accounts queries", () => {
  let userId: number;
  let accountId: number;

  beforeAll(async () => {
    const u = await usersQ.insertUser({ username: `acct_owner_${Date.now()}`, password_hash: "pass", role: "user" });
    userId = u.id;
  });

  it("creates an account", async () => {
    const pool = getTestPool();
    const { rows } = await pool.query(
      "INSERT INTO accounts (owner_id, screen_name, platform, auth_token, fetch_interval) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [userId, "test_twitter", "twitter", "token123", 30]
    );
    expect(rows[0].screen_name).toBe("test_twitter");
    accountId = rows[0].id;
  });

  it("lists accounts for owner", async () => {
    const accounts = await accountsQ.getAccounts(userId);
    expect(accounts.length).toBeGreaterThanOrEqual(1);
  });

  it("gets account by id", async () => {
    const account = await accountsQ.getAccountById(accountId);
    expect(account).toBeDefined();
  });

  it("soft-deletes an account", async () => {
    await accountsQ.deleteAccount(accountId);
    const account = await accountsQ.getAccountById(accountId);
    expect(account).toBeUndefined();
  });
});

describe("twitter queries", () => {
  let acctId: number;

  beforeAll(async () => {
    const u = await usersQ.insertUser({ username: `twitter_user_${Date.now()}`, password_hash: "pass", role: "user" });
    const pool = getTestPool();
    const { rows } = await pool.query(
      "INSERT INTO accounts (owner_id, screen_name, platform, auth_token) VALUES ($1, $2, $3, $4) RETURNING *",
      [u.id, "tweet_test", "twitter", "tok"]
    );
    acctId = rows[0].id;
  });

  it("inserts user stats", async () => {
    await twitterQ.insertUserStats({ account_id: acctId, followers_count: 100, following_count: 50, tweet_count: 200 });
    const latest = await twitterQ.getLatestUserStats(acctId);
    expect(latest).toBeDefined();
    expect(latest!.followers_count).toBe(100);
  });

  it("returns only the latest user stats snapshot per date in the timeline", async () => {
    const pool = getTestPool();
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString().slice(0, 10);

    await pool.query(
      `INSERT INTO user_stats (account_id, followers_count, following_count, tweet_count, recorded_at) VALUES
       ($1, 100, 50, 200, $2), ($1, 95, 52, 205, $3),
       ($1, 110, 55, 210, $4), ($1, 108, 56, 212, $5)`,
      [
        acctId,
        `${twoDaysAgo}T08:00:00.000Z`,
        `${twoDaysAgo}T20:00:00.000Z`,
        `${dayAgo}T08:00:00.000Z`,
        `${dayAgo}T20:00:00.000Z`,
      ]
    );

    const timeline = await twitterQ.getTimeline(30, [acctId]);
    const growth = timeline.followerGrowth.filter(
      (r) => r.date === twoDaysAgo || r.date === dayAgo
    );

    expect(growth).toEqual([
      { date: twoDaysAgo, followers_count: 95, following_count: 52, tweet_count: 205 },
      { date: dayAgo, followers_count: 108, following_count: 56, tweet_count: 212 },
    ]);
  });

  it("upserts and retrieves a tweet", async () => {
    await twitterQ.upsertTweet({
      id: "999",
      account_id: acctId,
      full_text: "Hello test",
      created_at: "2024-01-01T00:00:00Z",
      favorite_count: 10,
      retweet_count: 5,
      reply_count: 2,
      view_count: 100,
      bookmark_count: 1,
      is_quote: 0,
      is_reply: 0,
      is_retweet: 0,
      media_urls: "[]",
      urls: "[]",
      hashtags: "[]",
      mentions: "[]",
      lang: "en",
    });

    const result = await twitterQ.getTweets(1, 10, "created_at", "desc", undefined, [acctId]);
    expect(result.data.length).toBe(1);
    expect(result.data[0].full_text).toBe("Hello test");
  });

  it("counts only non-reply non-retweet tweets in todayTweets", async () => {
    const today = new Date().toISOString();

    await twitterQ.upsertTweet({
      id: "today_tweet",
      account_id: acctId,
      full_text: "Today main tweet",
      created_at: today,
      favorite_count: 3,
      retweet_count: 2,
      reply_count: 1,
      view_count: 30,
      bookmark_count: 0,
      is_quote: 0,
      is_reply: 0,
      is_retweet: 0,
      media_urls: "[]",
      urls: "[]",
      hashtags: "[]",
      mentions: "[]",
      lang: "en",
    });

    await twitterQ.upsertTweet({
      id: "today_reply",
      account_id: acctId,
      full_text: "Today reply",
      created_at: today,
      favorite_count: 2,
      retweet_count: 1,
      reply_count: 0,
      view_count: 20,
      bookmark_count: 0,
      is_quote: 0,
      is_reply: 1,
      is_retweet: 0,
      media_urls: "[]",
      urls: "[]",
      hashtags: "[]",
      mentions: "[]",
      lang: "en",
    });

    await twitterQ.upsertTweet({
      id: "today_retweet",
      account_id: acctId,
      full_text: "Today retweet",
      created_at: today,
      favorite_count: 1,
      retweet_count: 0,
      reply_count: 0,
      view_count: 10,
      bookmark_count: 0,
      is_quote: 0,
      is_reply: 0,
      is_retweet: 1,
      media_urls: "[]",
      urls: "[]",
      hashtags: "[]",
      mentions: "[]",
      lang: "en",
    });

    const overview = await twitterQ.getOverviewStats([acctId]);
    expect(overview.todayTweets).toBe(1);
  });
});

describe("reddit queries", () => {
  let acctId: number;

  beforeAll(async () => {
    const u = await usersQ.insertUser({ username: `reddit_user_${Date.now()}`, password_hash: "pass", role: "user" });
    const pool = getTestPool();
    const { rows } = await pool.query(
      "INSERT INTO accounts (owner_id, screen_name, platform, auth_token) VALUES ($1, $2, $3, $4) RETURNING *",
      [u.id, "reddit_test", "reddit", "tok"]
    );
    acctId = rows[0].id;
  });

  it("inserts stats and gets overview", async () => {
    await redditQ.insertRedditStats({ account_id: acctId, post_karma: 500, comment_karma: 300 });
    const overview = await redditQ.getRedditOverview(acctId);
    expect(overview).toBeDefined();
  });

  it("upserts a post", async () => {
    await redditQ.upsertRedditPost({
      id: "post_1", account_id: acctId, title: "Test Post", selftext: "",
      subreddit: "test", score: 42, upvote_ratio: 0.9, num_comments: 10,
      permalink: "/r/test/123/", url: "", is_self: 1, created_utc: 1700000000,
    });
    const result = await redditQ.getRedditPosts(acctId, 1, 20);
    expect(result.data.length).toBe(1);
    expect(result.data[0].title).toBe("Test Post");
  });

  it("upserts a comment", async () => {
    await redditQ.upsertRedditComment({
      id: "comment_1", account_id: acctId, body: "Nice post!", subreddit: "test",
      score: 5, link_id: "t3_post_1", parent_id: "t3_post_1", depth: 1,
      permalink: "/r/test/123/c/", created_utc: 1700000001, is_submitter: 0,
    });
    const result = await redditQ.getRedditComments(acctId, 1, 20);
    expect(result.data.length).toBe(1);
    expect(result.data[0].body).toBe("Nice post!");
  });
});

describe("github queries", () => {
  let acctId: number;

  beforeAll(async () => {
    const u = await usersQ.insertUser({ username: `gh_user_${Date.now()}`, password_hash: "pass", role: "user" });
    const pool = getTestPool();
    const { rows } = await pool.query(
      "INSERT INTO accounts (owner_id, screen_name, platform, auth_token) VALUES ($1, $2, $3, $4) RETURNING *",
      [u.id, "gh_test", "github", "tok"]
    );
    acctId = rows[0].id;
  });

  it("inserts stats and gets overview", async () => {
    await githubQ.insertGithubStats({ account_id: acctId, public_repos: 10, public_gists: 5, followers: 20, following: 8 });
    const overview = await githubQ.getGithubOverview(acctId);
    expect(overview).toBeDefined();
  });

  it("persists split Issue and Pull Request counts", async () => {
    await githubQ.upsertGithubRepo({
      account_id: acctId, repo_id: 200, name: "split", full_name: "gh_test/split",
      description: null, language: null, stars: 3, forks: 1, open_issues: 7,
      open_issues_only: 4, open_pull_requests: 3, topics: "[]", homepage: null,
      is_fork: 0, created_at: null, updated_at: null, pushed_at: null,
    });

    await githubQ.upsertGithubRepoSnapshot({
      account_id: acctId, repo_id: 200, stars: 3, forks: 1, open_issues: 8,
      snapshot_date: "2026-08-23",
    });
    let snapshots = await githubQ.getGithubRepoSnapshots(acctId, 200);
    expect(snapshots[0]).toMatchObject({ open_issues: 8, open_issues_only: null, open_pull_requests: null });

    await githubQ.upsertGithubRepoSnapshot({
      account_id: acctId, repo_id: 200, stars: 3, forks: 1, open_issues: 8,
      open_issues_only: 5, open_pull_requests: 3, snapshot_date: "2026-08-23",
    });
    snapshots = await githubQ.getGithubRepoSnapshots(acctId, 200);
    expect(snapshots[0]).toMatchObject({ open_issues: 8, open_issues_only: 5, open_pull_requests: 3 });

    const overview = await githubQ.getGithubOverview(acctId);
    const repo = overview.allRepos.find(item => item.repo_id === 200);
    expect(repo).toMatchObject({ open_issues: 7, open_issues_only: 4, open_pull_requests: 3 });
  });

  it("keeps one repository row when a second PAT tracks the same stable GitHub id", async () => {
    const pool = getTestPool();
    const secondUser = await usersQ.insertUser({ username: `gh_second_${Date.now()}`, password_hash: "pass", role: "user" });
    const { rows } = await pool.query(
      "INSERT INTO accounts (owner_id, screen_name, platform, auth_token) VALUES ($1, $2, $3, $4) RETURNING id",
      [secondUser.id, "gh_second", "github", "tok"],
    );
    const secondAccountId = rows[0].id as number;
    expect(await githubQ.resolveGithubRepositoryId(secondAccountId, 200)).toBeNull();
    expect(await githubQ.resolveGithubRepositoryId(acctId, 987654321)).toBeNull();

    const stableRepo = {
      github_id: 1241734389,
      node_id: "R_kgDOTransfer",
      owner_github_id: 7654321,
      owner_login: "ShiinaLabs",
      owner_type: "Organization",
      html_url: "https://github.com/ShiinaLabs/wifi-lens",
    };
    await githubQ.upsertGithubRepo({
      account_id: acctId, repo_id: 1241734389, ...stableRepo,
      name: "wifi-lens", full_name: "SHIINASAMA/wifi-lens", description: null,
      language: "TypeScript", stars: 10, forks: 2, open_issues: 1, topics: "[]",
      homepage: null, is_fork: 0, created_at: null, updated_at: null, pushed_at: null,
    });
    await githubQ.upsertGithubRepo({
      account_id: secondAccountId, repo_id: 1241734389, ...stableRepo,
      name: "wifi-lens", full_name: "ShiinaLabs/wifi-lens", description: null,
      language: "TypeScript", stars: 11, forks: 2, open_issues: 1, topics: "[]",
      homepage: null, is_fork: 0, created_at: null, updated_at: null, pushed_at: null,
    });

    const repoRows = await pool.query("SELECT id, full_name FROM github_repos WHERE github_id = $1", [1241734389]);
    const trackingRows = await pool.query("SELECT account_id, repository_id FROM github_repository_tracking WHERE repository_id = $1", [repoRows.rows[0].id]);
    expect(repoRows.rows).toHaveLength(1);
    expect(await githubQ.resolveGithubRepositoryId(acctId, 1241734389)).toBe(repoRows.rows[0].id);
    expect(repoRows.rows[0].full_name).toBe("ShiinaLabs/wifi-lens");
    expect(trackingRows.rows.map((row) => row.account_id).sort()).toEqual([acctId, secondAccountId].sort());

    await githubQ.upsertGithubRepoSnapshot({
      account_id: acctId, repo_id: 1241734389, stars: 10, forks: 2,
      open_issues: 1, snapshot_date: "2026-09-11",
    });
    await githubQ.upsertGithubRepoSnapshot({
      account_id: secondAccountId, repo_id: 1241734389, stars: 11, forks: 2,
      open_issues: 1, snapshot_date: "2026-09-11",
    });
    const snapshot = await pool.query(
      "SELECT repository_id, stars FROM github_repo_snapshots WHERE repository_id = $1 AND snapshot_date = $2",
      [repoRows.rows[0].id, "2026-09-11"],
    );
    expect(snapshot.rows).toHaveLength(1);
    expect(snapshot.rows[0]).toMatchObject({ repository_id: repoRows.rows[0].id, stars: 11 });

    await githubQ.upsertGithubRelease({
      account_id: acctId, repo_id: 1241734389, release_id: 900001,
      tag_name: "v1", name: "v1", body: null, prerelease: 0,
      published_at: "2026-09-10T00:00:00.000Z", html_url: null, total_downloads: 10,
    });
    await githubQ.upsertGithubRelease({
      account_id: secondAccountId, repo_id: 1241734389, release_id: 900001,
      tag_name: "v1", name: "v1", body: null, prerelease: 0,
      published_at: "2026-09-10T00:00:00.000Z", html_url: null, total_downloads: 12,
    });
    const releases = await githubQ.getGithubReleases(secondAccountId, 1241734389);
    expect(releases).toHaveLength(1);
    expect(releases[0].total_downloads).toBe(12);
  });

  it("rolls back the entire asset replacement when a later asset is invalid", async () => {
    const { PgReleaseWrite } = await import("../lib/infra/drizzle/PgReleaseWrite");
    const writer = new PgReleaseWrite();
    const pool = getTestPool();
    const { rows } = await pool.query(`INSERT INTO github_releases
      (account_id, repo_id, release_id, tag_name) VALUES ($1, 200, 900002, 'v2') RETURNING id`, [acctId]);
    const id = rows[0].id;
    await writer.replaceAssets(id, [{ name: "original.zip", download_count: 42 }]);
    const before = await pool.query("SELECT * FROM github_release_assets WHERE release_id = $1", [id]);
    await expect(writer.replaceAssets(id, [{ name: "new.zip" }, { name: null }])).rejects.toThrow();
    const after = await pool.query("SELECT * FROM github_release_assets WHERE release_id = $1", [id]);
    expect(after.rows).toEqual(before.rows);
  });

  it("keeps legacy history visible while repository backfill is incomplete", async () => {
    const pool = getTestPool();
    const day = new Date().toISOString().slice(0, 10);
    await pool.query(`INSERT INTO github_traffic_views (account_id, repo_id, date, count, uniques)
      VALUES ($1, 200, $2, 123, 45)`, [acctId, day]);
    const views = await githubQ.getGithubTrafficViews(acctId, 200);
    expect(views.some(row => row.count === 123 && row.repository_id === null)).toBe(true);
    expect(await githubQ.getGithubTrafficViews(acctId, 999999)).toEqual([]);
  });

  it("upserts a contribution", async () => {
    await githubQ.upsertGithubContribution({ account_id: acctId, date: "2024-01-01", count: 5, level: 2 });
    const contribs = await githubQ.getGithubContributions(acctId);
    expect(contribs.length).toBe(1);
    expect(contribs[0].count).toBe(5);
  });
});

describe("gitlab queries", () => {
  let acctId: number;

  beforeAll(async () => {
    const u = await usersQ.insertUser({ username: `gl_user_${Date.now()}`, password_hash: "pass", role: "user" });
    const pool = getTestPool();
    const { rows } = await pool.query(
      "INSERT INTO accounts (owner_id, screen_name, platform, auth_token) VALUES ($1, $2, $3, $4) RETURNING *",
      [u.id, "gl_test", "gitlab", "tok"]
    );
    acctId = rows[0].id;
  });

  it("inserts stats and gets overview", async () => {
    await gitlabQ.insertGitlabStats({ account_id: acctId, public_projects: 5, followers: 10, following: 3 });
    const overview = await gitlabQ.getGitlabOverview(acctId);
    expect(overview).toBeDefined();
  });

  it("upserts a contribution", async () => {
    await gitlabQ.upsertGitlabContribution({ account_id: acctId, date: "2024-01-01", count: 3 });
    const contribs = await gitlabQ.getGitlabContributions(acctId);
    expect(contribs.length).toBe(1);
    expect(contribs[0].count).toBe(3);
  });
});

describe("top content service queries", () => {
  let ghAcctId: number;
  let glAcctId: number;

  beforeAll(async () => {
    const u = await usersQ.insertUser({ username: `top_content_${Date.now()}`, password_hash: "pass", role: "user" });
    const pool = getTestPool();
    const [gh, gl] = await Promise.all([
      pool.query("INSERT INTO accounts (owner_id, screen_name, platform, auth_token) VALUES ($1, $2, $3, $4) RETURNING id", [u.id, "tc_gh", "github", "tok"]),
      pool.query("INSERT INTO accounts (owner_id, screen_name, platform, auth_token) VALUES ($1, $2, $3, $4) RETURNING id", [u.id, "tc_gl", "gitlab", "tok"]),
    ]);
    ghAcctId = gh.rows[0].id;
    glAcctId = gl.rows[0].id;

    const today = new Date();
    const dayStr = (offset: number) => new Date(today.getTime() - offset * 86_400_000).toISOString().slice(0, 10);

    // GitHub: baseline snapshot (10 days ago), current repo has grown.
    await pool.query(
      `INSERT INTO github_repo_snapshots (account_id, repo_id, stars, forks, snapshot_date) VALUES ($1, 100, 50, 5, $2)`,
      [ghAcctId, dayStr(10)],
    );
    const rising = await pool.query(
      `INSERT INTO github_repos (account_id, repo_id, name, full_name, stars, forks, is_fork)
       VALUES ($1, 100, 'rising', 'tc_gh/rising', 80, 8, 0) RETURNING id`,
      [ghAcctId],
    );
    // Surfacing in top content (and every other surface reading github_repos)
    // requires the repository to be watched.
    await pool.query(
      `INSERT INTO github_repository_tracking (account_id, repository_id, enabled) VALUES ($1, $2, 1)`,
      [ghAcctId, rising.rows[0].id],
    );
    // A repository the user has unselected, with identical growth, must not
    // appear even though its rows and history are still present.
    await pool.query(
      `INSERT INTO github_repo_snapshots (account_id, repo_id, stars, forks, snapshot_date) VALUES ($1, 101, 50, 5, $2)`,
      [ghAcctId, dayStr(10)],
    );
    const hidden = await pool.query(
      `INSERT INTO github_repos (account_id, repo_id, name, full_name, stars, forks, is_fork)
       VALUES ($1, 101, 'hidden', 'tc_gh/hidden', 80, 8, 0) RETURNING id`,
      [ghAcctId],
    );
    await pool.query(
      `INSERT INTO github_repository_tracking (account_id, repository_id, enabled) VALUES ($1, $2, 0)`,
      [ghAcctId, hidden.rows[0].id],
    );
    // GitHub release published inside the window.
    await pool.query(
      `INSERT INTO github_releases (account_id, repo_id, release_id, tag_name, name, published_at, html_url, total_downloads)
       VALUES ($1, 100, 9001, 'v1.0', 'First release', $2, 'https://github.com/tc_gh/rising/releases/v1.0', 250)`,
      [ghAcctId, dayStr(3)],
    );

    // GitLab: project with snapshot and a release + assets inside the window.
    await pool.query(
      `INSERT INTO gitlab_project_snapshots (account_id, project_id, stars, forks, snapshot_date) VALUES ($1, 200, 30, 3, $2)`,
      [glAcctId, dayStr(10)],
    );
    await pool.query(
      `INSERT INTO gitlab_projects (account_id, project_id, name, path_with_namespace, stars, forks, is_fork)
       VALUES ($1, 200, 'growing', 'tc_gl/growing', 45, 6, 0)`,
      [glAcctId],
    );
    const rel = await pool.query(
      `INSERT INTO gitlab_releases (account_id, project_id, release_tag, name, released_at)
       VALUES ($1, 200, 'v0.1', 'Initial release', $2) RETURNING id`,
      [glAcctId, dayStr(2)],
    );
    const releaseRowId = rel.rows[0].id;
    await pool.query(
      `INSERT INTO gitlab_release_assets (release_id, name, download_count) VALUES ($1, 'app.tar.gz', 120)`,
      [releaseRowId],
    );
  });

  it("returns github and gitlab items without SQL errors", async () => {
    const accounts = [
      { id: ghAcctId, screen_name: "tc_gh", platform: "github", is_active: 1 },
      { id: glAcctId, screen_name: "tc_gl", platform: "gitlab", is_active: 1 },
    ];
    const result = await getTopContent(accounts, 7);

    expect(result.items.length).toBeGreaterThan(0);

    const kinds = new Set(result.items.map((item) => item.kind));
    expect(kinds.has("release")).toBe(true);
    expect(kinds.has("repo_growth")).toBe(true);

    const ghRepo = result.items.find((item) => item.kind === "repo_growth" && item.platform === "github");
    expect(ghRepo).toBeDefined();
    expect(ghRepo!.metricValue).toBe(30); // 80 - 50
    expect(ghRepo!.growthRate).toBe(60); // (80 - 50) / 50

    const glRelease = result.items.find((item) => item.kind === "release" && item.platform === "gitlab");
    expect(glRelease).toBeDefined();
    expect(glRelease!.metricValue).toBe(120); // summed from gitlab_release_assets

    const ghRelease = result.items.find((item) => item.kind === "release" && item.platform === "github");
    expect(ghRelease).toBeDefined();
    expect(ghRelease!.metricValue).toBe(250);

    // The unwatched repository is absent from every surface.
    expect(result.items.some((item) => item.fullName === "tc_gh/hidden")).toBe(false);
  });
});

// ─── GitHub watchlist: selection-based monitoring ──────────────────────────
//
// These live in this file rather than their own because `resetTestDb()` drops
// and recreates every table: two files doing that in parallel collide in the
// system catalog. One file owns the DB reset.

/** Insert a repository plus its tracking relation; returns `github_repos.id`. */
async function addGithubRepoFor(accountId: number, repoId: number, fullName: string, enabled = true): Promise<number> {
  const pool = getTestPool();
  const { rows } = await pool.query(
    `INSERT INTO github_repos (account_id, repo_id, github_id, name, full_name, owner_login, owner_type)
     VALUES ($1, $2::int, $2::bigint, $3, $4, $5, 'User') RETURNING id`,
    [accountId, repoId, fullName.split("/")[1], fullName, fullName.split("/")[0]],
  );
  const githubReposId = rows[0].id as number;
  await pool.query(
    "INSERT INTO github_repository_tracking (account_id, repository_id, enabled) VALUES ($1, $2, $3)",
    [accountId, githubReposId, enabled ? 1 : 0],
  );
  return githubReposId;
}

async function createWatchAccount(suffix: string): Promise<number> {
  const user = await usersQ.insertUser({ username: `watch_${suffix}_${Date.now()}`, password_hash: "pass", role: "user" });
  const { rows } = await getTestPool().query(
    "INSERT INTO accounts (owner_id, screen_name, platform, auth_token) VALUES ($1, $2, 'github', 'tok') RETURNING id",
    [user.id, `watch_${suffix}`],
  );
  return rows[0].id as number;
}

describe("github watchlist", () => {
  let watchAccountId: number;

  beforeAll(async () => {
    watchAccountId = await createWatchAccount("main");
  });

  it("never deletes a tracking row or its history when unselecting", async () => {
    const keep = await addGithubRepoFor(watchAccountId, 900001, "alice/keep");
    const drop = await addGithubRepoFor(watchAccountId, 900002, "alice/drop");
    await getTestPool().query(
      "INSERT INTO github_repo_snapshots (account_id, repo_id, repository_id, stars, snapshot_date) VALUES ($1, 900002, $2, 5, '2026-09-01')",
      [watchAccountId, drop],
    );

    await setGithubWatchlist(watchAccountId, [keep]);
    const after = await listGithubWatchlist(watchAccountId);
    expect(after.find((r) => r.githubReposId === keep)?.enabled).toBe(true);
    expect(after.find((r) => r.githubReposId === drop)?.enabled).toBe(false);
    // The row and its history are still there — only the flag moved.
    expect(after).toHaveLength(2);
    const snapshots = await getTestPool().query(
      "SELECT count(*)::int AS n FROM github_repo_snapshots WHERE account_id = $1 AND repo_id = 900002",
      [watchAccountId],
    );
    expect(snapshots.rows[0].n).toBe(1);

    // Re-selecting resumes exactly where it left off.
    await setGithubWatchlist(watchAccountId, [keep, drop]);
    const reselected = await listGithubWatchlist(watchAccountId);
    expect(reselected.every((r) => r.enabled)).toBe(true);
  });

  it("reports which repositories are monitored, and why a failing one is failing", async () => {
    const failing = (await listGithubWatchlist(watchAccountId)).find((r) => r.githubId === 900002)!;
    await markGithubTrackingError(watchAccountId, failing.githubReposId, "GitHub repository 404");
    expect(await listGithubWatchedRepoIds([watchAccountId])).toHaveLength(2);
    const row = (await listGithubWatchlist(watchAccountId)).find((r) => r.githubId === 900002);
    expect(row?.lastError).toContain("404");
  });

  it("tells 'nothing selected' apart from 'nothing tracked yet'", async () => {
    const fresh = await createWatchAccount("fresh");
    expect(await hasGithubTrackingRelation(fresh)).toBe(false);

    // No tracking rows at all: the legacy overview fallback still applies.
    await getTestPool().query(
      "INSERT INTO github_repos (account_id, repo_id, github_id, name, full_name) VALUES ($1, 800001, 800001, 'legacy', 'alice/legacy')",
      [fresh],
    );
    expect((await getGithubOverview(fresh)).totalRepos).toBe(1);

    // With tracking rows present but none enabled, nothing is monitored and
    // nothing may be shown — the repositories must NOT come back.
    const reposId = (await getTestPool().query("SELECT id FROM github_repos WHERE account_id = $1", [fresh])).rows[0].id;
    await getTestPool().query(
      "INSERT INTO github_repository_tracking (account_id, repository_id, enabled) VALUES ($1, $2, 0)",
      [fresh, reposId],
    );
    expect(await hasGithubTrackingRelation(fresh)).toBe(true);
    const selectedNone = await getGithubOverview(fresh);
    expect(selectedNone.totalRepos).toBe(0);
    expect(selectedNone.allRepos).toEqual([]);

    // ...and the shared filter matches nothing either.
    const filter = await githubWatchedReposFilter([fresh]);
    expect(await getDb().select({ id: github_repos.id }).from(github_repos).where(filter)).toHaveLength(0);
  });

  it("filters non-GitHub surfaces down to monitored repositories only", async () => {
    const accountId = await createWatchAccount("filter");
    const pool = getTestPool();
    const watched = await pool.query(
      "INSERT INTO github_repos (account_id, repo_id, github_id, name, full_name) VALUES ($1, 700001, 700001, 'w', 'a/w') RETURNING id",
      [accountId],
    );
    const unwatched = await pool.query(
      "INSERT INTO github_repos (account_id, repo_id, github_id, name, full_name) VALUES ($1, 700002, 700002, 'u', 'a/u') RETURNING id",
      [accountId],
    );
    await pool.query("INSERT INTO github_repository_tracking (account_id, repository_id, enabled) VALUES ($1, $2, 1)", [accountId, watched.rows[0].id]);
    await pool.query("INSERT INTO github_repository_tracking (account_id, repository_id, enabled) VALUES ($1, $2, 0)", [accountId, unwatched.rows[0].id]);

    expect(await listGithubWatchedRepoIds([accountId])).toEqual([watched.rows[0].id]);
  });
});

describe("github discovery sources", () => {
  let sourceAccount: number;

  beforeAll(async () => {
    sourceAccount = await createWatchAccount("sources");
  });

  it("soft-disables a removed organization instead of deleting it, and keeps its identity", async () => {
    await upsertGithubSource({ account_id: sourceAccount, source_type: "organization", login: "ShiinaLabs", github_id: 1234, node_id: "O_1" });
    await setGithubSources(sourceAccount, ["ShiinaLabs", "libsese"]);
    expect((await listGithubSourceRows(sourceAccount)).map((r) => r.login).sort()).toEqual(["ShiinaLabs", "libsese"]);

    await setGithubSources(sourceAccount, ["ShiinaLabs"]);
    const rows = await listGithubSourceRows(sourceAccount);
    expect(rows.find((r) => r.login === "ShiinaLabs")?.enabled).toBe(true);
    expect(rows.find((r) => r.login === "libsese")?.enabled).toBe(false);

    // The row survives, and re-adding restores it without losing the captured id.
    expect(rows).toHaveLength(2);
    await setGithubSources(sourceAccount, ["ShiinaLabs", "libsese"]);
    expect((await listGithubSourceRows(sourceAccount)).find((r) => r.login === "libsese")?.enabled).toBe(true);
    const identity = await getTestPool().query(
      "SELECT github_id, node_id FROM github_sources WHERE account_id = $1 AND login = 'ShiinaLabs'",
      [sourceAccount],
    );
    expect(Number(identity.rows[0].github_id)).toBe(1234);
    expect(identity.rows[0].node_id).toBe("O_1");
  });

  it("re-enabling a source does not wipe an identity captured earlier", async () => {
    await upsertGithubSource({ account_id: sourceAccount, source_type: "organization", login: "DreamerQcl" });
    const created = await getTestPool().query(
      "SELECT github_id FROM github_sources WHERE account_id = $1 AND login = 'DreamerQcl'",
      [sourceAccount],
    );
    expect(created.rows[0].github_id).toBeNull();
    // A later upsert that supplies no identity must not null out one that exists.
    await upsertGithubSource({ account_id: sourceAccount, source_type: "organization", login: "ShiinaLabs" });
    const kept = await getTestPool().query(
      "SELECT github_id FROM github_sources WHERE account_id = $1 AND login = 'ShiinaLabs'",
      [sourceAccount],
    );
    expect(Number(kept.rows[0].github_id)).toBe(1234);
  });

  it("clears every organization when the selection is empty", async () => {
    await setGithubSources(sourceAccount, []);
    expect((await listGithubSourceRows(sourceAccount)).every((r) => !r.enabled)).toBe(true);
  });
});

// ─── GitHub L2 telemetry ───────────────────────────────────────────────────
//
// These need a database: SyncTelemetry returns early when no pool is
// initialised, so a unit test without PostgreSQL never reaches the loop.

describe("github L2 telemetry", () => {
  const telemetryRepo = (accountId: number, repoId: number, fullName: string) => ({
    type: "RepoMetaFetched" as const,
    repo: { accountId, repoId, fullName } as never,
  });

  it("keeps collecting after a repository fails, and reports it", async () => {
    const accountId = await createWatchAccount("l2");
    await addGithubRepoFor(accountId, 600001, "alice/ok");
    await addGithubRepoFor(accountId, 600002, "alice/broken");
    const account = { id: accountId, screenName: "l2", platform: "github", authToken: "tok" };

    // The failing repository comes FIRST. Previously the per-repository
    // identity lookup sat outside the guard, so one failure aborted the whole
    // loop and every repository after it silently stopped updating — a fixed
    // subset of repositories stayed stale while the rest looked healthy.
    const fetcher = {
      fetchRepoMeta: async () => [
        telemetryRepo(accountId, 600002, "alice/broken"),
        telemetryRepo(accountId, 600001, "alice/ok"),
      ],
    };
    const client = {
      fetchRepoTraffic: async (fullName: string) => {
        if (fullName === "alice/broken") throw new Error("GitHub traffic 500");
        return { clones: [{ date: "2026-09-12", count: 5, uniques: 2 }], views: [], referrers: [], paths: [], errors: [] };
      },
    };

    const result = await new SyncTelemetry({} as never, fetcher as never, client as never).execute(account as never);

    expect(result.repos).toBe(2);
    expect(result.trafficFailures).toEqual([{ fullName: "alice/broken", message: "GitHub traffic 500" }]);
    // The repository AFTER the failure was still collected.
    const written = await getTestPool().query(
      "SELECT count(*)::int AS n FROM github_traffic_clones WHERE account_id = $1 AND repo_id = 600001",
      [accountId],
    );
    expect(written.rows[0].n).toBe(1);
  });

  it("writes the data that did come back and reports only the failing endpoints", async () => {
    const accountId = await createWatchAccount("l2partial");
    await addGithubRepoFor(accountId, 600003, "alice/partial");
    const account = { id: accountId, screenName: "l2partial", platform: "github", authToken: "tok" };
    const fetcher = { fetchRepoMeta: async () => [telemetryRepo(accountId, 600003, "alice/partial")] };
    const client = {
      fetchRepoTraffic: async () => ({
        clones: [{ date: "2026-09-12", count: 9, uniques: 4 }],
        views: [],
        referrers: [],
        paths: [],
        errors: ["paths 403 (traffic needs push access): Resource not accessible"],
      }),
    };

    const result = await new SyncTelemetry({} as never, fetcher as never, client as never).execute(account as never);

    expect(result.trafficFailures).toHaveLength(1);
    expect(result.trafficFailures[0].message).toContain("push access");
    const written = await getTestPool().query(
      "SELECT count, uniques FROM github_traffic_clones WHERE account_id = $1 AND repo_id = 600003",
      [accountId],
    );
    // Partial data is still persisted rather than discarded with the failure.
    expect(written.rows).toEqual([{ count: 9, uniques: 4 }]);
  });
});
