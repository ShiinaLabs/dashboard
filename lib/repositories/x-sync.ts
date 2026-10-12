import { getPgPool } from "../db/connection";

export interface XDiscoveryRecord { id: string; publishedAt: string | null; isPinned: boolean }
export type XCandidateKind = "new" | "retry" | "due";
export interface XSyncCandidate extends XDiscoveryRecord {
  kind: XCandidateKind;
  failureCount: number;
  lastAttemptAt: string | null;
  fetchedAt: string | null;
  metrics: { likes: number | null; replies: number | null; reposts: number | null; bookmarks: number | null } | null;
}

function pool() {
  const p = getPgPool();
  if (!p) throw new Error("PostgreSQL is unavailable");
  return p;
}

/** Idempotently seeds at most 250 existing rows per run; old fetched_at values are never reused as proof of a fresh detail request. */
export async function seedLegacyXTweetState(accountId: number, batchSize = 250): Promise<number> {
  const result = await pool().query(`
    WITH batch AS (
      SELECT t.id, t.created_at, row_number() OVER (ORDER BY t.created_at, t.id) AS position
      FROM tweets t
      LEFT JOIN x_tweet_sync_state s ON s.account_id = t.account_id AND s.tweet_id = t.id
      WHERE t.account_id = $1 AND s.tweet_id IS NULL
      ORDER BY t.created_at, t.id
      LIMIT $2
    )
    INSERT INTO x_tweet_sync_state (account_id, tweet_id, published_at, first_seen_at, is_pinned, next_due_at)
    SELECT $1, id, created_at, NOW(), FALSE, (NOW() + ((position - 1) % 240) * INTERVAL '1 minute')::text FROM batch
    ON CONFLICT (account_id, tweet_id) DO NOTHING
  `, [accountId, batchSize]);
  return result.rowCount ?? 0;
}

export async function upsertDiscoveredXTweets(accountId: number, records: XDiscoveryRecord[]): Promise<void> {
  if (!records.length) return;
  const p = pool();
  for (const record of records) {
    await p.query(`INSERT INTO x_tweet_sync_state (account_id,tweet_id,published_at,is_pinned)
      VALUES ($1,$2,$3,$4) ON CONFLICT (account_id,tweet_id) DO UPDATE SET
      published_at=COALESCE(EXCLUDED.published_at,x_tweet_sync_state.published_at),
      next_due_at=CASE WHEN EXCLUDED.is_pinned AND NOT x_tweet_sync_state.is_pinned THEN NOW()::text ELSE x_tweet_sync_state.next_due_at END,
      is_pinned=EXCLUDED.is_pinned`,
    [accountId, record.id, record.publishedAt, record.isPinned]);
  }
}

export async function clearRemovedPinnedXTweets(accountId: number, pinnedIds: string[]): Promise<void> {
  await pool().query("UPDATE x_tweet_sync_state SET is_pinned=FALSE WHERE account_id=$1 AND is_pinned=TRUE AND NOT (tweet_id=ANY($2::text[]))", [accountId, pinnedIds]);
}

export async function getDueXTweetCandidates(accountId: number, limit = 400): Promise<XSyncCandidate[]> {
  const { rows } = await pool().query(`
    WITH candidates AS (
      SELECT s.tweet_id AS id, s.published_at AS "publishedAt", s.is_pinned AS "isPinned",
        s.failure_count AS "failureCount", s.last_attempt_at AS "lastAttemptAt", t.fetched_at AS "fetchedAt",
        CASE WHEN s.failure_count>0 THEN 'retry'
             WHEN t.id IS NULL THEN 'new' ELSE 'due' END AS kind,
        CASE WHEN t.id IS NULL THEN NULL ELSE json_build_object(
          'likes',t.favorite_count,'replies',t.reply_count,'reposts',t.retweet_count,'bookmarks',t.bookmark_count) END AS metrics,
        row_number() OVER (PARTITION BY CASE WHEN s.failure_count>0 THEN 'retry'
          WHEN t.id IS NULL THEN 'new' ELSE 'due' END ORDER BY COALESCE(t.fetched_at,s.first_seen_at),s.first_seen_at) AS rank_in_kind
      FROM x_tweet_sync_state s LEFT JOIN tweets t ON t.id=s.tweet_id AND t.account_id=s.account_id
      WHERE s.account_id=$1 AND s.next_due_at::timestamptz <= NOW()
        AND (t.id IS NULL OR s.is_pinned OR (s.published_at IS NOT NULL AND s.published_at >= (NOW() - INTERVAL '90 days')::text))
    )
    SELECT * FROM candidates WHERE (kind='new' AND rank_in_kind<=100) OR (kind='retry' AND rank_in_kind<=100)
      OR (kind='due' AND rank_in_kind<=200) ORDER BY rank_in_kind LIMIT $2`, [accountId, limit]);
  return rows.map((r) => ({ ...r, isPinned: Boolean(r.isPinned), metrics: r.metrics ?? null }));
}

export async function markXTweetAttempt(accountId: number, tweetId: string): Promise<void> {
  await pool().query("UPDATE x_tweet_sync_state SET last_attempt_at=NOW()::text WHERE account_id=$1 AND tweet_id=$2", [accountId, tweetId]);
}

export async function markXTweetFailure(accountId: number, tweetId: string, kind: string, retryAt: Date): Promise<void> {
  await pool().query(`UPDATE x_tweet_sync_state SET last_attempt_at=NOW()::text,
    failure_count=failure_count+1,last_error_kind=$3,next_due_at=$4 WHERE account_id=$1 AND tweet_id=$2`,
  [accountId, tweetId, kind, retryAt.toISOString()]);
}

export async function markXTweetSuccess(accountId: number, tweetId: string, nextDueAt: Date, metricDelta: number | null): Promise<void> {
  await pool().query(`UPDATE x_tweet_sync_state SET last_attempt_at=NOW()::text,failure_count=0,
    last_error_kind=NULL,next_due_at=$3,last_metric_delta=$4 WHERE account_id=$1 AND tweet_id=$2`,
  [accountId, tweetId, nextDueAt.toISOString(), metricDelta]);
}

export async function markXDiscoverySuccess(accountId: number, kind: "regular" | "full"): Promise<void> {
  const column = kind === "regular" ? "last_regular_success_at" : "last_full_success_at";
  await pool().query(`INSERT INTO x_account_discovery_state(account_id,${column}) VALUES($1,NOW()::text)
    ON CONFLICT(account_id) DO UPDATE SET ${column}=NOW()::text`, [accountId]);
}

export async function getXDiscoveryState(accountId: number): Promise<{ lastRegularSuccessAt: string | null; lastFullSuccessAt: string | null } | null> {
  const { rows } = await pool().query("SELECT last_regular_success_at AS \"lastRegularSuccessAt\",last_full_success_at AS \"lastFullSuccessAt\" FROM x_account_discovery_state WHERE account_id=$1", [accountId]);
  return rows[0] ?? null;
}
