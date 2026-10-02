import { beforeEach, describe, expect, it, vi } from "vitest";

const { loadConfig, isMockMode, initLogger, bootstrap, ensureScheduler, recoverStaleRuns } = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  isMockMode: vi.fn(),
  initLogger: vi.fn(),
  bootstrap: vi.fn(),
  ensureScheduler: vi.fn(),
  recoverStaleRuns: vi.fn(),
}));

vi.mock("../lib/config", () => ({ loadConfig, isMockMode }));
vi.mock("../lib/logger", () => ({ initLogger }));
vi.mock("../lib/setup", () => ({ bootstrap }));
vi.mock("../lib/scheduler-singleton", () => ({ ensureScheduler }));
vi.mock("../lib/repositories/app-store", () => ({ recoverStaleRuns }));

const config = { log: { dir: "/tmp/dashboard-test-logs", level: "silent", maxSize: "1m", maxFiles: 1 } };

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  loadConfig.mockReturnValue(config);
  isMockMode.mockReturnValue(false);
  bootstrap.mockResolvedValue(undefined);
  recoverStaleRuns.mockResolvedValue(0);
});

describe("ensureApplicationReady", () => {
  it("initializes logger, waits for bootstrap, then starts the scheduler", async () => {
    const events: string[] = [];
    const bootstrapGate = deferred<void>();
    loadConfig.mockImplementation(() => {
      events.push("config");
      return config;
    });
    initLogger.mockImplementation(() => events.push("logger"));
    bootstrap.mockImplementation(() => {
      events.push("bootstrap:start");
      return bootstrapGate.promise.then(() => events.push("bootstrap:complete"));
    });
    ensureScheduler.mockImplementation(() => events.push("scheduler"));
    recoverStaleRuns.mockImplementation(async () => { events.push("recovery"); return 0; });

    const { ensureApplicationReady } = await import("../lib/startup");
    const ready = ensureApplicationReady();

    expect(events).toEqual(["config", "logger", "bootstrap:start"]);
    expect(ensureScheduler).not.toHaveBeenCalled();

    bootstrapGate.resolve();
    await ready;
    expect(events).toEqual(["config", "logger", "bootstrap:start", "bootstrap:complete", "recovery", "scheduler"]);
  });

  it("shares one startup promise across concurrent callers", async () => {
    const bootstrapGate = deferred<void>();
    bootstrap.mockReturnValue(bootstrapGate.promise);
    const { ensureApplicationReady } = await import("../lib/startup");

    const first = ensureApplicationReady();
    const second = ensureApplicationReady();
    const third = ensureApplicationReady();

    expect(second).toBe(first);
    expect(third).toBe(first);
    expect(loadConfig).toHaveBeenCalledTimes(1);
    expect(initLogger).toHaveBeenCalledTimes(1);
    expect(bootstrap).toHaveBeenCalledTimes(1);
    expect(ensureScheduler).not.toHaveBeenCalled();

    bootstrapGate.resolve();
    await Promise.all([first, second, third]);
    expect(ensureScheduler).toHaveBeenCalledTimes(1);
    expect(recoverStaleRuns).toHaveBeenCalledTimes(1);
  });

  it("does not start the scheduler when bootstrap fails", async () => {
    const error = new Error("database unavailable");
    bootstrap.mockRejectedValue(error);
    const { ensureApplicationReady } = await import("../lib/startup");

    await expect(ensureApplicationReady()).rejects.toBe(error);
    expect(ensureScheduler).not.toHaveBeenCalled();
    expect(recoverStaleRuns).not.toHaveBeenCalled();
  });

  it("retries startup after a bootstrap failure", async () => {
    bootstrap
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockResolvedValueOnce(undefined);
    const { ensureApplicationReady } = await import("../lib/startup");

    await expect(ensureApplicationReady()).rejects.toThrow("database unavailable");
    expect(ensureScheduler).not.toHaveBeenCalled();

    await ensureApplicationReady();
    expect(bootstrap).toHaveBeenCalledTimes(2);
    expect(loadConfig).toHaveBeenCalledTimes(2);
    expect(initLogger).toHaveBeenCalledTimes(2);
    expect(ensureScheduler).toHaveBeenCalledTimes(1);
  });

  it("bootstraps mock mode without starting the scheduler", async () => {
    isMockMode.mockReturnValue(true);
    const { ensureApplicationReady } = await import("../lib/startup");

    await expect(ensureApplicationReady()).resolves.toBeUndefined();

    expect(initLogger).toHaveBeenCalledWith(config.log);
    expect(bootstrap).toHaveBeenCalledTimes(1);
    expect(ensureScheduler).not.toHaveBeenCalled();
  });
});
