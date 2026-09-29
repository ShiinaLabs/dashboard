import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiJson, apiRequest, apiUrl, normalizeApiBase, ApiError } from "@/lib/client/api-transport";

describe("browser API transport", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("uses /api by default and joins endpoint paths without duplicate slashes", () => {
    expect(normalizeApiBase(undefined)).toBe("/api");
    expect(normalizeApiBase("")).toBe("/api");
    expect(normalizeApiBase("/api/")).toBe("/api");
    expect(apiUrl("/accounts", "")).toBe("/api/accounts");
    expect(apiUrl("accounts", "/api/")).toBe("/api/accounts");
  });

  it("supports an absolute configured API root", () => {
    expect(apiUrl("/accounts", "https://api.example.com/api/")).toBe("https://api.example.com/api/accounts");
  });

  it("includes credentials and JSON headers in requests", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })));

    await apiJson("/accounts", { method: "POST", body: JSON.stringify({ screenName: "octocat" }) });

    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(init?.credentials).toBe("include");
    expect(new Headers(init?.headers).get("Content-Type")).toBe("application/json");
  });

  it("parses API errors into ApiError with the response status", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }));

    const error = await apiJson("/settings").catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      message: "Forbidden",
      status: 403,
    });
  });

  it("does not redirect 401 responses from auth checks", async () => {
    const replace = vi.fn();
    vi.stubGlobal("window", { location: { pathname: "/overview", search: "", replace } });
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }));

    await expect(apiJson("/auth/me")).rejects.toMatchObject({ status: 401 });
    expect(replace).not.toHaveBeenCalled();
  });

  it("redirects once on an expired non-auth session and preserves the current URL", async () => {
    const replace = vi.fn();
    vi.stubGlobal("window", { location: { pathname: "/overview", search: "?tab=all", replace } });
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }));

    await expect(apiJson("/accounts")).rejects.toMatchObject({ status: 401 });
    await expect(apiJson("/accounts")).rejects.toMatchObject({ status: 401 });
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/login?from=%2Foverview%3Ftab%3Dall");
  });

  it("returns raw streaming responses without consuming the body", async () => {
    const response = new Response("assistant stream");
    vi.mocked(fetch).mockResolvedValueOnce(response);

    const result = await apiRequest("/ai/chat", { method: "POST", body: "{}" });

    expect(result).toBe(response);
    await expect(result.text()).resolves.toBe("assistant stream");
  });
});
