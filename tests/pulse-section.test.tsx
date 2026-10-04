import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, vi } from "vitest";
import * as PulseModule from "../components/domain/pulse/PulseSection";

const { pulseResponse } = vi.hoisted(() => ({
  pulseResponse: {
    range: { days: 7, since: "2026-09-22T00:00:00.000Z", until: "2026-09-29T00:00:00.000Z" },
    totals: {
      activity: { current: 0, previous: 0, change: 0 },
      traction: {
        stars: { current: 187, previous: 182, change: 5 },
        forks: { current: 13, previous: 12, change: 1 },
      },
    },
    platforms: [{
      platform: "github",
      audienceMetric: "followers",
      audience: { current: 0, previous: 0, change: 0 },
      activity: { current: 0, previous: 0, change: 0, tweets: 0, posts: 0, comments: 0, contributions: 0 },
    }],
    content: { tweets: [], redditPosts: [], redditComments: [] },
    repositories: [],
  },
}));

vi.mock("@tanstack/react-query", () => ({
    useQuery: () => ({ data: undefined, isPending: true, isError: false }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { PulseSection } from "../app/(dashboard)/overview/PulseSection";

describe("PulseSection domain", () => {
  it("exports PulseSection", () => {
    expect(PulseModule.PulseSection).toBeDefined();
    expect(typeof PulseModule.PulseSection).toBe("function");
  });

  it("shows GitHub traction values in previous-to-current order", () => {
    const html = renderToStaticMarkup(<PulseSection initialData={pulseResponse} />);

    expect(html).not.toContain("187 → 182");
    expect(html).toContain("182 → 187");
    expect(html).not.toContain("13 → 12");
    expect(html).toContain("12 → 13");
  });
});
