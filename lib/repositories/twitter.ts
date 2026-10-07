// @ts-nocheck — Drizzle ORM types are complex
import { eq, and, desc, sql, count, inArray, gte, lt, like, type SQL } from "drizzle-orm";
import { getDb } from "../db/connection";
import { tweets, user_stats } from "@/db/schema";
import type { OverviewStats } from "../../shared/types";
import { isMockMode } from "../config";
import * as mock from "../mock";

export const EMPTY_OVERVIEW: OverviewStats = {
  tweet_count: 0, tweet_likes: 0, tweet_retweets: 0, tweet_views: 0,
  reply_count: 0, reply_likes: 0, reply_retweets: 0, reply_views: 0,
  followersCount: 0, followingCount: 0, userTweetCount: 0,
  todayLikes: 0, todayRetweets: 0, todayTweets: 0,
};

function hasIds(ids?: number[]): ids is number[] { return Array.isArray(ids) && ids.length > 0; }
function isExplicitEmpty(ids?: number[]): boolean { return Array.isArray(ids) && ids.length === 0; }

export async function getOverviewStats(accountIds?: number[]) {
  if (isMockMode()) return mock.overviewStats;
  if (isExplicitEmpty(accountIds)) return { ...EMPTY_OVERVIEW };
  const db = getDb();
  const tweetFilter = hasIds(accountIds) ? inArray(tweets.account_id, accountIds) : undefined;
  const idsParam = tweetFilter;

  const tweetCond = and(eq(tweets.is_reply, 0), eq(tweets.is_retweet, 0), ...(idsParam ? [idsParam] : []));
  const [tw] = await db.select({
    tweet_count: count(),
    tweet_likes: sql<number>`COALESCE(SUM(${tweets.favorite_count}), 0)`,
    tweet_retweets: sql<number>`COALESCE(SUM(${tweets.retweet_count}), 0)`,
    tweet_views: sql<number>`COALESCE(SUM(${tweets.view_count}), 0)`,
  }).from(tweets).where(tweetCond);

  const replyCond = and(eq(tweets.is_reply, 1), ...(idsParam ? [idsParam] : []));
  const [rp] = await db.select({
    reply_count: count(),
    reply_likes: sql<number>`COALESCE(SUM(${tweets.favorite_count}), 0)`,
    reply_retweets: sql<number>`COALESCE(SUM(${tweets.retweet_count}), 0)`,
    reply_views: sql<number>`COALESCE(SUM(${tweets.view_count}), 0)`,
  }).from(tweets).where(replyCond);

  const today = new Date().toISOString().slice(0, 10);
  const todayCond = and(
    gte(tweets.created_at, today),
    eq(tweets.is_reply, 0),
    eq(tweets.is_retweet, 0),
    ...(idsParam ? [idsParam] : []),
  );
  const [td] = await db.select({
    today_likes: sql<number>`COALESCE(SUM(${tweets.favorite_count}), 0)`,
    today_retweets: sql<number>`COALESCE(SUM(${tweets.retweet_count}), 0)`,
    today_tweets: count(),
  }).from(tweets).where(todayCond);

  const allStats = await db.select({
    account_id: user_stats.account_id,
    followers_count: user_stats.followers_count,
    following_count: user_stats.following_count,
    tweet_count: user_stats.tweet_count,
  }).from(user_stats)
    .where(hasIds(accountIds) ? inArray(user_stats.account_id, accountIds) : undefined)
    .orderBy(desc(user_stats.recorded_at));

  const latestMap = new Map<number, typeof allStats[0]>();
  for (const s of allStats) { if (!latestMap.has(s.account_id)) latestMap.set(s.account_id, s); }
  const latestRows = [...latestMap.values()];
  return {
    tweet_count: tw?.tweet_count ?? 0,
    tweet_likes: tw?.tweet_likes ?? 0,
    tweet_retweets: tw?.tweet_retweets ?? 0,
    tweet_views: tw?.tweet_views ?? 0,
    reply_count: rp?.reply_count ?? 0,
    reply_likes: rp?.reply_likes ?? 0,
    reply_retweets: rp?.reply_retweets ?? 0,
    reply_views: rp?.reply_views ?? 0,
    followersCount: latestRows.reduce((s, r) => s + r.followers_count, 0),
    followingCount: latestRows.reduce((s, r) => s + r.following_count, 0),
    userTweetCount: latestRows.reduce((s, r) => s + r.tweet_count, 0),
    todayLikes: Number(td?.today_likes ?? 0),
    todayRetweets: Number(td?.today_retweets ?? 0),
    todayTweets: Number(td?.today_tweets ?? 0),
  };
}

