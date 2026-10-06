// @ts-nocheck — Twitter API types are loose, existing business logic
import type { AccountRow } from "./repositories/accounts";
import { upsertTweet, insertUserStats } from "./repositories/twitter";
import { updateAccount } from "./repositories/accounts";
import { _xClient } from "../scripts/utils";
import { getLogger } from "./logger";
import { contentWindowDays } from "./config";

const LOG_TAG = "X";

function toISO(createdAt: string | undefined): string {
  if (!createdAt) return "";
  return new Date(createdAt).toISOString();
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const runningXAccounts = new Set<number>();

async function apiCall<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err: unknown) {
      if (i >= retries - 1) throw err;
      const wait = (i + 1) * 10_000;
      getLogger().warn(LOG_TAG, "API call failed (%s), retrying in %ds...", (err instanceof Error ? err.name : null) || "Error", wait / 1000);
      await sleep(wait);
    }
  }
  throw new Error("Unreachable");
}

function parseViews(views: Record<string, unknown> | null | undefined): number {
  if (!views) return 0;
  const c = views.count;
  if (c === undefined || c === null) return 0;
  return parseInt(String(c), 10) || 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractTweet(tweetObj: any, accountId: number) {
  const t = tweetObj.tweet || tweetObj;
  if (!t) return null;
  const legacy = t.legacy;
  if (!legacy) return null;

  const tid = String(legacy.idStr || t.restId || "");
  if (!tid) return null;

  const views = tweetObj.views || t.views;

  return {
    id: tid,
    account_id: accountId,
    full_text: legacy.fullText || "",
    created_at: toISO(legacy.createdAt),
    favorite_count: legacy.favoriteCount || 0,
    retweet_count: (legacy.retweetCount || 0) + (legacy.quoteCount || 0),
    reply_count: legacy.replyCount || 0,
    view_count: parseViews(views),
    bookmark_count: legacy.bookmarkCount || 0,
    is_quote: legacy.isQuoteStatus && !legacy.inReplyToStatusIdStr ? 1 : 0,
    is_reply: legacy.inReplyToStatusIdStr ? 1 : 0,
    is_retweet: (legacy.fullText || "").startsWith("RT @") ? 1 : 0,
    media_urls: "[]",
    urls: "[]",
    hashtags: "[]",
    mentions: "[]",
    lang: legacy.lang || "",
  };
}

export async function fetchAccount(account: AccountRow) {
  if (!account.is_active) {
    getLogger().debug(LOG_TAG, "@%s: inactive, skipping", account.screen_name);
    return 0;
  }
  if (runningXAccounts.has(account.id)) {
    getLogger().debug(LOG_TAG, "@%s: already running, skipping", account.screen_name);
    return 0;
  }
  runningXAccounts.add(account.id);
  const logger = getLogger();
  logger.info("Fetcher", "Fetching @%s...", account.screen_name);
  let recordedCoreData = false;

  try {
    const client = await _xClient(account.auth_token);
    await sleep(1000);

    // ── Phase 1: User profile ──────────────────────────────────────
    const profileResp = await apiCall(() =>
      client.getUserApi().getUserByScreenName({ screenName: account.screen_name }),
    );
    const userData = profileResp.data as Record<string, unknown>;
    const legacy = (userData.user as Record<string, unknown>)?.legacy as Record<string, unknown> || {};
    const userId = (account.user_id || (userData.user as Record<string, unknown>)?.restId || (userData.raw as Record<string, unknown>)?.restId || "") as string;

    if (!userId) {
      throw new Error(`Could not resolve user ID for @${account.screen_name}`);
    }
    if (!account.user_id) {
      await updateAccount(account.id, { user_id: userId });
    }
    recordedCoreData = true;

    // Record stats
    if (legacy && Object.keys(legacy).length > 0) {
      await insertUserStats({
        account_id: account.id,
        followers_count: (legacy.followersCount as number) || 0,
        following_count: (legacy.friendsCount as number) || 0,
        tweet_count: (legacy.statusesCount as number) || 0,
        listed_count: (legacy.listedCount as number) || 0,
      });
      logger.info("Fetcher", "@%s: stats recorded (followers=%d)", account.screen_name, (legacy.followersCount as number) || 0);
    }

    // Collect pinned IDs upfront
    const pinnedIds: string[] = (legacy.pinnedTweetIdsStr as string[]) || [];

    // ── Phase 2: Discover own tweet IDs within the time window ───────
    await sleep(2000);
    logger.info("Fetcher", "@%s: discovering tweets...", account.screen_name);

    const windowDays = contentWindowDays();
    const cutoffMs = Date.now() - windowDays * 24 * 60 * 60 * 1000;

    const ownIds = new Set<string>();
    // Pinned tweets are always included, regardless of age.
    for (const pid of pinnedIds) ownIds.add(pid);

    const maxTweets = 800;
    const batchSize = 100;
    let cursor: string | undefined;
    let totalFetched = 0;
    let skippedOld = 0;

    while (totalFetched < maxTweets) {
      const params = { userId, count: batchSize, ...(cursor ? { cursor } : {}) } as Record<string, unknown>;
      const resp = await apiCall(() =>
        // @ts-ignore — Twitter API types are loose
        (client.getTweetApi() as { getUserTweetsAndReplies(params: Record<string, unknown>): Promise<Record<string, unknown>> }).getUserTweetsAndReplies(params),
      ) as Record<string, unknown>;
      const entries = (((resp.data as Record<string, unknown>)?.data || []) as Array<Record<string, unknown>>);

      if (entries.length === 0) break;

      let batchNewest: number | null = null;
      for (const entry of entries) {
        const ts = entryCreatedAt(entry);
        if (ts !== null) batchNewest = batchNewest === null ? ts : Math.max(batchNewest, ts);
        skippedOld += collectOwnTweets(entry, userId, ownIds, cutoffMs);
      }

      totalFetched += entries.length;
      // Timeline is newest-first; once a whole batch is older than the
      // window, every following page is too — stop discovering.
      if (batchNewest !== null && batchNewest < cutoffMs) break;
      const rawData = resp.data as Record<string, unknown>;
      const cursorObj = rawData.cursor as { bottom?: { value?: string }; top?: { value?: string } } | undefined;
      cursor = cursorObj?.bottom?.value || cursorObj?.top?.value;
      if (!cursor) break;
      await sleep(2000);
    }

    const allIds = [...ownIds];
    logger.info("Fetcher", "@%s: discovered %d own tweets (%d pinned, %d skipped as older than %dd)", account.screen_name, allIds.length, pinnedIds.length, skippedOld, windowDays);

    // ── Phase 3: Fetch full details for each tweet ──────────────────
    logger.info("Fetcher", "@%s: fetching details for %d tweets...", account.screen_name, allIds.length);

    let savedCount = 0;
    let errorCount = 0;

    for (const tid of allIds) {
      try {
        await sleep(1000);
        const detailResp = await apiCall(() =>
          client.getTweetApi().getTweetDetail({ focalTweetId: tid }),
        );
        const entries = (((detailResp.data as Record<string, unknown>)?.data || []) as Array<Record<string, unknown>>);

        let found = false;
        for (const entry of entries) {
          const resultLegacy = (entry.tweet || entry).legacy;
          if (!resultLegacy) continue;
          const resultId = String(resultLegacy.idStr || (entry.tweet || entry).restId || "");
          if (resultId === tid) {
            const tweetData = extractTweet(entry.tweet || entry, account.id);
            if (tweetData) {
              await upsertTweet(tweetData);
              savedCount++;
              found = true;
            }
            break;
          }
        }

        if (!found) errorCount++;
      } catch (e: unknown) {
        logger.debug("Fetcher", "@%s: tweet detail failed for %s: %s", account.screen_name, tid, e instanceof Error ? e.message : String(e));
        errorCount++;
      }
    }

    if (errorCount > 0) logger.warn("Fetcher", "twitter_detail_fetch_partial requested=%d saved=%d failed=%d", allIds.length, savedCount, errorCount);

    logger.info("Fetcher", "@%s: %d saved, %d errors", account.screen_name, savedCount, errorCount);

    await updateAccount(account.id, {
      last_fetched_at: new Date().toISOString(),
      error_message: errorCount > 0 ? `${errorCount} tweet detail(s) could not be refreshed` : null,
    });

    logger.info("Fetcher", "@%s: done", account.screen_name);
    return {
      status: errorCount === 0 ? "success" : savedCount > 0 || allIds.length === 0 ? "partial" : "failed",
      errorMessage: errorCount > 0 ? `${errorCount} tweet detail(s) could not be refreshed` : null,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    getLogger().error("Fetcher", "@%s error: %s", account.screen_name, msg);
    await updateAccount(account.id, { error_message: msg, last_fetched_at: new Date().toISOString() });
    const error = err instanceof Error ? err : new Error(msg) as Error & { fetchRunStatus?: "failed" | "partial" };
    error.fetchRunStatus = recordedCoreData ? "partial" : "failed";
    throw error;
  } finally {
    runningXAccounts.delete(account.id);
  }
}

// ── Helper: recursively collect own tweet IDs from timeline entries ──
// Tweets older than cutoffMs are skipped (time-window). Returns the count
// of own tweets skipped as too old.

function collectOwnTweets(entry: Record<string, unknown>, userId: string, out: Set<string>, cutoffMs: number): number {
  let skipped = collectFromEntry(entry, userId, out, cutoffMs);

  // Walk nested replies (level 1)
  const replies = entry.replies;
  if (Array.isArray(replies)) {
    for (const reply of replies) {
      if (reply && typeof reply === "object") {
        skipped += collectFromEntry(reply as Record<string, unknown>, userId, out, cutoffMs);
        // Walk nested replies (level 2)
        const nested = (reply as Record<string, unknown>).replies;
        if (Array.isArray(nested)) {
          for (const nr of nested) {
            if (nr && typeof nr === "object") skipped += collectFromEntry(nr as Record<string, unknown>, userId, out, cutoffMs);
          }
        }
      }
    }
  }
  return skipped;
}

function collectFromEntry(entry: Record<string, unknown>, userId: string, out: Set<string>, cutoffMs: number): number {
  const t = entry.tweet || entry;
  if (!t || typeof t !== "object") return 0;
  const legacy = (t as Record<string, unknown>).legacy;
  if (!legacy || typeof legacy !== "object") return 0;
  if ((legacy as Record<string, unknown>).userIdStr !== userId) return 0;
  const tid = String((legacy as Record<string, unknown>).idStr || (t as Record<string, unknown>).restId || "");
  if (!tid) return 0;
  const ca = (legacy as Record<string, unknown>).createdAt;
  if (typeof ca === "string") {
    const ts = new Date(ca).getTime();
    if (!isNaN(ts) && ts < cutoffMs) return 1; // too old → skip
  }
  out.add(tid);
  return 0;
}

function entryCreatedAt(entry: Record<string, unknown>): number | null {
  const t = entry.tweet || entry;
  if (!t || typeof t !== "object") return null;
  const legacy = (t as Record<string, unknown>).legacy;
  const ca = legacy && typeof legacy === "object" ? (legacy as Record<string, unknown>).createdAt : undefined;
  if (typeof ca !== "string") return null;
  const ts = new Date(ca).getTime();
  return isNaN(ts) ? null : ts;
}
