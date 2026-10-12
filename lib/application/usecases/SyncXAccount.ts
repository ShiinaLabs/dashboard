// X/Twitter UseCase: identity discovery -> persisted due selection -> bounded detail refresh.
import type { Account } from "../../domain/account";
import { XClient } from "../../infra/fetchers/XClient";
import type { XWrite } from "./XWrite";
import { extractTweet } from "../../infra/fetchers/XMapper";
import { getLogger } from "../../logger";
import { adaptiveXRefreshInterval, classifyXError, selectXDueCandidates, xRefreshIntervalMs, xRetryAfterAt, xRetryDelayMs } from "./xSyncPolicy";
import type { XDiscoveryRecord } from "../../repositories/x-sync";

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

export interface XResult {
  status: "success" | "partial" | "failed";
  saved: number;
  errors: number;
  newDiscovered: number;
  planned: number;
  detailRequests: number;
  deferred: number;
  fullDiscoveryCompleted: boolean;
  pendingRetries: number;
}

export class SyncXAccount {
  private write?: XWrite;

  constructor(private account: Account, private client?: XClient, write?: XWrite) { this.write = write; }

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
    const stateful = this.client === undefined || this.client instanceof XClient;
    logger.info("Fetcher", "Fetching @%s...", account.screenName);

    const { legacy, userId, pinnedIds = [] } = await client.fetchProfile();
    if (account.userId !== userId) await write.updateAccount(account.id, { user_id: userId });
    if (legacy && Object.keys(legacy).length > 0) {
      await write.insertStats({ account_id: account.id, followers_count: (legacy.followersCount as number) || 0,
        following_count: (legacy.friendsCount as number) || 0, tweet_count: (legacy.statusesCount as number) || 0,
        listed_count: (legacy.listedCount as number) || 0 });
    }

    const cutoffMs = client.getWindowCutoffMs();
    let discoveries: XDiscoveryRecord[] = [];
    let candidates: Awaited<ReturnType<typeof import("../../repositories/x-sync").getDueXTweetCandidates>> = [];
    let fullDiscoveryCompleted = false;
    let deferred = 0;
    let pendingRetries = 0;

    if (stateful) {
      const sync = await import("../../repositories/x-sync");
      await sync.seedLegacyXTweetState(account.id, 250);
      await sync.clearRemovedPinnedXTweets(account.id, pinnedIds);
      const regular = await client.discoverOwnTweetIds(userId, cutoffMs, 200, pinnedIds, 2);
      discoveries = regular.tweets;
      await sync.upsertDiscoveredXTweets(account.id, discoveries);
      await sync.markXDiscoverySuccess(account.id, "regular");

      const discoveryState = await sync.getXDiscoveryState(account.id);
      if (!discoveryState?.lastFullSuccessAt || Date.now() - Date.parse(discoveryState.lastFullSuccessAt) >= 24 * 60 * 60_000) {
        const full = await client.discoverOwnTweetIds(userId, cutoffMs, 800, pinnedIds, 8);
        await sync.upsertDiscoveredXTweets(account.id, full.tweets);
        fullDiscoveryCompleted = full.stopReason === "time_boundary" || full.stopReason === "end";
        if (fullDiscoveryCompleted) await sync.markXDiscoverySuccess(account.id, "full");
        discoveries = [...new Map([...discoveries, ...full.tweets].map(item => [item.id, item])).values()];
      }
      const due = await sync.getDueXTweetCandidates(account.id, 400);
      candidates = selectXDueCandidates(due);
      deferred = Math.max(0, due.length - candidates.length);
      pendingRetries = due.filter(item => item.kind === "retry").length;
    } else {
      const result = await client.discoverOwnTweetIds(userId, cutoffMs, 800, pinnedIds);
      discoveries = result.tweets ?? result.ids.map(id => ({ id, publishedAt: null, isPinned: pinnedIds.includes(id) }));
      candidates = discoveries.map(item => ({ ...item, kind: "new" as const, failureCount: 0, lastAttemptAt: null, fetchedAt: null, metrics: null }));
    }
    logger.info("Fetcher", "@%s: discovered %d identities (%d pinned)", account.screenName, discoveries.length, discoveries.filter(item => item.isPinned).length);

