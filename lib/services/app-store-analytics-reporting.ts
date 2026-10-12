import { z } from "zod";
import { isMockMode } from "../config";
import { listConnections, getApps } from "../repositories/app-store";
import { AppStoreError } from "./app-store";
import { readAnalyticsFacts } from "../repositories/app-store-facts";
import { sumDecimals, completionDays, isFinalizedDailyPartition } from "../infra/app-store/report-mapping";
import type { AppStoreAnalyticsAppOption, AppStoreAnalyticsDashboard, AppStoreAnalyticsCoverage, AppStoreMetricCoverage } from "@/shared/app-store-analytics";

type Viewer = { id: number; role: string };
export async function listEnabledAnalyticsApps(viewer: Viewer): Promise<AppStoreAnalyticsAppOption[]> {
  if (isMockMode()) return [{ id: 1, name: "Demo App" }];
  const connections = (await listConnections(viewer.role === "admin" ? undefined : viewer.id)).filter((connection) => connection.is_active);
  const apps = (await Promise.all(connections.map((connection) => getApps(connection.id)))).flat().filter((app) => app.is_enabled);
  return apps.map((app) => ({ id: app.id, name: app.name }));
}

export const filterSchema = z.object({ from: z.iso.date(), to: z.iso.date(), appId: z.coerce.number().int().positive().optional(), territory: z.string().trim().min(1).max(100).optional() });
type AnalyticsFilter = z.infer<typeof filterSchema>;

export function emptyDashboard(): AppStoreAnalyticsDashboard {
  const unknown = (): AppStoreMetricCoverage => ({ state: "unknown", reportingApps: 0, totalApps: 0, reportingAppDays: 0, totalAppDays: 0 });
  const coverage = { impressions: unknown(), views: unknown(), firstTimeDownloads: unknown(), downloads: unknown(), conversion: unknown() };
  return { updatedAt: null, completeThrough: null, overview: { impressions: null, views: null, firstTimeDownloads: null, downloads: null, conversion: null }, coverage, trend: [], acquisition: [], campaigns: [], territories: [] };
}

export async function getAppStoreAnalyticsDashboard(viewer: Viewer, input: unknown): Promise<AppStoreAnalyticsDashboard> {
  const parsed = filterSchema.safeParse(input);
  if (!parsed.success) throw new AppStoreError("invalid_filters", 400, "Invalid App Store Analytics filters");
  const filter = parsed.data;
  const days = (Date.parse(filter.to) - Date.parse(filter.from)) / 86400000 + 1;
  if (days < 1 || days > 90) throw new AppStoreError("invalid_range", 400, "Select a date range of 1–90 days");
  const apps = await listEnabledAnalyticsApps(viewer);
  if (filter.appId !== undefined && !apps.some((app) => app.id === filter.appId)) throw new AppStoreError("forbidden", 403, "App is not enabled or accessible");
  if (!apps.length) return emptyDashboard();
  if (isMockMode()) return projectAnalyticsDashboard(filter, apps, mockAnalyticsFacts(apps, filter));
  const appIds = apps.filter((app) => !filter.appId || app.id === filter.appId).map((app) => app.id);
  const data = await readAnalyticsFacts(appIds, filter);
  return projectAnalyticsDashboard(filter, apps, data);
}

