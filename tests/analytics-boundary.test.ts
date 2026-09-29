import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Web Analytics boundaries", () => {
  it("keeps sites and overview routes on the service", () => {
    const listRoute = readFileSync("app/api/analytics/sites/route.ts", "utf8");
    const overviewRoute = readFileSync("app/api/analytics/sites/[id]/overview/route.ts", "utf8");
    const installationRoute = readFileSync("app/api/analytics/sites/[id]/installation/route.ts", "utf8");
    const service = readFileSync("lib/services/analytics.ts", "utf8");
    for (const route of [listRoute, overviewRoute, installationRoute]) {
      expect(route).toContain("@/lib/services/analytics");
      expect(route).not.toMatch(/repositories\/analytics-sites|cloudflare-analytics|@\/db\/schema/);
    }
    expect(service).toContain("getTrafficSummary");
    expect(service).toContain("../repositories/analytics-sites");
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
});
