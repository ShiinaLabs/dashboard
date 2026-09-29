import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const browserRoots = ["app", "components"].map((directory) => path.resolve(process.cwd(), directory));
const rawApiFetch = /\bfetch\s*\(\s*["'`]\/api\//;

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
    const files = (await Promise.all(browserRoots.map(sourceFiles))).flat();
    const violations: string[] = [];

    for (const file of files) {
      const source = await readFile(file, "utf8");
      if (rawApiFetch.test(source)) violations.push(path.relative(process.cwd(), file));
    }

    expect(violations).toEqual([]);
  });
});
