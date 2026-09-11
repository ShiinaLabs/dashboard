import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * The two locale files are maintained by hand and nothing else enforces that
 * they stay in step: there is no i18n eslint plugin and no parity test. A key
 * added to one file only shows up as a dev-only missingKey warning, so this
 * test is the executable form of that convention.
 */
function load(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

function keyPaths(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return [prefix];
  return Object.entries(value as Record<string, unknown>)
    .flatMap(([key, child]) => keyPaths(child, prefix ? `${prefix}.${key}` : key));
}

describe("locale parity", () => {
  const en = load("locales/en.json");
  const zh = load("locales/zh.json");

  it("exposes exactly the same translation keys in both locales", () => {
    const enKeys = keyPaths(en).sort();
    const zhKeys = keyPaths(zh).sort();
    expect(zhKeys.filter((key) => !enKeys.includes(key))).toEqual([]);
    expect(enKeys.filter((key) => !zhKeys.includes(key))).toEqual([]);
  });

  it("keeps the same top-level section order", () => {
    expect(Object.keys(zh)).toEqual(Object.keys(en));
  });

  it("has a translation for the github watchlist feature in both", () => {
    for (const locale of [en, zh]) {
      const section = locale.githubWatchlist as Record<string, string>;
      expect(section).toBeTruthy();
      for (const value of Object.values(section)) expect(value.trim().length).toBeGreaterThan(0);
      expect(section.watchingHeading).toBeTruthy();
      expect(section.availableEmpty).toBeTruthy();
    }
  });
});
