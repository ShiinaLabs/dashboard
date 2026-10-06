// X/Twitter new-architecture UseCase: XClient (fetch) -> XWrite (persist).
import type { Account } from "../../domain/account";
import { XClient } from "../../infra/fetchers/XClient";
import type { XWrite } from "./XWrite";
import { extractTweet } from "../../infra/fetchers/XMapper";
import { getLogger } from "../../logger";

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

export interface XResult { status: "success" | "partial" | "failed"; saved: number; errors: number; }

export class SyncXAccount {
  private write?: XWrite;

  constructor(private account: Account, private client?: XClient, write?: XWrite) {
    this.write = write;
  }

  private async ensureWrite(): Promise<XWrite> {
    if (this.write) return this.write;
    const { XRepoRepository } = await import("../../infra/drizzle/XRepoRepository");
    this.write = new XRepoRepository();
    return this.write;
  }

  async execute(): Promise<XResult> {
    const logger = getLogger();
    const write = await this.ensureWrite();
    const account = this.account;
    const client = this.client ?? new XClient(account.authToken ?? "", account.screenName, account.userId ?? "");
    const pinnedIds = client["pinnedIds"] ?? [];

    logger.info("Fetcher", "Fetching @%s...", account.screenName);

    // Phase 1: profile + stats
    const { legacy, userId } = await client.fetchProfile();
    if (account.userId !== userId) await write.updateAccount(account.id, { user_id: userId });
    if (legacy && Object.keys(legacy).length > 0) {
      await write.insertStats({
        account_id: account.id,
        followers_count: (legacy.followersCount as number) || 0,
        following_count: (legacy.friendsCount as number) || 0,
        tweet_count: (legacy.statusesCount as number) || 0,
        listed_count: (legacy.listedCount as number) || 0,
      });
      logger.info("Fetcher", "@%s: stats recorded (followers=%d)", account.screenName, (legacy.followersCount as number) || 0);
    }

    // Phase 2: discover own tweet ids
    await sleep(2000);
    logger.info("Fetcher", "@%s: discovering tweets...", account.screenName);
    const cutoffMs = client.getWindowCutoffMs();
    const { ids, skippedOld } = await client.discoverOwnTweetIds(userId, cutoffMs, 800);
    logger.info("Fetcher", "@%s: discovered %d own tweets (%d pinned, %d skipped as older than %dd)", account.screenName, ids.length, pinnedIds.length, skippedOld, Math.round((Date.now()-cutoffMs)/86400000));

    // Phase 3: full details
    logger.info("Fetcher", "@%s: fetching details for %d tweets...", account.screenName, ids.length);
    let savedCount = 0;
    let errorCount = 0;
    for (const tid of ids) {
      try {
        await sleep(1000);
        const entry = await client.fetchTweetDetail(tid);
        const tweet = extractTweet(entry as Record<string, unknown> | undefined, account.id);
        if (tweet && tweet.id === tid) {
          await write.upsertTweet(tweet);
          savedCount++;
        } else {
          errorCount++;
        }
      } catch (e) {
        logger.debug("Fetcher", "@%s: tweet detail failed for %s: %s", account.screenName, tid, e instanceof Error ? e.message : String(e));
        errorCount++;
      }
    }
    if (errorCount > 0) logger.warn("Fetcher", "twitter_detail_fetch_partial requested=%d saved=%d failed=%d", ids.length, savedCount, errorCount);
    logger.info("Fetcher", "@%s: %d saved, %d errors", account.screenName, savedCount, errorCount);

    await write.updateAccount(account.id, { last_fetched_at: new Date().toISOString(), error_message: errorCount > 0 ? `${errorCount} tweet detail(s) could not be refreshed` : null });
    logger.info("Fetcher", "@%s: done", account.screenName);

    const status = errorCount === 0 ? "success" : (savedCount > 0 || ids.length === 0 ? "partial" : "failed");
    return { status: status as "success" | "partial" | "failed", saved: savedCount, errors: errorCount };
  }
}
