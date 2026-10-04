import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const routeTestByPrefix: Record<string, string> = {
  "a/e": "tests/analytics-collector-route.test.ts",
  "api/accounts": "tests/account-credential-boundary.test.ts",
  "api/app-store": "tests/app-store-routes.test.ts",
  "api/auth": "tests/auth.test.ts",
  "api/graphql": "tests/graphql-route.test.ts",
  "api/analytics/sites": "tests/analytics-sites-routes.test.ts",
  "api/bing-wallpaper": "tests/api-boundary.test.ts",
  "api/confirm/token": "tests/confirm-token.test.ts",
  "api/fetch": "tests/fetch-dispatch.test.ts",
  "api/ai/chat": "tests/api-transport.test.ts",
  "api/settings": "tests/graphql-settings.test.ts",
  "api/github": "tests/github-client.test.ts",
  "api/gitlab": "tests/api-client-boundary.test.ts",
  "api/health": "tests/api-boundary.test.ts",
  "api/reddit/callback": "tests/api-boundary.test.ts",
  "api/users": "tests/graphql-settings.test.ts",
  "api/*": "tests/api-boundary.test.ts",
};

const operationTestByName: Record<string, string> = {
  AccountsList: "tests/graphql-accounts.test.ts",
  AccountDetail: "tests/graphql-accounts.test.ts",
  XAccountPage: "tests/graphql-route.test.ts",
  OverviewPage: "tests/graphql-overview-page.test.ts",
  OverviewPulse: "tests/graphql-overview-page.test.ts",
  OverviewTopContent: "tests/graphql-overview-page.test.ts",
  OverviewFetchHealth: "tests/graphql-overview-page.test.ts",
  OverviewAnalyticsPortfolio: "tests/graphql-overview-page.test.ts",
  SettingsPage: "tests/graphql-settings.test.ts",
  AdminUsersPage: "tests/graphql-settings.test.ts",
  AiStatus: "tests/graphql-settings.test.ts",
  AppStoreConnections: "tests/app-store-routes.test.ts",
  AppStoreConnectionPage: "tests/app-store-routes.test.ts",
  AppStoreAnalyticsPage: "tests/app-store-routes.test.ts",
  RevenuePage: "tests/app-store-routes.test.ts",
  GitlabAccountPage: "tests/graphql-route.test.ts",
  GitlabProjectPage: "tests/graphql-route.test.ts",
  RedditAccountPage: "tests/graphql-route.test.ts",
  GithubAccountPage: "tests/graphql-route.test.ts",
  GithubRepoPage: "tests/graphql-route.test.ts",
  GithubWatchlistManager: "tests/graphql-route.test.ts",
};

async function routeEntries() {
  const source = await readFile("app/routes.ts", "utf8");
  return [...source.matchAll(/route\("([^"]+)",\s*"([^"]+)"\)/g)]
    .filter((match) => match[1] === "a/e" || match[1].startsWith("api/"))
    .map((match) => ({ route: match[1], file: path.join("app", match[2]) }));
}

describe("API contract inventory", () => {
  it("classifies every registered REST route, method surface, and owning contract suite", async () => {
    const entries = await routeEntries();
    const missing: string[] = [];
    const categories = { public: 0, session: 0, ownerOrAdmin: 0, admin: 0, infrastructure: 0 };

    for (const entry of entries) {
      const source = await readFile(entry.file, "utf8");
      const hasLoader = /export\s+(?:async\s+)?(?:const\s+loader|function\s+loader)/.test(source);
      const hasAction = /export\s+(?:async\s+)?(?:const\s+action|function\s+action)/.test(source);
      const testFile = Object.entries(routeTestByPrefix).find(([prefix]) => entry.route === prefix || entry.route.startsWith(`${prefix}/`))?.[1];
      if ((!hasLoader && !hasAction) || !testFile || !(await fileExists(testFile))) missing.push(entry.route);

      if (entry.route === "a/e" || /^api\/(?:health|bing-wallpaper|reddit\/callback)$/.test(entry.route)) categories.public++;
      else if (entry.route.startsWith("api/auth/")) categories.session++;
      else if (entry.route === "api/confirm/token" || entry.route === "api/*") categories.infrastructure++;
      else if (entry.route.startsWith("api/users")) categories.admin++;
      else if (entry.route === "api/graphql") categories.ownerOrAdmin++;
      else categories.ownerOrAdmin++;
    }

    expect(missing).toEqual([]);
    expect(entries).toHaveLength(31);
    expect(categories).toMatchObject({ public: 4, session: 4, ownerOrAdmin: 19, admin: 2, infrastructure: 2 });
  });

  it("inventories every browser GraphQL operation and maps it to a domain contract suite", async () => {
    const clientRoot = path.resolve("lib/client/graphql");
    const files = await tsFiles(clientRoot);
    const operations = new Set<string>();
    for (const file of files) {
      const source = await readFile(file, "utf8");
      for (const match of source.matchAll(/\bquery\s+([A-Z][A-Za-z0-9_]*)/g)) operations.add(match[1]);
      expect(source).not.toMatch(/\b(?:private_key|auth_token|password_hash|api_key)\b/i);
    }
    expect([...operations].sort()).toEqual(Object.keys(operationTestByName).sort());
    for (const testFile of Object.values(operationTestByName)) expect(await fileExists(testFile)).toBe(true);
    expect([...operations]).toHaveLength(21);
  });
});

async function fileExists(file: string) {
  try { await readFile(file); return true; } catch { return false; }
}

async function tsFiles(directory: string): Promise<string[]> {
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? tsFiles(file) : entry.isFile() && entry.name.endsWith(".ts") ? Promise.resolve([file]) : Promise.resolve([]);
  }));
  return nested.flat();
}
