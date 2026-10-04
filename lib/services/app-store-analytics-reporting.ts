import { z } from "zod";
import { isMockMode } from "../config";
import { listConnections, getApps } from "../repositories/app-store";
import { AppStoreError } from "./app-store";
import { readAnalyticsFacts } from "../repositories/app-store-facts";
import { sumDecimals, completionDays } from "../infra/app-store/report-mapping";
import type { AppStoreAnalyticsAppOption, AppStoreAnalyticsDashboard } from "@/shared/app-store-analytics";

type Viewer = { id: number; role: string };
export async function listEnabledAnalyticsApps(viewer: Viewer): Promise<AppStoreAnalyticsAppOption[]> {
  const connections = (await listConnections(viewer.role === "admin" ? undefined : viewer.id)).filter((connection) => connection.is_active);
  const apps = (await Promise.all(connections.map((connection) => getApps(connection.id)))).flat().filter((app) => app.is_enabled);
  return apps.map((app) => ({ id: app.id, name: app.name }));
}

export const filterSchema = z.object({ from: z.iso.date(), to: z.iso.date(), appId: z.coerce.number().int().positive().optional(), territory: z.string().trim().min(1).max(100).optional() });

export function emptyDashboard(): AppStoreAnalyticsDashboard {
  return { updatedAt: null, completeThrough: null, overview: { impressions: null, views: null, firstTimeDownloads: null, downloads: null, conversion: null }, trend: [], acquisition: [], campaigns: [], territories: [] };
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
    const trend: AppStoreAnalyticsDashboard["trend"] = [];
    for (let time = Date.parse(`${filter.from}T00:00:00Z`); time <= Date.parse(`${completeThrough}T00:00:00Z`); time += 86400000) {
      const date = new Date(time).toISOString().slice(0, 10), day = Math.floor(time / 86400000);
      trend.push({ date, impressions: (day % 5 === 0 ? 0 : 120 + day % 80) * multiplier, views: (day % 7 === 0 ? 0 : 24 + day % 22) * multiplier, firstTimeDownloads: (day % 6 === 0 ? 0 : 2 + day % 6) * multiplier, downloads: (day % 6 === 0 ? 0 : 4 + day % 9) * multiplier, conversion: null });
    }
    const overview = {
      impressions: trend.reduce((sum, row) => sum + (row.impressions ?? 0), 0),
      views: trend.reduce((sum, row) => sum + (row.views ?? 0), 0),
      firstTimeDownloads: trend.reduce((sum, row) => sum + (row.firstTimeDownloads ?? 0), 0),
      downloads: trend.reduce((sum, row) => sum + (row.downloads ?? 0), 0),
      conversion: null,
    };
    return { updatedAt: completeThrough, completeThrough, overview, trend, acquisition: [
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
  const covered = (kind: string, from: string, to: string) => appIds.every((id) => partitions.some((p) => p.app_id === id && p.report_kind === kind && p.date >= from && p.date <= to));
  const total = (rows: { counts: string | null }[], known: boolean): number | null => {
    if (!known) return null;
    const amount = rows.length ? sumDecimals(rows.map((r) => r.counts)) : "0";
    if (amount === null) return null;
    const n = Number(amount);
    return Number.isSafeInteger(n) ? n : null;
  };
  const metrics = (from: string, to: string, source?: string) => {
    const d = discovery.filter((r) => r.date >= from && r.date <= to && (!source || r.source_type === source));
    const dl = downloads.filter((r) => r.date >= from && r.date <= to && (!source || r.source_type === source));
    return {
      impressions: total(d.filter((r) => r.event === "Impression"), covered("discovery", from, to)),
      views: total(d.filter((r) => r.event === "Page view" && r.page_type === "Product page"), covered("discovery", from, to)),
      firstTimeDownloads: total(dl.filter((r) => r.download_type === "First-time Download"), covered("downloads", from, to)),
      downloads: total(dl.filter((r) => r.download_type === "First-time Download" || r.download_type === "Redownload"), covered("downloads", from, to)),
      conversion: null, // Unique users are not additive across report dimensions.
    };
  };
  const dates = [...new Set(partitions.filter((p) => p.date >= filter.from && p.date <= filter.to).map((p) => p.date))].sort();
  return {
    updatedAt: dates.at(-1) ?? null,
    completeThrough: analyticsCompleteThrough(partitions, appIds, ["discovery", "downloads"], filter.from, filter.to),
    overview: metrics(filter.from, filter.to),
    trend: dates.map((date) => ({ date, ...metrics(date, date) })),
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
