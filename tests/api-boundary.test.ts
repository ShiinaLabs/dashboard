import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const apiRoot = path.resolve(process.cwd(), "app/api");
const forbiddenSpecifier = [
  /(?:^|\/)repositories\//,
  /(?:^|\/)db(?:\/|$)/,
  /(?:^|\/)fetchers\//,
  /(?:^|\/)fetcher(?:\/|$)/,
  /(?:^|\/)fetch-dispatch(?:\/|$)/,
  /(?:^|\/)infra\//,
  /^drizzle-orm(?:\/|$)/,
  /^pg$/,
];
const importSpecifier = /\b(?:from\s*|import\s*)["']([^"']+)["']/g;

async function routeFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return routeFiles(fullPath);
    return entry.isFile() && entry.name.endsWith("route.ts") ? [fullPath] : [];
  }));
  return nested.flat();
}

describe("API route dependency boundary", () => {
  it("keeps repositories, database drivers, and fetch implementations behind services", async () => {
    const files = await routeFiles(apiRoot);
    const violations: string[] = [];

    for (const file of files) {
      const source = await readFile(file, "utf8");
      for (const match of source.matchAll(importSpecifier)) {
        const specifier = match[1];
        const blocked = forbiddenSpecifier.find((pattern) => pattern.test(specifier));
        if (blocked) violations.push(`${path.relative(process.cwd(), file)}: ${specifier}`);
      }
    }

    expect(violations).toEqual([]);
  });
});
