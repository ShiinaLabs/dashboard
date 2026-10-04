// @ts-nocheck — Drizzle ORM types are complex
import { eq, desc, sql, count, gte, and, inArray, type SQL } from "drizzle-orm";
import { getDb } from "../db/connection";
import { reddit_stats, reddit_posts, reddit_comments } from "@/db/schema";
import { isMockMode } from "../config";
import * as mock from "../mock";

export async function insertRedditStats(stats: { account_id: number; post_karma: number; comment_karma: number }) {
  await getDb().insert(reddit_stats).values({ ...stats, recorded_at: sql`NOW()` });
}

export async function getRedditTimeline(accountId: number, days = 30) {
  if (isMockMode()) return mock.redditTimeline;
  const since = new Date(); since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString();
  const { rows } = await getDb().execute<{
    date: string;
    post_karma: number;
    comment_karma: number;
  }>(sql`SELECT DISTINCT ON (SUBSTRING(${reddit_stats.recorded_at}, 1, 10))
    SUBSTRING(${reddit_stats.recorded_at}, 1, 10) AS date,
    ${reddit_stats.post_karma},
    ${reddit_stats.comment_karma}
  FROM ${reddit_stats}
  WHERE ${reddit_stats.account_id} = ${accountId}
    AND ${reddit_stats.recorded_at} >= ${sinceStr}
  ORDER BY SUBSTRING(${reddit_stats.recorded_at}, 1, 10), ${reddit_stats.recorded_at} DESC`);
  return rows;
}

export async function upsertRedditPost(post: { id: string; account_id: number; title: string; selftext: string; subreddit: string; score: number; upvote_ratio: number; num_comments: number; permalink: string; url: string; is_self: number; created_utc: number }) {
  await getDb().insert(reddit_posts).values({ ...post, fetched_at: sql`NOW()` }).onConflictDoUpdate({
    target: reddit_posts.id,
    set: { score: post.score, upvote_ratio: post.upvote_ratio, num_comments: post.num_comments },
  });
}

export async function upsertRedditComment(comment: { id: string; account_id: number; body: string; subreddit: string; score: number; link_id: string; parent_id: string | null; depth: number; permalink: string; created_utc: number; is_submitter: number }) {
  await getDb().insert(reddit_comments).values({ ...comment, fetched_at: sql`NOW()` }).onConflictDoUpdate({
    target: reddit_comments.id,
    set: { score: comment.score },
  });
}

export async function getRedditPosts(accountId: number, page: number, limit: number, sort = "score") {
  if (isMockMode()) {
    const data = [...mock.redditPosts].sort((a, b) => (b[sort] ?? b.score) - (a[sort] ?? a.score));
    const total = data.length;
    return { data: data.slice((page - 1) * limit, page * limit), total, page, limit, totalPages: Math.ceil(total / limit) };
  }
  const offset = (page - 1) * limit;
  const allowed: Record<string, SQL<unknown>> = { score: reddit_posts.score, num_comments: reddit_posts.num_comments, created_utc: reddit_posts.created_utc };
  const sortCol = allowed[sort] || reddit_posts.score;
  const [total] = await getDb().select({ count: count() }).from(reddit_posts).where(eq(reddit_posts.account_id, accountId));
  const data = await getDb().select().from(reddit_posts)
    .where(eq(reddit_posts.account_id, accountId)).orderBy(desc(sortCol)).limit(limit).offset(offset);
  return { data, total: total.count, page, limit, totalPages: Math.ceil(total.count / limit) };
}

export async function getRedditComments(accountId: number, page: number, limit: number) {
  if (isMockMode()) {
    const data = mock.redditComments;
    const total = data.length;
    return { data: data.slice((page - 1) * limit, page * limit), total, page, limit, totalPages: Math.ceil(total / limit) };
  }
  const offset = (page - 1) * limit;
  const [total] = await getDb().select({ count: count() }).from(reddit_comments).where(eq(reddit_comments.account_id, accountId));
  const data = await getDb().select().from(reddit_comments)
    .where(eq(reddit_comments.account_id, accountId)).orderBy(desc(reddit_comments.created_utc)).limit(limit).offset(offset);
  return { data, total: total.count, page, limit, totalPages: Math.ceil(total.count / limit) };
}

