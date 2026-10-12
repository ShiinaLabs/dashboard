import type { XTweet } from "../../application/usecases/XWrite";

export function toISO(createdAt: string | undefined): string | null {
  if (!createdAt) return null;
  const d = new Date(createdAt);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export function parseViews(views: Record<string, unknown> | null | undefined): number | null {
  return metric((views?.count));
}

function metric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

export function extractTweet(tweetObj: Record<string, unknown> | undefined, accountId: number, requestedId?: string): XTweet | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = (tweetObj?.tweet ?? tweetObj) as any;
  if (!t) return null;
  const legacy = t.legacy;
  if (!legacy) return null;
  const tid = String(legacy.idStr || t.restId || "");
  if (!tid || (requestedId !== undefined && tid !== requestedId)) return null;
  const createdAt = toISO(typeof legacy.createdAt === "string" ? legacy.createdAt : undefined);
  if (!createdAt) return null;
  const views = tweetObj?.views || t.views;
  const retweetCount = metric(legacy.retweetCount);
  const quoteCount = metric(legacy.quoteCount);
  return {
    id: tid,
    account_id: accountId,
    full_text: legacy.fullText || "",
    created_at: createdAt,
    favorite_count: metric(legacy.favoriteCount),
    retweet_count: retweetCount === null || quoteCount === null ? null : retweetCount + quoteCount,
    reply_count: metric(legacy.replyCount),
    view_count: parseViews(views),
    bookmark_count: metric(legacy.bookmarkCount),
    is_quote: legacy.isQuoteStatus && !legacy.inReplyToStatusIdStr ? 1 : 0,
    is_reply: legacy.inReplyToStatusIdStr ? 1 : 0,
    is_retweet: (legacy.fullText || "").startsWith("RT @") ? 1 : 0,
    media_urls: "[]", urls: "[]", hashtags: "[]", mentions: "[]",
    lang: legacy.lang || "",
  };
}

export function collectOwnTweets(entry: Record<string, unknown>, userId: string, out: Set<string>, cutoffMs: number): number {
  let skipped = collectFromEntry(entry, userId, out, cutoffMs);
  const replies = entry.replies;
  if (Array.isArray(replies)) {
    for (const reply of replies) {
      if (reply && typeof reply === "object") {
        skipped += collectFromEntry(reply as Record<string, unknown>, userId, out, cutoffMs);
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
    if (!isNaN(ts) && ts < cutoffMs) return 1;
  }
  out.add(tid);
  return 0;
}

export function entryCreatedAt(entry: Record<string, unknown>): number | null {
  const t = entry.tweet || entry;
  if (!t || typeof t !== "object") return null;
  const legacy = (t as Record<string, unknown>).legacy;
  const ca = legacy && typeof legacy === "object" ? (legacy as Record<string, unknown>).createdAt : undefined;
  if (typeof ca !== "string") return null;
  const ts = new Date(ca).getTime();
  return isNaN(ts) ? null : ts;
}
