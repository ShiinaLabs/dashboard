import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function projectSources(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    if (statSync(path).isDirectory()) return projectSources(path);
    return path.endsWith(".tsx") ? [path] : [];
  });
}

describe("Mantine UI smoke contracts", () => {
  it("has one MantineProvider and no application-authored native controls", () => {
    const sources = projectSources("app").concat(projectSources("components"));
    const source = sources.map((path) => readFileSync(path, "utf8")).join("\n");

    expect(source.match(/<MantineProvider\b/g)?.length).toBe(1);
    expect(source).not.toMatch(/<(button|input|select|textarea)\b/);
  });

  it("keeps Mantine styles layered before Tailwind utilities without preflight", () => {
    const css = readFileSync("app/globals.css", "utf8");
    expect(css).toContain('@import "@mantine/core/styles.layer.css";');
    expect(css).toContain('@import "tailwindcss/theme.css" layer(theme);');
    expect(css).toContain('@import "tailwindcss/utilities.css" layer(utilities);');
    expect(css).not.toContain("tailwindcss/preflight.css");
  });
});
