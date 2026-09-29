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

  it("loads page data only through the API client", () => {
    const page = readFileSync("app/(dashboard)/analytics/page.tsx", "utf8");
    const client = readFileSync("lib/api.ts", "utf8");
    expect(page).toContain("api.getAnalyticsSites");
    expect(page).toContain("api.getAnalyticsTraffic(selectedSite!.id, timezone!)");
    expect(page).toContain("api.getAnalyticsInstallation(selectedSite!.id)");
    expect(page).toContain("getAnalyticsAcquisition");
    expect(page).toContain("getAnalyticsAcquisition(selectedSite!.id, timezone!)");
    expect(page).not.toContain("dimensionData?.referrers");
    expect(page).not.toMatch(/\bfetch\s*\(/);
    expect(page).not.toMatch(/fetch\s*\(\s*[`"']\/api\/graphql/);
    expect(client).toContain('"/analytics/sites"');
    expect(client).toContain("/analytics/sites/${siteId}/traffic?timezone=${encodeURIComponent(timezone)}");
    expect(client).toContain("/analytics/sites/${siteId}/installation");
    expect(client).toContain("AnalyticsTrafficDimensions");
    expect(client).toContain("operatingSystems: AnalyticsOperatingSystemDimension[]");
    const graphqlClient = readFileSync("lib/client/analytics-graphql.ts", "utf8");
    expect(graphqlClient).toContain("graphqlRequest<");
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
