import { beforeEach, describe, expect, it, vi } from "vitest";

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
      last_fetched_at: new Date(Date.now() - 91 * 60_000).toISOString(), // L1 90m auto -> 91m is due
      error_message: null,
      instance_url: null,
      auth_type: null,
      created_at: "2026-07-05T00:00:00.000Z",
      updated_at: "2026-07-05T00:00:00.000Z",
    };

    getActiveAccounts.mockResolvedValue([dueAccount]);
    getAccountByIdWithCredential.mockResolvedValue(dueAccount);
    dispatchFetch.mockResolvedValue({ status: "success" });

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
