import { beforeEach, describe, expect, it, vi } from "vitest";

const { startFetchRun, finishFetchRun, updateAccount, syncGitlabExecute } = vi.hoisted(() => ({
  startFetchRun: vi.fn(),
  finishFetchRun: vi.fn(),
  updateAccount: vi.fn(),
  syncGitlabExecute: vi.fn(),
}));

vi.mock("../lib/repositories/fetch-runs", () => ({ startFetchRun, finishFetchRun }));
vi.mock("../lib/services/accounts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/services/accounts")>();
  return { ...actual, updateAccount };
});
vi.mock("../lib/config", () => ({ isMockMode: () => false, isMockFetcherMode: () => false }));
vi.mock("../lib/logger", () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock("../lib/fetcher", () => ({ fetchAccount: vi.fn() }));
vi.mock("../lib/fetchers/github", () => ({ fetchGithubAccount: vi.fn() }));
vi.mock("../lib/fetchers/gitlab", () => ({ fetchGitlabAccount: vi.fn() }));
vi.mock("../lib/fetchers/reddit", () => ({ fetchRedditAccount: vi.fn(), fetchRedditPublicAccount: vi.fn() }));
vi.mock("../lib/application/usecases/SyncGitlabAccount", () => ({
  SyncGitlabAccount: class {
    execute = syncGitlabExecute;
  },
}));

const account = {
  id: 41,
  owner_id: 1,
  screen_name: "gitlab-user",
  platform: "gitlab",
  user_id: null,
  auth_token: "token",
  fetch_interval: 30,
  is_active: 1,
  last_fetched_at: null,
  error_message: null,
  instance_url: "https://gitlab.com",
  auth_type: null,
  created_at: "2026-07-05T00:00:00.000Z",
  updated_at: "2026-07-05T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  startFetchRun.mockResolvedValue({ id: 314 });
  finishFetchRun.mockResolvedValue(undefined);
  updateAccount.mockResolvedValue(undefined);
  syncGitlabExecute.mockResolvedValue({ status: "success", capabilityGaps: [] });
});

describe("dispatchFetch result contract", () => {
  it("returns success without exposing the use case's raw result", async () => {
    syncGitlabExecute.mockResolvedValue({ status: "success", capabilityGaps: [] });
    const { dispatchFetch } = await import("../lib/fetch-dispatch");

    await expect(dispatchFetch(account as never, "manual", "l1")).resolves.toEqual({
      status: "success",
      capabilityGaps: [],
    });
    expect(finishFetchRun).toHaveBeenCalledWith(expect.objectContaining({ id: 314, status: "success" }));
    expect(updateAccount).toHaveBeenCalledWith(41, { last_fetched_at: expect.any(String) });
  });

  it("returns partial with capability gaps and records the completed run", async () => {
    const capabilityGaps = [{ capability: "gitlab_releases", message: "release endpoint unavailable" }];
    syncGitlabExecute.mockResolvedValue({ status: "partial", capabilityGaps });
    const { dispatchFetch } = await import("../lib/fetch-dispatch");

    await expect(dispatchFetch(account as never, "scheduler", "l1")).resolves.toEqual({
      status: "partial",
      capabilityGaps,
      errorMessage: null,
    });
    expect(finishFetchRun).toHaveBeenCalledWith(expect.objectContaining({ id: 314, status: "partial", capabilityGaps }));
    expect(updateAccount).toHaveBeenCalledWith(41, { last_fetched_at: expect.any(String) });
  });

  it("returns failed for an execution error and does not advance last_fetched_at", async () => {
    syncGitlabExecute.mockRejectedValue(new Error("upstream unavailable"));
    const { dispatchFetch } = await import("../lib/fetch-dispatch");

    await expect(dispatchFetch(account as never, "scheduler", "l1")).resolves.toEqual({
      status: "failed",
      errorMessage: "All fetch levels failed for account 41",
    });
    expect(finishFetchRun).toHaveBeenCalledWith(expect.objectContaining({ id: 314, status: "failed", errorMessage: "All fetch levels failed for account 41" }));
    expect(updateAccount).not.toHaveBeenCalled();
  });

  it("preserves partial status when an escaped error carries partial metadata", async () => {
    const error = Object.assign(new Error("some data was saved"), { fetchRunStatus: "partial" });
    finishFetchRun.mockRejectedValueOnce(error);
    const { dispatchFetch } = await import("../lib/fetch-dispatch");

    await expect(dispatchFetch(account as never, "scheduler", "l1")).resolves.toEqual({
      status: "partial",
      errorMessage: "some data was saved",
    });
    expect(finishFetchRun).toHaveBeenCalledWith(expect.objectContaining({ id: 314, status: "partial" }));
    expect(updateAccount).toHaveBeenCalledTimes(1);
    expect(updateAccount).toHaveBeenCalledWith(41, { last_fetched_at: expect.any(String) });
  });

  it("skips a second dispatch while the account's first dispatch is still running", async () => {
    let completeSync!: (result: { status: string; capabilityGaps: [] }) => void;
    syncGitlabExecute.mockImplementationOnce(() => new Promise((resolve) => {
      completeSync = resolve;
    }));
    const { dispatchFetch } = await import("../lib/fetch-dispatch");

    const first = dispatchFetch(account as never, "manual", "l1");
    await vi.waitFor(() => expect(syncGitlabExecute).toHaveBeenCalledTimes(1));

    await expect(dispatchFetch(account as never, "scheduler", "l1")).resolves.toEqual({
      status: "skipped",
      reason: "already-running",
    });

    completeSync({ status: "success", capabilityGaps: [] });
    await expect(first).resolves.toEqual({ status: "success", capabilityGaps: [] });
    expect(startFetchRun).toHaveBeenCalledTimes(1);
  });
});
