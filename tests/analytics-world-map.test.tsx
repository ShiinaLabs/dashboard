import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AnalyticsWorldMap } from "@/components/domain/analytics/AnalyticsWorldMap";
import { projectedCountryPaths, resolveCountryGeometryCode } from "@/components/domain/analytics/world-map/geometry";

const labels = {
  countries: [{ country: "JP", views: 2 }, { country: "Unknown", views: 5 }],
  totalViews: 10,
  locale: "en",
  title: "Visitor geography",
  emptyMessage: "No geographic data in this period",
  lessLabel: "Less",
  moreLabel: "More",
  viewsLabel: "Views",
};

describe("AnalyticsWorldMap", () => {
  it("maps common geometry identifiers to ISO alpha-2 features", () => {
    const codes = new Set(projectedCountryPaths.map(({ code }) => code));
    for (const code of ["JP", "US", "DE", "CN", "GB", "FR", "CA", "AU", "BR", "IN"]) {
      expect(resolveCountryGeometryCode(code)).toBe(code);
      expect(codes.has(code)).toBe(true);
    }
    expect(resolveCountryGeometryCode("USA")).toBe("US");
    expect(resolveCountryGeometryCode("GBR")).toBe("GB");
  });

  it("highlights mapped traffic and keeps unknown and no-traffic countries inactive", () => {
    const markup = renderToStaticMarkup(createElement(AnalyticsWorldMap, labels));
    expect(markup).toContain('role="img" aria-label="Visitor geography"');
    expect(markup).toContain('data-country-code="JP" data-active="true"');
    expect(markup).toContain('data-country-code="US" data-active="false"');
    expect(markup).not.toContain('data-country-code="Unknown"');
    expect(markup).toContain('aria-label="Japan, 2 views, 20%"');
  });

  it("uses log-scaled intensity so a single view remains visible", () => {
    const markup = renderToStaticMarkup(createElement(AnalyticsWorldMap, {
      ...labels,
      countries: [{ country: "JP", views: 128 }, { country: "US", views: 8 }, { country: "DE", views: 1 }],
      totalViews: 137,
    }));
    expect(markup).toContain('data-country-code="JP" data-active="true" data-intensity="5"');
    expect(markup).toContain('data-country-code="DE" data-active="true" data-intensity="1"');
  });

  it("shows the geographic empty state when all country traffic is unknown", () => {
    const markup = renderToStaticMarkup(createElement(AnalyticsWorldMap, { ...labels, countries: [{ country: "Unknown", views: 8 }] }));
    expect(markup).toContain("No geographic data in this period");
    expect(markup).not.toContain("data-country-code=");
  });
});
