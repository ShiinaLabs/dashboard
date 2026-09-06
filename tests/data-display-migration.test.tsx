import { readFileSync } from "node:fs";
import type { ReactNode } from "react";
import { MantineProvider } from "@mantine/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChartCardSkeleton } from "@/components/Skeleton";
import { CompactCard } from "@/components/domain/shared/OverviewCards";

const TASK_FOUR_ROUTES = [
  "app/(dashboard)/overview/page.tsx",
  "app/(dashboard)/overview/FetchHealthSection.tsx",
  "app/(dashboard)/overview/GitHubSection.tsx",
  "app/(dashboard)/overview/GitLabSection.tsx",
  "app/(dashboard)/overview/PulseSection.tsx",
  "app/(dashboard)/overview/RedditSection.tsx",
  "app/(dashboard)/overview/TopContentSection.tsx",
  "app/(dashboard)/overview/XSection.tsx",
  "app/(dashboard)/github/[accountId]/page.tsx",
  "app/(dashboard)/gitlab/[accountId]/page.tsx",
  "app/(dashboard)/reddit/[id]/page.tsx",
  "app/(dashboard)/x/[id]/page.tsx",
] as const;

const LEGACY_DATA_DISPLAY_REFERENCES = [
  "@/components/StatCard",
  "@/components/ui/card",
  "@/components/ui/BaseCard",
  "@/components/domain/shared/StatGrid",
  "StatCompactCard",
  "StatCardSkeleton",
  "<CardHeader",
  "<CardTitle",
  "<CardDescription",
  "<CardContent",
  "function MetricCard",
] as const;

function readProjectFile(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function renderWithMantine(element: ReactNode) {
  return renderToStaticMarkup(<MantineProvider>{element}</MantineProvider>);
}

describe("Task 4 data-display migration", () => {
  it("keeps overview and account-detail routes on canonical data-display components", () => {
    for (const path of TASK_FOUR_ROUTES) {
      const source = readProjectFile(path);

      for (const legacyReference of LEGACY_DATA_DISPLAY_REFERENCES) {
        expect(source, `${path} still references ${legacyReference}`).not.toContain(legacyReference);
      }
    }
  });

  it("keeps the X account summary on the canonical raw-number three-column contract", () => {
    const source = readProjectFile("app/(dashboard)/x/[id]/page.tsx");

    expect(source).toContain('<MetricGrid columns="three">');
    expect(source).toContain("value={account.stats.followers_count ?? 0}");
    expect(source).toContain("value={account.stats.following_count ?? 0}");
    expect(source).toContain("value={account.stats.tweet_count ?? 0}");
  });

  it("renders shared overview containers with Mantine Card", () => {
    const html = renderWithMantine(<CompactCard>content</CompactCard>);

    expect(html).toContain("mantine-Card-root");
    expect(html).toContain("content");
  });

  it("renders chart loading geometry with Mantine Card and Mantine Skeleton", () => {
    const html = renderWithMantine(<ChartCardSkeleton rows={2} />);

    expect(html).toContain("mantine-Card-root");
    expect(html).toContain("mantine-Skeleton-root");
  });
});
