import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import type { ReactNode } from "react";
import { MetricCard, MetricCardSkeleton } from "@/components/domain/shared/MetricCard";
import { MetricGrid } from "@/components/domain/shared/MetricGrid";

function renderWithMantine(element: ReactNode) {
  return renderToStaticMarkup(<MantineProvider>{element}</MantineProvider>);
}

describe("MetricCard", () => {
  it("renders stable label, value, hint and icon slots", () => {
    const html = renderWithMantine(
      <MetricCard icon={<span>icon</span>} label="Followers" value={12345} hint="Today +12" />,
    );

    expect(html).toContain("Followers");
    expect(html).toContain("12,345");
    expect(html).toContain("Today +12");
    expect(html).toContain("data-slot=\"metric-icon\"");
    expect(html).toContain("data-slot=\"metric-label\"");
    expect(html).toContain("data-slot=\"metric-value\"");
    expect(html).toContain("data-slot=\"metric-hint\"");
    expect(html).toContain("min-height:108px");
    expect(html).toContain("font-variant-numeric:tabular-nums");
  });

  it("keeps loading geometry equivalent to the card", () => {
    const html = renderWithMantine(<MetricCardSkeleton />);

    expect(html).toContain("data-slot=\"metric-skeleton-icon\"");
    expect(html).toContain("data-slot=\"metric-skeleton-value\"");
    expect(html).toContain("data-slot=\"metric-skeleton-label\"");
    expect(html).toContain("data-slot=\"metric-skeleton-hint\"");
  });

  it("preserves the four-column tablet breakpoint", () => {
    const html = renderWithMantine(
      <MetricGrid columns="four"><MetricCard icon={<span>icon</span>} label="Followers" value={1} /></MetricGrid>,
    );

    expect(html).toContain('data-slot="metric-grid"');
    expect(html).toContain('data-columns="four"');
    expect(html).toContain("48em");
    expect(html).toContain("--sg-cols:4");
  });

  it("supports three-column detail summaries without a page-local grid", () => {
    const html = renderWithMantine(
      <MetricGrid columns="three">
        <MetricCard icon={<span>icon</span>} label="Followers" value={1} />
      </MetricGrid>,
    );

    expect(html).toContain('data-columns="three"');
    expect(html).toContain("48em");
    expect(html).toContain("--sg-cols:3");
  });
});
