import { describe, it, expect, vi, beforeEach } from "vitest";

const requireSession = vi.fn();
const authorizeAccountOwner = vi.fn();
vi.mock("@/lib/auth-helpers", () => ({
  requireSession: (...args: unknown[]) => requireSession(...args),
  authorizeAccountOwner: (...args: unknown[]) => authorizeAccountOwner(...args),
}));

const getAccountByIdWithCredential = vi.fn();
vi.mock("@/lib/services/accounts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/services/accounts")>();
  return {
    ...actual,
    getAccountByIdWithCredential: (...args: unknown[]) => getAccountByIdWithCredential(...args),
  };
});

const serviceGet = vi.fn();
const serviceSave = vi.fn();
vi.mock("@/lib/services/github-watchlist", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/services/github-watchlist")>();
  return {
    ...actual,
    GithubWatchlistService: class {
      get = serviceGet;
      save = serviceSave;
    },
  };
});

const fetchAuthenticatedOrgs = vi.fn();
vi.mock("@/lib/infra/fetchers/GithubClient", () => ({
  GithubClient: class {
    fetchAuthenticatedOrgs = fetchAuthenticatedOrgs;
  },
}));

const { loader: watchlistLoader, action: watchlistAction } = await import("../app/api/github/watchlist/[accountId]/route");
const { loader: availableLoader } = await import("../app/api/github/sources/[accountId]/available/route");
const { normalizeGithubLogin } = await import("../lib/services/github-watchlist");

const GITHUB_ACCOUNT = { id: 6, screen_name: "SHIINASAMA", platform: "github", auth_token: "pat", owner_id: 1 };
const PAYLOAD = { accountId: 6, sources: [], candidates: [], warnings: [] };

const session = { user: { id: 1, username: "admin", role: "admin" } };
const call = (fn: unknown, request: Request, accountId = "6") =>
  (fn as (a: { request: Request; params: Record<string, string> }) => Promise<Response>)({ request, params: { accountId } });

beforeEach(() => {
  vi.clearAllMocks();
  requireSession.mockResolvedValue(session);
  authorizeAccountOwner.mockResolvedValue({ authorized: true, account: GITHUB_ACCOUNT });
  getAccountByIdWithCredential.mockResolvedValue(GITHUB_ACCOUNT);
  serviceGet.mockResolvedValue(PAYLOAD);
  serviceSave.mockResolvedValue(PAYLOAD);
  fetchAuthenticatedOrgs.mockResolvedValue([{ login: "ShiinaLabs", id: 1, node_id: "O_1" }]);
});

