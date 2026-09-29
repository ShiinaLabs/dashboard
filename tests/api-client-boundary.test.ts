import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const browserRoots = ["app", "components"].map((directory) => path.resolve(process.cwd(), directory));
const rawApiFetch = /\bfetch\s*\(\s*["'`][^"'`]*\/api\//;
const importSpecifier = /\b(?:from\s*|import\s*\(?\s*)["']([^"']+)["']/g;
const forbiddenPackages = /^(?:pg|drizzle-orm)(?:\/|$)/;
const forbiddenSourceRoots = [
  "db",
  "lib/db",
  "lib/repositories",
  "lib/fetchers",
  "lib/fetcher",
  "lib/fetch-dispatch",
].map((root) => path.resolve(process.cwd(), root));

function resolvesToForbiddenSource(file: string, specifier: string): boolean {
  if (forbiddenPackages.test(specifier)) return true;

  let resolved: string | null = null;
  if (specifier.startsWith("@/")) resolved = path.resolve(process.cwd(), specifier.slice(2));
  else if (specifier.startsWith(".")) resolved = path.resolve(path.dirname(file), specifier);
  if (!resolved) return false;

  const normalized = resolved.replace(/\.(?:[cm]?[jt]sx?)$/, "");
  return forbiddenSourceRoots.some((root) => normalized === root || normalized.startsWith(`${root}${path.sep}`));
}

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(fullPath);
    return entry.isFile() && /\.(?:ts|tsx|js|jsx)$/.test(entry.name) ? [fullPath] : [];
  }));
  return nested.flat();
}

describe("browser API client boundary", () => {
  it("keeps direct /api fetch calls out of pages and components", async () => {
    const files = (await Promise.all(browserRoots.map(sourceFiles))).flat()
      .filter((file) => !path.relative(process.cwd(), file).startsWith(`app${path.sep}api${path.sep}`));
    const violations: string[] = [];

    for (const file of files) {
      const source = await readFile(file, "utf8");
      if (rawApiFetch.test(source)) violations.push(path.relative(process.cwd(), file));
    }

    expect(violations).toEqual([]);
  });

  it("keeps repository, database, and fetcher imports out of pages and components", async () => {
    const files = (await Promise.all(browserRoots.map(sourceFiles))).flat()
      .filter((file) => !path.relative(process.cwd(), file).startsWith(`app${path.sep}api${path.sep}`));
    const violations: string[] = [];

    for (const file of files) {
      const source = await readFile(file, "utf8");
      for (const match of source.matchAll(importSpecifier)) {
        if (resolvesToForbiddenSource(file, match[1])) {
          violations.push(`${path.relative(process.cwd(), file)}: ${match[1]}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
