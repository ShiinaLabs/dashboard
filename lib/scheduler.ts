import { getActiveAccounts, getAccountByIdWithCredential, updateAccount } from "./services/accounts";
import { dispatchFetch } from "./fetch-dispatch";
import { getLogger } from "./logger";
import { isSupportedPlatform } from "./platforms";
import { getFetchInterval, getPlatformFetchLevels, type FetchLevel } from "./application/scheduler/fetchPolicy";
import { getAccountFetchState, getPlatformLastFetchFinishedAt, recordAccountFetchFailure, upsertAccountFetchState } from "./repositories/account-fetch-state";
import type { AccountRow } from "./repositories/accounts";

const PLATFORM_COOLDOWN_MS: Record<string, number> = { github: 120_000, gitlab: 120_000, twitter: 300_000, reddit: 120_000 };
const CYCLE_INTERVAL_MS = 60_000;
const MAX_CONCURRENT = 2;

type SchedulerGlobal = typeof globalThis & {
  __running?: boolean; __cycleRunning?: boolean; __timeoutId?: ReturnType<typeof setTimeout> | null;
  __schedulerAccounts?: Set<number>; __schedulerPlatforms?: Set<string>; __schedulerNextPlatformAt?: Map<string, number>; __schedulerCursor?: number;
  __schedulerTasks?: Set<Promise<void>>;
};
const g = globalThis as SchedulerGlobal;
const activeAccounts = () => g.__schedulerAccounts ??= new Set<number>();
const activePlatforms = () => g.__schedulerPlatforms ??= new Set<string>();
const platformNextAt = () => g.__schedulerNextPlatformAt ??= new Map<string, number>();
const schedulerTasks = () => g.__schedulerTasks ??= new Set<Promise<void>>();

export function startScheduler() {
  if (g.__running) return;
  g.__running = true;
  getLogger().info("Scheduler", "Started (checking every %ds)", CYCLE_INTERVAL_MS / 1000);
  scheduleNext();
}

export function stopScheduler() {
  if (g.__timeoutId) clearTimeout(g.__timeoutId);
  g.__running = false;
}

function scheduleNext() {
  if (!g.__running) return;
  const jitter = Math.random() * 10_000;
  g.__timeoutId = setTimeout(() => { runCycle().catch(error => getLogger().error("Scheduler", "Cycle error: %s", error instanceof Error ? error.message : String(error))).finally(scheduleNext); }, CYCLE_INTERVAL_MS + jitter);
}

async function runCycle() {
  if (g.__cycleRunning) return;
  g.__cycleRunning = true;
  try {
    const accounts = (await getActiveAccounts()).filter(account => isSupportedPlatform(account.platform));
    if (!accounts.length) return;
    const start = (g.__schedulerCursor ?? 0) % accounts.length;
    const ordered = [...accounts.slice(start), ...accounts.slice(0, start)];
    g.__schedulerCursor = (start + 1) % accounts.length;

    for (const account of ordered) {
      if (!g.__running && g.__timeoutId) break;
      if (activeAccounts().size >= MAX_CONCURRENT) break;
      if (activeAccounts().has(account.id) || activePlatforms().has(account.platform)) continue;
      const now = Date.now();
      if (now < (platformNextAt().get(account.platform) ?? 0)) continue;
      const lastPlatformAt = await getPlatformLastFetchFinishedAt(account.platform);
      if (lastPlatformAt && now - Date.parse(lastPlatformAt) < (PLATFORM_COOLDOWN_MS[account.platform] ?? 0)) continue;

      const states = await getAccountFetchState(account.id).catch(() => [] as Array<{ level: string; lastFetchedAt?: string | null; nextRetryAt?: string | null; failureCount?: number }>);
      const stateMap = new Map(states.map(state => [state.level, state]));
      let dueLevel: FetchLevel | null = null;
      for (const level of getPlatformFetchLevels(account.platform) as FetchLevel[]) {
        const state = stateMap.get(level);
        if (state?.nextRetryAt && Date.parse(state.nextRetryAt) > now) continue;
        const lastFetched = state?.lastFetchedAt ? Date.parse(state.lastFetchedAt) : 0;
        if (now - lastFetched >= getFetchInterval(account.platform, level, null)) { dueLevel = level; break; }
      }
      if (!dueLevel) {
        getLogger().debug("Scheduler", "Account %s (%s) skipped this cycle — no level due (unsupported levels excluded)", account.id, account.platform);
        continue;
      }

      activeAccounts().add(account.id);
      activePlatforms().add(account.platform);
      platformNextAt().set(account.platform, now + (PLATFORM_COOLDOWN_MS[account.platform] ?? 0));
      const task = dispatchAccount(account, dueLevel, stateMap.get(dueLevel)?.failureCount ?? 0);
      schedulerTasks().add(task);
      void task.finally(() => schedulerTasks().delete(task)).catch(() => undefined);
    }
  } finally {
    g.__cycleRunning = false;
  }
}

async function dispatchAccount(account: { id: number; platform: string }, level: FetchLevel, failureCount: number) {
  try {
    const fresh = await getAccountByIdWithCredential(account.id);
    if (!fresh || !fresh.is_active || !isSupportedPlatform(fresh.platform)) return;
    const result = await dispatchFetch(fresh as AccountRow, "scheduler", level);
    if (result.status === "success" || result.status === "partial") {
      await upsertAccountFetchState(account.id, level, new Date().toISOString());
    } else if (result.status === "failed") {
      await recordAccountFetchFailure(account.id, level, result.errorMessage ?? "Scheduled fetch failed", failureCount);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    getLogger().warn("Scheduler", "Account %s scheduled fetch failed: %s", account.id, message);
    await updateAccount(account.id, { error_message: message }).catch(() => undefined);
    await recordAccountFetchFailure(account.id, level, message, failureCount);
  } finally {
    activeAccounts().delete(account.id);
    activePlatforms().delete(account.platform);
  }
}

export async function runCycleOnceForTests(options: { waitForDispatches?: boolean } = {}) {
  platformNextAt().clear();
  await runCycle();
  if (options.waitForDispatches !== false) await Promise.allSettled([...schedulerTasks()]);
}
