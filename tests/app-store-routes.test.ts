import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireSession } from "../lib/auth-helpers";
import { createConnection, deleteConnection, updateConnection, refreshApps, setAppEnabled } from "../lib/services/app-store";
import { action } from "../app/api/app-store/connections/route";
import { action as detailAction } from "../app/api/app-store/connections/[id]/route";
import { action as refreshAction } from "../app/api/app-store/connections/[id]/refresh/route";
import { action as appAction } from "../app/api/app-store/connections/[id]/apps/[appId]/route";
import { createConfirmToken } from "../lib/confirm-helpers";
import { AppStoreApiError } from "../lib/infra/app-store/AppStoreConnectClient";

vi.mock("../lib/auth-helpers", () => ({ requireSession: vi.fn() }));
vi.mock("../lib/services/app-store", async (original) => ({
  ...await original<typeof import("../lib/services/app-store")>(),
  createConnection: vi.fn(), deleteConnection: vi.fn(), updateConnection: vi.fn(), refreshApps: vi.fn(), setAppEnabled: vi.fn(),
}));

const viewer = { id: 10, username: "member", role: "user" };
const args = (method = "GET", body?: unknown, params = { id: "1", appId: "2" }) => ({
  request: new Request("http://localhost/api/app-store/connections/1", { method, body: body === undefined ? undefined : JSON.stringify(body) }), params, context: {},
}) as never;
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireSession).mockResolvedValue({ user: viewer, session: { username: "member", role: "user" } });
});

describe("ASC routes", () => {
  it("requires a session for all operations", async () => {
    vi.mocked(requireSession).mockResolvedValue(null);
    for (const response of [await action(args("POST", {})), await detailAction(args("PUT", {})), await refreshAction(args("POST")), await appAction(args("PUT", {}))]) expect(response.status).toBe(401);
    expect(createConnection).not.toHaveBeenCalled();
  });

  it("passes the authenticated viewer to connection creation and updates", async () => {
    vi.mocked(createConnection).mockResolvedValue({ id: 3 } as never);
    expect((await action(args("POST", { owner_id: 999, name: "Team" }))).status).toBe(201);
    expect(createConnection).toHaveBeenCalledWith(viewer, { owner_id: 999, name: "Team" });
    await detailAction(args("PUT", { isActive: false }));
    expect(updateConnection).toHaveBeenCalledWith(1, viewer, { isActive: false });
  });

  it("preserves upstream status and permission detail", async () => {
    vi.mocked(createConnection).mockRejectedValueOnce(new AppStoreApiError(403, "FORBIDDEN", "Apple API (403): no access"));
    const response = await action(args("POST", {}));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "Apple API (403): no access", code: "FORBIDDEN", upstreamStatus: 403 });
  });

  it("maps ownership and validation errors and hides internal error details", async () => {
    vi.mocked(createConnection).mockRejectedValueOnce(new Error("SQL includes PRIVATE KEY"));
    const response = await action(args("POST", {}));
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("PRIVATE KEY");
  });

  it("binds app mutations and refreshes to the authorized connection", async () => {
    await appAction(args("PUT", { isEnabled: false }));
    expect(setAppEnabled).toHaveBeenCalledWith(1, 2, viewer, { isEnabled: false });
    await refreshAction(args("POST"));
    expect(refreshApps).toHaveBeenCalledWith(1, viewer);
  });

  it("requires an ASC-specific confirmation token for soft deletion and prevents replay", async () => {
    const wrong = createConfirmToken(10, 1, "delete");
    expect((await detailAction(args("DELETE", { confirmToken: wrong }))).status).toBe(400);
    expect(deleteConnection).not.toHaveBeenCalled();
    const correct = createConfirmToken(10, 1, "delete_app_store_connection");
    expect((await detailAction(args("DELETE", { confirmToken: correct }))).status).toBe(200);
    expect(deleteConnection).toHaveBeenCalledWith(1, viewer);
    expect((await detailAction(args("DELETE", { confirmToken: correct }))).status).toBe(400);
  });
});
