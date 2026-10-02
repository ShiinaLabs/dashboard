import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireSession } from "../lib/auth-helpers";
import { syncAppStoreAnalytics, syncAppStoreRevenue } from "../lib/services/app-store-sync";
import { getAppStoreRevenueDashboard } from "../lib/services/app-store-revenue";
import { action as analytics } from "../app/api/app-store/connections/[id]/analytics/sync/route";
import { action as revenue } from "../app/api/app-store/connections/[id]/revenue/sync/route";
import { loader } from "../app/api/app-store/revenue/route";
import { AppStoreError } from "../lib/services/app-store";
vi.mock("../lib/auth-helpers", () => ({ requireSession: vi.fn() }));
vi.mock("../lib/services/app-store-sync", () => ({ syncAppStoreAnalytics: vi.fn(), syncAppStoreRevenue: vi.fn() }));
vi.mock("../lib/services/app-store-revenue", () => ({ getAppStoreRevenueDashboard: vi.fn() }));
const viewer = { id: 10, username: "member", role: "user" };
const input = { from: "2026-09-23", to: "2026-09-29", fiscalMonth: "2026-09", regionCode: "ZZ" };
const args = (method: string, id = "1") => ({ request: new Request("http://localhost/api/app-store/revenue?from=2026-09-23&to=2026-09-29", { method, ...(method === "POST" ? { body: JSON.stringify(input), headers: { "Content-Type": "application/json" } } : {}) }), params: { id }, context: {} }) as never;
beforeEach(() => { vi.clearAllMocks(); vi.mocked(requireSession).mockResolvedValue({ user: viewer, session: viewer }); });
describe("Revenue and report sync authorization", () => {
  it("requires an authenticated session on every new route", async () => {
    vi.mocked(requireSession).mockResolvedValue(null);
    expect((await analytics(args("POST"))).status).toBe(401);
    expect((await revenue(args("POST"))).status).toBe(401);
    expect((await loader(args("GET"))).status).toBe(401);
    expect(syncAppStoreRevenue).not.toHaveBeenCalled();
  });
  it("passes the session identity and validates IDs", async () => {
    await analytics(args("POST")); await revenue(args("POST")); await loader(args("GET"));
    expect(syncAppStoreAnalytics).toHaveBeenCalledWith(1, viewer);
    expect(syncAppStoreRevenue).toHaveBeenCalledWith(1, viewer, input);
    expect(getAppStoreRevenueDashboard).toHaveBeenCalledWith(viewer, { from: input.from, to: input.to });
    expect((await revenue(args("POST", "0"))).status).toBe(400);
  });
  it("preserves ownership failures and hides database values", async () => {
    vi.mocked(syncAppStoreRevenue).mockRejectedValueOnce(new AppStoreError("forbidden", 403, "Forbidden")).mockRejectedValueOnce(new Error("SECRET row and credential"));
    expect((await revenue(args("POST"))).status).toBe(403);
    const response = await revenue(args("POST"));
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("SECRET");
  });
});
