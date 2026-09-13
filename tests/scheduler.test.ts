import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAccountFetchState } from "../lib/repositories/account-fetch-state";

const getActiveAccounts = vi.fn();
const getAccountByIdWithCredential = vi.fn();
const fetchAccount = vi.fn();
const fetchGithubAccount = vi.fn();
const fetchGitlabAccount = vi.fn();
const fetchRedditAccount = vi.fn();
const fetchRedditPublicAccount = vi.fn();
const dispatchFetch = vi.fn();
const updateAccount = vi.fn().mockResolvedValue(undefined);

vi.mock("../lib/services/accounts", () => ({
  getActiveAccounts,
  getAccountByIdWithCredential,
  updateAccount,
}));

vi.mock("../lib/fetcher", () => ({
  fetchAccount,
}));

vi.mock("../lib/fetchers/github", () => ({
  fetchGithubAccount,
}));

vi.mock("../lib/fetchers/gitlab", () => ({
  fetchGitlabAccount,
}));

vi.mock("../lib/fetchers/reddit", () => ({
  fetchRedditAccount,
  fetchRedditPublicAccount,
}));

vi.mock("../lib/fetch-dispatch", () => ({
  dispatchFetch,
}));

vi.mock("../lib/repositories/account-fetch-state", () => ({
  getAccountFetchState: vi.fn().mockResolvedValue([]),
  upsertAccountFetchState: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/logger", () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe("scheduler", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    // Default: the account has no per-level state, so every level counts as
    // never-fetched and L0 is the first due one.
    vi.mocked(getAccountFetchState).mockResolvedValue([]);
  });

  it("skips accounts that were disabled after the active snapshot was loaded", async () => {
    const staleActiveAccount = {
      id: 7,
      owner_id: 1,
      screen_name: "shiinasama2001",
      platform: "twitter",
      user_id: null,
      auth_token: "token",
      fetch_interval: 30,
      is_active: 1,
      last_fetched_at: null,
      error_message: null,
      instance_url: null,
      auth_type: null,
      created_at: "2026-07-05T00:00:00.000Z",
      updated_at: "2026-07-05T00:00:00.000Z",
    };

    getActiveAccounts.mockResolvedValue([staleActiveAccount]);
    getAccountByIdWithCredential.mockResolvedValue({ ...staleActiveAccount, is_active: 0 });

    const { runCycleOnceForTests } = await import("../lib/scheduler");
    await runCycleOnceForTests();

    expect(getAccountByIdWithCredential).toHaveBeenCalledWith(7);
    expect(fetchAccount).not.toHaveBeenCalled();
  });

  it("dispatches a due account as a scheduler run", async () => {
    const dueAccount = {
      id: 8,
      owner_id: 1,
      screen_name: "due-user",
      platform: "twitter",
      user_id: null,
      auth_token: "token",
      fetch_interval: 30,
      is_active: 1,
      last_fetched_at: new Date(Date.now() - 91 * 60_000).toISOString(),
      error_message: null,
      instance_url: null,
      auth_type: null,
      created_at: "2026-07-05T00:00:00.000Z",
      updated_at: "2026-07-05T00:00:00.000Z",
    };

    getActiveAccounts.mockResolvedValue([dueAccount]);
    getAccountByIdWithCredential.mockResolvedValue(dueAccount);
    dispatchFetch.mockResolvedValue({ status: "success" });
    // L0 is fresh, so L0 is skipped and L1's own 90m interval decides.
    vi.mocked(getAccountFetchState).mockResolvedValue([
      { level: "l0", lastFetchedAt: new Date().toISOString() },
      { level: "l1", lastFetchedAt: new Date(Date.now() - 91 * 60_000).toISOString() },
    ] as never);

    const { runCycleOnceForTests } = await import("../lib/scheduler");
    await runCycleOnceForTests();

    expect(getAccountByIdWithCredential).toHaveBeenCalledWith(8);
    expect(dispatchFetch).toHaveBeenCalledWith(dueAccount, "scheduler", "l1");
  });

  it("isolates a credential decryption failure to the affected account", async () => {
    const brokenAccount = {
      id: 14,
      owner_id: 1,
      screen_name: "broken-user",
      platform: "twitter",
      user_id: null,
      auth_token: "encrypted-token",
      fetch_interval: 30,
      is_active: 1,
      last_fetched_at: null,
      error_message: null,
      instance_url: null,
      auth_type: null,
      created_at: "2026-07-05T00:00:00.000Z",
      updated_at: "2026-07-05T00:00:00.000Z",
    };
    const healthyAccount = {
      ...brokenAccount,
      id: 15,
      screen_name: "healthy-user",
      last_fetched_at: new Date(Date.now() - 91 * 60_000).toISOString(),
    };

    getActiveAccounts.mockResolvedValue([brokenAccount, healthyAccount]);
    vi.mocked(getAccountFetchState).mockResolvedValue([
      { level: "l0", lastFetchedAt: new Date().toISOString() },
    ] as never);
    getAccountByIdWithCredential
      .mockRejectedValueOnce(new Error("Stored credential cannot be decrypted; check ENCRYPTION_KEY"))
      .mockResolvedValueOnce(healthyAccount);
    dispatchFetch.mockResolvedValue({ status: "success" });

    const { runCycleOnceForTests } = await import("../lib/scheduler");
    await runCycleOnceForTests();

    expect(dispatchFetch).toHaveBeenCalledWith(healthyAccount, "scheduler", "l1");
    expect(updateAccount).toHaveBeenCalledWith(
      14,
      expect.objectContaining({ error_message: expect.stringContaining("cannot be decrypted") }),
    );
  });

  it("runs L0 and L2 even though L1 keeps refreshing last_fetched_at", async () => {
    // Regression: the due check used to fall back to the shared
    // `account.last_fetched_at` when a level had no state row. L1 runs every 90
    // minutes and refreshes that column, so L0 (24h) and L2 (8h) were never
    // reached and never ran at all — telemetry stopped updating while
    // everything L1 refreshes stayed current.
    const account = {
      id: 21,
      owner_id: 1,
      screen_name: "starved-user",
      platform: "github",
      user_id: null,
      auth_token: "token",
      fetch_interval: 30,
      is_active: 1,
      last_fetched_at: new Date().toISOString(), // just fetched, as L1 keeps it
      error_message: null,
      instance_url: null,
      auth_type: null,
      created_at: "2026-07-05T00:00:00.000Z",
      updated_at: "2026-07-05T00:00:00.000Z",
    };
    getActiveAccounts.mockResolvedValue([account]);
    getAccountByIdWithCredential.mockResolvedValue(account);
    dispatchFetch.mockResolvedValue({ status: "success" });
    // L0 and L1 have both just run; L2 has never run (no row).
    vi.mocked(getAccountFetchState).mockResolvedValue([
      { level: "l0", lastFetchedAt: new Date().toISOString() },
      { level: "l1", lastFetchedAt: new Date().toISOString() },
    ] as never);

    const { runCycleOnceForTests } = await import("../lib/scheduler");
    await runCycleOnceForTests();

    expect(dispatchFetch).toHaveBeenCalledWith(account, "scheduler", "l2");
  });

  it("runs L0 when it has no state row, even right after another level fetched", async () => {
    const account = {
      id: 22,
      owner_id: 1,
      screen_name: "l0-starved",
      platform: "github",
      user_id: null,
      auth_token: "token",
      fetch_interval: 30,
      is_active: 1,
      last_fetched_at: new Date().toISOString(),
      error_message: null,
      instance_url: null,
      auth_type: null,
      created_at: "2026-07-05T00:00:00.000Z",
      updated_at: "2026-07-05T00:00:00.000Z",
    };
    getActiveAccounts.mockResolvedValue([account]);
    getAccountByIdWithCredential.mockResolvedValue(account);
    dispatchFetch.mockResolvedValue({ status: "success" });
    vi.mocked(getAccountFetchState).mockResolvedValue([
      { level: "l1", lastFetchedAt: new Date().toISOString() },
    ] as never);

    const { runCycleOnceForTests } = await import("../lib/scheduler");
    await runCycleOnceForTests();

    expect(dispatchFetch).toHaveBeenCalledWith(account, "scheduler", "l0");
  });

  it("skips active accounts on unsupported platforms", async () => {
    const unsupportedAccount = {
      id: 13,
      owner_id: 1,
      screen_name: "shiinasama2001",
      platform: "medium",
      user_id: null,
      auth_token: "token",
      fetch_interval: 30,
      is_active: 1,
      last_fetched_at: null,
      error_message: null,
      instance_url: null,
      auth_type: null,
      created_at: "2026-06-27T00:00:00.000Z",
      updated_at: "2026-06-27T00:00:00.000Z",
    };

    getActiveAccounts.mockResolvedValue([unsupportedAccount]);

    const { runCycleOnceForTests } = await import("../lib/scheduler");
    await runCycleOnceForTests();

    expect(getAccountByIdWithCredential).not.toHaveBeenCalled();
    expect(dispatchFetch).not.toHaveBeenCalled();
    expect(fetchAccount).not.toHaveBeenCalled();
  });
});
