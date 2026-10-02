import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireSession } from "../lib/auth-helpers";
import { getAppStoreAnalyticsStatus, setupAppStoreAnalytics } from "../lib/services/app-store-analytics";
import { getAppStoreAnalyticsDashboard, listEnabledAnalyticsApps } from "../lib/services/app-store-analytics-reporting";
import { loader as statusLoader, action as setupAction } from "../app/api/app-store/connections/[id]/analytics/route";
import { loader as dashboardLoader } from "../app/api/app-store/analytics/route";
import { loader as appsLoader } from "../app/api/app-store/analytics/apps/route";
import { AppStoreError } from "../lib/services/app-store";

vi.mock("../lib/auth-helpers", () => ({ requireSession: vi.fn() }));
vi.mock("../lib/services/app-store-analytics", () => ({ getAppStoreAnalyticsStatus: vi.fn(), setupAppStoreAnalytics: vi.fn() }));
vi.mock("../lib/services/app-store-analytics-reporting", () => ({ getAppStoreAnalyticsDashboard: vi.fn(), listEnabledAnalyticsApps: vi.fn() }));

const viewer = { id: 10, username: "member", role: "user" };
const args = (url = "http://localhost/api/app-store/analytics?from=2026-10-01&to=2026-10-02", method = "GET", id = "1") => ({ request: new Request(url, { method }), params: { id }, context: {} }) as never;
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireSession).mockResolvedValue({ user: viewer, session: { username: "member", role: "user" } });
});

describe("ASC Analytics route authorization", () => {
  it("requires a session at every Analytics endpoint", async () => {
    vi.mocked(requireSession).mockResolvedValue(null);
    for (const response of [await statusLoader(args()), await setupAction(args(undefined, "POST")), await dashboardLoader(args()), await appsLoader(args())]) expect(response.status).toBe(401);
    expect(setupAppStoreAnalytics).not.toHaveBeenCalled();
    expect(getAppStoreAnalyticsDashboard).not.toHaveBeenCalled();
  });

  it("uses the authenticated viewer and never accepts owner_id from query parameters", async () => {
    await dashboardLoader(args("http://localhost/api/app-store/analytics?from=2026-10-01&to=2026-10-02&appId=2&territory=JPN&owner_id=999"));
    expect(getAppStoreAnalyticsDashboard).toHaveBeenCalledWith(viewer, { from: "2026-10-01", to: "2026-10-02", appId: "2", territory: "JPN" });
    await dashboardLoader(args());
    expect(getAppStoreAnalyticsDashboard).toHaveBeenLastCalledWith(viewer, { from: "2026-10-01", to: "2026-10-02" });
    await appsLoader(args());
    expect(listEnabledAnalyticsApps).toHaveBeenCalledWith(viewer);
    await setupAction(args(undefined, "POST"));
    expect(setupAppStoreAnalytics).toHaveBeenCalledWith(1, viewer);
  });

  it("propagates ownership errors and validates connection IDs before setup", async () => {
    vi.mocked(getAppStoreAnalyticsStatus).mockRejectedValueOnce(new AppStoreError("forbidden", 403, "Forbidden"));
    expect((await statusLoader(args())).status).toBe(403);
    expect((await setupAction(args(undefined, "POST", "1.5"))).status).toBe(400);
    expect(setupAppStoreAnalytics).not.toHaveBeenCalled();
  });

  it("makes the pending real report mapping explicit instead of returning false empty data", async () => {
    vi.mocked(getAppStoreAnalyticsDashboard).mockRejectedValueOnce(new AppStoreError("report_mapping_pending", 503, "Import configuration incomplete"));
    const response = await dashboardLoader(args());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "report_mapping_pending" });
  });
});
