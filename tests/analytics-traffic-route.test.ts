import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnalyticsSiteError } from "../lib/services/analytics";
import { loader } from "../app/api/analytics/sites/[id]/traffic/route";
import { requireSession } from "../lib/auth-helpers";

const { getAnalyticsTrafficForSite } = vi.hoisted(() => ({ getAnalyticsTrafficForSite: vi.fn() }));
vi.mock("../lib/auth-helpers", () => ({ requireSession: vi.fn() }));
vi.mock("../lib/services/analytics", async (importOriginal) => {
  const original = await importOriginal<typeof import("../lib/services/analytics")>();
  return { ...original, getAnalyticsTrafficForSite };
});

const traffic = {
  period: { days: 7 as const, timezone: "Asia/Tokyo" },
  overview: { views: 3, visitors: 1, visits: 2 },
  timeline: [],
  topPages: [],
};
const request = (method = "GET", url = "http://localhost/api/analytics/sites/12/traffic") => new Request(url, { method });
const load = (req: Request, id = "12") => loader({ request: req, params: { id }, context: {} } as never);
const authAs = (id = 1, role = "user") => vi.mocked(requireSession).mockResolvedValue({ user: { id, username: `u${id}`, role } } as never);

beforeEach(() => vi.clearAllMocks());

describe("analytics traffic route", () => {
  it("returns traffic and forwards the viewer timezone", async () => {
    authAs();
    vi.mocked(getAnalyticsTrafficForSite).mockResolvedValue(traffic);
    const response = await load(request("GET", "http://localhost/api/analytics/sites/12/traffic?timezone=Asia%2FTokyo"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(traffic);
    expect(getAnalyticsTrafficForSite).toHaveBeenCalledWith(12, { id: 1, role: "user" }, "Asia/Tokyo");
  });

  it("defaults an omitted timezone to UTC", async () => {
    authAs();
    vi.mocked(getAnalyticsTrafficForSite).mockResolvedValue({ ...traffic, period: { days: 7, timezone: "UTC" } });
    await load(request());
    expect(getAnalyticsTrafficForSite).toHaveBeenCalledWith(12, { id: 1, role: "user" }, "UTC");
  });

  it("maps method, authentication, and invalid site IDs", async () => {
    expect((await load(request("POST"))).status).toBe(405);
    expect(requireSession).not.toHaveBeenCalled();
    vi.mocked(requireSession).mockResolvedValue(null);
    expect((await load(request())).status).toBe(401);
    authAs();
    expect((await load(request(), "nope")).status).toBe(404);
    expect(getAnalyticsTrafficForSite).not.toHaveBeenCalled();
  });

  it("maps authorization, missing site, invalid timezone, and database failures without leaking details", async () => {
    authAs();
    vi.mocked(getAnalyticsTrafficForSite).mockRejectedValueOnce(new AnalyticsSiteError("forbidden"));
    expect((await load(request())).status).toBe(403);
    vi.mocked(getAnalyticsTrafficForSite).mockRejectedValueOnce(new AnalyticsSiteError("not_found"));
    expect((await load(request())).status).toBe(404);
    vi.mocked(getAnalyticsTrafficForSite).mockRejectedValueOnce(new AnalyticsSiteError("invalid_input"));
    expect((await load(request("GET", "http://localhost/api/analytics/sites/12/traffic?timezone=Not%2FAZone"))).status).toBe(400);
    vi.mocked(getAnalyticsTrafficForSite).mockRejectedValueOnce(new Error("database details"));
    const unavailable = await load(request());
    expect(unavailable.status).toBe(503);
    await expect(unavailable.json()).resolves.toEqual({ error: "Analytics traffic unavailable" });
  });
});
