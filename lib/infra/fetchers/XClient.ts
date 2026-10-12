// X/Twitter client — wraps twitter-openapi-typescript via _xClient.
import { _xClient } from "../../../scripts/utils";
import { getLogger } from "../../logger";
import { xContentWindowDays } from "../../config";
import { collectOwnTweets, entryCreatedAt } from "./XMapper";

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function apiCall<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try { return await fn(); }
    catch (e: unknown) {
      if (i === retries - 1) throw e;
      getLogger().warn("X", "API call failed (%s), retrying in %ds", e instanceof Error ? e.message : String(e), 10 * (i + 1));
      await sleep(10_000 * (i + 1));
    }
  }
  throw new Error("unreachable");
}

export class XClient {
  private clientPromise?: ReturnType<typeof _xClient>;

  constructor(private token: string, private screenName: string, private userId: string) {}

  private client() {
    if (!this.clientPromise) {
      this.clientPromise = _xClient(this.token).catch((error) => {
        this.clientPromise = undefined;
        throw error;
      });
    }
    return this.clientPromise;
  }

  async fetchProfile(): Promise<{ userData: Record<string, unknown>; legacy: Record<string, unknown>; userId: string; pinnedIds: string[] }> {
    const client = await this.client();
    const profileResp = await apiCall(() => client.getUserApi().getUserByScreenName({ screenName: this.screenName })) as Record<string, unknown>;
    const userData = profileResp.data as Record<string, unknown>;
    const legacy = ((userData.user as Record<string, unknown>)?.legacy as Record<string, unknown>) || {};
    const userId = String((this.userId || (userData.user as Record<string, unknown>)?.restId || (userData.raw as Record<string, unknown>)?.restId) || "");
    if (!userId) throw new Error(`Could not resolve user ID for @${this.screenName}`);
    const pinned = (userData.user as Record<string, unknown>)?.legacy as Record<string, unknown> | undefined;
    const pinnedTweetIds = Array.isArray(pinned?.pinnedTweetIdsStr)
      ? pinned.pinnedTweetIdsStr.filter((id): id is string => typeof id === "string" && id.length > 0)
      : [];
    return { userData, legacy, userId, pinnedIds: pinnedTweetIds };
  }

  async discoverOwnTweetIds(userId: string, cutoffMs: number, maxTweets = 800, pinnedIds: string[] = [], maxPages = 8): Promise<{ ids: string[]; skippedOld: number; tweets: Array<{ id: string; publishedAt: string | null; isPinned: boolean }>; stopReason: "page_limit" | "time_boundary" | "end" | "tweet_limit" }> {
    const client = await this.client();
    const pinned = new Set(pinnedIds);
    const discovered = new Map<string, { id: string; publishedAt: string | null; isPinned: boolean }>(pinnedIds.map(id => [id, { id, publishedAt: null, isPinned: true }]));
    let skippedOld = 0;
    let cursor: string | undefined;
    let totalFetched = 0;
    let stopReason: "page_limit" | "time_boundary" | "end" | "tweet_limit" = "page_limit";
    const batchSize = 100;
    for (let page = 0; page < maxPages && totalFetched < maxTweets; page++) {
      const params = { userId, count: batchSize, ...(cursor ? { cursor } : {}) } as Record<string, unknown>;
      const resp = await apiCall(() => (client.getTweetApi() as { getUserTweetsAndReplies(p: Record<string, unknown>): Promise<Record<string, unknown>> }).getUserTweetsAndReplies(params)) as Record<string, unknown>;
      const entries = (((resp.data as Record<string, unknown>)?.data || []) as Array<Record<string, unknown>>);
      if (entries.length === 0) { stopReason = "end"; break; }
      let batchNewest: number | null = null;
      for (const entry of entries) {
        const ts = entryCreatedAt(entry);
        if (ts !== null) batchNewest = batchNewest === null ? ts : Math.max(batchNewest, ts);
        skippedOld += collectOwnTweets(entry, userId, new Set<string>(), cutoffMs);
        const t = (entry.tweet || entry) as Record<string, unknown>;
        const legacy = t.legacy as Record<string, unknown> | undefined;
        if (legacy?.userIdStr === userId) {
          const id = String(legacy.idStr || t.restId || "");
          const created = typeof legacy.createdAt === "string" ? new Date(legacy.createdAt) : null;
          const publishedAt = created && Number.isFinite(created.getTime()) ? created.toISOString() : null;
          if (id && (pinned.has(id) || !created || !Number.isFinite(created.getTime()) || created.getTime() >= cutoffMs)) {
            discovered.set(id, { id, publishedAt, isPinned: pinned.has(id) });
          }
        }
        for (const r of [ ...(Array.isArray(entry.replies) ? entry.replies : []), ...((Array.isArray(entry.replies) ? entry.replies : []).flatMap((x: Record<string, unknown>) => Array.isArray(x?.replies) ? x.replies as unknown[] : [])) ]) {
          if (!r || typeof r !== "object") continue;
          const rt = ((r as Record<string, unknown>).tweet || r) as Record<string, unknown>;
          const rl = rt.legacy as Record<string, unknown> | undefined;
          if (rl?.userIdStr !== userId) continue;
          const id = String(rl.idStr || rt.restId || "");
          const created = typeof rl.createdAt === "string" ? new Date(rl.createdAt) : null;
          const publishedAt = created && Number.isFinite(created.getTime()) ? created.toISOString() : null;
          if (id && (pinned.has(id) || !created || !Number.isFinite(created.getTime()) || created.getTime() >= cutoffMs)) discovered.set(id, { id, publishedAt, isPinned: pinned.has(id) });
        }
      }
      totalFetched += entries.length;
      if (batchNewest !== null && batchNewest < cutoffMs) { stopReason = "time_boundary"; break; }
      const rawData = resp.data as Record<string, unknown>;
      const cursorObj = rawData.cursor as { bottom?: { value?: string }; top?: { value?: string } } | undefined;
      cursor = cursorObj?.bottom?.value || cursorObj?.top?.value;
      if (!cursor) { stopReason = "end"; break; }
      await sleep(2000);
    }
    if (totalFetched >= maxTweets) stopReason = "tweet_limit";
    return { ids: [...discovered.keys()], tweets: [...discovered.values()], skippedOld, stopReason };
  }

  async fetchTweetDetail(tweetId: string): Promise<Record<string, unknown> | undefined> {
    const client = await this.client();
    const detailResp = await apiCall(() => client.getTweetApi().getTweetDetail({ focalTweetId: tweetId }), 1) as Record<string, unknown>;
    const entries = (((detailResp.data as Record<string, unknown>)?.data || []) as Array<Record<string, unknown>>);
    for (const entry of entries) {
      const tid = (entry.tweet ?? entry) as Record<string, unknown>;
      const legacy = (tid.legacy as Record<string, unknown> | undefined) ??
        ((tid.tweet as Record<string, unknown> | undefined)?.legacy as Record<string, unknown> | undefined);
      if (!legacy) continue;
      const resultId = String((legacy as Record<string, unknown>).idStr || tid.restId || "");
      if (resultId === tweetId) return entry;
    }
    return undefined;
  }

  getWindowCutoffMs(): number {
    return Date.now() - xContentWindowDays() * 24 * 60 * 60 * 1000;
  }
}