export async function getRedditOverview(accountId: number) {
  if (isMockMode()) return mock.redditOverview;
  const [latest] = await getDb().select().from(reddit_stats)
    .where(eq(reddit_stats.account_id, accountId)).orderBy(desc(reddit_stats.recorded_at)).limit(1);
  const [postCount] = await getDb().select({ count: count() }).from(reddit_posts).where(eq(reddit_posts.account_id, accountId));
  const [commentCount] = await getDb().select({ count: count() }).from(reddit_comments).where(eq(reddit_comments.account_id, accountId));
  const [scoreSum] = await getDb().select({ s: sql<number>`COALESCE(SUM(${reddit_posts.score}), 0)` }).from(reddit_posts).where(eq(reddit_posts.account_id, accountId));
  const topPosts = await getDb().select({
    id: reddit_posts.id, title: reddit_posts.title, subreddit: reddit_posts.subreddit,
    score: reddit_posts.score, num_comments: reddit_posts.num_comments,
    upvote_ratio: reddit_posts.upvote_ratio, permalink: reddit_posts.permalink,
    created_utc: reddit_posts.created_utc,
  }).from(reddit_posts).where(eq(reddit_posts.account_id, accountId)).orderBy(desc(reddit_posts.score)).limit(10);
  return { stats: latest || undefined, totalPosts: postCount.count, totalComments: commentCount.count, totalScore: scoreSum.s, topPosts };
}

/** Batched Reddit aggregates for the overview page, scoped to the visible account IDs. */
export async function getRedditOverviewSummary(accountIds: number[], days = 30) {
  if (accountIds.length === 0) return {
    postKarma: 0, commentKarma: 0, totalPosts: 0, totalComments: 0,
    karmaTimeline: [], dailyActivity: [], subreddits: [],
  };
  if (isMockMode()) return {
    postKarma: Number(mock.redditOverview.stats?.post_karma ?? 0) * accountIds.length,
    commentKarma: Number(mock.redditOverview.stats?.comment_karma ?? 0) * accountIds.length,
    totalPosts: mock.redditOverview.totalPosts * accountIds.length,
    totalComments: mock.redditOverview.totalComments * accountIds.length,
    karmaTimeline: mock.redditTimeline.map((day) => ({ ...day, post_karma: day.post_karma * accountIds.length, comment_karma: day.comment_karma * accountIds.length })),
    dailyActivity: mergeMockRedditActivity().map((day) => ({ ...day, posts: day.posts * accountIds.length, comments: day.comments * accountIds.length })),
    subreddits: mock.redditSubreddits.map((subreddit) => ({ ...subreddit, count: subreddit.count * accountIds.length })),
  };

  const since = new Date(Date.now() - Math.min(365, Math.max(1, days)) * 86_400_000).toISOString();
  const sinceEpoch = Math.floor(Date.parse(since) / 1000);
  const db = getDb();
  const idList = sql.join(accountIds.map((id) => sql`${id}`), sql`, `);
  const [karma, postCounts, commentCounts, postDays, commentDays, postSubs, commentSubs] = await Promise.all([
    db.execute<{ post_karma: number; comment_karma: number }>(sql`SELECT
      COALESCE(SUM(post_karma), 0)::int AS post_karma,
      COALESCE(SUM(comment_karma), 0)::int AS comment_karma
      FROM (SELECT DISTINCT ON (account_id) account_id, post_karma, comment_karma
        FROM ${reddit_stats} WHERE account_id IN (${idList}) ORDER BY account_id, recorded_at DESC) latest`),
    db.select({ count: count() }).from(reddit_posts).where(inArray(reddit_posts.account_id, accountIds)),
    db.select({ count: count() }).from(reddit_comments).where(inArray(reddit_comments.account_id, accountIds)),
    db.select({ date: sql<string>`TO_CHAR(TO_TIMESTAMP(${reddit_posts.created_utc})::date, 'YYYY-MM-DD')`, count: count() })
      .from(reddit_posts).where(and(inArray(reddit_posts.account_id, accountIds), gte(reddit_posts.created_utc, sinceEpoch)))
      .groupBy(sql`TO_TIMESTAMP(${reddit_posts.created_utc})::date`).orderBy(sql`TO_TIMESTAMP(${reddit_posts.created_utc})::date`),
    db.select({ date: sql<string>`TO_CHAR(TO_TIMESTAMP(${reddit_comments.created_utc})::date, 'YYYY-MM-DD')`, count: count() })
      .from(reddit_comments).where(and(inArray(reddit_comments.account_id, accountIds), gte(reddit_comments.created_utc, sinceEpoch)))
      .groupBy(sql`TO_TIMESTAMP(${reddit_comments.created_utc})::date`).orderBy(sql`TO_TIMESTAMP(${reddit_comments.created_utc})::date`),
    db.select({ subreddit: reddit_posts.subreddit, count: count() }).from(reddit_posts)
      .where(inArray(reddit_posts.account_id, accountIds)).groupBy(reddit_posts.subreddit),
    db.select({ subreddit: reddit_comments.subreddit, count: count() }).from(reddit_comments)
      .where(inArray(reddit_comments.account_id, accountIds)).groupBy(reddit_comments.subreddit),
  ]);
  const { rows: timelineRows } = await db.execute<{ date: string; post_karma: number; comment_karma: number }>(
    sql`SELECT date, SUM(post_karma)::int AS post_karma, SUM(comment_karma)::int AS comment_karma FROM (
      SELECT DISTINCT ON (account_id, SUBSTRING(recorded_at, 1, 10))
        account_id, SUBSTRING(recorded_at, 1, 10) AS date, post_karma, comment_karma
      FROM ${reddit_stats} WHERE account_id IN (${idList}) AND recorded_at >= ${since}
      ORDER BY account_id, SUBSTRING(recorded_at, 1, 10), recorded_at DESC
    ) daily GROUP BY date ORDER BY date`);
  const activity = new Map<string, { posts: number; comments: number }>();
  for (const row of postDays) activity.set(row.date, { posts: Number(row.count), comments: 0 });
  for (const row of commentDays) {
    const value = activity.get(row.date) ?? { posts: 0, comments: 0 };
    value.comments = Number(row.count);
    activity.set(row.date, value);
  }
  const subredditCounts = new Map<string, number>();
  for (const row of [...postSubs, ...commentSubs]) subredditCounts.set(row.subreddit, (subredditCounts.get(row.subreddit) ?? 0) + Number(row.count));
  return {
    postKarma: Number(karma.rows[0]?.post_karma ?? 0),
    commentKarma: Number(karma.rows[0]?.comment_karma ?? 0),
    totalPosts: Number(postCounts[0]?.count ?? 0),
    totalComments: Number(commentCounts[0]?.count ?? 0),
    karmaTimeline: timelineRows,
    dailyActivity: [...activity].sort(([left], [right]) => left.localeCompare(right)).map(([date, value]) => ({ date, ...value })),
    subreddits: [...subredditCounts].map(([subreddit, value]) => ({ subreddit, count: value })).sort((a, b) => b.count - a.count).slice(0, 10),
  };
}

