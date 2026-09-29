import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { MetricCard, MetricCardSkeleton } from "@/components/domain/shared/MetricCard";
import { MetricGrid } from "@/components/domain/shared/MetricGrid";

function renderToHtml(element: ReactNode) {
  return renderToStaticMarkup(<>{element}</>);
}

describe("MetricCard", () => {
  it("renders stable label, value, hint and icon slots", () => {
    const html = renderToHtml(
      <MetricCard icon={<span>icon</span>} label="Followers" value={12345} hint="Today +12" />,
    );

    expect(html).toContain("Followers");
    expect(html).toContain("12,345");
    expect(html).toContain("Today +12");
    expect(html).toContain("data-slot=\"metric-icon\"");
    expect(html).toContain("data-slot=\"metric-label\"");
    expect(html).toContain("data-slot=\"metric-value\"");
    expect(html).toContain("data-slot=\"metric-hint\"");
    expect(html).not.toContain("min-height");
    expect(html).toContain("line-clamp-2");
    expect(html).toContain("tabular-nums");
  });

  it("keeps loading geometry equivalent to the card", () => {
    const html = renderToHtml(<MetricCardSkeleton />);

    expect(html).toContain("data-slot=\"metric-skeleton-icon\"");
    expect(html).toContain("data-slot=\"metric-skeleton-value\"");
    expect(html).toContain("data-slot=\"metric-skeleton-label\"");
    expect(html).toContain("data-slot=\"metric-skeleton-hint\"");
  });

  it("uses semantic value tones while keeping neutral metrics neutral", () => {
    const positive = renderToHtml(<MetricCard icon={<span />} label="Growth" value={2} tone="success" />);
    const negative = renderToHtml(<MetricCard icon={<span />} label="Errors" value={1} tone="danger" />);
    const neutral = renderToHtml(<MetricCard icon={<span />} label="Accounts" value={8} />);

    expect(positive).toContain("text-[var(--success)]");
    expect(negative).toContain("text-[var(--danger)]");
    expect(neutral).toContain("text-foreground");
    expect(neutral).not.toContain("text-[var(--success)]");
    expect(neutral).not.toContain("text-[var(--danger)]");
  });

  it("keeps success and danger tone semantics theme-token based in dark and light themes", () => {
    const html = renderToHtml(<div className="dark"><MetricCard icon={<span />} label="Growth" value={2} tone="success" /><MetricCard icon={<span />} label="Errors" value={1} tone="danger" /></div>);

    expect(html).toContain("text-[var(--success)]");
    expect(html).toContain("text-[var(--danger)]");
  });

  it("preserves the four-column tablet breakpoint", () => {
    const html = renderToHtml(
      <MetricGrid columns="four"><MetricCard icon={<span>icon</span>} label="Followers" value={1} /></MetricGrid>,
    );

    expect(html).toContain('data-slot="metric-grid"');
    expect(html).toContain('data-columns="four"');
    expect(html).toContain("grid-cols-2");
    expect(html).toContain("xl:grid-cols-4");
  });

  it("supports three-column detail summaries without a page-local grid", () => {
    const html = renderToHtml(
      <MetricGrid columns="three">
        <MetricCard icon={<span>icon</span>} label="Followers" value={1} />
      </MetricGrid>,
    );

    expect(html).toContain('data-columns="three"');
    expect(html).toContain("grid-cols-2");
    expect(html).toContain("xl:grid-cols-3");
  });
});
