import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AnalyticsAtAGlance } from "@/components/domain/analytics/AnalyticsAtAGlance";

describe("analytics at-a-glance summary", () => {
  const items = [
    { key: "page", label: "Top Page", value: "/", detail: "42 Views" },
    { key: "source", label: "Top Source", value: "Direct", detail: "2,100 Visits" },
    { key: "country", label: "Top Country", value: "Japan (JP)", detail: "4,280 Views" },
    { key: "campaign", label: "Top Campaign", value: "launch", detail: "newsletter / email · 420 Visits" },
  ];

  it("renders four compact text summaries without interactive controls", () => {
    const markup = renderToStaticMarkup(createElement(AnalyticsAtAGlance, {
      title: "At a glance",
      items,
      emptyMessage: "No analytics data in this period",
      loadingLabel: "Loading",
    }));

    for (const item of items) {
      expect(markup).toContain(item.label);
      expect(markup).toContain(item.value);
      expect(markup).toContain(item.detail);
    }
    expect(markup).toContain('<section aria-labelledby="analytics-at-a-glance-heading"');
    expect(markup).toContain('id="analytics-at-a-glance-heading"');
    expect(markup.match(/<dt/g)).toHaveLength(4);
    expect(markup).not.toMatch(/<(?:a|button)\b/);
  });

  it("exposes the full value as a title when the displayed text truncates", () => {
    const markup = renderToStaticMarkup(createElement(AnalyticsAtAGlance, {
      title: "At a glance",
      items: [{ key: "page", label: "Top Page", value: "/a/very/long/path", detail: "42 Views", title: "/a/very/long/path" }],
      emptyMessage: "No analytics data in this period",
      loadingLabel: "Loading",
    }));

    expect(markup).toContain("truncate");
    expect(markup).toContain('title="/a/very/long/path"');
  });

  it("renders a single empty state or loading skeleton instead of summary cells", () => {
    const emptyMarkup = renderToStaticMarkup(createElement(AnalyticsAtAGlance, {
      title: "At a glance",
      items,
      emptyMessage: "No analytics data in this period",
      loadingLabel: "Loading",
      empty: true,
    }));
    expect(emptyMarkup).toContain("No analytics data in this period");
    expect(emptyMarkup).not.toContain("Top Page");

    const loadingMarkup = renderToStaticMarkup(createElement(AnalyticsAtAGlance, {
      title: "At a glance",
      items,
      emptyMessage: "No analytics data in this period",
      loadingLabel: "Loading",
      loading: true,
    }));
    expect(loadingMarkup).toContain("Loading");
    expect(loadingMarkup).not.toContain("Top Page");
  });
});
