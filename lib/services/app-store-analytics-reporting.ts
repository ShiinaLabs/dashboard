import { z } from "zod";
import { isMockMode } from "../config";
import { listConnections, getApps } from "../repositories/app-store";
import { AppStoreError } from "./app-store";
import type { AppStoreAnalyticsAppOption, AppStoreAnalyticsDashboard } from "@/shared/app-store-analytics";

type Viewer = { id: number; role: string };
export async function listEnabledAnalyticsApps(viewer: Viewer): Promise<AppStoreAnalyticsAppOption[]> {
  const connections = (await listConnections(viewer.role === "admin" ? undefined : viewer.id)).filter((connection) => connection.is_active);
  const apps = (await Promise.all(connections.map((connection) => getApps(connection.id)))).flat().filter((app) => app.is_enabled);
  return apps.map((app) => ({ id: app.id, name: app.name }));
}

const filterSchema = z.object({ from: z.iso.date(), to: z.iso.date(), appId: z.coerce.number().int().positive().optional(), territory: z.string().trim().min(1).max(100).optional() });

function emptyDashboard(): AppStoreAnalyticsDashboard {
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
    const date = filter.to;
    const multiplier = filter.appId ? 1 : apps.length;
    if (filter.territory && filter.territory !== "USA") return emptyDashboard();
    const overview = { impressions: 240 * multiplier, views: 65 * multiplier, firstTimeDownloads: 12 * multiplier, downloads: 17 * multiplier, conversion: 5 };
    return { updatedAt: new Date().toISOString(), completeThrough: new Date(Date.parse(date) - 3 * 86400000).toISOString().slice(0, 10), overview, trend: [{ date, ...overview }], acquisition: [
      { source: "App Store Search", impressions: 180 * multiplier, views: 45 * multiplier, firstTimeDownloads: 9 * multiplier, downloads: 13 * multiplier, conversion: 5 },
      { source: "App Store Browse", impressions: 60 * multiplier, views: 20 * multiplier, firstTimeDownloads: 3 * multiplier, downloads: 4 * multiplier, conversion: 5 },
      ...["App Referrer", "Web Referrer", "Campaign"].map((source) => ({ source, impressions: null, views: null, firstTimeDownloads: null, downloads: null, conversion: null })),
    ], campaigns: [], territories: ["USA"] };
  }
  // A real typed adapter must be derived from captured reports before this gate is removed.
  // Do not pretend an absent implementation is an empty or zero-valued report.
  throw new AppStoreError("report_mapping_pending", 503, "Analytics reports cannot be displayed yet; report import configuration is incomplete");
}
