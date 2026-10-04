import { beforeEach, describe, expect, it, vi } from "vitest";
import { loader } from "@/app/(dashboard)/overview/page";
import { requireSession } from "@/lib/auth-helpers";
import { getOverviewReadModel } from "@/lib/services/overview";

const viewer = { id: 12, username: "member", role: "user" };
vi.mock("@/lib/auth-helpers", () => ({ requireSession: vi.fn() }));
vi.mock("@/lib/services/overview", () => ({ getOverviewReadModel: vi.fn() }));

const rawOverview = {
  accounts: [],
  stats: {},
  timeline: {},
  topLiked: [],
  platforms: {
    github: { followers: 1, repositoryCount: 2, stars: 3, forks: 4, pinnedRepositories: [] },
    gitlab: { followers: 5, projectCount: 6, stars: 7, forks: 8, pinnedProjects: [] },
    reddit: { postKarma: 9, commentKarma: 10, totalPosts: 11, totalComments: 12, karmaTimeline: [], dailyActivity: [], subreddits: [] },
  },
  pulse: {},
  topContent: {},
  fetchHealth: { summary: {}, unsupportedAccounts: [], issues: [{}, {}, {}, {}, {}, {}] },
  analyticsPortfolio: {},
};

function args(request: Request) {
  return { request, params: {}, context: {} } as never;
}

describe("Overview route loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireSession).mockResolvedValue({ user: viewer, session: viewer } as never);
    vi.mocked(getOverviewReadModel).mockResolvedValue(rawOverview as never);
  });

  it("starts one shared read model with the authenticated viewer and request timezone", async () => {
    const result = await loader(args(new Request("http://localhost/overview", {
      headers: { cookie: "dash_timezone=Asia%2FTokyo" },
    })));

    expect(getOverviewReadModel).toHaveBeenCalledTimes(1);
    expect(getOverviewReadModel).toHaveBeenCalledWith(viewer, {
      pulseDays: 7,
      contentDays: 7,
      analyticsRange: "DAYS_7",
      timezone: "Asia/Tokyo",
    });
    await expect(result.overviewData).resolves.toMatchObject({
      github: { followers: 1, itemCount: 2, pinned: [] },
      gitlab: { followers: 5, itemCount: 6, pinned: [] },
      fetchHealth: { issueCount: 6, issues: [{}, {}, {}, {}, {}] },
    });
  });

  it("returns before the shared read model resolves", async () => {
    let resolveReadModel!: (value: typeof rawOverview) => void;
    vi.mocked(getOverviewReadModel).mockReturnValue(new Promise((resolve) => { resolveReadModel = resolve; }) as never);
    const result = await loader(args(new Request("http://localhost/overview")));

    expect(result.overviewData).toBeInstanceOf(Promise);
    expect(getOverviewReadModel).toHaveBeenCalledTimes(1);
    resolveReadModel(rawOverview);
    await expect(result.overviewData).resolves.toHaveProperty("github.itemCount", 2);
  });

  it("uses UTC when the request timezone is invalid", async () => {
    await loader(args(new Request("http://localhost/overview", {
      headers: { cookie: "dash_timezone=Not%2FAZone" },
    })));
    expect(getOverviewReadModel).toHaveBeenCalledWith(viewer, expect.objectContaining({ timezone: "UTC" }));
  });

  it("redirects unauthenticated requests to login with the requested path", async () => {
    vi.mocked(requireSession).mockResolvedValue(null);
    await expect(loader(args(new Request("http://localhost/overview?tab=activity"))))
      .rejects.toMatchObject({ status: 302, headers: expect.any(Headers) });
    expect(getOverviewReadModel).not.toHaveBeenCalled();
  });
});
