import { describe, expect, it, vi } from "vitest";
import { GithubClient } from "../lib/infra/fetchers/GithubClient";

const okResponse = (body: unknown) => ({ ok: true, json: async () => body }) as Response;
const failure = (status: number) => ({ ok: false, status, text: async () => "denied" }) as Response;

describe("GithubClient.fetchRepositoryById", () => {
  it("retries transient network errors with a fresh abort signal on each attempt", async () => {
    vi.useFakeTimers();
    try {
      const signals: AbortSignal[] = [];
      const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
        signals.push(init?.signal as AbortSignal);
        if (fetchFn.mock.calls.length === 1) throw new TypeError("fetch failed");
        return okResponse({ id: 42 });
      });
      const promise = new GithubClient(fetchFn as never).fetchRepositoryById(42, "token");
      await vi.runAllTimersAsync();
      await expect(promise).resolves.toEqual({ id: 42 });
      expect(fetchFn).toHaveBeenCalledTimes(2);
      expect(signals[0]).not.toBe(signals[1]);
      expect(fetchFn.mock.calls[1][0]).toContain("/repositories/42");
    } finally { vi.useRealTimers(); }
  });

  it.each([401, 403, 404])("does not retry permanent HTTP %s responses", async (status) => {
    const fetchFn = vi.fn().mockResolvedValue(failure(status));
    await expect(new GithubClient(fetchFn as never).fetchRepositoryById(42)).rejects.toThrow(`GitHub repository ${status}`);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
