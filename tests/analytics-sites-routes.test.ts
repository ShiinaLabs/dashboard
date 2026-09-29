import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnalyticsSiteError, createAnalyticsSite, getAnalyticsInstallationForSite, getAnalyticsSites } from "../lib/services/analytics";
import { loader as sitesLoader, action as sitesAction } from "../app/api/analytics/sites/route";
import { loader as installationLoader } from "../app/api/analytics/sites/[id]/installation/route";
import { requireSession } from "../lib/auth-helpers";

vi.mock("../lib/auth-helpers", () => ({
  requireSession: vi.fn(),
  getOwnerId: (user: { id: number; role: string }) => user.role === "admin" ? undefined : user.id,
}));
vi.mock("../lib/services/analytics", async (importOriginal) => {
  const original = await importOriginal<typeof import("../lib/services/analytics")>();
  return { ...original, getAnalyticsSites: vi.fn(), createAnalyticsSite: vi.fn(), getAnalyticsInstallationForSite: vi.fn() };
});

const request = (method = "GET", body?: unknown) => new Request("http://localhost/api/analytics/sites", {
  method, headers: body === undefined ? undefined : { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
});
const authAs = (id: number, role = "user") => vi.mocked(requireSession).mockResolvedValue({ user: { id, username: `u${id}`, role } } as never);

beforeEach(() => vi.clearAllMocks());

describe("analytics site routes", () => {
  it("scopes regular user lists and gives admins global scope", async () => {
    authAs(10);
    await sitesLoader({ request: request(), params: {}, context: {} } as never);
    expect(getAnalyticsSites).toHaveBeenLastCalledWith(10);
    authAs(99, "admin");
    await sitesLoader({ request: request(), params: {}, context: {} } as never);
    expect(getAnalyticsSites).toHaveBeenLastCalledWith(undefined);
  });

  it("always creates for the authenticated user even when body supplies ownerId", async () => {
    authAs(10);
    vi.mocked(createAnalyticsSite).mockResolvedValue({ id: 3, name: "A", site_key: "server-generated", host: "a.example", created_at: "now", updated_at: "now" });
    const response = await sitesAction({ request: request("POST", { ownerId: 999, name: "A", siteKey: "victim-key", host: "a.example" }), params: {}, context: {} } as never);
    expect(response.status).toBe(201);
    expect(createAnalyticsSite).toHaveBeenCalledWith(10, { name: "A", host: "a.example" });
    const created = await response.json();
    expect(created.site_key).not.toBe("victim-key");
  });

  it("enforces installation ownership and allows admins to access the service", async () => {
    authAs(10);
    vi.mocked(getAnalyticsInstallationForSite).mockRejectedValueOnce(new AnalyticsSiteError("forbidden"));
    const forbidden = await installationLoader({ request: request(), params: { id: "20" }, context: {} } as never);
    expect(forbidden.status).toBe(403);
    expect(getAnalyticsInstallationForSite).toHaveBeenLastCalledWith(20, { id: 10, role: "user" });

    authAs(99, "admin");
    vi.mocked(getAnalyticsInstallationForSite).mockResolvedValue({ trackerUrl: "https://dashboard.example/a/t.js", snippet: "<script></script>" });
    const allowed = await installationLoader({ request: request(), params: { id: "20" }, context: {} } as never);
    expect(allowed.status).toBe(200);
    expect(getAnalyticsInstallationForSite).toHaveBeenLastCalledWith(20, { id: 99, role: "admin" });
    await expect(allowed.json()).resolves.toMatchObject({ trackerUrl: "https://dashboard.example/a/t.js" });
  });

  it("returns an explicit collector configuration error", async () => {
    authAs(10);
    vi.mocked(getAnalyticsInstallationForSite).mockRejectedValue(new AnalyticsSiteError("public_origin_not_configured"));
    const response = await installationLoader({ request: request(), params: { id: "20" }, context: {} } as never);
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Analytics public URL is not configured", code: "public_origin_not_configured" });
  });
});