export async function getTweets(page: number, limit: number, sort: string, order: string, search?: string, accountIds?: number[], isReply?: number) {
  if (isMockMode()) {
    const data = isReply === undefined ? mock.tweets : mock.tweets.filter((t) => t.is_reply === isReply);
    const total = data.length;
    return { data: data.slice((page - 1) * limit, page * limit), total, page, limit, totalPages: Math.ceil(total / limit) };
  }
  if (isExplicitEmpty(accountIds)) return { data: [], total: 0, page, limit, totalPages: 0 };
  const db = getDb();
  const offset = (page - 1) * limit;
  const conditions: SQL<unknown>[] = [];
  if (search) {
    // Escape SQL LIKE wildcards to prevent users from matching unintended patterns
    const escaped = search.replace(/%/g, "\\%").replace(/_/g, "\\_");
    conditions.push(like(tweets.full_text, `%${escaped}%`));
  }
  if (hasIds(accountIds)) conditions.push(inArray(tweets.account_id, accountIds));
  if (isReply !== undefined) conditions.push(eq(tweets.is_reply, isReply));
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const allowed: Record<string, SQL<unknown>> = {
    created_at: tweets.created_at, favorite_count: tweets.favorite_count,
    retweet_count: tweets.retweet_count, reply_count: tweets.reply_count,
    view_count: tweets.view_count,
  };
  const sortCol = allowed[sort] || tweets.created_at;
  const sortOrder = order === "asc" ? sortCol : desc(sortCol);
  const [total] = await db.select({ count: count() }).from(tweets).where(whereClause);
  const data = await db.select().from(tweets).where(whereClause).orderBy(sortOrder).limit(limit).offset(offset);
  return { data, total: total.count, page, limit, totalPages: Math.ceil(total.count / limit) };
}

export async function getTweetById(id: string) {
  if (isMockMode()) return mock.tweets.find((t) => t.id === id) ?? mock.tweets[0];
  const rows = await getDb().select().from(tweets).where(eq(tweets.id, id)).limit(1);
  return rows[0];
}

export async function getTimeline(days = 30, accountIds?: number[]) {
  if (isMockMode()) return mock.timelineData;
  if (isExplicitEmpty(accountIds)) return { dailyTweets: [], followerGrowth: [] };
  const db = getDb();
  const since = new Date(); since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString();
  const tweetFilter = hasIds(accountIds) ? inArray(tweets.account_id, accountIds) : undefined;

  const dailyTweets = await db.select({
    date: sql`DATE(${tweets.created_at})`.as<string>(),
    tweets_count: count(),
    total_likes: sql<number>`COALESCE(SUM(${tweets.favorite_count}), 0)`,
    total_retweets: sql<number>`COALESCE(SUM(${tweets.retweet_count}), 0)`,
    total_replies: sql<number>`COALESCE(SUM(${tweets.reply_count}), 0)`,
    total_views: sql<number>`COALESCE(SUM(${tweets.view_count}), 0)`,
  }).from(tweets)
    .where(and(gte(tweets.created_at, sinceStr), tweetFilter))
    .groupBy(sql`DATE(${tweets.created_at})`)
    .orderBy(sql`DATE(${tweets.created_at})`);

  const { rows: followerGrowth } = await db.execute<{
    date: string;
    followers_count: number;
    following_count: number;
    tweet_count: number;
  }>(sql`SELECT DISTINCT ON (SUBSTRING(${user_stats.recorded_at}, 1, 10))
    SUBSTRING(${user_stats.recorded_at}, 1, 10) AS date,
    ${user_stats.followers_count},
    ${user_stats.following_count},
    ${user_stats.tweet_count}
  FROM ${user_stats}
  WHERE ${user_stats.account_id} = ANY(${accountIds && accountIds.length > 0 ? sql`ARRAY[${sql.join(accountIds.map(id => sql`${id}`), sql`, `)}]::int[]` : sql`ARRAY[]::int[]`})
    AND ${user_stats.recorded_at} >= ${sinceStr}
  ORDER BY SUBSTRING(${user_stats.recorded_at}, 1, 10), ${user_stats.recorded_at} DESC`);

  return { dailyTweets, followerGrowth };
}

