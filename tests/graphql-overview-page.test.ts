import { beforeEach, describe, expect, it, vi } from "vitest";
import { action as graphqlAction } from "@/app/api/graphql/route";
import { getOverviewReadModel } from "@/lib/services/overview";

const viewer = { id: 12, username: "member", role: "user" };
vi.mock("@/lib/auth-helpers", () => ({ requireSession: vi.fn(async () => ({ user: viewer, session: viewer })) }));
vi.mock("@/lib/services/overview", () => ({ getOverviewReadModel: vi.fn() }));

async function query(source: string, variables: Record<string, unknown>) {
  return graphqlAction({ request: new Request("http://localhost/api/graphql", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: source, variables }) }), params: {}, context: {} } as never);
}

describe("Overview page query", () => {
  beforeEach(() => vi.clearAllMocks());

  it("composes a page read model once with viewer and page parameters", async () => {
    vi.mocked(getOverviewReadModel).mockResolvedValue({ accounts: [{ id: 4, screen_name: "x" }] } as never);
    const response = await query(`query OverviewPage($pulseDays: Int!, $contentDays: Int!, $analyticsRange: AnalyticsRange!, $timezone: String!) {
      overview { page(pulseDays: $pulseDays, contentDays: $contentDays, analyticsRange: $analyticsRange, timezone: $timezone) { accounts { id screen_name } } }
    }`, { pulseDays: 7, contentDays: 14, analyticsRange: "DAYS_30", timezone: "Europe/Paris" });

    expect((await response.json()).data.overview.page.accounts).toEqual([{ id: 4, screen_name: "x" }]);
    expect(getOverviewReadModel).toHaveBeenCalledTimes(1);
    expect(getOverviewReadModel).toHaveBeenCalledWith(viewer, { pulseDays: 7, contentDays: 14, analyticsRange: "DAYS_30", timezone: "Europe/Paris" });
  });
});
