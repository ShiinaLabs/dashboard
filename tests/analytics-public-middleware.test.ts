import { beforeEach, describe, expect, it, vi } from "vitest";

const ensureApplicationReady = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("../lib/startup", () => ({ ensureApplicationReady }));
vi.mock("../lib/config", () => ({ isMockMode: () => false }));

import { middleware } from "../app/auth-middleware.server";

describe("public analytics middleware exception", () => {
  beforeEach(() => ensureApplicationReady.mockClear());

  it.each(["POST", "OPTIONS"])("lets %s /a/e reach its route without a session", async (method) => {
    const response = await middleware[0]({ request: new Request("https://dashboard.example/a/e", { method }) });
    expect(response).toBeUndefined();
    expect(ensureApplicationReady).toHaveBeenCalledOnce();
  });

  it("does not make other /a paths public", async () => {
    const response = await middleware[0]({ request: new Request("https://dashboard.example/a/e", { method: "GET" }) });
    expect(response?.status).toBe(302);
    expect(response?.headers.get("location")).toContain("/login?from=%2Fa%2Fe");
  });
});
