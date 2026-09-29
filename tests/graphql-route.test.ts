import { beforeEach, describe, expect, it, vi } from "vitest";
import { action as graphqlAction, loader as graphqlLoader } from "@/app/api/graphql/route";
import { loader as restTrafficLoader } from "@/app/api/analytics/sites/[id]/traffic/route";
import { AnalyticsSiteError } from "@/lib/services/analytics";
import { getOwnerId, requireSession } from "@/lib/auth-helpers";

const mocks = vi.hoisted(() => ({
  getAnalyticsSites: vi.fn(),
  getAnalyticsTrafficForSite: vi.fn(),
  getAnalyticsAcquisitionForSite: vi.fn(),
  getAnalyticsDashboardForSite: vi.fn(),
}));

vi.mock("@/lib/auth-helpers", () => ({
  getOwnerId: vi.fn((user: { id: number; role: string }) => user.role === "admin" ? undefined : user.id),
  requireSession: vi.fn(),
}));
vi.mock("@/lib/services/analytics", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/services/analytics")>();
  return { ...original, ...mocks };
});

const traffic = {
  period: { days: 7, timezone: "Asia/Tokyo" },
  overview: { views: 18, visitors: 11, visits: 14 },
  timeline: [{ date: "2026-09-29", views: 18, visitors: 11, visits: 14 }],
  topPages: [{ path: "/pricing", views: 10 }],
  dimensions: {
    referrers: [{ referrer: "", views: 10 }],
    countries: [{ country: "JP", views: 8 }, { country: "DE", views: 4 }],
    browsers: [{ browser: "Safari", views: 9 }],
    operatingSystems: [{ os: "macOS", views: 7 }],
    devices: [{ device: "Mobile", views: 6 }],
  },
};

const trafficQuery = /* GraphQL */ `
  query AnalyticsTraffic($siteId: Int!, $timezone: String!) {
    analytics {
      traffic(siteId: $siteId, timezone: $timezone) {
        period { days timezone }
        overview { views visitors visits }
        timeline { date views visitors visits }
        topPages { path views }
        dimensions {
          referrers { referrer views }
          countries { country views }
          browsers { browser views }
          operatingSystems { os views }
          devices { device views }
        }
      }
    }
  }
`;

const acquisitionQuery = /* GraphQL */ `
  query AnalyticsAcquisition($siteId: Int!, $timezone: String!) {
    analytics {
      acquisition(siteId: $siteId, timezone: $timezone) {
        period { days timezone }
        totalVisits
        referrers { referrer visits }
        entryPages { path visits }
      }
    }
  }
`;

const dashboardQuery = /* GraphQL */ `
  query AnalyticsDashboard($siteId: Int!, $range: AnalyticsRange!, $timezone: String!) {
    analytics {
      dashboard(siteId: $siteId, range: $range, timezone: $timezone) {
        period { days timezone startDate endDate }
        previousPeriod { days timezone startDate endDate }
        overview { views visits visitorDays }
        previousOverview { views visits visitorDays }
        timeline { date views visitors visits }
        topPages { path views }
        dimensions { countries { country views } browsers { browser views } operatingSystems { os views } devices { device views } }
        acquisition { totalVisits referrers { referrer visits } entryPages { path visits } campaigns { source medium campaign visits } }
      }
    }
  }
`;

