import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireSession } = vi.hoisted(() => ({ requireSession: vi.fn() }));
vi.mock("@/lib/auth-helpers", () => ({ requireSession }));

import { loader } from "@/app/(dashboard)/layout";

describe("dashboard layout loader", () => {
  beforeEach(() => requireSession.mockReset());

  it.each([
    [{ id: 3, username: "member", role: "user" }, { id: 3, username: "member", role: "user" }],
    [{ id: 1, username: "admin", role: "admin" }, { id: 1, username: "admin", role: "admin" }],
  ])("returns the safe user projection plus the panel preference", async (user, expected) => {
    requireSession.mockResolvedValue({ session: { username: "member", role: "user", token: "secret" }, user });
    const result = await loader({ request: new Request("http://localhost/overview") } as never);
    expect(result).toEqual({ user: expected, initialPanelOpen: true });
    expect(JSON.stringify(result)).not.toMatch(/token|secret|password|credential/i);
  });

  it("reads the panel preference from the cookie for a deterministic first paint", async () => {
    requireSession.mockResolvedValue({ session: { username: "member", role: "user" }, user: { id: 3, username: "member", role: "user" } });
    const closed = await loader({
      request: new Request("http://localhost/overview", { headers: { cookie: "nav_panel=closed" } }),
    } as never);
    expect(closed.initialPanelOpen).toBe(false);

    const open = await loader({
      request: new Request("http://localhost/overview", { headers: { cookie: "nav_panel=open" } }),
    } as never);
    expect(open.initialPanelOpen).toBe(true);
  });

  it("redirects missing sessions to login and preserves the requested location", async () => {
    requireSession.mockResolvedValue(null);
    let redirectResponse: unknown;
    try {
      await loader({ request: new Request("http://localhost/admin?tab=users") } as never);
    } catch (error) {
      redirectResponse = error;
    }
    expect(redirectResponse).toMatchObject({ status: 302 });
    expect((redirectResponse as Response).headers.get("location")).toBe("/login?from=%2Fadmin%3Ftab%3Dusers");
  });
});
