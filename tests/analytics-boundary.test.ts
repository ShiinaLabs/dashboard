import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Web Analytics boundaries", () => {
  it("keeps sites and overview routes on the service", () => {
    const listRoute = readFileSync("app/api/analytics/sites/route.ts", "utf8");
    const overviewRoute = readFileSync("app/api/analytics/sites/[id]/overview/route.ts", "utf8");
    const installationRoute = readFileSync("app/api/analytics/sites/[id]/installation/route.ts", "utf8");
    const eventRoute = readFileSync("app/a/e/route.ts", "utf8");
    const service = readFileSync("lib/services/analytics.ts", "utf8");
    for (const route of [listRoute, overviewRoute, installationRoute]) {
      expect(route).toContain("@/lib/services/analytics");
      expect(route).not.toMatch(/repositories\/analytics-sites|cloudflare-analytics|@\/db\/schema/);
    }
    expect(service).toContain("getAnalyticsTrafficSummary");
    expect(service).toContain("../repositories/analytics-sites");
    expect(eventRoute).toContain("@/lib/services/analytics-collector");
    expect(eventRoute).not.toMatch(/repositories\/|@\/db\/|from ["']pg["']|drizzle-orm/);
    expect(service).not.toMatch(/cloudflare-analytics|Analytics Engine/);
  });

  it("loads page data only through the API client", () => {
    const page = readFileSync("app/(dashboard)/analytics/page.tsx", "utf8");
    const client = readFileSync("lib/api.ts", "utf8");
    expect(page).toContain("api.getAnalyticsSites");
    expect(page).toContain("api.getAnalyticsOverview(selectedSite!.id)");
    expect(page).toContain("api.getAnalyticsInstallation(selectedSite!.id)");
    expect(page).not.toMatch(/\bfetch\s*\(/);
    expect(client).toContain('"/analytics/sites"');
    expect(client).toContain("/analytics/sites/${siteId}/overview");
    expect(client).toContain("/analytics/sites/${siteId}/installation");
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