    let savedCount = 0;
    let errorCount = 0;
    let detailRequests = 0;
    for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex++) {
      const candidate = candidates[candidateIndex];
      if (stateful && detailRequests >= 40) { deferred++; continue; }
      try {
        await sleep(1000);
        detailRequests++;
        if (stateful) {
          const sync = await import("../../repositories/x-sync");
          await sync.markXTweetAttempt(account.id, candidate.id);
        }
        const entry = await client.fetchTweetDetail(candidate.id);
        const tweet = extractTweet(entry as Record<string, unknown> | undefined, account.id, candidate.id);
        if (!tweet) {
          errorCount++;
          if (stateful) {
            const sync = await import("../../repositories/x-sync");
            await sync.markXTweetFailure(account.id, candidate.id, "not_found", new Date(Date.now() + 30 * 24 * 60 * 60_000));
          }
          continue;
        }
        let nextDueAt: Date | undefined;
        let metricDelta: number | null = null;
        if (stateful) {
          const values = [tweet.favorite_count, tweet.reply_count, tweet.retweet_count, tweet.bookmark_count];
          const old = candidate.metrics ? [candidate.metrics.likes, candidate.metrics.replies, candidate.metrics.reposts, candidate.metrics.bookmarks] : null;
          const total = values.every(v => v !== null) ? values.reduce((a, b) => a + (b ?? 0), 0) : null;
          const oldTotal = old && old.every(v => v !== null) ? old.reduce((a, b) => a + (b ?? 0), 0) : null;
          metricDelta = total !== null && oldTotal !== null ? total - oldTotal : null;
          const base = xRefreshIntervalMs(candidate.publishedAt, candidate.isPinned);
          const interval = base === null ? 365 * 24 * 60 * 60_000 : adaptiveXRefreshInterval(base, oldTotal, total);
          nextDueAt = new Date(Date.now() + interval);
        }
        if (stateful && nextDueAt && write.upsertTweetAndSyncState) {
          await write.upsertTweetAndSyncState(tweet, nextDueAt.toISOString(), metricDelta);
        } else {
          await write.upsertTweet(tweet);
          if (stateful && nextDueAt) {
            const sync = await import("../../repositories/x-sync");
            await sync.markXTweetSuccess(account.id, candidate.id, nextDueAt, metricDelta);
          }
        }
        savedCount++;
      } catch (error) {
        logger.debug("Fetcher", "@%s: tweet detail failed for %s: %s", account.screenName, candidate.id, error instanceof Error ? error.message : String(error));
        errorCount++;
        if (stateful) {
          const sync = await import("../../repositories/x-sync");
          const kind = classifyXError(error);
          const retryAt = kind === "rate_limit"
            ? xRetryAfterAt(error, Date.now() + xRetryDelayMs(candidate.failureCount))
            : new Date(Date.now() + xRetryDelayMs(candidate.failureCount));
          await sync.markXTweetFailure(account.id, candidate.id, kind, retryAt);
          if (kind === "auth" || kind === "rate_limit") {
            deferred += candidates.length - candidateIndex - 1;
            break;
          }
        }
      }
    }

    if (errorCount > 0) logger.warn("Fetcher", "twitter_detail_fetch_partial requested=%d saved=%d failed=%d", candidates.length, savedCount, errorCount);
    await write.updateAccount(account.id, { error_message: errorCount > 0 ? `${errorCount} tweet detail(s) could not be refreshed` : null });
    logger.info("Fetcher", "@%s: done; requests=%d deferred=%d", account.screenName, detailRequests, deferred);
    const status = errorCount === 0 ? "success" : (savedCount > 0 || candidates.length === 0 ? "partial" : "failed");
    return { status, saved: savedCount, errors: errorCount, newDiscovered: discoveries.length, planned: candidates.length,
      detailRequests, deferred, fullDiscoveryCompleted, pendingRetries };
  }
}
