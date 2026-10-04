import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAnalyticsPage } from "@/lib/client/analytics-graphql";
import { getAppStoreAnalyticsPage, getRevenuePage } from "@/lib/client/graphql/app-store";
import { getXAccountPageQuery } from "@/lib/client/graphql/x";
import { GraphQLRequestError, graphqlRequest } from "@/lib/client/graphql";

describe("GraphQL client helper", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("sends a credentialed POST through the shared API transport and returns data", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ data: { analytics: { sites: [] } } })));
    const variables = { siteId: 5, timezone: "Asia/Tokyo" };

    await expect(graphqlRequest<{ analytics: { sites: unknown[] } }, typeof variables>(
      "query Sites($siteId: Int!, $timezone: String!) { analytics { sites { id } } }",
      variables,
    )).resolves.toEqual({ analytics: { sites: [] } });

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/graphql");
    expect(init?.method).toBe("POST");
    expect(init?.credentials).toBe("include");
    expect(JSON.parse(String(init?.body))).toMatchObject({ variables });
  });

  it("propagates AbortSignal to the shared fetch transport", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ data: { ok: true } })));
    const controller = new AbortController();
    await graphqlRequest<{ ok: boolean }>("query { ok }", undefined, controller.signal);
    expect(vi.mocked(fetch).mock.calls[0][1]?.signal).toBe(controller.signal);
  });

  it("preserves GraphQL error messages and extensions codes", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      errors: [{ message: "Forbidden", extensions: { code: "FORBIDDEN" } }],
    })));

    const error = await graphqlRequest("{ analytics { sites { id } } }").catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(GraphQLRequestError);
    expect(error).toMatchObject({ message: "Forbidden", extensions: { code: "FORBIDDEN" } });
  });

  it("uses the existing unauthorized redirect behavior for HTTP 401", async () => {
    const replace = vi.fn();
    vi.stubGlobal("window", { location: { pathname: "/analytics", search: "", replace } });
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }));

    const error = await graphqlRequest("{ analytics { sites { id } } }").catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(GraphQLRequestError);
    expect(error).toMatchObject({ message: "Unauthorized", status: 401 });
    expect(replace).toHaveBeenCalledWith("/login?from=%2Fanalytics");
  });

  it("loads Analytics options, dashboard, and installation through one page operation", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ data: { analytics: {
      sites: [{ id: 12, name: "Site", siteKey: "site_key", host: "site.example", createdAt: "2026-09-01", updatedAt: "2026-09-02" }],
      globalDashboard: null,
      dashboard: { overview: { views: 1 } },
      installation: { trackerUrl: "https://example.test/a/t.js", snippet: "<script>" },
    } } })));
    const signal = new AbortController().signal;
    const result = await getAnalyticsPage({ range: "DAYS_30", timezone: "Asia/Tokyo", siteId: 12, showGlobal: false, showSite: true }, signal);
    expect(result.sites[0]).toMatchObject({ id: 12, site_key: "site_key" });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(String(init?.body));
    expect(url).toBe("/api/graphql");
    expect(init?.signal).toBe(signal);
    expect(body.variables).toEqual({ range: "DAYS_30", timezone: "Asia/Tokyo", siteId: 12, showGlobal: false, showSite: true });
    expect(body.query).toContain("sites { id name siteKey host createdAt updatedAt }");
    expect(body.query).toContain("globalDashboard(range: $range, timezone: $timezone) @include(if: $showGlobal)");
    expect(body.query).toContain("installation(siteId: $siteId) @include(if: $showSite)");
    expect(body.query).not.toContain("query AnalyticsAcquisition(");
  });

  it("loads App Store apps and analytics in one selected-field operation", async () => {
    const analytics = { updatedAt: null, completeThrough: null, overview: {}, trend: [], acquisition: [], campaigns: [], territories: [] };
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ data: { appStore: { enabledApps: [{ id: 3, name: "App" }], analytics } } })));
    await expect(getAppStoreAnalyticsPage({ from: "2026-09-01", to: "2026-09-07", appId: 3 })).resolves.toMatchObject({ enabledApps: [{ id: 3 }], analytics });
    expect(fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
    expect(body.variables).toEqual({ from: "2026-09-01", to: "2026-09-07", appId: 3 });
    expect(body.query).toContain("enabledApps { id name }");
    expect(body.query).toContain("analytics(from: $from, to: $to, appId: $appId, territory: $territory)");
  });

  it("loads Revenue apps and report in one operation", async () => {
    const revenue = { updatedAt: null, completeThrough: null, overview: {}, trend: [], byApp: [], byTerritory: [], sales: {}, subscriptions: {}, settlements: [], territories: [] };
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ data: { appStore: { enabledApps: [], revenue } } })));
    await getRevenuePage({ from: "2026-09-01", to: "2026-09-07", fiscalMonth: "2026-08" });
    expect(fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
    expect(body.variables.fiscalMonth).toBe("2026-08");
    expect(body.query).toContain("revenue(from: $from, to: $to, appId: $appId, territory: $territory, fiscalMonth: $fiscalMonth)");
  });

  it("requests one X page operation with only the active content kind and visible tweet fields", async () => {
    const page = { account: {}, timeline: { dailyTweets: [], followerGrowth: [] }, content: { data: [], total: 0, page: 1, limit: 50, totalPages: 0 } };
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ data: { x: { accountPage: page } } })));
    const controller = new AbortController();
    await getXAccountPageQuery({ accountId: 12, days: 30, kind: "TWEETS" }, controller.signal);
    expect(fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
    expect(body.variables).toEqual({ accountId: 12, days: 30, kind: "TWEETS" });
    expect(vi.mocked(fetch).mock.calls[0][1]?.signal).toBe(controller.signal);
    expect(body.query).toContain("accountPage(accountId: $accountId, days: $days, kind: $kind)");
    expect(body.query).toContain("data { id full_text created_at favorite_count retweet_count reply_count view_count }");
    expect(body.query).not.toContain("media_urls");
  });
});
