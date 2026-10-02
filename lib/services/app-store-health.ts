import type { AppStoreHealth, AppStoreSourceHealth } from "@/shared/app-store-health";
import { getLatestRunForSource } from "../repositories/app-store";
import { authorizedConnection } from "./app-store";
import { enabledApps } from "../repositories/app-store-analytics";
import { readAnalyticsPartitions, readCommerceImportDates } from "../repositories/app-store-facts";
import { reportRunDisplayStatus } from "../../shared/app-store";
import { analyticsCompleteThrough } from "./app-store-analytics-reporting";

type Viewer = { id: number; role: string };
const DAY = 86_400_000;
const empty = (state: AppStoreSourceHealth["state"], reason: string | null = null): AppStoreSourceHealth => ({ state, lastSync: null, latestData: null, completeThrough: null, reason });

export function classifyAppStoreSourceHealth(run: { status: "running" | "success" | "partial" | "error"; scope: string | null; trigger: "manual" | "scheduler"; kind: "metadata" | "analytics" | "sales" | "finance"; error_message: string | null; started_at: string; finished_at: string | null } | undefined, latestData: string | null, maxAge: number, now: number): AppStoreSourceHealth {
  if (!run) return empty("never_run");
  const lastSync = run.finished_at ?? run.started_at;
  const message = run.error_message ?? "";
  if (/status=(401|403)|vendor_required|invalid_private_key|permission/i.test(message)) return { state: "action_required", lastSync, latestData, completeThrough: null, reason: message || "Apple permission or connection settings need attention" };
  if (run.status === "running") return { state: "waiting", lastSync, latestData, completeThrough: null, reason: "A sync is currently running" };
  if (/^(?:report_waiting|waiting):\s*/.test(message)) return { state: "waiting", lastSync, latestData, completeThrough: null, reason: message.replace(/^(?:report_waiting|waiting):\s*/, "") || "Apple has not made a report available yet" };
  const displayStatus = reportRunDisplayStatus(run);
  if (displayStatus === "waiting") return { state: "waiting", lastSync, latestData, completeThrough: null, reason: message.replace(/^(?:report_waiting|waiting):\s*/, "") || "Apple has not made a report available yet" };
  if (displayStatus === "error" || displayStatus === "partial") return { state: "error", lastSync, latestData, completeThrough: null, reason: message || "The latest sync failed" };
  if (!latestData) return { state: "waiting", lastSync, latestData, completeThrough: null, reason: "No imported report partition is available yet" };
  const dataTime = Date.parse(`${latestData}T00:00:00Z`);
  return { state: now - dataTime > maxAge ? "stale" : "healthy", lastSync, latestData, completeThrough: latestData, reason: now - Date.parse(lastSync) > maxAge ? "No recent sync has completed" : null };
}

export async function getAppStoreHealth(connectionId: number, viewer: Viewer, now = Date.now()): Promise<AppStoreHealth> {
  const connection = await authorizedConnection(connectionId, viewer);
  const [apps, metadata, acquisitionRun, revenueRun, salesRun, financeRun, commerceImports] = await Promise.all([
    enabledApps(connectionId),
    getLatestRunForSource(connectionId, "metadata", null),
    getLatestRunForSource(connectionId, "analytics", "acquisition"),
    getLatestRunForSource(connectionId, "analytics", "revenue"),
    getLatestRunForSource(connectionId, "sales", "revenue"),
    getLatestRunForSource(connectionId, "finance", "revenue"),
    readCommerceImportDates(connectionId),
  ]);
  const partitions = await readAnalyticsPartitions(apps.map((app) => app.id));
  const metadataAction = metadata?.error_message && /status=(401|403)|\b(401|403)\b|invalid_private_key|permission|forbidden|unauthorized/i.test(metadata.error_message);
  const connectionHealth: AppStoreSourceHealth = !connection.is_active
    ? empty("action_required", "This connection is disabled")
    : !metadata
      ? empty("never_run")
      : metadataAction
        ? { state: "action_required", lastSync: metadata.finished_at ?? metadata.started_at, latestData: null, completeThrough: null, reason: metadata.error_message }
        : metadata.status === "running"
          ? { state: "waiting", lastSync: metadata.started_at, latestData: null, completeThrough: null, reason: "Connection metadata refresh is running" }
        : metadata.status === "error"
          ? { state: "error", lastSync: metadata.finished_at ?? metadata.started_at, latestData: null, completeThrough: null, reason: metadata.error_message }
          : { state: now - Date.parse(metadata.finished_at ?? metadata.started_at) > 7 * DAY ? "stale" : "healthy", lastSync: metadata.finished_at ?? metadata.started_at, latestData: null, completeThrough: null, reason: null };
  const acquisition = partitions.filter((partition) => partition.report_kind === "discovery" || partition.report_kind === "downloads").map((partition) => partition.date).sort().at(-1) ?? null;
  const revenueAnalytics = partitions.filter((partition) => ["purchases", "subscriptionState", "subscriptionEvent"].includes(partition.report_kind)).map((partition) => partition.date).sort().at(-1) ?? null;
  const firstPartition = (kinds: string[]) => partitions.filter((partition) => kinds.includes(partition.report_kind)).map((partition) => partition.date).sort()[0] ?? null;
  const today = new Date(now).toISOString().slice(0, 10);
  const windowStart = new Date(now - 90 * DAY).toISOString().slice(0, 10);
  const acquisitionFirst = firstPartition(["discovery", "downloads"]);
  const revenueFirst = firstPartition(["purchases", "subscriptionState", "subscriptionEvent"]);
  const acquisitionComplete = acquisitionFirst ? analyticsCompleteThrough(partitions, apps.map((app) => app.id), ["discovery", "downloads"], acquisitionFirst > windowStart ? acquisitionFirst : windowStart, today) : null;
  const revenueComplete = revenueFirst ? analyticsCompleteThrough(partitions, apps.map((app) => app.id), ["purchases", "subscriptionState", "subscriptionEvent"], revenueFirst > windowStart ? revenueFirst : windowStart, today) : null;
  const analyticsHealth = (run: typeof acquisitionRun, latest: string | null, complete: string | null) => {
    const health = classifyAppStoreSourceHealth(run, complete, 5 * DAY, now);
    if (latest && !complete && health.state === "waiting" && health.reason === "No imported report partition is available yet") health.reason = "Analytics reports do not yet provide complete-through coverage";
    return { ...health, latestData: latest, completeThrough: complete };
  };
  const sales = commerceImports.sales.sort().at(-1) ?? null;
  const finance = commerceImports.finance.sort().at(-1) ?? null;
  const result: AppStoreHealth = {
    connection: connectionHealth,
    analytics: analyticsHealth(acquisitionRun, acquisition, acquisitionComplete),
    revenueAnalytics: analyticsHealth(revenueRun, revenueAnalytics, revenueComplete),
    sales: classifyAppStoreSourceHealth(salesRun, sales, 4 * DAY, now),
    finance: classifyAppStoreSourceHealth(financeRun, finance ? `${finance}-01` : null, 50 * DAY, now),
  };
  return result;
}