function request(query: string, variables?: unknown, method = "POST"): Request {
  if (method === "GET") {
    const url = new URL("http://localhost/api/graphql");
    url.searchParams.set("query", query);
    if (variables !== undefined) url.searchParams.set("variables", JSON.stringify(variables));
    return new Request(url, { method });
  }
  return new Request("http://localhost/api/graphql", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
}

function routeCall(handler: typeof graphqlAction | typeof graphqlLoader, req: Request) {
  return handler({ request: req, params: {}, context: {} } as never);
}

function authAs(id = 7, role = "user") {
  vi.mocked(requireSession).mockResolvedValue({ user: { id, username: `user-${id}`, role } } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAnalyticsSites.mockResolvedValue([]);
});

describe("authenticated GraphQL route", () => {
  it("rejects unauthenticated requests before GraphQL execution", async () => {
    vi.mocked(requireSession).mockResolvedValue(null);
    const response = await routeCall(graphqlAction, request("{ analytics { sites { id } } }"));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(mocks.getAnalyticsSites).not.toHaveBeenCalled();
  });

  it("executes GET and POST GraphQL queries", async () => {
    authAs();
    const query = "{ analytics { sites { id } } }";
    const getResponse = await routeCall(graphqlLoader, request(query, undefined, "GET"));
    expect(getResponse.status).toBe(200);
    await expect(getResponse.json()).resolves.toEqual({ data: { analytics: { sites: [] } } });

    const postResponse = await routeCall(graphqlAction, request(query));
    expect(postResponse.status).toBe(200);
    await expect(postResponse.json()).resolves.toEqual({ data: { analytics: { sites: [] } } });
  });

  it("scopes regular users to their sites and gives admins global site access", async () => {
    const site = { id: 3, name: "Owned", site_key: "site-secret", host: "example.test", created_at: "created", updated_at: "updated" };
    const query = "{ analytics { sites { id name siteKey host createdAt updatedAt } } }";

    authAs(7, "user");
    mocks.getAnalyticsSites.mockResolvedValueOnce([site]);
    const userResponse = await routeCall(graphqlAction, request(query));
    await expect(userResponse.json()).resolves.toEqual({
      data: { analytics: { sites: [{ id: 3, name: "Owned", siteKey: "site-secret", host: "example.test", createdAt: "created", updatedAt: "updated" }] } },
    });
    expect(getOwnerId).toHaveBeenCalledWith({ id: 7, username: "user-7", role: "user" });
    expect(mocks.getAnalyticsSites).toHaveBeenLastCalledWith(7);

    authAs(99, "admin");
    mocks.getAnalyticsSites.mockResolvedValueOnce([site, { ...site, id: 4, name: "Other owner" }]);
    const adminResponse = await routeCall(graphqlAction, request(query));
    const adminResult = await adminResponse.json();
    expect(adminResult.data.analytics.sites).toHaveLength(2);
    expect(mocks.getAnalyticsSites).toHaveBeenLastCalledWith(undefined);
  });

  it("delegates traffic access and timezone validation to the existing service", async () => {
    authAs(7, "user");
    mocks.getAnalyticsTrafficForSite.mockResolvedValue(traffic);
    const response = await routeCall(graphqlAction, request(trafficQuery, { siteId: 12, timezone: "Asia/Tokyo" }));
    expect(response.status).toBe(200);
    expect(mocks.getAnalyticsTrafficForSite).toHaveBeenCalledWith(12, { id: 7, role: "user" }, "Asia/Tokyo");

    mocks.getAnalyticsTrafficForSite.mockRejectedValueOnce(new AnalyticsSiteError("invalid_input"));
    const invalidTimezone = await routeCall(graphqlAction, request(trafficQuery, { siteId: 12, timezone: "Not/AZone" }));
    const invalidResult = await invalidTimezone.json();
    expect(invalidResult.errors[0]).toMatchObject({
      message: "Invalid input",
      extensions: { code: "BAD_USER_INPUT" },
    });
  });

  it("maps foreign-site authorization to FORBIDDEN without duplicating ownership logic", async () => {
    authAs(7, "user");
    mocks.getAnalyticsTrafficForSite.mockRejectedValue(new AnalyticsSiteError("forbidden"));
    const response = await routeCall(graphqlAction, request(trafficQuery, { siteId: 80, timezone: "UTC" }));
    const result = await response.json();
    expect(result.errors[0].extensions.code).toBe("FORBIDDEN");
    expect(mocks.getAnalyticsTrafficForSite).toHaveBeenCalledWith(80, { id: 7, role: "user" }, "UTC");
  });

  it("returns GraphQL errors for invalid syntax and unknown fields", async () => {
    authAs();
    const invalid = await routeCall(graphqlAction, request("query {"));
    expect((await invalid.json()).errors[0].message).toContain("Syntax Error");
    const unknown = await routeCall(graphqlAction, request("{ analytics { doesNotExist } }"));
    expect((await unknown.json()).errors[0].message).toContain("Cannot query field");
    expect(mocks.getAnalyticsSites).not.toHaveBeenCalled();
  });

  it("returns a GraphQL traffic result identical to the REST service result", async () => {
    authAs();
    mocks.getAnalyticsTrafficForSite.mockResolvedValue(traffic);

    const restResponse = await restTrafficLoader({
      request: new Request("http://localhost/api/analytics/sites/12/traffic?timezone=Asia%2FTokyo"),
      params: { id: "12" },
      context: {},
    } as never);
    const graphqlResponse = await routeCall(graphqlAction, request(trafficQuery, { siteId: 12, timezone: "Asia/Tokyo" }));

    expect((await graphqlResponse.json()).data.analytics.traffic).toEqual(await restResponse.json());
  });

  it("returns acquisition totals, referrers, and entry pages through the service", async () => {
    authAs(7, "user");
    const acquisition = {
      period: { days: 7, timezone: "Asia/Tokyo" },
      totalVisits: 2,
      referrers: [{ referrer: "", visits: 1 }, { referrer: "google.com", visits: 1 }],
      entryPages: [{ path: "/", visits: 1 }, { path: "/landing", visits: 1 }],
    };
    mocks.getAnalyticsAcquisitionForSite.mockResolvedValueOnce(acquisition);
    const response = await routeCall(graphqlAction, request(acquisitionQuery, { siteId: 12, timezone: "Asia/Tokyo" }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: { analytics: { acquisition } } });
    expect(mocks.getAnalyticsAcquisitionForSite).toHaveBeenCalledWith(12, { id: 7, role: "user" }, "Asia/Tokyo");
  });

  it("maps acquisition authorization and timezone errors using the existing service errors", async () => {
    authAs(7, "user");
    mocks.getAnalyticsAcquisitionForSite.mockRejectedValueOnce(new AnalyticsSiteError("forbidden"));
    const forbidden = await routeCall(graphqlAction, request(acquisitionQuery, { siteId: 80, timezone: "UTC" }));
    expect((await forbidden.json()).errors[0].extensions.code).toBe("FORBIDDEN");

    mocks.getAnalyticsAcquisitionForSite.mockRejectedValueOnce(new AnalyticsSiteError("invalid_input"));
    const invalidTimezone = await routeCall(graphqlAction, request(acquisitionQuery, { siteId: 12, timezone: "Not/AZone" }));
    expect((await invalidTimezone.json()).errors[0].extensions.code).toBe("BAD_USER_INPUT");
  });

  it.each([["DAYS_7", 7], ["DAYS_30", 30], ["DAYS_90", 90]] as const)("maps %s to %i service days", async (range, days) => {
    authAs(7, "user");
    const dashboard = {
      period: { days, timezone: "Asia/Tokyo", startDate: "2026-09-01", endDate: "2026-09-30" },
      previousPeriod: { days, timezone: "Asia/Tokyo", startDate: "2026-08-02", endDate: "2026-08-31" },
      overview: { views: 18, visits: 4, visitorDays: 12 },
      previousOverview: { views: 15, visits: 3, visitorDays: 10 },
      timeline: [], topPages: [], dimensions: { countries: [], browsers: [], operatingSystems: [], devices: [] },
      acquisition: { totalVisits: 4, referrers: [], entryPages: [], campaigns: [{ source: "newsletter", medium: "email", campaign: "launch", visits: 2 }] },
    };
    mocks.getAnalyticsDashboardForSite.mockResolvedValueOnce(dashboard);
    const response = await routeCall(graphqlAction, request(dashboardQuery, { siteId: 12, range, timezone: "Asia/Tokyo" }));
    await expect(response.json()).resolves.toEqual({ data: { analytics: { dashboard } } });
    expect(mocks.getAnalyticsDashboardForSite).toHaveBeenCalledWith(12, { id: 7, role: "user" }, "Asia/Tokyo", days);
  });

  it("rejects a dashboard range outside the public enum", async () => {
    authAs();
    const response = await routeCall(graphqlAction, request(dashboardQuery, { siteId: 12, range: "DAYS_14", timezone: "UTC" }));
    expect((await response.json()).errors[0].message).toContain("DAYS_14");
    expect(mocks.getAnalyticsDashboardForSite).not.toHaveBeenCalled();
  });

  it("defaults dashboard queries to seven UTC days", async () => {
    authAs(7, "user");
    mocks.getAnalyticsDashboardForSite.mockResolvedValueOnce({ overview: { visitorDays: 2 } } as never);
    const response = await routeCall(graphqlAction, request("{ analytics { dashboard(siteId: 12) { overview { visitorDays } } } }"));
    await expect(response.json()).resolves.toEqual({ data: { analytics: { dashboard: { overview: { visitorDays: 2 } } } } });
    expect(mocks.getAnalyticsDashboardForSite).toHaveBeenCalledWith(12, { id: 7, role: "user" }, "UTC", 7);
  });
});
