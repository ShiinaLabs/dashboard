import { beforeEach, describe, expect, it, vi } from "vitest";
import { getVisibleAccountDetails } from "@/lib/services/accounts";
import { getTimeline, getTweets } from "@/lib/services/twitter";
import { getXAccountPage, XDashboardError } from "@/lib/services/x-dashboard";

vi.mock("@/lib/services/accounts", () => ({ getVisibleAccountDetails: vi.fn() }));
vi.mock("@/lib/services/twitter", () => ({ getTimeline: vi.fn(), getTweets: vi.fn() }));

describe("X account page read model", () => {
  beforeEach(() => vi.clearAllMocks());

  it("composes account, range timeline, and only the selected content kind", async () => {
    vi.mocked(getVisibleAccountDetails).mockResolvedValue({ id: 12, platform: "twitter" } as never);
    vi.mocked(getTimeline).mockResolvedValue({ dailyTweets: [], followerGrowth: [] });
    vi.mocked(getTweets).mockResolvedValue({ data: [], total: 0, page: 1, limit: 50, totalPages: 0 });
    const viewer = { id: 4, role: "user" };

    await getXAccountPage(viewer, 12, 30, "TWEETS");
    expect(getVisibleAccountDetails).toHaveBeenCalledWith(12, viewer);
    expect(getTimeline).toHaveBeenCalledWith(30, [12]);
    expect(getTweets).toHaveBeenLastCalledWith(1, 50, "created_at", "desc", undefined, [12], 0);

    await getXAccountPage(viewer, 12, 7, "REPLIES");
    expect(getTweets).toHaveBeenLastCalledWith(1, 50, "created_at", "desc", undefined, [12], 1);
  });

  it("fails closed for foreign accounts and invalid ranges", async () => {
    vi.mocked(getVisibleAccountDetails).mockRejectedValueOnce(Object.assign(new Error("Forbidden"), { name: "AccountForbiddenError" }));
    await expect(getXAccountPage({ id: 4, role: "user" }, 12, 30, "TWEETS")).rejects.toBeInstanceOf(XDashboardError);
    await expect(getXAccountPage({ id: 4, role: "user" }, 12, 14, "TWEETS")).rejects.toMatchObject({ code: "invalid_range" });
    expect(getVisibleAccountDetails).toHaveBeenCalledTimes(1);
  });
});
