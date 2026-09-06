import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { MantineProvider } from "@mantine/core";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// calcYAxisWidth measures text via @chenglou/pretext, which needs a canvas
// context; provide a minimal OffscreenCanvas stub for server rendering.
class FakeCanvasContext {
  font = "";
  measureText(seg: string) {
    return { width: seg.length * 6 };
  }
}
class FakeOffscreenCanvas {
  getContext() {
    return new FakeCanvasContext();
  }
}
vi.stubGlobal("OffscreenCanvas", FakeOffscreenCanvas);

import { XFollowerGrowthChart } from "../components/XFollowerGrowthChart";

function readProjectFile(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const SNAPSHOTS = [
  { date: "2026-08-01", followers_count: 1000, following_count: 50, tweet_count: 200 },
  { date: "2026-08-02", followers_count: 980, following_count: 52, tweet_count: 205 },
];

function renderChart(data: typeof SNAPSHOTS) {
  return renderToStaticMarkup(
    <MantineProvider>
      <XFollowerGrowthChart data={data} />
    </MantineProvider>,
  );
}

describe("XFollowerGrowthChart", () => {
  it("renders a follower curve when at least two snapshots exist", () => {
    const html = renderChart(SNAPSHOTS);

    expect(html).toContain("xDetail.followerGrowth");
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="xDetail.followerGrowthA11y"');
    expect(html).toContain("recharts-responsive-container");
    expect(html).not.toContain("xDetail.followerGrowthEmpty");
  });

  it("shows an explicit insufficient-history state for zero snapshots", () => {
    const html = renderChart([]);

    expect(html).toContain("xDetail.followerGrowthEmpty");
    expect(html).not.toContain("recharts-responsive-container");
    expect(html).not.toContain('role="img"');
  });

  it("shows an explicit insufficient-history state for a single snapshot", () => {
    const html = renderChart([SNAPSHOTS[0]]);

    expect(html).toContain("xDetail.followerGrowthEmpty");
    expect(html).not.toContain("recharts-responsive-container");
  });

  it("keeps the follower chart independent of the tweets chart data", () => {
    const page = readProjectFile("app/(dashboard)/x/[id]/page.tsx");

    const chartUsage = page.indexOf("<XFollowerGrowthChart");
    const firstTweetsGuard = page.indexOf("timeline.dailyTweets.length > 0");

    expect(chartUsage).toBeGreaterThan(-1);
    expect(firstTweetsGuard).toBeGreaterThan(-1);
    expect(chartUsage).toBeLessThan(firstTweetsGuard);
    expect(page.match(/<XFollowerGrowthChart/g)?.length ?? 0).toBe(1);
  });

  it("plots followers_count with the shared chart conventions", () => {
    const source = readProjectFile("components/XFollowerGrowthChart.tsx");

    expect(source).toContain("AreaChart");
    expect(source).toContain('dataKey="date"');
    expect(source).toContain('dataKey="followers_count"');
    expect(source).toContain('calcYAxisWidth(data, "followers_count")');
    expect(source).toContain("data.length >= 2");
  });
});
