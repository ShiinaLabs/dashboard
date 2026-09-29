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
  });

  it("keeps GraphQL browser requests on apiRequest", async () => {
    const client = await readFile("lib/client/graphql.ts", "utf8");
    expect(client).toContain('import { apiRequest } from "./api-transport"');
    expect(client).not.toMatch(/\bfetch\s*\(/);
  });
});
