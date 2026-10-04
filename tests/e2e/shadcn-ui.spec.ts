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

describe("shadcn UI architecture contracts", () => {
  it("keeps React Router, React Query, and the existing API client boundary", () => {
    const layout = readFileSync("components/layout/authenticated-layout.tsx", "utf8");
    const route = readFileSync("app/(dashboard)/layout.tsx", "utf8");
    expect(layout).toContain("@tanstack/react-query");
    expect(layout).not.toContain("api.checkAuth()");
    expect(layout).toContain("api.logout()");
    expect(route).toContain("requireSession(request)");
    expect(route).toContain("<Outlet context={user} />");
  });

  it("uses the donor sidebar shell with accessible shadcn primitives", () => {
    const sources = projectSources("components");
    const source = sources.map((path) => readFileSync(path, "utf8")).join("\n");
    expect(source).toContain("SidebarProvider");
    expect(source).toContain("SidebarInset");
    expect(source).toContain("AlertDialog");
    expect(source).toContain("SheetContent");
  });

  it("keeps Tailwind preflight, theme tokens, and motion styling in the root stylesheet", () => {
    const css = readFileSync("app/globals.css", "utf8");
    const tokens = readFileSync("components/ui/theme.css", "utf8");
    expect(css).toContain('@import "tailwindcss";');
    expect(css).toContain('@import "tw-animate-css";');
    for (const token of ["--background", "--foreground", "--card", "--popover", "--primary", "--sidebar-ring"]) {
      expect(tokens).toContain(token);
    }
  });
});
