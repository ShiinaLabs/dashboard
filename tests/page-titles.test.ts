import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { APP_NAME, PAGE_TITLES, titleFor, type PageTitleKey } from "../lib/page-titles";

/**
 * Every page used to render with no `<title>` at all: the tab showed the URL.
 * Nothing in the build catches a route that forgets one, so this is the
 * executable form of "a page route declares its tab title" — the same contract
 * shape tests/mobile-layout.test.ts uses for other route-level conventions.
 */

const root = fileURLToPath(new URL("..", import.meta.url));

function pageFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name === "page.tsx")
    // `parentPath` is Node >= 20.12; older 20.x exposes the same value as `path`.
    .map((entry) => {
      const parent = (entry as { parentPath?: string; path?: string }).parentPath ?? entry.path ?? dir;
      return join(parent, entry.name);
    });
}

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function lookup(source: unknown, dottedKey: string): unknown {
  return dottedKey
    .split(".")
    .reduce<unknown>(
      (node, part) => (node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined),
      source,
    );
}

describe("page titles", () => {
  const en = JSON.parse(read(join(root, "locales/en.json"))) as unknown;
  const zh = JSON.parse(read(join(root, "locales/zh.json"))) as unknown;

  it("appends the app name to a page name", () => {
    expect(titleFor("GitHub")).toBe(`GitHub · ${APP_NAME}`);
    expect(titleFor()).toBe(APP_NAME);
    expect(titleFor(null)).toBe(APP_NAME);
  });

  it("keeps the app name in step with the localized header", () => {
    expect(en).toMatchObject({ common: { dashboard: APP_NAME } });
  });

  it("resolves every bundled title key in both locales", () => {
    for (const key of Object.keys(PAGE_TITLES) as PageTitleKey[]) {
      expect(lookup(en, key), `en.json is missing ${key}`).toBe(PAGE_TITLES[key]);
      expect(typeof lookup(zh, key), `zh.json is missing ${key}`).toBe("string");
    }
  });

  it("gives every rendering page route a meta and a matching title handle", () => {
    const files = pageFiles(join(root, "app"));

    // The index route only throws a redirect; it never renders a page.
    const rendering = files.filter((file) => !read(file).includes("throw redirect("));
    expect(rendering.length).toBeGreaterThan(10);

    for (const file of rendering) {
      const source = read(file);
      const label = relative(root, file);

      const declared = source.match(/const titleKey = "([^"]+)" satisfies PageTitleKey;/);
      expect(declared, `${label} does not declare a titleKey`).not.toBeNull();

      const key = declared?.[1] as PageTitleKey;
      expect(PAGE_TITLES[key], `${label} uses "${key}", which no locale bundles`).toBeTruthy();
      expect(source, `${label} does not export the English meta`).toContain("export const meta = pageMeta(titleKey);");
      expect(source, `${label} does not export the title handle`).toContain(
        "export const handle = { titleKey } satisfies TitleHandle;",
      );
    }
  });

  it("keeps the root route's fallback title for pages that declare none", () => {
    expect(read(join(root, "app/root.tsx"))).toContain("export const meta: MetaFunction = () => [{ title: titleFor() }]");
  });
});