describe("GET /api/github/watchlist/:accountId", () => {
  it("401 without a session", async () => {
    requireSession.mockResolvedValue(null);
    expect((await call(watchlistLoader, new Request("http://x/api/github/watchlist/6"))).status).toBe(401);
  });

  it("404 for an unknown account and 403 for someone else's", async () => {
    authorizeAccountOwner.mockResolvedValue({ authorized: false });
    expect((await call(watchlistLoader, new Request("http://x/api/github/watchlist/6"))).status).toBe(404);
    authorizeAccountOwner.mockResolvedValue({ authorized: false, account: { ...GITHUB_ACCOUNT, owner_id: 99 } });
    expect((await call(watchlistLoader, new Request("http://x/api/github/watchlist/6"))).status).toBe(403);
  });

  it("409 when the stored credential cannot be decrypted", async () => {
    // The token is fetched separately from the authorization result, so a
    // credential that cannot be decrypted must not become a 500.
    getAccountByIdWithCredential.mockRejectedValue(new Error("Ciphertext too short"));
    expect((await call(watchlistLoader, new Request("http://x/api/github/watchlist/6"))).status).toBe(409);
  });

  it("400 for a non-GitHub account", async () => {
    authorizeAccountOwner.mockResolvedValue({ authorized: true, account: { ...GITHUB_ACCOUNT, platform: "gitlab" } });
    expect((await call(watchlistLoader, new Request("http://x/api/github/watchlist/6"))).status).toBe(400);
  });

  it("returns the payload", async () => {
    const res = await call(watchlistLoader, new Request("http://x/api/github/watchlist/6"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(PAYLOAD);
  });

  it("405 for a non-GET loader call", async () => {
    expect((await call(watchlistLoader, new Request("http://x/api/github/watchlist/6", { method: "POST" }))).status).toBe(405);
  });
});

describe("PUT /api/github/watchlist/:accountId", () => {
  const put = (body: unknown) =>
    call(watchlistAction, new Request("http://x/api/github/watchlist/6", { method: "PUT", body: JSON.stringify(body) }));

  it("405 for unsupported methods", async () => {
    expect((await call(watchlistAction, new Request("http://x/api/github/watchlist/6", { method: "DELETE" }))).status).toBe(405);
  });

  it("400 on an unparseable body", async () => {
    const res = await call(watchlistAction, new Request("http://x/api/github/watchlist/6", { method: "PUT", body: "not json" }));
    expect(res.status).toBe(400);
  });

  it("passes the selection through and reports a rejected selection as 400", async () => {
    await put({ orgs: ["ShiinaLabs"], watched: [1241734389] });
    expect(serviceSave).toHaveBeenCalledWith(GITHUB_ACCOUNT, { orgs: ["ShiinaLabs"], watched: [1241734389] });

    serviceSave.mockRejectedValue(new Error("ShiinaLabs-nope: GitHub org 404"));
    const res = await put({ orgs: ["ShiinaLabs-nope"], watched: [] });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("404");
  });

  it("treats missing orgs/watched as empty rather than failing", async () => {
    await put({});
    expect(serviceSave).toHaveBeenCalledWith(GITHUB_ACCOUNT, { orgs: [], watched: [] });
  });
});

describe("GET /api/github/sources/:accountId/available", () => {
  it("requires the owner like every other GitHub route", async () => {
    requireSession.mockResolvedValue(null);
    expect((await call(availableLoader, new Request("http://x/api/github/sources/6/available"))).status).toBe(401);
    requireSession.mockResolvedValue(session);
    authorizeAccountOwner.mockResolvedValue({ authorized: false });
    expect((await call(availableLoader, new Request("http://x/api/github/sources/6/available"))).status).toBe(404);
  });

  it("returns the organizations", async () => {
    const res = await call(availableLoader, new Request("http://x/api/github/sources/6/available"));
    expect(await res.json()).toEqual({ orgs: [{ login: "ShiinaLabs", githubId: 1, nodeId: "O_1" }], unavailable: null });
  });

  it("reports a token that cannot enumerate organizations instead of throwing", async () => {
    // Fine-grained PATs and classic PATs without read:org land here, so the UI
    // must be able to explain it rather than showing an empty picker.
    fetchAuthenticatedOrgs.mockRejectedValue(new Error("GitHub organizations 403: forbidden"));
    const res = await call(availableLoader, new Request("http://x/api/github/sources/6/available"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.orgs).toEqual([]);
    expect(body.unavailable).toContain("403");
  });
});

describe("normalizeGithubLogin", () => {
  it("accepts a bare login, a handle and a URL", () => {
    expect(normalizeGithubLogin("ShiinaLabs")).toBe("ShiinaLabs");
    expect(normalizeGithubLogin("  @shiinalabs ")).toBe("shiinalabs");
    expect(normalizeGithubLogin("https://github.com/ShiinaLabs")).toBe("ShiinaLabs");
    expect(normalizeGithubLogin("http://www.github.com/ShiinaLabs/")).toBe("ShiinaLabs");
  });

  it("rejects anything that could not be a GitHub login", () => {
    expect(normalizeGithubLogin("")).toBeNull();
    expect(normalizeGithubLogin("bad name")).toBeNull();
    expect(normalizeGithubLogin("-leading")).toBeNull();
    expect(normalizeGithubLogin("trailing-")).toBeNull();
    expect(normalizeGithubLogin("double--hyphen")).toBeNull();
    expect(normalizeGithubLogin("a-b")).toBe("a-b");
    expect(normalizeGithubLogin("a".repeat(40))).toBeNull();
    expect(normalizeGithubLogin("../../etc/passwd")).toBeNull();
    expect(normalizeGithubLogin(123)).toBeNull();
    expect(normalizeGithubLogin("Shiina/Labs")).toBeNull();
  });
});
