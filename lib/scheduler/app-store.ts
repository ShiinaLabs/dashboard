import { getLogger } from "../logger";
import { isMockMode } from "../config";
import { listConnections, getLatestRunForSource, pruneFinishedRuns, recoverStaleRuns } from "../repositories/app-store";
import { syncAppStoreAnalyticsForConnection, syncAppStoreRevenueForConnection } from "../services/app-store-sync";
import { latestSalesReportDate } from "../../shared/app-store-revenue";

const TICK_MS = 60 * 60 * 1000;
const STALE_RUN_MS = 30 * 60 * 1000;
const DUE_MS = { analytics: 6 * 60 * 60 * 1000, revenue: 6 * 60 * 60 * 1000, sales: 24 * 60 * 60 * 1000, finance: 24 * 60 * 60 * 1000 };
const g = globalThis as unknown as { __ascSchedulerStarted?: boolean; __ascSchedulerTimer?: ReturnType<typeof setTimeout>; __ascSchedulerTicking?: boolean };

export function isSyncDue(lastRunAt: string | null | undefined, now: number, intervalMs: number) {
  return !lastRunAt || now - Date.parse(lastRunAt) >= intervalMs;
}

function permanentFailure(errorMessage: string | null | undefined) {
  return /status=(401|403)|code=(FORBIDDEN|INVALID_|NOT_AUTHORIZED)|vendor_required|invalid_private_key|permission/i.test(errorMessage ?? "");
}

async function sourceDue(connectionId: number, kind: "analytics" | "sales" | "finance", scope: string, interval: number, now: number) {
  const latest = await getLatestRunForSource(connectionId, kind, scope);
  if (permanentFailure(latest?.error_message)) return { due: false, lastRunAt: latest?.started_at ?? null };
  return { due: isSyncDue(latest?.started_at, now, interval), lastRunAt: latest?.started_at ?? null };
}

export async function runAppStoreSchedulerTick(now = Date.now()) {
  getLogger().debug("ASC", JSON.stringify({ event: "asc_scheduler_tick", at: new Date(now).toISOString() }));
  if (isMockMode()) return;
  const recovered = await recoverStaleRuns(new Date(now - STALE_RUN_MS), new Date(now));
  if (recovered) getLogger().warn("ASC", JSON.stringify({ event: "asc_stale_runs_recovered", count: recovered }));
  const pruned = await pruneFinishedRuns(new Date(now - 180 * 86_400_000));
  if (pruned) getLogger().info("ASC", JSON.stringify({ event: "asc_sync_runs_pruned", count: pruned, retentionDays: 180 }));
  const connections = (await listConnections()).filter((connection) => connection.is_active);
  for (const connection of connections) {
    const sources = [
      { kind: "analytics" as const, scope: "acquisition", interval: DUE_MS.analytics },
      { kind: "analytics" as const, scope: "revenue", interval: DUE_MS.revenue },
      { kind: "sales" as const, scope: "revenue", interval: DUE_MS.sales },
      { kind: "finance" as const, scope: "revenue", interval: DUE_MS.finance },
    ];
    for (const source of sources) {
      const due = await sourceDue(connection.id, source.kind, source.scope, source.interval, now).catch(() => ({ due: false, lastRunAt: null }));
      if (!due.due) continue;
      getLogger().info("ASC", JSON.stringify({ event: "asc_scheduler_due", connectionId: connection.id, source: source.kind, scope: source.scope, lastRunAt: due.lastRunAt, intervalMinutes: source.interval / 60_000 }));
      try {
        if (source.kind === "analytics") {
          await syncAppStoreAnalyticsForConnection(connection, { scope: source.scope as "acquisition" | "revenue", trigger: "scheduler" });
        } else {
          const latestDate = latestSalesReportDate();
          const from = new Date(Date.parse(`${latestDate}T00:00:00Z`) - 2 * 86400_000).toISOString().slice(0, 10);
          const month = new Date(now).toISOString().slice(0, 7);
          await syncAppStoreRevenueForConnection(connection, { from, to: latestDate, fiscalMonth: month, regionCode: "ZZ" }, { trigger: "scheduler", sources: [source.kind] });
        }
      } catch (error) {
        if (!(error instanceof Error && error.message.includes("already running"))) {
          getLogger().warn("ASC", JSON.stringify({ event: "asc_scheduler_source_failed", connectionId: connection.id, source: source.kind, scope: source.scope, error: error instanceof Error ? error.name : "unknown" }));
        }
      }
    }
  }
}

function schedule() {
  if (!g.__ascSchedulerStarted) return;
  g.__ascSchedulerTimer = setTimeout(() => {
    void runAppStoreSchedulerTick().catch((error) => getLogger().error("ASC", JSON.stringify({ event: "asc_scheduler_tick_failed", error: error instanceof Error ? error.name : "unknown" }))).finally(schedule);
  }, TICK_MS);
}

export function startAppStoreScheduler() {
  if (g.__ascSchedulerStarted) return;
  g.__ascSchedulerStarted = true;
  getLogger().info("ASC", JSON.stringify({ event: "asc_scheduler_started", intervalMinutes: TICK_MS / 60_000 }));
  schedule();
}

export function stopAppStoreScheduler() {
  if (g.__ascSchedulerTimer) clearTimeout(g.__ascSchedulerTimer);
  g.__ascSchedulerStarted = false;
}