function mockAnalyticsFacts(apps: AppStoreAnalyticsAppOption[], filter: AnalyticsFilter): Awaited<ReturnType<typeof readAnalyticsFacts>> {
  const appIds = apps.filter((app) => !filter.appId || app.id === filter.appId).map((app) => app.id);
  const discovery: Awaited<ReturnType<typeof readAnalyticsFacts>>["discovery"] = [];
  const downloads: Awaited<ReturnType<typeof readAnalyticsFacts>>["downloads"] = [];
  const partitions: Awaited<ReturnType<typeof readAnalyticsFacts>>["partitions"] = [];
  if (filter.territory && filter.territory !== "USA") return { discovery, downloads, purchases: [], subscriptionState: [], subscriptionEvent: [], partitions };
  for (let time = Date.parse(`${filter.from}T00:00:00Z`); time <= Date.parse(`${filter.to}T00:00:00Z`); time += 86_400_000) {
    const date = new Date(time).toISOString().slice(0, 10), day = Math.floor(time / 86_400_000);
    if (date > new Date(Date.parse(`${filter.to}T00:00:00Z`) - 2 * 86_400_000).toISOString().slice(0, 10)) continue;
    for (const appId of appIds) {
      if ((day + appId) % 11 === 0) continue; // Deliberately partial coverage.
      for (const kind of ["discovery", "downloads"] as const) partitions.push({ id: 0, app_id: appId, report_kind: kind, date, granularity: "DAILY", source_instance_id: `mock-${appId}-${kind}-${date}`, processing_date: new Date(time + 3 * 86_400_000).toISOString().slice(0, 10), coverage_source: "daily_complete", updated_at: date });
      const impressions = day % 5 === 0 ? 0 : 120 + day % 80;
      const views = day % 7 === 0 ? 0 : 24 + day % 22;
      const firstTimeDownloads = day % 6 === 0 ? 0 : 2 + day % 6;
      const redownloads = day % 8 === 0 ? 0 : day % 4;
      if (impressions) discovery.push({ id: 0, app_id: appId, date, event: "Impression", page_type: "Product page", source_type: "App Store Search", territory: "USA", counts: String(impressions), unique_counts: null, source_instance_id: `mock-${appId}`, processing_date: date, created_at: date, updated_at: date });
      if (views) discovery.push({ id: 0, app_id: appId, date, event: "Page view", page_type: "Product page", source_type: "App Store Search", territory: "USA", counts: String(views), unique_counts: null, source_instance_id: `mock-${appId}`, processing_date: date, created_at: date, updated_at: date });
      if (firstTimeDownloads) downloads.push({ id: 0, app_id: appId, date, download_type: "First-time Download", source_type: "App Store Search", territory: "USA", counts: String(firstTimeDownloads), source_instance_id: `mock-${appId}`, processing_date: date, created_at: date, updated_at: date });
      if (redownloads) downloads.push({ id: 0, app_id: appId, date, download_type: "Redownload", source_type: "App Store Browse", territory: "USA", counts: String(redownloads), source_instance_id: `mock-${appId}`, processing_date: date, created_at: date, updated_at: date });
    }
  }
  return { discovery, downloads, purchases: [], subscriptionState: [], subscriptionEvent: [], partitions };
}

