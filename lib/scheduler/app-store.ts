import { getLogger } from "../logger";
import { isMockMode } from "../config";
import { listConnections, getLatestRunForSource, pruneFinishedRuns, recoverStaleRuns } from "../repositories/app-store";
import { hasFinanceImport, readCommerceImportDates } from "../repositories/app-store-facts";
import { syncAppStoreAnalyticsForConnection, syncAppStoreRevenueForConnection } from "../services/app-store-sync";
import { financeCandidateMonths, latestSalesReportDate } from "../../shared/app-store-revenue";

const TICK_MS = 60 * 60 * 1000;
const STALE_RUN_MS = 30 * 60 * 1000;
const DUE_MS = { analytics: 6 * 60 * 60 * 1000, revenue: 6 * 60 * 60 * 1000, sales: 24 * 60 * 60 * 1000, finance: 24 * 60 * 60 * 1000 };
const g = globalThis as unknown as { __ascSchedulerStarted?: boolean; __ascSchedulerTimer?: ReturnType<typeof setTimeout>; __ascSchedulerTicking?: boolean };

export function isSyncDue(lastRunAt: string | null | undefined, now: number, intervalMs: number) {
  return !lastRunAt || now - Date.parse(lastRunAt) >= intervalMs;
}

function permanentFailure(errorMessage: string | null | undefined) {
  const message = errorMessage ?? "";
  return /status=(?:401|403)\b|code=(?:AUTHENTICATION_ERROR|NOT_AUTHORIZED|FORBIDDEN(?:_ERROR)?|INVALID_PRIVATE_KEY)\b|invalid_private_key|vendor_required|(?:authorization|role) failure|insufficient (?:app )?access/i.test(message);
}

export function salesCandidateDates(latestDate: string, importedDates: readonly string[], lookbackDays = 30, correctionDays = 3): string[] {
  const latestTime = Date.parse(`${latestDate}T00:00:00Z`);
  if (!Number.isFinite(latestTime) || lookbackDays < 1 || correctionDays < 0) return [];
  const imported = new Set(importedDates);
  const dates: string[] = [];
  for (let offset = lookbackDays - 1; offset >= 0; offset--) {
    const date = new Date(latestTime - offset * 86_400_000).toISOString().slice(0, 10);
    if (!imported.has(date) || offset < correctionDays) dates.push(date);
  }
  return dates;
}

function isPermanentFailureRun(latest: Awaited<ReturnType<typeof getLatestRunForSource>>) {
  return Boolean(latest && ["error", "partial"].includes(latest.status) && permanentFailure(latest.error_message));
}

function connectionChangedAfterFailure(latest: Awaited<ReturnType<typeof getLatestRunForSource>>, connectionUpdatedAt: string) {
  if (!latest || !isPermanentFailureRun(latest)) return false;
  const runStartedAt = Date.parse(latest.started_at);
  const connectionUpdated = Date.parse(connectionUpdatedAt);
  return Number.isFinite(runStartedAt) && Number.isFinite(connectionUpdated) && connectionUpdated > runStartedAt;
}

async function sourceDue(connection: { id: number; updated_at: string }, kind: "analytics" | "sales" | "finance", scope: string, interval: number, now: number) {
  const latest = await getLatestRunForSource(connection.id, kind, scope);
  if (isPermanentFailureRun(latest)) {
    const changed = connectionChangedAfterFailure(latest, connection.updated_at);
    return { due: changed, lastRunAt: latest?.started_at ?? null };
  }
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
      const due = await sourceDue(connection, source.kind, source.scope, source.interval, now).catch(() => ({ due: false, lastRunAt: null }));
      if (!due.due) continue;
      const candidateFiscalMonths = source.kind === "finance" ? financeCandidateMonths(now) : undefined;
      getLogger().info("ASC", JSON.stringify({ event: "asc_scheduler_due", connectionId: connection.id, source: source.kind, scope: source.scope, lastRunAt: due.lastRunAt, intervalMinutes: source.interval / 60_000, ...(candidateFiscalMonths ? { candidateFiscalMonths } : {}) }));
      try {
        if (source.kind === "analytics") {
          await syncAppStoreAnalyticsForConnection(connection, { scope: source.scope as "acquisition" | "revenue", trigger: "scheduler" });
        } else if (source.kind === "sales") {
          const latestDate = latestSalesReportDate(new Date(now));
          const oldestDate = new Date(Date.parse(`${latestDate}T00:00:00Z`) - 29 * 86_400_000).toISOString().slice(0, 10);
          const imports = await readCommerceImportDates(connection.id, { from: oldestDate, to: latestDate });
          const salesDates = salesCandidateDates(latestDate, imports.sales);
          if (!salesDates.length) continue;
          const month = new Date(now).toISOString().slice(0, 7);
          await syncAppStoreRevenueForConnection(connection, { from: salesDates[0], to: latestDate, fiscalMonth: month, regionCode: "ZZ" }, { trigger: "scheduler", sources: [source.kind], salesDates });
        } else {
          const latestDate = latestSalesReportDate(new Date(now));
          const from = new Date(Date.parse(`${latestDate}T00:00:00Z`) - 2 * 86400_000).toISOString().slice(0, 10);
          for (const fiscalMonth of candidateFiscalMonths ?? []) {
            try {
              if (await hasFinanceImport(connection.id, fiscalMonth, "ZZ")) {
                getLogger().info("ASC", JSON.stringify({ event: "finance_month_skipped", connectionId: connection.id, fiscalMonth, regionCode: "ZZ", reason: "already_imported" }));
                continue;
              }
            } catch (error) {
              getLogger().warn("ASC", JSON.stringify({ event: "finance_import_lookup_failed", connectionId: connection.id, fiscalMonth, error: error instanceof Error ? error.name : "unknown" }));
              continue;
            }
            getLogger().info("ASC", JSON.stringify({ event: "finance_month_selected", connectionId: connection.id, fiscalMonth, regionCode: "ZZ" }));
            try {
              await syncAppStoreRevenueForConnection(connection, { from, to: latestDate, fiscalMonth, regionCode: "ZZ" }, { trigger: "scheduler", sources: ["finance"] });
            } catch (error) {
              if (!(error instanceof Error && error.message.includes("already running"))) {
                getLogger().warn("ASC", JSON.stringify({ event: "asc_scheduler_source_failed", connectionId: connection.id, source: "finance", scope: source.scope, fiscalMonth, error: error instanceof Error ? error.name : "unknown" }));
              }
            }
          }
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
