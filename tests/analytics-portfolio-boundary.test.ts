import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("analytics portfolio repository boundary", () => {
  it("keeps scope, one clock, event bounds, and aggregation in one SQL statement", async () => {
    const source = await readFile("lib/repositories/analytics-events.ts", "utf8");
    const portfolioSource = source.slice(source.indexOf("export async function getAnalyticsPortfolioReport"));

    expect(portfolioSource.match(/getDb\(\)\.execute/g)).toHaveLength(1);
    expect(portfolioSource.match(/CURRENT_TIMESTAMP/g)).toHaveLength(1);
    expect(portfolioSource).toContain("site_scope AS MATERIALIZED");
    expect(portfolioSource).toContain("INNER JOIN site_scope ON site_scope.id = event.site_id");
    expect(portfolioSource).toContain("site.deleted_at IS NULL");
    expect(portfolioSource).toContain("site.owner_id =");
    expect(portfolioSource).toContain("current_events AS MATERIALIZED");
    expect(portfolioSource).toContain("previous_events AS MATERIALIZED");
    expect(portfolioSource).toContain("ORDER BY views DESC, visits DESC, name ASC, id ASC");
    expect(portfolioSource).not.toMatch(/FROM analytics_events[\s\S]*?LIMIT/);
  });
});
