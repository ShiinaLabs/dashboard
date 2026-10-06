import { z } from "zod";
import { isMockMode } from "../config";
import { listConnections, getApps } from "../repositories/app-store";
import { AppStoreError } from "./app-store";
import { readAnalyticsFacts } from "../repositories/app-store-facts";
import { sumDecimals, completionDays } from "../infra/app-store/report-mapping";
import type { AppStoreAnalyticsAppOption, AppStoreAnalyticsDashboard, AppStoreAnalyticsCoverage, AppStoreMetricCoverage } from "@/shared/app-store-analytics";

type Viewer = { id: number; role: string };
export async function listEnabledAnalyticsApps(viewer: Viewer): Promise<AppStoreAnalyticsAppOption[]> {
  const connections = (await listConnections(viewer.role === "admin" ? undefined : viewer.id)).filter((connection) => connection.is_active);
  const apps = (await Promise.all(connections.map((connection) => getApps(connection.id)))).flat().filter((app) => app.is_enabled);
  return apps.map((app) => ({ id: app.id, name: app.name }));
}

export const filterSchema = z.object({ from: z.iso.date(), to: z.iso.date(), appId: z.coerce.number().int().positive().optional(), territory: z.string().trim().min(1).max(100).optional() });

export function emptyDashboard(): AppStoreAnalyticsDashboard {
  const unknown = (): AppStoreMetricCoverage => ({ state: "unknown", reportingApps: 0, totalApps: 0 });
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
  if (isMockMode()) {
    // UI demonstration only. These numbers are not Apple report fixtures.
    const multiplier = filter.appId ? 1 : apps.length;
    if (filter.territory && filter.territory !== "USA") return emptyDashboard();
    const completeThrough = new Date(Math.max(Date.parse(filter.from), Date.parse(filter.to) - 2 * 86400000)).toISOString().slice(0, 10);
    const completeCoverage: AppStoreMetricCoverage = { state: "complete", reportingApps: apps.length, totalApps: apps.length };
    const coverage: AppStoreAnalyticsCoverage = { impressions: completeCoverage, views: completeCoverage, firstTimeDownloads: completeCoverage, downloads: completeCoverage, conversion: { state: "unknown", reportingApps: 0, totalApps: apps.length } };
    const trend: AppStoreAnalyticsDashboard["trend"] = [];
    for (let time = Date.parse(`${filter.from}T00:00:00Z`); time <= Date.parse(`${completeThrough}T00:00:00Z`); time += 86400000) {
      const date = new Date(time).toISOString().slice(0, 10), day = Math.floor(time / 86400000);
      trend.push({ date, impressions: (day % 5 === 0 ? 0 : 120 + day % 80) * multiplier, views: (day % 7 === 0 ? 0 : 24 + day % 22) * multiplier, firstTimeDownloads: (day % 6 === 0 ? 0 : 2 + day % 6) * multiplier, downloads: (day % 6 === 0 ? 0 : 4 + day % 9) * multiplier, conversion: null, coverage });
    }
    const overview = {
      impressions: trend.reduce((sum, row) => sum + (row.impressions ?? 0), 0),
      views: trend.reduce((sum, row) => sum + (row.views ?? 0), 0),
      firstTimeDownloads: trend.reduce((sum, row) => sum + (row.firstTimeDownloads ?? 0), 0),
      downloads: trend.reduce((sum, row) => sum + (row.downloads ?? 0), 0),
      conversion: null,
    };
    return { updatedAt: completeThrough, completeThrough, overview, coverage, trend, acquisition: [
      { source: "App Store Search", impressions: 180 * multiplier, views: 45 * multiplier, firstTimeDownloads: 9 * multiplier, downloads: 13 * multiplier, conversion: 5 },
      { source: "App Store Browse", impressions: 60 * multiplier, views: 20 * multiplier, firstTimeDownloads: 3 * multiplier, downloads: 4 * multiplier, conversion: 5 },
      ...["App Referrer", "Web Referrer", "Campaign"].map((source) => ({ source, impressions: null, views: null, firstTimeDownloads: null, downloads: null, conversion: null })),
    ], campaigns: [], territories: ["USA"] };
  }
  const appIds = apps.filter((app) => !filter.appId || app.id === filter.appId).map((app) => app.id);
  const data = await readAnalyticsFacts(appIds, filter);
  const relevant = <T extends { date: string; territory: string | null }>(rows: T[]) => rows.filter((r) => r.date >= filter.from && r.date <= filter.to && (!filter.territory || r.territory === filter.territory));
  const discovery = relevant(data.discovery), downloads = relevant(data.downloads);
  const partitions = data.partitions.filter((p) => p.report_kind === "discovery" || p.report_kind === "downloads");
  const metricCoverage = (kind: string, from: string, to: string): { coverage: AppStoreMetricCoverage; apps: Set<number> } => {
    const reporting = new Set(partitions.filter((p) => p.report_kind === kind && p.date >= from && p.date <= to).map((p) => p.app_id).filter((id) => appIds.includes(id)));
    const count = reporting.size;
    return { coverage: { state: count === 0 ? "unknown" : count === appIds.length ? "complete" : "partial", reportingApps: count, totalApps: appIds.length }, apps: reporting };
  };
  const total = <T extends { counts: string | null }>(rows: T[], reportingApps: Set<number>): number | null => {
    if (!reportingApps.size) return null;
    const amount = rows.length ? sumDecimals(rows.map((r) => r.counts)) : "0";
    if (amount === null) return null;
    const n = Number(amount);
    return Number.isSafeInteger(n) ? n : null;
  };
  const metrics = (from: string, to: string, source?: string) => {
    const d = discovery.filter((r) => r.date >= from && r.date <= to && (!source || r.source_type === source));
    const dl = downloads.filter((r) => r.date >= from && r.date <= to && (!source || r.source_type === source));
    const discoveryApps = metricCoverage("discovery", from, to);
    const downloadApps = metricCoverage("downloads", from, to);
    const sumFor = <T extends { app_id: number; counts: string | null }>(rows: T[], reporting: Set<number>) => total(rows.filter((row) => reporting.has(row.app_id)), reporting);
    return {
      impressions: sumFor(d.filter((r) => r.event === "Impression"), discoveryApps.apps),
      views: sumFor(d.filter((r) => r.event === "Page view" && r.page_type === "Product page"), discoveryApps.apps),
      firstTimeDownloads: sumFor(dl.filter((r) => r.download_type === "First-time Download"), downloadApps.apps),
      downloads: sumFor(dl.filter((r) => r.download_type === "First-time Download" || r.download_type === "Redownload"), downloadApps.apps),
      conversion: null, // Unique users are not additive across report dimensions.
      coverage: { impressions: discoveryApps.coverage, views: discoveryApps.coverage, firstTimeDownloads: downloadApps.coverage, downloads: downloadApps.coverage, conversion: { state: "unknown", reportingApps: 0, totalApps: appIds.length } } satisfies AppStoreAnalyticsCoverage,
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

export function analyticsCompleteThrough(partitions: { app_id: number; report_kind: string; date: string; processing_date: string }[], appIds: number[], kinds: (keyof typeof completionDays)[], from: string, to: string): string | null {
  if (!appIds.length) return null;
  let complete: string | null = null;
  for (let time = Date.parse(from); time <= Date.parse(to); time += 86400000) {
    const date = new Date(time).toISOString().slice(0, 10);
    const known = appIds.every((appId) => kinds.every((kind) => partitions.some((p) => p.app_id === appId && p.report_kind === kind && p.date === date && Date.parse(p.processing_date) - time >= completionDays[kind] * 86400000)));
    if (!known) break;
    complete = date;
  }
  return complete;
}