export function projectAnalyticsDashboard(filter: AnalyticsFilter, apps: AppStoreAnalyticsAppOption[], data: Awaited<ReturnType<typeof readAnalyticsFacts>>): AppStoreAnalyticsDashboard {
  const appIds = apps.filter((app) => !filter.appId || app.id === filter.appId).map((app) => app.id);
  const relevant = <T extends { date: string; territory: string | null }>(rows: T[]) => rows.filter((r) => r.date >= filter.from && r.date <= filter.to && (!filter.territory || r.territory === filter.territory));
  const discovery = relevant(data.discovery), downloads = relevant(data.downloads);
  const partitions = data.partitions.filter((p) => p.report_kind === "discovery" || p.report_kind === "downloads");
  const metricCoverage = (kind: "discovery" | "downloads", from: string, to: string): { coverage: AppStoreMetricCoverage; apps: Set<number>; finalizedApps: Set<number> } => {
    const relevantPartitions = partitions.filter((partition) => partition.report_kind === kind && partition.date >= from && partition.date <= to && appIds.includes(partition.app_id));
    const reportingAppDays = new Set(relevantPartitions.map((partition) => `${partition.app_id}:${partition.date}`));
    const finalizedAppDays = new Set(relevantPartitions.filter((partition) => isFinalizedDailyPartition(partition, kind)).map((partition) => `${partition.app_id}:${partition.date}`));
    const reporting = new Set([...reportingAppDays].map((key) => Number(key.slice(0, key.indexOf(":")))));
    const finalized = new Set([...finalizedAppDays].map((key) => Number(key.slice(0, key.indexOf(":")))));
    const days = Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
    const totalAppDays = appIds.length * days;
    const reportedDays = finalizedAppDays.size;
    return {
      coverage: { state: reportedDays === 0 ? "unknown" : reportedDays === totalAppDays ? "complete" : "partial", reportingApps: reporting.size, totalApps: appIds.length, reportingAppDays: reportedDays, totalAppDays },
      apps: reporting,
      finalizedApps: finalized,
    };
  };
  const total = <T extends { counts: string | null }>(rows: T[], finalizedApps: Set<number>): number | null => {
    const amount = rows.length ? sumDecimals(rows.map((r) => r.counts)) : finalizedApps.size ? "0" : null;
    if (amount === null) return null;
    const n = Number(amount);
    return Number.isSafeInteger(n) ? n : null;
  };
  const metrics = (from: string, to: string, source?: string) => {
    const d = discovery.filter((r) => r.date >= from && r.date <= to && (!source || r.source_type === source));
    const dl = downloads.filter((r) => r.date >= from && r.date <= to && (!source || r.source_type === source));
    const discoveryApps = metricCoverage("discovery", from, to);
    const downloadApps = metricCoverage("downloads", from, to);
    const sumFor = <T extends { app_id: number; counts: string | null }>(rows: T[], reporting: Set<number>, finalized: Set<number>) => total(rows.filter((row) => reporting.has(row.app_id)), finalized);
    return {
      impressions: sumFor(d.filter((r) => r.event === "Impression"), discoveryApps.apps, discoveryApps.finalizedApps),
      views: sumFor(d.filter((r) => r.event === "Page view" && r.page_type === "Product page"), discoveryApps.apps, discoveryApps.finalizedApps),
      firstTimeDownloads: sumFor(dl.filter((r) => r.download_type === "First-time Download"), downloadApps.apps, downloadApps.finalizedApps),
      downloads: sumFor(dl.filter((r) => r.download_type === "First-time Download" || r.download_type === "Redownload"), downloadApps.apps, downloadApps.finalizedApps),
      conversion: null, // Unique users are not additive across report dimensions.
      coverage: { impressions: discoveryApps.coverage, views: discoveryApps.coverage, firstTimeDownloads: downloadApps.coverage, downloads: downloadApps.coverage, conversion: { state: "unknown", reportingApps: 0, totalApps: appIds.length, reportingAppDays: 0, totalAppDays: appIds.length * (Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1) } } satisfies AppStoreAnalyticsCoverage,
    };
  };
  const reportedDates = [...new Set(partitions.filter((p) => p.date >= filter.from && p.date <= filter.to).map((p) => p.date))].sort();
  const dates: string[] = [];
  for (let time = Date.parse(`${filter.from}T00:00:00Z`); time <= Date.parse(`${filter.to}T00:00:00Z`); time += 86_400_000) dates.push(new Date(time).toISOString().slice(0, 10));
  return {
    updatedAt: reportedDates.at(-1) ?? null,
    completeThrough: analyticsCompleteThrough(partitions, appIds, ["discovery", "downloads"], filter.from, filter.to),
    overview: metrics(filter.from, filter.to),
    trend: dates.map((date) => ({ date, ...metrics(date, date) })),
    coverage: metrics(filter.from, filter.to).coverage,
    acquisition: [...new Set([...discovery, ...downloads].flatMap((r) => r.source_type ? [r.source_type] : []))].sort().map((source) => ({ source, ...metrics(filter.from, filter.to, source) })),
    campaigns: [], // Standard reports do not contain Campaign; Detailed data is not inferred.
    territories: [...new Set([...data.discovery, ...data.downloads].flatMap((r) => r.territory ? [r.territory] : []))].sort(),
  };
}

export function analyticsCompleteThrough(partitions: { app_id: number; report_kind: string; date: string; processing_date: string; coverage_source?: string | null }[], appIds: number[], kinds: (keyof typeof completionDays)[], from: string, to: string): string | null {
  if (!appIds.length) return null;
  let complete: string | null = null;
  for (let time = Date.parse(from); time <= Date.parse(to); time += 86400000) {
    const date = new Date(time).toISOString().slice(0, 10);
    const known = appIds.every((appId) => kinds.every((kind) => partitions.some((p) => p.app_id === appId && p.report_kind === kind && p.date === date && isFinalizedDailyPartition(p, kind))));
    if (!known) break;
    complete = date;
  }
  return complete;
}
