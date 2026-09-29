import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AnalyticsDimensionCard } from "@/components/domain/analytics/AnalyticsDimensionCard";

describe("analytics ranked metric card", () => {
  it("renders arbitrary metric values and computes share from the matching total", () => {
    const markup = renderToStaticMarkup(createElement(AnalyticsDimensionCard, {
      title: "Referrers",
      itemLabel: "Referrer",
      metricLabel: "Visits",
      shareLabel: "Share",
      emptyMessage: "No acquisition data",
      loadingLabel: "Loading",
      items: [{ key: "google.com", label: "google.com", value: 2 }],
      totalValue: 4,
    }));

    expect(markup).toContain("Visits");
    expect(markup).toContain("google.com");
    expect(markup).toContain(">2</span>");
    expect(markup).toContain("50%");
    expect(markup).not.toContain("Views");
    expect(markup).not.toContain("undefined");
  });
});
