import { beforeEach, describe, expect, it, vi } from "vitest";

const ensureApplicationReady = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("../lib/startup", () => ({ ensureApplicationReady }));
vi.mock("../lib/config", () => ({ isMockMode: () => false }));

import { middleware } from "../app/auth-middleware.server";

describe("public analytics middleware exception", () => {
  beforeEach(() => ensureApplicationReady.mockClear());

  it.each(["GET", "HEAD"])("lets %s /a/t.js reach its static handler without a session", async (method) => {
    const response = await middleware[0]({ request: new Request("https://dashboard.example/a/t.js", { method }) });
    expect(response).toBeUndefined();
    expect(ensureApplicationReady).toHaveBeenCalledOnce();
  });

  it.each(["POST", "OPTIONS"])("lets %s /a/e reach its route without a session", async (method) => {
    const response = await middleware[0]({ request: new Request("https://dashboard.example/a/e", { method }) });
    expect(response).toBeUndefined();
    expect(ensureApplicationReady).toHaveBeenCalledOnce();
  });

  it.each(["/a/foo", "/a/e"])("keeps %s protected on GET", async (path) => {
    const response = await middleware[0]({ request: new Request(`https://dashboard.example${path}`, { method: "GET" }) });
    expect(response?.status).toBe(302);
    expect(response?.headers.get("location")).toContain(`/login?from=${encodeURIComponent(path)}`);
  });
});
