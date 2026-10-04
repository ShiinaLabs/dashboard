import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnalyticsSiteError, createAnalyticsSite, renameAnalyticsSite } from "../lib/services/analytics";
import { action as sitesAction } from "../app/api/analytics/sites/route";
import { action as renameSiteAction } from "../app/api/analytics/sites/[id]/route";
import { requireSession } from "../lib/auth-helpers";

vi.mock("../lib/auth-helpers", () => ({
  requireSession: vi.fn(),
}));
vi.mock("../lib/services/analytics", async (importOriginal) => {
  const original = await importOriginal<typeof import("../lib/services/analytics")>();
  return { ...original, createAnalyticsSite: vi.fn(), renameAnalyticsSite: vi.fn() };
});

const request = (method = "POST", body?: unknown) => new Request("http://localhost/api/analytics/sites", {
  method, headers: body === undefined ? undefined : { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
});
const authAs = (id: number, role = "user") => vi.mocked(requireSession).mockResolvedValue({ user: { id, username: `u${id}`, role } } as never);

beforeEach(() => vi.clearAllMocks());

describe("analytics site routes", () => {
  it("always creates for the authenticated user even when body supplies ownerId", async () => {
    authAs(10);
    vi.mocked(createAnalyticsSite).mockResolvedValue({ id: 3, name: "A", site_key: "server-generated", host: "a.example", created_at: "now", updated_at: "now" });
    const response = await sitesAction({ request: request("POST", { ownerId: 999, name: "A", siteKey: "victim-key", host: "a.example" }), params: {}, context: {} } as never);
    expect(response.status).toBe(201);
    expect(createAnalyticsSite).toHaveBeenCalledWith(10, { name: "A", host: "a.example" });
    const created = await response.json();
    expect(created.site_key).not.toBe("victim-key");
  });

  it("routes authenticated site rename through the owner-aware service and accepts only a name", async () => {
    authAs(10);
    vi.mocked(renameAnalyticsSite).mockResolvedValue({ id: 20, owner_id: 10, name: "Renamed", site_key: "fixed", host: "fixed.example", created_at: "then", updated_at: "now", deleted_at: null } as never);
    const response = await renameSiteAction({
      request: new Request("http://localhost/api/analytics/sites/20", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Renamed", host: "attacker.example", site_key: "attacker" }) }),
      params: { id: "20" }, context: {},
    } as never);
    expect(response.status).toBe(200);
    expect(renameAnalyticsSite).toHaveBeenCalledWith(20, { id: 10, role: "user" }, { name: "Renamed" });
    await expect(response.json()).resolves.toMatchObject({ name: "Renamed", host: "fixed.example", site_key: "fixed", updated_at: "now" });
  });

  it("maps rename ownership, missing-site, and validation errors to HTTP status codes", async () => {
    authAs(10);
    vi.mocked(renameAnalyticsSite).mockRejectedValueOnce(new AnalyticsSiteError("forbidden"));
    expect((await renameSiteAction({ request: new Request("http://localhost/api/analytics/sites/20", { method: "PUT", body: JSON.stringify({ name: "X" }) }), params: { id: "20" }, context: {} } as never)).status).toBe(403);
    vi.mocked(renameAnalyticsSite).mockRejectedValueOnce(new AnalyticsSiteError("not_found"));
    expect((await renameSiteAction({ request: new Request("http://localhost/api/analytics/sites/20", { method: "PUT", body: JSON.stringify({ name: "X" }) }), params: { id: "20" }, context: {} } as never)).status).toBe(404);
    vi.mocked(renameAnalyticsSite).mockRejectedValueOnce(new AnalyticsSiteError("invalid_input"));
    expect((await renameSiteAction({ request: new Request("http://localhost/api/analytics/sites/20", { method: "PUT", body: JSON.stringify({ name: " " }) }), params: { id: "20" }, context: {} } as never)).status).toBe(400);
  });

});
