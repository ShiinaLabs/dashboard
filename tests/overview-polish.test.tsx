import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it } from "vitest";
import { MetricCard } from "@/components/domain/shared/MetricCard";
import { SectionShell } from "@/components/domain/shared/SectionShell";

function render(element: React.ReactElement) {
  return renderToStaticMarkup(<MantineProvider>{element}</MantineProvider>);
}

describe("overview visual contracts", () => {
  it("keeps metric status in the content without a top color rail", () => {
    const html = render(
      <MetricCard
        icon={<span>!</span>}
        label="Failed"
        value={2}
        hint="Needs attention"
        tone="danger"
      />,
    );

    expect(html).not.toContain('data-slot="metric-accent"');
    expect(html).toContain('data-tone="danger"');
    expect(html).toContain('data-slot="metric-value"');
    expect(html).toContain('data-slot="metric-hint"');
  });

  it("gives every overview section a consistent heading structure", () => {
    const html = render(
      <SectionShell icon={<span>icon</span>} title="Fetch health">
        <p>Content</p>
      </SectionShell>,
    );

    expect(html).toContain('data-slot="overview-section"');
    expect(html).toContain('data-slot="overview-section-heading"');
    expect(html).toContain('data-slot="overview-section-icon"');
    expect(html).toContain("Fetch health");
  });

  it("keeps pulse highlight cards readable before the tablet breakpoint", () => {
    const css = readFileSync("app/globals.css", "utf8");
    const pulse = readFileSync("app/(dashboard)/overview/PulseSection.tsx", "utf8");

    expect(pulse).toContain("overview-highlight-grid");
    expect(css).toMatch(/\.overview-highlight-grid\s*\{[\s\S]*grid-template-columns:\s*1fr;/);
    expect(css).toContain("repeat(var(--highlight-columns), minmax(0, 1fr))");
  });

  it("keeps content links inside the dashboard visual system", () => {
    const css = readFileSync("app/globals.css", "utf8");

    expect(css).toMatch(/(^|\n)a\s*\{[\s\S]*color:\s*inherit;[\s\S]*text-decoration:\s*none;/);
  });

  it("uses one heading treatment for health and pulse sections", () => {
    const health = readFileSync("app/(dashboard)/overview/FetchHealthSection.tsx", "utf8");
    const pulse = readFileSync("app/(dashboard)/overview/PulseSection.tsx", "utf8");

    expect(health).toContain("SectionShell");
    expect(pulse).toContain("SectionShell");
  });

  it("gives overview account chips explicit icon and text spacing", () => {
    const overview = readFileSync("app/(dashboard)/overview/page.tsx", "utf8");
    const css = readFileSync("app/globals.css", "utf8");

    expect(overview).toContain('className="overview-account-chip"');
    expect(overview).toContain("leftSection=");
    expect(overview).toContain("rightSection=");
    expect(css).toMatch(/\.overview-account-chip\s*\{[\s\S]*align-items:\s*center;[\s\S]*padding/);
  });

  it("gives overview and detail chart cards a padded body around the plotting area", () => {
    const xDetail = readFileSync("app/(dashboard)/x/[id]/page.tsx", "utf8");
    const xOverview = readFileSync("app/(dashboard)/overview/XSection.tsx", "utf8");
    const css = readFileSync("app/globals.css", "utf8");

    expect(xDetail).toContain("ChartCard");
    expect(xOverview).toContain("overview-chart-body");
    expect(css).toMatch(/\.overview-chart-body\s*\{[\s\S]*padding:/);
  });

  it("provides the admin role translation and labeled form fields", () => {
    const zh = JSON.parse(readFileSync("locales/zh.json", "utf8")) as { admin: { role?: string } };
    const en = JSON.parse(readFileSync("locales/en.json", "utf8")) as { admin: { role?: string } };
    const admin = readFileSync("app/(dashboard)/admin/page.tsx", "utf8");

    expect(zh.admin.role).toBeTruthy();
    expect(en.admin.role).toBeTruthy();
    expect(admin).toContain('label={t("admin.password")}');
    expect(admin).toContain('label={t("admin.confirmPassword")}');
    expect(admin).toContain("admin-create-card");
  });

  it("gives account cards separate content and action insets", () => {
    const accounts = readFileSync("app/(dashboard)/accounts/page.tsx", "utf8");
    const accountList = readFileSync("components/AccountListPage.tsx", "utf8");
    const css = readFileSync("app/globals.css", "utf8");

    expect(accounts).toContain("account-card-content");
    expect(accounts).toContain("account-card-main");
    expect(accounts).toContain("account-card-actions");
    expect(accountList).toContain('className="account-card-content"');
    expect(accountList).toContain('<div className="account-card-content">');
    expect(accountList).not.toContain('<CardContent className="account-card-content">');
    expect(accountList).toContain("account-card-main");
    expect(accountList).toContain("account-card-meta");
    expect(css).toMatch(/\.account-card-actions\s*\{[\s\S]*padding:/);
    expect(css).toMatch(/\.account-card-content\s*\{[\s\S]*padding:\s*1\.25rem\s*!important/);
  });

  it("keeps fetch run history rows inside one padded list surface", () => {
    const history = readFileSync("components/FetchRunHistory.tsx", "utf8");
    const css = readFileSync("app/globals.css", "utf8");

    expect(history).toContain('<div className="fetch-history-content">');
    expect(history).toContain("fetch-history-list");
    expect(history).not.toContain('<CardContent className="p-3 pt-3 sm:p-3 sm:pt-3">');
    expect(history).not.toContain('className="-mx-2 space-y-0.5"');
    expect(css).toMatch(/\.fetch-history-content\s*\{[\s\S]*padding:/);
    expect(css).toMatch(/\.fetch-history-list\s*\{[\s\S]*display:\s*grid;[\s\S]*gap:/);
  });

  it("uses one padded layout contract for all detail-page content lists", () => {
    const sources = [
      readFileSync("app/(dashboard)/x/[id]/page.tsx", "utf8"),
      readFileSync("app/(dashboard)/github/[accountId]/page.tsx", "utf8"),
      readFileSync("app/(dashboard)/gitlab/[accountId]/page.tsx", "utf8"),
      readFileSync("app/(dashboard)/reddit/[id]/page.tsx", "utf8"),
    ];
    const css = readFileSync("app/globals.css", "utf8");

    for (const source of sources) {
      expect(source).toContain("detail-list-card");
      expect(source).toContain("detail-list-card-header");
      expect(source).toContain("detail-list-card-body");
      expect(source).toContain("detail-list");
      expect(source).toContain("detail-list-row");
    }
    expect(css).toMatch(/\.detail-list-card-header\s*\{[\s\S]*padding:/);
    expect(css).toMatch(/\.detail-list-card-body\s*\{[\s\S]*padding:/);
    expect(css).toMatch(/\.detail-list\s*\{[\s\S]*display:\s*grid;[\s\S]*gap:/);
    expect(css).toMatch(/\.detail-list-row\s*\{[\s\S]*padding:/);
  });

  it("keeps fetch-health issue rows inside one consistent padded surface", () => {
    const health = readFileSync("app/(dashboard)/overview/FetchHealthSection.tsx", "utf8");
    const css = readFileSync("app/globals.css", "utf8");

    expect(health).toContain("overview-health-issues");
    expect(health).toContain("overview-health-issue-row");
    expect(css).toMatch(/\.overview-health-issues\s*\{[\s\S]*padding:/);
    expect(css).toMatch(/(^|\n)p\s*\{\s*margin:\s*0;/);
  });

  it("gives top-content rows a dedicated icon slot", () => {
    const topContent = readFileSync("app/(dashboard)/overview/TopContentSection.tsx", "utf8");
    const css = readFileSync("app/globals.css", "utf8");

    expect(topContent).toContain("top-content-icon");
    expect(topContent).toContain("top-content-primary");
    expect(css).toMatch(/\.top-content-icon\s*\{[\s\S]*width:[\s\S]*height:/);
  });

  it("uses real chart body wrappers so card padding is not eaten by Card.Section", () => {
    const xDetail = readFileSync("app/(dashboard)/x/[id]/page.tsx", "utf8");
    const xOverview = readFileSync("app/(dashboard)/overview/XSection.tsx", "utf8");
    const css = readFileSync("app/globals.css", "utf8");

    expect(xDetail).toContain("ChartCard");
    expect(xOverview).toContain('<div className="overview-chart-body">');
    expect(xDetail).not.toContain('<div className="overview-chart-title">');
    expect(xOverview).toContain('<div className="overview-chart-title">');
    expect(css).toMatch(/\.overview-chart-title\s*\{[\s\S]*padding:/);
  });

  it("keeps Reddit chart cards on the same title and body layout contract", () => {
    const reddit = readFileSync("app/(dashboard)/overview/RedditSection.tsx", "utf8");

    expect(reddit).toContain('<div className="overview-chart-title">');
    expect(reddit).toContain('<div className="overview-chart-body">');
    expect(reddit).not.toContain("<Card.Section");
  });

  it("audits detail chart cards through the shared layout", () => {
    const chartCard = readFileSync("components/domain/shared/ChartCard.tsx", "utf8");
    const followerGrowth = readFileSync("components/XFollowerGrowthChart.tsx", "utf8");
    const repoDetail = readFileSync("app/(dashboard)/github/[accountId]/repos/[repoId]/page.tsx", "utf8");
    const projectDetail = readFileSync("app/(dashboard)/gitlab/[accountId]/projects/[projectId]/page.tsx", "utf8");
    const redditDetail = readFileSync("app/(dashboard)/reddit/[id]/page.tsx", "utf8");
    const githubAccount = readFileSync("app/(dashboard)/github/[accountId]/page.tsx", "utf8");
    const gitlabAccount = readFileSync("app/(dashboard)/gitlab/[accountId]/page.tsx", "utf8");
    const skeleton = readFileSync("components/Skeleton.tsx", "utf8");
    const xDetail = readFileSync("app/(dashboard)/x/[id]/page.tsx", "utf8");
    const trafficList = readFileSync("components/TrafficMetricList.tsx", "utf8");

    expect(chartCard).toContain("chart-card-title");
    expect(chartCard).toContain("chart-card-body");
    expect(followerGrowth).toContain("ChartCard");
    expect(repoDetail).toContain("ChartCard");
    expect((repoDetail.match(/<ChartCard/g) ?? []).length).toBeGreaterThanOrEqual(6);
    expect(projectDetail).toContain("ChartCard");
    expect(redditDetail).toContain("ChartCard");
    expect(githubAccount).toContain("ChartCard");
    expect(gitlabAccount).toContain("ChartCard");
    expect((githubAccount.match(/<ChartCard/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect((gitlabAccount.match(/<ChartCard/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((xDetail.match(/<ChartCard/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(skeleton).toContain('className="chart-card-title"');
    expect(skeleton).toContain('className="chart-card-body"');
    expect(trafficList).toContain("max-h-60");
    expect(trafficList).not.toContain("flex h-60 flex-col");
  });

  it("gives pinned repository controls explicit name and metric spacing", () => {
    const repoChip = readFileSync("components/ui/RepoChip.tsx", "utf8");
    const css = readFileSync("app/globals.css", "utf8");

    expect(repoChip).toContain('className="repo-chip min-w-0"');
    expect(repoChip).toContain('inner: "repo-chip-inner"');
    expect(repoChip).toContain('label: "repo-chip-label"');
    expect(repoChip).toContain("repo-chip-name");
    expect(repoChip).toContain("repo-chip-stats");
    expect(css).toMatch(/\.repo-chip-inner\s*\{[\s\S]*width:\s*100%;[\s\S]*gap:/);
    expect(css).toMatch(/\.repo-chip-label\s*\{[\s\S]*display:\s*flex;[\s\S]*align-items:\s*center;/);
  });

  it("centers metric content within the card's vertical inset", () => {
    const metricCard = readFileSync("components/domain/shared/MetricCard.tsx", "utf8");

    expect(metricCard).toContain('display: "flex"');
    expect(metricCard).toContain('alignItems: "center"');
    expect(metricCard).toContain('justifyContent: "center"');
  });
});
