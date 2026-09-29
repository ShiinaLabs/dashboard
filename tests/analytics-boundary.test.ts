import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Web Analytics spike boundaries", () => {
  it("keeps the HTTP route on the application service and integration behind the service", () => {
    const route = readFileSync("app/api/analytics/overview/route.ts", "utf8");
    const service = readFileSync("lib/services/analytics.ts", "utf8");

    expect(route).toContain("getAnalyticsOverview");
    expect(route).not.toContain("cloudflare-analytics");
    expect(service).toContain("getTrafficSummary");
  });

  it("loads page data through the existing API client", () => {
    const page = readFileSync("app/(dashboard)/analytics/page.tsx", "utf8");
    const client = readFileSync("lib/api.ts", "utf8");

    expect(page).toContain("api.getAnalyticsOverview");
    expect(client).toContain('apiJson<AnalyticsOverview>("/analytics/overview")');
    expect(page).not.toMatch(/\bfetch\s*\(/);
  });
});
