import { beforeEach, describe, expect, it, vi } from "vitest";

const updateAccount = vi.hoisted(() => vi.fn());

vi.mock("../lib/db", () => ({
  insertGitlabStats: vi.fn(),
  upsertGitlabProject: vi.fn(),
  upsertGitlabProjectSnapshot: vi.fn(),
  upsertGitlabContributions: vi.fn(),
  upsertGitlabRelease: vi.fn(),
  updateAccount,
}));
vi.mock("../lib/logger", () => ({
  getLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

describe("legacy GitLab running lock", () => {
  beforeEach(() => vi.clearAllMocks());

  it("releases the running lock when instance URL validation fails", async () => {
    const { fetchGitlabAccount } = await import("../lib/fetchers/gitlab");
    const account = {
      id: 77,
      is_active: 1,
      screen_name: "self-hosted",
      instance_url: "http://127.0.0.1",
      auth_token: "token",
    };

    await expect(fetchGitlabAccount(account as never)).rejects.toThrow("Invalid GitLab instance URL");
    await expect(fetchGitlabAccount(account as never)).rejects.toThrow("Invalid GitLab instance URL");
    expect(updateAccount).toHaveBeenCalledTimes(2);
  });
});