function mergeMockRedditActivity() {
  const activity = new Map<string, { posts: number; comments: number }>();
  for (const row of mock.redditActivity.posts) activity.set(row.date, { posts: row.count, comments: 0 });
  for (const row of mock.redditActivity.comments) {
    const value = activity.get(row.date) ?? { posts: 0, comments: 0 };
    value.comments = row.count;
    activity.set(row.date, value);
  }
  return [...activity].sort(([left], [right]) => left.localeCompare(right)).map(([date, value]) => ({ date, ...value }));
}

export async function getRedditDailyActivity(accountId: number, days = 30) {
  if (isMockMode()) return mock.redditActivity.posts;
  const since = new Date(); since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString();
  return getDb().select({
    date: sql`TO_TIMESTAMP(${reddit_posts.created_utc})::date`.as("date"),
    count: count(),
  }).from(reddit_posts)
    .where(and(eq(reddit_posts.account_id, accountId), gte(sql`TO_TIMESTAMP(${reddit_posts.created_utc})`, sinceStr)))
    .groupBy(sql`TO_TIMESTAMP(${reddit_posts.created_utc})::date`)
    .orderBy(sql`TO_TIMESTAMP(${reddit_posts.created_utc})::date`);
}

export async function getRedditDailyCommentActivity(accountId: number, days = 30) {
  if (isMockMode()) return mock.redditActivity.comments;
  const since = new Date(); since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString();
  return getDb().select({
    date: sql`TO_TIMESTAMP(${reddit_comments.created_utc})::date`.as("date"),
    count: count(),
  }).from(reddit_comments)
    .where(and(eq(reddit_comments.account_id, accountId), gte(sql`TO_TIMESTAMP(${reddit_comments.created_utc})`, sinceStr)))
    .groupBy(sql`TO_TIMESTAMP(${reddit_comments.created_utc})::date`)
    .orderBy(sql`TO_TIMESTAMP(${reddit_comments.created_utc})::date`);
}

export async function getRedditSubredditDistribution(accountId: number) {
  if (isMockMode()) return mock.redditSubreddits;
  const posts = await getDb().select({ subreddit: reddit_posts.subreddit, count: count() })
    .from(reddit_posts).where(eq(reddit_posts.account_id, accountId)).groupBy(reddit_posts.subreddit);
  const comments = await getDb().select({ subreddit: reddit_comments.subreddit, count: count() })
    .from(reddit_comments).where(eq(reddit_comments.account_id, accountId)).groupBy(reddit_comments.subreddit);
  const combined = new Map<string, number>();
  for (const p of posts) combined.set(p.subreddit, (combined.get(p.subreddit) || 0) + p.count);
  for (const c of comments) combined.set(c.subreddit, (combined.get(c.subreddit) || 0) + c.count);
  return [...combined.entries()].map(([subreddit, count]) => ({ subreddit, count })).sort((a, b) => b.count - a.count).slice(0, 10);
}
