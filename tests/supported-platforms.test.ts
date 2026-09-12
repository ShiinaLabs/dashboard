import { beforeEach, describe, expect, it, vi } from "vitest";

const createAccountRepo = vi.hoisted(() => vi.fn());
const startFetchRun = vi.hoisted(() => vi.fn());

vi.mock("../lib/repositories/accounts", () => ({
  createAccount: createAccountRepo,
}));

vi.mock("../lib/repositories/fetch-runs", () => ({
  startFetchRun,
  finishFetchRun: vi.fn(),
}));

vi.mock("../lib/crypto", () => ({
  encrypt: vi.fn((value: string) => `encrypted:${value}`),
  decrypt: vi.fn((value: string) => value),
}));

vi.mock("../lib/logger", () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe("supported platform guardrails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects account creation for an unsupported platform", async () => {
    const { createAccount } = await import("../lib/services/accounts");

    await expect(createAccount({
      screenName: "shiinasama2001",
      authToken: "token",
      fetchInterval: 30,
      platform: "medium",
      instanceUrl: null,
      authType: null,
      ownerId: 1,
    })).rejects.toThrow("Unsupported platform: medium");

    expect(createAccountRepo).not.toHaveBeenCalled();
  });

  it("skips dispatch before creating a run for an unsupported platform", async () => {
    const { dispatchFetch } = await import("../lib/fetch-dispatch");
    const account = {
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

    await expect(dispatchFetch(account as never)).resolves.toEqual({ skipped: true });
    expect(startFetchRun).not.toHaveBeenCalled();
  });
});
