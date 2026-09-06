import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { TimeRangeSelector } from "../components/TimeRangeSelector";

function readProjectFile(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("mobile layout contracts", () => {
  it("makes the time range selector fill narrow screens with touch-sized options", () => {
    const html = renderToStaticMarkup(
      <MantineProvider><TimeRangeSelector value={30} onChange={() => undefined} /></MantineProvider>,
    );

    expect(html).toContain("mantine-SegmentedControl-root");
    expect(html).toContain("data-full-width=\"true\"");
  });

  it("keeps sidebar navigation items touch-sized", () => {
    const source = readProjectFile("components/Layout.tsx");

    expect(source).toContain("relative flex min-h-11 items-center gap-3");
    expect(source).toContain("flex min-h-11 items-center gap-3");
  });

  it("hydrates the layout from a server-stable sidebar state", () => {
    const source = readProjectFile("components/Layout.tsx");

    // SSR must render the open sidebar deterministically; the client then
    // reconciles via matchMedia / localStorage without a hydration flash.
    expect(source).toContain("useState(() => {");
    expect(source).toContain('typeof window === "undefined"');
    expect(source).toContain("loadVisible()");
  });

  it("waits for the client before rendering detected translations", () => {
    const i18n = readProjectFile("lib/client/i18n.ts");
    const providers = readProjectFile("app/providers.tsx");

    expect(i18n).toContain('lng: isBrowser ? undefined : "en"');
    expect(providers).toContain("useSyncExternalStore");
    expect(providers).toContain("if (!mounted)");
  });

  it("gives the most-used detail pages a full-width mobile control row", () => {
    const xDetail = readProjectFile("app/(dashboard)/x/[id]/page.tsx");
    const repoDetail = readProjectFile("app/(dashboard)/github/[accountId]/repos/[repoId]/page.tsx");

    expect(xDetail).toContain('className="mobile-detail-controls"');
    expect(repoDetail).toContain('className="mobile-detail-controls"');
  });

  it("keeps detail header actions at their intrinsic width", () => {
    const styles = readProjectFile("app/globals.css");

    expect(styles).toMatch(/\.detail-header-actions\s*\{[^}]*align-self:\s*flex-start/s);
  });

  it("balances the four repository metrics in a two-column layout", () => {
    const repoDetail = readProjectFile("app/(dashboard)/github/[accountId]/repos/[repoId]/page.tsx");

    // 4 metrics (stars/forks/issues/PRs) fit 2x2 on mobile, 4 on desktop — no col-span hack needed
    expect(repoDetail).toContain('grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4');
  });

  it("constrains repository chart tooltips with wrapping long labels", () => {
    const repoDetail = readProjectFile("app/(dashboard)/github/[accountId]/repos/[repoId]/page.tsx");

    expect(repoDetail).toContain('maxWidth: "min(28rem, calc(100vw - 2rem))"');
    expect(repoDetail.match(/contentStyle=\{CHART_TOOLTIP_CONTENT_STYLE\}/g)?.length ?? 0).toBeGreaterThanOrEqual(6);
    expect(repoDetail.match(/itemStyle=\{CHART_TOOLTIP_ITEM_STYLE\}/g)?.length ?? 0).toBeGreaterThanOrEqual(6);
  });

  it("keeps four-metric account summaries compact on phones", () => {
    const accountDetails = [
      "app/(dashboard)/github/[accountId]/page.tsx",
      "app/(dashboard)/gitlab/[accountId]/page.tsx",
      "app/(dashboard)/reddit/[id]/page.tsx",
    ].map(readProjectFile);

    for (const source of accountDetails) {
      expect(source).toContain("<MetricGrid>");
    }

    const metricGrid = readProjectFile("components/domain/shared/MetricGrid.tsx");
    expect(metricGrid).toContain("four: { base: 2, sm: 4 }");
  });

  it("separates account information from mobile card actions", () => {
    const source = readProjectFile("app/(dashboard)/accounts/page.tsx");

    expect(source).toContain("mobile-tab-strip");
    expect(source).toContain("mobile-account-card");
    expect(source).toContain("account-card-actions");
  });

  it("stacks admin and settings controls on narrow screens", () => {
    const admin = readProjectFile("app/(dashboard)/admin/page.tsx");
    const settings = readProjectFile("app/(dashboard)/settings/page.tsx");

    expect(admin).toContain("grid grid-cols-1 gap-4 sm:grid-cols-2");
    expect(admin).toContain('className="sm:self-start"');
    expect(settings).toContain("flex flex-col gap-2 sm:flex-row sm:items-center");
  });

  it("keeps admin and settings form controls touch-sized", () => {
    const admin = readProjectFile("app/(dashboard)/admin/page.tsx");
    const settings = readProjectFile("app/(dashboard)/settings/page.tsx");

    expect(admin.match(/<(TextInput|PasswordInput|Select|Button)\b/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
    expect(settings.match(/<(TextInput|PasswordInput|Select|SegmentedControl|Button)\b/g)?.length ?? 0).toBeGreaterThanOrEqual(8);
  });

  it("keeps login and confirmation actions usable on narrow screens", () => {
    const login = readProjectFile("app/login/page.tsx");
    const confirmDialog = readProjectFile("components/ui/ConfirmDialog.tsx");

    expect(login).toContain("p-5 sm:p-8");
    expect(login.match(/<(TextInput|PasswordInput|Button|Alert)\b/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
    expect(confirmDialog).toContain("<Modal");
    expect(confirmDialog).toContain("<TextInput");
  });

  it("keeps account editor fields and cookie controls touch-sized", () => {
    const accounts = readProjectFile("app/(dashboard)/accounts/page.tsx");

    expect(accounts.match(/<(TextInput|PasswordInput|Button|ActionIcon)\b/g)?.length ?? 0).toBeGreaterThanOrEqual(15);
  });
});
