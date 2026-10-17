import { describe, expect, it, vi } from "vitest";
import { fetchGitlabWithSafety } from "../lib/gitlab-http";

const publicRecords = [{ address: "93.184.216.34", family: 4 as const }];

function hooks(responses: Response[], resolved = publicRecords) {
  const lookup = vi.fn(async () => resolved) as unknown as typeof import("node:dns/promises").lookup;
  const request = vi.fn(async (_url, _method, _headers, _signal, _target) => {
    const response = responses.shift();
    if (!response) throw new Error("unexpected request");
    return response;
  });
  return { lookup, request, hooks: { lookup, request } };
}

describe("fetchGitlabWithSafety", () => {
  it("pins each request to the public address selected during validation", async () => {
    const { request, hooks: dependencies } = hooks([new Response("{}")]);
    await fetchGitlabWithSafety("https://gitlab.com/api/v4/user", {
      headers: { "PRIVATE-TOKEN": "secret" },
    }, dependencies);

    expect(request).toHaveBeenCalledWith(
      expect.any(URL), "GET", expect.any(Headers), undefined,
      { address: "93.184.216.34", family: 4 },
    );
  });

  it("rejects mixed public and private DNS answers before connecting", async () => {
    const { request, hooks: dependencies } = hooks([new Response("{}")], [
      ...publicRecords,
      { address: "10.0.0.8", family: 4 as const },
    ]);
    await expect(fetchGitlabWithSafety("https://gitlab.com/api/v4/user", {}, dependencies)).rejects.toThrow("non-public address");
    expect(request).not.toHaveBeenCalled();
  });

  it("validates every redirect and removes credentials on cross-origin redirects", async () => {
    const { request, hooks: dependencies } = hooks([
      new Response(null, { status: 302, headers: { location: "https://api.gitlab.com/api/v4/user" } }),
      new Response("{}"),
    ]);
    await fetchGitlabWithSafety("https://gitlab.com/api/v4/user", {
      headers: { "PRIVATE-TOKEN": "secret", "User-Agent": "dashboard" },
    }, dependencies);

    const redirectedHeaders = request.mock.calls[1][2] as Headers;
    expect(redirectedHeaders.has("PRIVATE-TOKEN")).toBe(false);
    expect(redirectedHeaders.get("User-Agent")).toBe("dashboard");
  });

  it("rejects a redirect to an internal address before making the next request", async () => {
    const { request, hooks: dependencies } = hooks([
      new Response(null, { status: 302, headers: { location: "http://127.0.0.1/admin" } }),
    ]);
    await expect(fetchGitlabWithSafety("https://gitlab.com/api/v4/user", {}, dependencies)).rejects.toThrow("private");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("rejects a DNS answer that changes to an internal address on a later hop", async () => {
    const lookup = vi.fn()
      .mockResolvedValueOnce(publicRecords)
      .mockResolvedValueOnce([{ address: "192.168.1.4", family: 4 }]) as unknown as typeof import("node:dns/promises").lookup;
    const request = vi.fn(async () => new Response(null, {
      status: 302,
      headers: { location: "https://next.gitlab.com/api/v4/user" },
    }));

    await expect(fetchGitlabWithSafety("https://gitlab.com/api/v4/user", {}, { lookup, request })).rejects.toThrow("non-public address");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("stops after the redirect limit", async () => {
    const { request, hooks: dependencies } = hooks(Array.from({ length: 7 }, () =>
      new Response(null, { status: 302, headers: { location: "/next" } }),
    ));
    await expect(fetchGitlabWithSafety("https://gitlab.com/api/v4/user", {}, dependencies)).rejects.toThrow("redirect limit");
    expect(request).toHaveBeenCalledTimes(6);
  });
});
