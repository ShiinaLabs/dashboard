import { beforeEach, describe, expect, it, vi } from "vitest";

const getAccountsRepo = vi.hoisted(() => vi.fn());
const getActiveAccountsRepo = vi.hoisted(() => vi.fn());
const getAccountByIdRepo = vi.hoisted(() => vi.fn());
const decrypt = vi.hoisted(() => vi.fn());

vi.mock("../lib/repositories/accounts", () => ({
  getAccounts: getAccountsRepo,
  getActiveAccounts: getActiveAccountsRepo,
  getAccountById: getAccountByIdRepo,
  createAccount: vi.fn(),
  updateAccount: vi.fn(),
  deleteAccount: vi.fn(),
}));

vi.mock("../lib/crypto", () => ({
  encrypt: vi.fn(),
  decrypt,
}));

vi.mock("../lib/logger", () => ({
  getLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
  }),
}));

import {
  getAccountById,
  getAccountByIdWithCredential,
  getAccounts,
  getActiveAccounts,
} from "../lib/services/accounts";

const accountRow = {
  id: 1,
  owner_id: 7,
  screen_name: "example-user",
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

describe("account credential boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    decrypt.mockReset();
  });

  it("does not decrypt credentials for account metadata listings", async () => {
    getAccountsRepo.mockResolvedValue([accountRow]);
    getActiveAccountsRepo.mockResolvedValue([accountRow]);
    decrypt.mockImplementation(() => {
      throw new Error("key changed");
    });

    const accounts = await getAccounts(7);
    const activeAccounts = await getActiveAccounts();

    expect(accounts[0]).not.toHaveProperty("auth_token");
    expect(activeAccounts[0]).not.toHaveProperty("auth_token");
    expect(decrypt).not.toHaveBeenCalled();
  });

  it("keeps metadata lookup available when a stored credential is broken", async () => {
    getAccountByIdRepo.mockResolvedValue(accountRow);
    decrypt.mockImplementation(() => {
      throw new Error("key changed");
    });

    const account = await getAccountById(1);

    expect(account).not.toHaveProperty("auth_token");
    expect(decrypt).not.toHaveBeenCalled();
  });

  it("decrypts only at the explicit credential boundary", async () => {
    getAccountByIdRepo.mockResolvedValue(accountRow);
    decrypt.mockReturnValue("plain-token");

    await expect(getAccountByIdWithCredential(1)).resolves.toMatchObject({
      id: 1,
      auth_token: "plain-token",
    });
    expect(decrypt).toHaveBeenCalledWith("encrypted-token");
  });
});
