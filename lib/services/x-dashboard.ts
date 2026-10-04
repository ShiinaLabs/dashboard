import { getVisibleAccountDetails } from "./accounts";
import { getTimeline, getTweets } from "./twitter";

export type XContentKind = "TWEETS" | "REPLIES";

export class XDashboardError extends Error {
  constructor(readonly code: "not_found" | "forbidden" | "invalid_account" | "invalid_range") {
    super(code);
    this.name = "XDashboardError";
  }
}

/** Page read model for the currently visible X detail tab. */
export async function getXAccountPage(
  viewer: { id: number; role: string },
  accountId: number,
  days: number,
  kind: XContentKind,
) {
  if (![7, 30, 90].includes(days)) throw new XDashboardError("invalid_range");
  let account;
  try {
    account = await getVisibleAccountDetails(accountId, viewer);
  } catch (error) {
    if (error instanceof Error && error.name === "AccountForbiddenError") throw new XDashboardError("forbidden");
    throw error;
  }
  if (!account) throw new XDashboardError("not_found");
  if (account.platform !== "twitter") throw new XDashboardError("invalid_account");
  const isReply = kind === "REPLIES" ? 1 : 0;
  const [timeline, content] = await Promise.all([
    getTimeline(days, [accountId]),
    getTweets(1, 50, "created_at", "desc", undefined, [accountId], isReply),
  ]);
  return { account, timeline, content };
}
