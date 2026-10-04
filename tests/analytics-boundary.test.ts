import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Web Analytics boundaries", () => {
  it("keeps sites and traffic routes on the service", () => {
    const listRoute = readFileSync("app/api/analytics/sites/route.ts", "utf8");
    const trafficRoute = readFileSync("app/api/analytics/sites/[id]/traffic/route.ts", "utf8");
    const installationRoute = readFileSync("app/api/analytics/sites/[id]/installation/route.ts", "utf8");
    const eventRoute = readFileSync("app/a/e/route.ts", "utf8");
    const service = readFileSync("lib/services/analytics.ts", "utf8");
    for (const route of [listRoute, trafficRoute, installationRoute]) {
      expect(route).toContain("@/lib/services/analytics");
      expect(route).not.toMatch(/repositories\/analytics-sites|cloudflare-analytics|@\/db\/schema/);
    }
    expect(trafficRoute).toContain("getAnalyticsTrafficForSite");
    expect(trafficRoute).not.toMatch(/repositories\/|@\/db\/|drizzle-orm|from ["']pg["']/);
    expect(service).toContain("getAnalyticsTrafficReport");
    expect(service).toContain("../repositories/analytics-sites");
    expect(service).not.toMatch(/from ["']react-router|@\/lib\/api-server|\bRequest\b|\bResponse\b/);
    expect(eventRoute).toContain("@/lib/services/analytics-collector");
    expect(eventRoute).not.toMatch(/repositories\/|@\/db\/|from ["']pg["']|drizzle-orm/);
    expect(service).not.toMatch(/cloudflare-analytics|Analytics Engine/);
  });

  it("loads sites, the selected dashboard, and installation in one page GraphQL operation", () => {
    const page = readFileSync("app/(dashboard)/analytics/page.tsx", "utf8");
    const client = readFileSync("lib/api.ts", "utf8");
    expect(page).toContain("getAnalyticsPage({");
    expect(page).toContain('["analytics-page", selectedSiteId, selectedRange, timezone]');
    expect(page).toContain('useState<"all" | number>("all")');
    expect(page).not.toContain("?? sites[0]");
    expect(page).toContain('selectedSiteId === "all"');
    expect(page).toContain('value="all"');
    expect(page).toContain("api.renameAnalyticsSite(selectedSite!.id, { name: siteName })");
    expect(page).not.toContain("api.getAnalyticsTraffic(");
    expect(page).not.toContain("getAnalyticsAcquisition(");
    expect(page).not.toContain("dimensionData?.referrers");
    expect(page).not.toMatch(/\bfetch\s*\(/);
    expect(page).not.toMatch(/fetch\s*\(\s*[`"']\/api\/graphql/);
    expect(client).toContain('"/analytics/sites"');
    expect(client).toContain("AnalyticsTrafficDimensions");
    expect(client).toContain("operatingSystems: AnalyticsOperatingSystemDimension[]");
    const graphqlClient = readFileSync("lib/client/analytics-graphql.ts", "utf8");
    expect(graphqlClient).toContain("graphqlRequest<");
    expect(graphqlClient).toContain("export async function getAnalyticsPage(");
    expect(graphqlClient).toContain("sites { id name siteKey host createdAt updatedAt }");
    expect(graphqlClient).toContain("installation(siteId: $siteId) @include(if: $showSite)");
    expect(graphqlClient).toContain("export async function getAnalyticsDashboard");
    expect(graphqlClient).toContain("previousOverview { views visits visitorDays }");
    expect(graphqlClient).toContain("timeline { date views visitors visits }");
    expect(graphqlClient).toContain("export async function getAnalyticsGlobalDashboard(");
    expect(graphqlClient).toContain("globalDashboard(range: $range, timezone: $timezone)");
  });

  it("keeps the global dashboard as one owner-scoped SQL read without visitor or path aggregates", () => {
    const repository = readFileSync("lib/repositories/analytics-events.ts", "utf8");
    const start = repository.indexOf("export async function getAnalyticsGlobalDashboardReport(");
    const globalQuery = repository.slice(start);
    expect(globalQuery.match(/CURRENT_TIMESTAMP/g)).toHaveLength(1);
    for (const cte of ["clock AS MATERIALIZED", "site_scope AS MATERIALIZED", "scoped_events AS MATERIALIZED", "current_events AS MATERIALIZED", "previous_events AS MATERIALIZED", "visit_events AS MATERIALIZED"]) {
      expect(globalQuery).toContain(cte);
    }
    expect(globalQuery).toContain("INNER JOIN site_scope ON site_scope.id = event.site_id");
    expect(globalQuery).toContain("GROUP BY site_id, site_name, site_host, utm_source, utm_medium, utm_campaign");
    expect(globalQuery).not.toMatch(/top_pages|entry_pages|visitorDays|visitors/);
  });

  it("routes rename through the service and keeps the repository update name-only", () => {
    const route = readFileSync("app/api/analytics/sites/[id]/route.ts", "utf8");
    const service = readFileSync("lib/services/analytics.ts", "utf8");
    const repository = readFileSync("lib/repositories/analytics-sites.ts", "utf8");
    expect(route).toContain('request.method !== "PUT"');
    expect(route).toContain("requireSession(request)");
    expect(route).toContain("renameAnalyticsSite(id, { id: auth.user.id, role: auth.user.role }, { name })");
    expect(service).toContain("viewer.role !== \"admin\" && site.owner_id !== viewer.id");
    expect(repository).toContain(".set({ name, updated_at: new Date().toISOString() })");
  });

  it("keeps the public collector as an HTTP adapter and the exact tracker file allow-listed", () => {
    const collectorService = readFileSync("lib/services/analytics-collector.ts", "utf8");
    const middleware = readFileSync("app/auth-middleware.server.ts", "utf8");
    const server = readFileSync("server/index.mjs", "utf8");
    expect(collectorService).not.toMatch(/from ["']react-router|Request|Response|@\/lib\/api-server/);
    expect(middleware).toContain('pathname === "/a/e"');
    expect(server).toContain('"/a/t.js"');
    expect(server).not.toMatch(/\/a\/\*|\/a\/\//);
  });
});
