import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchGithubAccount } from "../lib/fetchers/github";

const mocks = vi.hoisted(() => ({
  info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
  fetchWithConfig: vi.fn(),
  insertGithubStats: vi.fn(), updateAccount: vi.fn(), upsertGithubRepo: vi.fn(), upsertGithubRepoSnapshot: vi.fn(),
  upsertGithubContributions: vi.fn(), upsertGithubTrafficClones: vi.fn(), upsertGithubTrafficViews: vi.fn(),
  upsertGithubReferrer: vi.fn(), upsertGithubPath: vi.fn(), upsertGithubRelease: vi.fn(), insertGithubReleaseAsset: vi.fn(), upsertGithubReleaseAssetSnapshot: vi.fn(),
}));

vi.mock("../lib/logger", () => ({ getLogger: () => mocks }));
vi.mock("../lib/http", () => ({ fetchWithConfig: mocks.fetchWithConfig, withNetworkRetry: (operation: () => Promise<unknown>) => operation() }));
vi.mock("../lib/db", () => ({ ...mocks }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchWithConfig.mockImplementation(async (url: string) => url.endsWith("/users/alice")
    ? Response.json({ id: 4, public_repos: 0, public_gists: 0, followers: 1, following: 0 })
    : Response.json([]));
});
afterEach(() => vi.useRealTimers());

describe("optional GitHub fetch logging", () => {
  it("keeps expected no-PAT capability gaps at DEBUG with no INFO/WARN flood", async () => {
    vi.useFakeTimers();
    const task = fetchGithubAccount({ id: 4, screen_name: "alice", auth_token: null, user_id: "4", is_active: true } as never);
    await vi.runAllTimersAsync();
    await expect(task).resolves.toMatchObject({ status: "partial" });
    expect(mocks.warn).not.toHaveBeenCalled();
    expect(mocks.debug.mock.calls.map(([, message]) => message)).toEqual(expect.arrayContaining([
      expect.stringContaining("optional issue/PR split unavailable"),
      expect.stringContaining("optional traffic and releases are unavailable"),
      expect.stringContaining("contributions are unavailable"),
    ]));
    expect(mocks.info.mock.calls.length).toBeLessThanOrEqual(5);
  });
});
