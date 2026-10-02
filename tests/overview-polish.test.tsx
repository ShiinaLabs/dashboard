import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MetricCard } from "@/components/domain/shared/MetricCard";
import { SectionShell } from "@/components/domain/shared/SectionShell";

function render(element: React.ReactElement) {
  return renderToStaticMarkup(<>{element}</>);
}

function source(path: string) {
  return readFileSync(path, "utf8");
}

describe("dashboard presentation and behavior", () => {
  it("exposes metric status and data in readable semantic content", () => {
    const html = render(<MetricCard icon={<span>!</span>} label="Failed" value={2} hint="Needs attention" tone="danger" />);
    expect(html).toContain("Failed");
    expect(html).toContain(">2<");
    expect(html).toContain("Needs attention");
    expect(html).toContain('data-slot="metric-value"');
    expect(html).toContain('data-slot="metric-hint"');
  });

  it("renders section titles, optional descriptions, actions and children", () => {
    const html = render(<SectionShell icon={<span>icon</span>} title="Fetch health" description="Account sync status" action={<button>Refresh</button>}><p>Healthy accounts</p></SectionShell>);
    expect(html).toContain('data-slot="insight-card"');
    expect(html).toContain("Fetch health");
    expect(html).toContain("Account sync status");
    expect(html).toContain("Refresh");
    expect(html).toContain("Healthy accounts");
  });

  it("uses responsive utility grids for the pulse highlights", () => {
    const pulse = source("app/(dashboard)/overview/PulseSection.tsx");
    expect(pulse).toContain("grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3");
    expect(pulse).not.toContain("overview-highlight-grid");
  });

  it("keeps links inheriting the active theme colors", () => {
    expect(source("app/globals.css")).toMatch(/(^|\n)a\s*\{[\s\S]*color:\s*inherit;[\s\S]*text-decoration:\s*none;/);
  });

  it("groups pulse and fetch-health content into titled cards", () => {
    expect(source("app/(dashboard)/overview/FetchHealthSection.tsx")).toContain("SectionShell");
    expect(source("app/(dashboard)/overview/PulseSection.tsx")).toContain("SectionShell");
  });

  it("offers account management and only renders tabs for connected platforms", () => {
    const overview = source("app/(dashboard)/overview/page.tsx");
    expect(overview).toContain('to="/accounts"');
    expect(overview).toContain("TabsTrigger");
    expect(overview).toContain('value: "x"');
    expect(overview).toContain('value: "github"');
    expect(overview).toContain('value: "gitlab"');
    expect(overview).toContain('value: "reddit"');
    expect(overview).toContain("platform.enabled");
  });

  it("retains chart descriptions and constrains chart surfaces", () => {
    const xOverview = source("app/(dashboard)/overview/XSection.tsx");
    const chartCard = source("components/domain/shared/ChartCard.tsx");
    expect(xOverview).toContain('role="img"');
    expect(xOverview).toContain("overview.charts.tweetActivity");
    expect(xOverview).toContain("ResponsiveContainer");
    expect(chartCard).toContain("min-w-0 overflow-hidden");
  });

  it("keeps admin role labels, form names and protected visibility", () => {
    const zh = JSON.parse(source("locales/zh.json")) as { admin: { role?: string } };
    const en = JSON.parse(source("locales/en.json")) as { admin: { role?: string } };
    const admin = source("app/(dashboard)/admin/page.tsx");
    expect(zh.admin.role).toBeTruthy();
    expect(en.admin.role).toBeTruthy();
    expect(admin).toContain('label={t("admin.password")}');
    expect(admin).toContain('label={t("admin.confirmPassword")}');
    expect(admin).toContain('authData?.role !== "admin"');
  });

  it("keeps account identity separate from its action controls", () => {
    const accounts = source("app/(dashboard)/accounts/page.tsx");
    const accountList = source("components/AccountListPage.tsx");
    expect(accounts).toContain("data-account-actions");
    expect(accounts).toContain("aria-label={`${currentTab.formatUsername(account)}");
    expect(accounts).toContain("settings.edit");
    expect(accounts).toContain("settings.delete");
    expect(accountList).toContain("formatUsername(account)");
    expect(accountList).toContain("accountCard.last");
  });

  it("keeps fetch history grouped with responsive rows", () => {
    const history = source("components/FetchRunHistory.tsx");
    expect(history).toContain("grid gap-2 pt-3");
    expect(history).toContain("hover:bg-[var(--muted)]");
    expect(history).toContain("text-[var(--muted-foreground)]");
  });

  it("keeps platform detail content in bordered card surfaces", () => {
    const pages = ["app/(dashboard)/x/[id]/page.tsx", "app/(dashboard)/github/[accountId]/page.tsx", "app/(dashboard)/gitlab/[accountId]/page.tsx", "app/(dashboard)/reddit/[id]/page.tsx"].map(source);
    for (const page of pages) {
      expect(page).toContain("rounded-lg border bg-card");
      expect(page).toContain("border-b px-5 py-4");
      expect(page).toContain("min-w-0 p-5");
    }
  });

  it("presents fetch-health issues as separate readable rows", () => {
    const health = source("app/(dashboard)/overview/FetchHealthSection.tsx");
    expect(health).toContain("grid content-start gap-2 p-4");
    expect(health).toContain("issue.accountId");
    expect(health).toContain("issue.latestError");
    expect(source("app/globals.css")).toContain('@import "tailwindcss";');
  });

  it("gives top-content rows a platform icon and primary content column", () => {
    const topContent = source("app/(dashboard)/overview/TopContentSection.tsx");
    expect(topContent).toContain("grid size-7 shrink-0 place-items-center");
    expect(topContent).toContain("min-w-0 flex-1");
    expect(topContent).toContain("item.title");
  });

  it("pads chart titles and plots with independent responsive layout", () => {
    const x = source("app/(dashboard)/overview/XSection.tsx");
    expect(x).toContain("px-5 pt-5 pb-1");
    expect(x).toContain("min-w-0 overflow-hidden px-4 pb-4 sm:px-5 sm:pb-5");
  });

  it("uses consistent chart containers for Reddit analytics", () => {
    const reddit = source("app/(dashboard)/overview/RedditSection.tsx");
    expect(reddit).toContain("overview.charts.redditKarma");
    expect(reddit).toContain("overview.charts.redditActivity");
    expect(reddit).toContain("ResponsiveContainer");
    expect(reddit).not.toContain("<Card.Section");
  });

  it("shares chart cards across platform details and preserves chart loading placeholders", () => {
    const paths = ["components/domain/shared/ChartCard.tsx", "components/XFollowerGrowthChart.tsx", "app/(dashboard)/github/[accountId]/repos/[repoId]/page.tsx", "app/(dashboard)/gitlab/[accountId]/projects/[projectId]/page.tsx", "app/(dashboard)/reddit/[id]/page.tsx", "app/(dashboard)/github/[accountId]/page.tsx", "app/(dashboard)/gitlab/[accountId]/page.tsx", "app/(dashboard)/x/[id]/page.tsx"];
    for (const path of paths) expect(source(path)).toContain("ChartCard");
    const chartCard = source("components/domain/shared/ChartCard.tsx");
    expect(chartCard).toContain('data-slot="chart-card-title"');
    expect(chartCard).toContain('data-slot="chart-card-body"');
    expect(source("components/Skeleton.tsx")).toContain("ChartCardSkeleton");
    expect(source("components/TrafficMetricList.tsx")).toContain("max-h-60");
  });

  it("keeps release chart axes readable at mobile widths", () => {
    const repoDetail = source("app/(dashboard)/github/[accountId]/repos/[repoId]/page.tsx");
    expect(repoDetail).toContain("const RELEASE_Y_AXIS_WIDTH = isMobile ? 48 : 72;");
    expect(repoDetail).toContain("width={RELEASE_Y_AXIS_WIDTH}");
  });

  it("keeps repository identity, language and metrics available to keyboard users", () => {
    const repoChip = source("components/ui/RepoChip.tsx");
    expect(repoChip).toContain('variant="outline"');
    expect(repoChip).toContain("name: string");
    expect(repoChip).toContain("stars.toLocaleString()");
    expect(repoChip).toContain("forks.toLocaleString()");
    expect(repoChip).toContain("min-w-0");
  });

  it("labels App Store Analytics purchases and Sales & Trends activity as separate sources", () => {
    const page = source("app/(dashboard)/revenue/page.tsx");
    const en = JSON.parse(source("locales/en.json")) as { revenue: Record<string, string> };
    const zh = JSON.parse(source("locales/zh.json")) as { revenue: Record<string, string> };
    expect(page).toContain('t("revenue.analyticsSource")');
    expect(page).toContain('t("revenue.salesSource")');
    expect(page).toContain('t("revenue.salesUnitsAllTypes")');
    expect(en.revenue.analyticsSource).toContain("App Store Analytics");
    expect(en.revenue.salesSource).toContain("Sales & Trends");
    expect(zh.revenue.analyticsSource).toContain("App Store Analytics");
    expect(zh.revenue.salesSource).toContain("Sales & Trends");
  });

  it("uses compact metric cards without preserving the old fixed minimum height", () => {
    const html = render(<MetricCard icon={<span>icon</span>} label="Followers" value={12345} hint="Today +12" />);
    expect(html).toContain("line-clamp-2");
    expect(html).toContain("tabular-nums");
    expect(html).not.toContain("min-height");
    expect(html).not.toContain("metric-accent");
  });
});