export async function getTopTweets(metric: string, limit: number, accountIds?: number[]) {
  if (isMockMode()) return mock.topTweets.slice(0, limit);
  if (isExplicitEmpty(accountIds)) return [];
  const allowed: Record<string, SQL<unknown>> = {
    favorite_count: tweets.favorite_count, retweet_count: tweets.retweet_count,
    reply_count: tweets.reply_count, view_count: tweets.view_count,
    bookmark_count: tweets.bookmark_count,
  };
  const col = allowed[metric] || tweets.favorite_count;
  const whereClause = hasIds(accountIds) ? inArray(tweets.account_id, accountIds) : undefined;
  return getDb().select().from(tweets).where(whereClause).orderBy(desc(col)).limit(limit);
}

export async function getCalendarData(yr: number, accountIds?: number[]) {
  if (isMockMode()) return mock.calendarData;
  if (isExplicitEmpty(accountIds)) return [];
  const conditions: SQL<unknown>[] = [
    gte(tweets.created_at, `${yr}-01-01`),
    lt(tweets.created_at, `${yr + 1}-01-01`),
  ];
  if (hasIds(accountIds)) conditions.push(inArray(tweets.account_id, accountIds));
  return getDb().select({
    date: sql`DATE(${tweets.created_at})`.as<string>(),
    count: count(),
  }).from(tweets)
    .where(and(...conditions))
    .groupBy(sql`DATE(${tweets.created_at})`)
    .orderBy(sql`DATE(${tweets.created_at})`) as Promise<{ date: string; count: number }[]>;
}

export async function upsertTweet(tweet: { id: string; account_id: number; full_text: string; created_at: string; favorite_count: number; retweet_count: number; reply_count: number; view_count: number; bookmark_count: number; is_quote: number; is_reply: number; is_retweet: number; media_urls: string; urls: string; hashtags: string; mentions: string; lang: string }) {
  await getDb().insert(tweets).values({ ...tweet, fetched_at: sql`NOW()` }).onConflictDoUpdate({
    target: tweets.id,
    set: {
      favorite_count: tweet.favorite_count,
      retweet_count: tweet.retweet_count,
      reply_count: tweet.reply_count,
      view_count: tweet.view_count,
      bookmark_count: tweet.bookmark_count,
    },
  });
}

export async function insertUserStats(stats: { account_id: number; followers_count: number; following_count: number; tweet_count: number; listed_count?: number }) {
  await getDb().insert(user_stats).values({...stats, listed_count: stats.listed_count ?? 0, recorded_at: sql`NOW()`});
}

export async function getLatestUserStats(accountId: number) {
  if (isMockMode()) return mock.latestUserStats;
  return getDb().select().from(user_stats)
    .where(eq(user_stats.account_id, accountId))
    .orderBy(desc(user_stats.recorded_at))
    .limit(1)
    .then(rows => rows[0]);
}

export async function updateTweetEngagement(tweetId: string, eng: { favorite_count: number; retweet_count: number; reply_count: number; view_count: number; bookmark_count: number }) {
  await getDb().update(tweets).set(eng).where(eq(tweets.id, tweetId));
}
