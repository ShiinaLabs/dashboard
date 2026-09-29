import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAnalyticsAcquisition, getAnalyticsDashboard } from "@/lib/client/analytics-graphql";
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

  it("loads typed acquisition data through graphqlRequest and the GraphQL endpoint", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ data: { analytics: { acquisition: {
      period: { days: 7, timezone: "Asia/Tokyo" },
      totalVisits: 2,
      referrers: [{ referrer: "", visits: 1 }, { referrer: "google.com", visits: 1 }],
      entryPages: [{ path: "/", visits: 1 }, { path: "/landing", visits: 1 }],
    } } } })));

    await expect(getAnalyticsAcquisition(12, "Asia/Tokyo")).resolves.toEqual({
      period: { days: 7, timezone: "Asia/Tokyo" },
      totalVisits: 2,
      referrers: [{ referrer: "", visits: 1 }, { referrer: "google.com", visits: 1 }],
      entryPages: [{ path: "/", visits: 1 }, { path: "/landing", visits: 1 }],
    });
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/graphql");
    expect(JSON.parse(String(init?.body))).toMatchObject({ variables: { siteId: 12, timezone: "Asia/Tokyo" } });
    expect(JSON.parse(String(init?.body)).query).toContain("acquisition");
  });

  it("loads the complete ranged dashboard through one GraphQL request", async () => {
    const dashboard = {
      period: { days: 30, timezone: "Asia/Tokyo", startDate: "2026-08-31", endDate: "2026-09-29" },
      previousPeriod: { days: 30, timezone: "Asia/Tokyo", startDate: "2026-08-01", endDate: "2026-08-30" },
      overview: { views: 12, visits: 4, visitorDays: 8 },
      previousOverview: { views: 10, visits: 3, visitorDays: 7 },
      timeline: [], topPages: [],
      dimensions: { countries: [], browsers: [], operatingSystems: [], devices: [] },
      acquisition: { totalVisits: 4, referrers: [], entryPages: [] },
    };
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ data: { analytics: { dashboard } } })));
    await expect(getAnalyticsDashboard(12, "DAYS_30", "Asia/Tokyo")).resolves.toEqual(dashboard);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(String(init?.body));
    expect(url).toBe("/api/graphql");
    expect(body.variables).toEqual({ siteId: 12, range: "DAYS_30", timezone: "Asia/Tokyo" });
    expect(body.query).toContain("previousOverview { views visits visitorDays }");
    expect(body.query).toContain("dimensions {");
    expect(body.query).toContain("acquisition { totalVisits");
  });
});
