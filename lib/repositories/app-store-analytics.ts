import { eq, inArray } from "drizzle-orm";
import { app_store_analytics_requests, app_store_apps, app_store_connections, app_store_report_imports } from "@/db/schema";
import { getDb } from "../db/connection";
import { isMockMode } from "../config";
import { getApp, getApps, getConnection, getRecentRuns, AppStoreConflictError } from "./app-store";
import type { AnalyticsReportRequest } from "../infra/app-store/AppStoreConnectClient";

export type AnalyticsRequestRow = typeof app_store_analytics_requests.$inferSelect;
const mockRequests: AnalyticsRequestRow[] = [];

export async function enabledApps(connectionId: number) {
  return (await getApps(connectionId)).filter((app) => app.is_enabled);
}

export async function requestsForApps(appIds: number[]): Promise<AnalyticsRequestRow[]> {
  if (!appIds.length) return [];
  if (isMockMode()) return mockRequests.filter((request) => appIds.includes(request.app_id)).map((row) => ({ ...row }));
  return getDb().select().from(app_store_analytics_requests).where(inArray(app_store_analytics_requests.app_id, appIds));
}

export async function adoptRequest(appId: number, resource: AnalyticsReportRequest, connectionVersion: string) {
  const now = new Date().toISOString();
  const data = { app_id: appId, apple_request_id: resource.id, access_type: resource.attributes.accessType, stopped_due_to_inactivity: resource.attributes.stoppedDueToInactivity, updated_at: now, last_seen_at: now };
  if (isMockMode()) {
    const app = await getApp(appId);
    if (!app) throw new AppStoreConflictError();
    await assertAppStillEnabled(appId, app.connection_id, connectionVersion);
    const existing = mockRequests.find((row) => row.apple_request_id === resource.id);
    if (existing && existing.app_id !== appId) throw new AppStoreConflictError();
    if (existing) { Object.assign(existing, data); return { ...existing }; }
    const row = { id: mockRequests.length + 1, ...data, created_at: now };
    mockRequests.push(row);
    return { ...row };
  }
  return getDb().transaction(async (tx) => {
    const [app] = await tx.select().from(app_store_apps).where(eq(app_store_apps.id, appId));
    if (!app) throw new AppStoreConflictError();
    const [connection] = await tx.select().from(app_store_connections).where(eq(app_store_connections.id, app.connection_id)).for("update");
    if (!connection || !connection.is_active || connection.deleted_at || connection.updated_at !== connectionVersion) throw new AppStoreConflictError();
    const [currentApp] = await tx.select().from(app_store_apps).where(eq(app_store_apps.id, appId)).for("update");
    if (!currentApp.is_enabled) throw new AppStoreConflictError();
    const [row] = await tx.insert(app_store_analytics_requests).values({ ...data, created_at: now })
      .onConflictDoUpdate({ target: app_store_analytics_requests.apple_request_id, set: data, setWhere: eq(app_store_analytics_requests.app_id, appId) }).returning();
    if (!row) throw new AppStoreConflictError();
    return row;
  });
}

export async function assertAppStillEnabled(appId: number, connectionId: number, version: string) {
  const connection = await getConnection(connectionId);
  if (!connection || !connection.is_active || connection.updated_at !== version || !(await enabledApps(connectionId)).some((app) => app.id === appId)) throw new AppStoreConflictError();
}

export async function analyticsRuns(connectionId: number) {
  return getRecentRuns(connectionId, "analytics");
}

export async function importsForApps(appIds: number[]) {
  if (!appIds.length || isMockMode()) return [];
  return getDb().select().from(app_store_report_imports).where(inArray(app_store_report_imports.app_id, appIds));
}
