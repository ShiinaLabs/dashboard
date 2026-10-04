import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const graphqlRoot = path.resolve(process.cwd(), "lib/graphql");
const importSpecifier = /\b(?:from\s*|import\s*(?:\(\s*)?)['"]([^'"]+)['"]/g;
const forbiddenSpecifier = [
  /(?:^|\/)repositories\//,
  /(?:^|\/)db(?:\/|$)/,
  /(?:^|\/)drizzle(?:-orm)?(?:\/|$)/,
  /^pg$/,
  /^drizzle-orm(?:\/|$)/,
];

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(file);
    return entry.isFile() && entry.name.endsWith(".ts") ? [file] : [];
  }));
  return nested.flat();
}

describe("GraphQL dependency boundary", () => {
  it("keeps GraphQL resolvers away from repositories, database drivers, and SQL", async () => {
    const violations: string[] = [];
    for (const file of await sourceFiles(graphqlRoot)) {
      const source = await readFile(file, "utf8");
      for (const match of source.matchAll(importSpecifier)) {
        if (forbiddenSpecifier.some((pattern) => pattern.test(match[1]))) {
          violations.push(`${path.relative(process.cwd(), file)}: ${match[1]}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("keeps the route-to-resolver-to-service chain explicit", async () => {
    const route = await readFile("app/api/graphql/route.ts", "utf8");
    const schema = await readFile("lib/graphql/schema.ts", "utf8");
    const analytics = await readFile("lib/graphql/analytics.ts", "utf8");
    expect(route).toContain("requireSession(request)");
    expect(route).toContain("yoga.fetch(request");
    expect(schema).toContain('from "./analytics"');
    expect(analytics).toContain('@/lib/services/analytics');
    expect(analytics).toContain("getAnalyticsTrafficForSite(");
    expect(analytics).toContain("getAnalyticsSites(");
    expect(analytics).toContain("getAnalyticsAcquisitionForSite(");
    expect(analytics).toContain("getAnalyticsDashboardForSite(");
    expect(analytics).toContain("getAnalyticsPortfolio(");
    expect(analytics).toContain("getAnalyticsGlobalDashboard(");
    expect(analytics).toContain('case "DAYS_7": return 7');
    expect(analytics).toContain('case "DAYS_30": return 30');
    expect(analytics).toContain('case "DAYS_90": return 90');
  });

  it("keeps GraphQL browser requests on apiRequest", async () => {
    const client = await readFile("lib/client/graphql.ts", "utf8");
    expect(client).toContain('import { apiRequest } from "./api-transport"');
    expect(client).not.toMatch(/\bfetch\s*\(/);
  });

  it("keeps settings and admin reads service-backed and admin-scoped", async () => {
    const settings = await readFile("lib/graphql/settings.ts", "utf8");
    expect(settings).toContain("context.user.role !== \"admin\"");
    expect(settings).toContain("getAiSettings()");
    expect(settings).toContain("getUsers()");
    expect(settings).toContain("getAiStatus(context.user.id)");
    expect(settings).not.toContain("apiKeyConfigured: true");
    expect(settings).not.toMatch(/repositories\/|@\/db\/schema|drizzle-orm/);
  });

  it("keeps GraphQL resolvers on services and the acquisition client on graphqlRequest", async () => {
    const service = await readFile("lib/services/analytics.ts", "utf8");
    const acquisitionClient = await readFile("lib/client/analytics-graphql.ts", "utf8");
    const portfolioClient = acquisitionClient;
    expect(service).toContain("getAnalyticsAcquisitionReport(site.id, timezone)");
    expect(acquisitionClient).toContain('import { graphqlRequest } from "./graphql"');
    expect(acquisitionClient).not.toMatch(/\bfetch\s*\(|\bapiRequest\s*\(/);
    expect(acquisitionClient).toContain("export async function getAnalyticsDashboard(");
    expect(acquisitionClient).toContain("dashboard(siteId: $siteId, range: $range, timezone: $timezone)");
    expect(service).toContain("return getAnalyticsPortfolioReport(ownerId, timezone, days)");
    expect(portfolioClient).toContain('import { graphqlRequest } from "./graphql"');
    expect(portfolioClient).toContain("export async function getAnalyticsPortfolio(");
    expect(portfolioClient).toContain("portfolio(range: $range, timezone: $timezone)");
    expect(acquisitionClient).toContain("export async function getAnalyticsGlobalDashboard(");
    expect(acquisitionClient).toContain("globalDashboard(range: $range, timezone: $timezone)");
  });
});
