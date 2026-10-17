import { beforeEach, describe, expect, it, vi } from "vitest";

const createAccountRepo = vi.hoisted(() => vi.fn());
const updateAccountRepo = vi.hoisted(() => vi.fn());
const startFetchRun = vi.hoisted(() => vi.fn());

vi.mock("../lib/repositories/accounts", () => ({
  createAccount: createAccountRepo,
  updateAccount: updateAccountRepo,
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

  it("rejects GitLab account creation with an unsafe instance URL", async () => {
    const { createAccount } = await import("../lib/services/accounts");

    await expect(createAccount({
      screenName: "self-hosted",
      authToken: "token",
      fetchInterval: 30,
      platform: "gitlab",
      instanceUrl: "http://10.0.0.8",
      ownerId: 1,
    })).rejects.toThrow("Invalid instance URL");

    expect(createAccountRepo).not.toHaveBeenCalled();
  });

  it("rejects unsafe instance URLs on account updates", async () => {
    const { updateAccountFromInput } = await import("../lib/services/accounts");

    await expect(updateAccountFromInput(5, { instanceUrl: "http://192.168.1.4" })).rejects.toThrow("Invalid instance URL");
    expect(updateAccountRepo).not.toHaveBeenCalled();
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

    await expect(dispatchFetch(account as never)).resolves.toEqual({
      status: "skipped",
      reason: "unsupported-platform",
    });
    expect(startFetchRun).not.toHaveBeenCalled();
  });
});
