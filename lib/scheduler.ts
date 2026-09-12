import { getActiveAccounts, getAccountByIdWithCredential, updateAccount } from "./services/accounts";
import { dispatchFetch } from "./fetch-dispatch";
import { getLogger } from "./logger";
import { isSupportedPlatform } from "./platforms";
import { getFetchInterval, type FetchLevel } from "./application/scheduler/fetchPolicy";
import { getAccountFetchState, upsertAccountFetchState } from "./repositories/account-fetch-state";
import type { AccountRow } from "./repositories/accounts";

// Minimum seconds between fetching two accounts of the same platform.
// Prevents hammering a single API with back-to-back full-profile fetches.
const PLATFORM_COOLDOWN_MS: Record<string, number> = {
  github: 120_000,
  gitlab: 120_000,
  twitter: 300_000,  // X rate limits are the strictest
  reddit: 120_000,
};

const CYCLE_INTERVAL_MS = 60_000;

const LEVELS: FetchLevel[] = ["l0", "l1", "l2"];

const g = globalThis as unknown as { __running?: boolean; __cycleRunning?: boolean; __timeoutId?: ReturnType<typeof setTimeout> | null };

export function startScheduler() {
  if (g.__running) return;
  g.__running = true;
  getLogger().info("Scheduler", "Started (checking every %ds) — L0/L1/L2 aware", CYCLE_INTERVAL_MS / 1000);
  scheduleNext();
}

export function stopScheduler() {
  if (g.__timeoutId) clearTimeout(g.__timeoutId);
  g.__running = false;
}

function scheduleNext() {
  if (!g.__running) return;
  // Add jitter to prevent alignment across restarts
  const jitter = Math.random() * 10_000; // 0–10s
  g.__timeoutId = setTimeout(() => {
    runCycle().finally(() => scheduleNext());
  }, CYCLE_INTERVAL_MS + jitter);
}

async function runCycle() {
  if (g.__cycleRunning) return;
  g.__cycleRunning = true;
  try {
    const accounts = (await getActiveAccounts()).filter((account) => isSupportedPlatform(account.platform));
    if (accounts.length === 0) return;
    let now = Date.now();
    const lastPlatformFetch = new Map<string, number>();

    for (const account of accounts) {
      // For each account, check per-level due state; dispatch the first due level (priority L0 > L1 > L2)
      const states = await getAccountFetchState(account.id).catch(() => null);
      const stateMap = new Map((states ?? []).map(s => [s.level, s.lastFetchedAt ? new Date(s.lastFetchedAt).getTime() : 0]));
      let dueLevel: FetchLevel | null = null;
      for (const level of LEVELS) { // L0: static 24h, L1: stars/issues/PR/release downloads 90m, L2: traffic telemetry 8h
        const lastFetched = stateMap.get(level) ?? (account.last_fetched_at ? new Date(account.last_fetched_at).getTime() : 0);
        const intervalMs = getFetchInterval(account.platform, level, null);
        if (now - lastFetched >= intervalMs) {
          dueLevel = level;
          break;
        }
      }
      if (!dueLevel) {
        // Diagnosability: why this account was skipped this cycle
        try {
          getLogger().info("Scheduler", "Account %s (%s) skipped this cycle — no level due (l0/l1/l2 check)", account.id, account.platform);
        } catch { void 0; }
        continue;
      }
      getLogger().info("Scheduler", "Account %s (%s) -> due level %s", account.id, account.platform, dueLevel);

      const platform = account.platform;
      const platformLast = lastPlatformFetch.get(platform) || 0;
      const cooldown = PLATFORM_COOLDOWN_MS[platform] || 0;
      const elapsed = now - platformLast;
      if (elapsed < cooldown) {
        await sleep(cooldown - elapsed);
      }

      // Re-fetch the account to ensure it's still active and has the latest state.
      let freshAccount: AccountRow | undefined;
      try {
        freshAccount = await getAccountByIdWithCredential(account.id);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        getLogger().warn("Scheduler", "Account %s credential unavailable: %s", account.id, message);
        await updateAccount(account.id, { error_message: message }).catch(() => undefined);
        continue;
      }
      if (!freshAccount || !freshAccount.is_active || !isSupportedPlatform(freshAccount.platform)) {
        continue;
      }

      await dispatchFetch(freshAccount, "scheduler", dueLevel);
      // Record per-level fetch time
      try {
        await upsertAccountFetchState(account.id, dueLevel, new Date().toISOString());
      } catch { /* per-level state table may not exist yet */ }
      // Also update legacy last_fetched_at for backward compat / health display
      try {
        await updateAccount(account.id, { last_fetched_at: new Date().toISOString() });
      } catch { /* legacy update best-effort */ }

      lastPlatformFetch.set(freshAccount.platform, Date.now());
      // Refresh now after each fetch so the interval check reflects real elapsed time
      now = Date.now();
    }
  } catch (err) {
    getLogger().error("Scheduler", "Cycle error: %s", err instanceof Error ? err.message : String(err));
  } finally {
    g.__cycleRunning = false;
  }
}

export async function runCycleOnceForTests() {
  await runCycle();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
