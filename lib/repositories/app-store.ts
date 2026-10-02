import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { app_store_apps, app_store_connections, app_store_sync_runs } from "@/db/schema";
import { getDb } from "../db/connection";
import { isMockMode } from "../config";
import type { DiscoveredApp } from "../infra/app-store/AppStoreConnectClient";

export type ConnectionRow = typeof app_store_connections.$inferSelect;
type ConnectionInsert = typeof app_store_connections.$inferInsert;
type RunRow = typeof app_store_sync_runs.$inferSelect;

export class AppStoreConflictError extends Error {
  constructor() { super("Connection changed during sync; refresh and try again"); }
}

const mockConnections: ConnectionRow[] = [{
  id: 1, owner_id: 1, name: "Demo Team", issuer_id: "00000000-0000-4000-8000-000000000001", key_id: "DEMO123456",
  private_key_encrypted: "mock-configured", vendor_number: null, is_active: true,
  created_at: new Date(0).toISOString(), updated_at: new Date(0).toISOString(), deleted_at: null,
}];
const mockApps: (typeof app_store_apps.$inferSelect)[] = [{
  id: 1, connection_id: 1, apple_id: "1234567890", name: "Demo App", bundle_id: "example.demo.app", sku: "demo-app",
  is_enabled: false, created_at: new Date(0).toISOString(), updated_at: new Date(0).toISOString(),
}];
const mockRuns: RunRow[] = [];

export async function listConnections(ownerId?: number): Promise<ConnectionRow[]> {
  if (isMockMode()) return mockConnections.filter((row) => row.deleted_at === null && (ownerId === undefined || row.owner_id === ownerId)).map((row) => ({ ...row }));
  return getDb().select().from(app_store_connections).where(and(isNull(app_store_connections.deleted_at), ownerId === undefined ? undefined : eq(app_store_connections.owner_id, ownerId))).orderBy(desc(app_store_connections.created_at));
}

export async function getConnection(id: number): Promise<ConnectionRow | undefined> {
  if (isMockMode()) {
    const row = mockConnections.find((row) => row.id === id && row.deleted_at === null);
    return row && { ...row };
  }
  const [row] = await getDb().select().from(app_store_connections).where(and(eq(app_store_connections.id, id), isNull(app_store_connections.deleted_at))).limit(1);
  return row;
}

export async function getApp(appId: number) {
  if (isMockMode()) {
    const app = mockApps.find((row) => row.id === appId);
    return app ? { ...app } : undefined;
  }
  return (await getDb().select().from(app_store_apps).where(eq(app_store_apps.id, appId)).limit(1))[0];
}

export async function getApps(connectionId: number) {
  if (isMockMode()) return mockApps.filter((row) => row.connection_id === connectionId).map((row) => ({ ...row }));
  return getDb().select().from(app_store_apps).where(eq(app_store_apps.connection_id, connectionId)).orderBy(app_store_apps.name);
}

export async function getRecentRuns(connectionId: number, kind?: RunRow["kind"], scope?: string) {
  if (isMockMode()) return mockRuns.filter((row) => row.connection_id === connectionId && (!kind || row.kind === kind) && (!scope || row.scope === scope || (scope === "acquisition" && row.scope === null))).slice(-10).reverse().map((row) => ({ ...row }));
  return getDb().select().from(app_store_sync_runs).where(and(eq(app_store_sync_runs.connection_id, connectionId), kind ? eq(app_store_sync_runs.kind, kind) : undefined, scope ? sql`(${app_store_sync_runs.scope} = ${scope} OR (${scope} = 'acquisition' AND ${app_store_sync_runs.scope} IS NULL))` : undefined)).orderBy(desc(app_store_sync_runs.started_at), desc(app_store_sync_runs.id)).limit(10);
}

export async function getLastSuccessfulRun(connectionId: number) {
  if (isMockMode()) return mockRuns.filter((row) => row.connection_id === connectionId && row.kind === "metadata" && row.status === "success").at(-1) ?? null;
  const [row] = await getDb().select().from(app_store_sync_runs).where(and(eq(app_store_sync_runs.connection_id, connectionId), eq(app_store_sync_runs.kind, "metadata"), eq(app_store_sync_runs.status, "success")))
    .orderBy(desc(app_store_sync_runs.started_at), desc(app_store_sync_runs.id)).limit(1);
  return row ?? null;
}

type Transaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

async function upsertApps(tx: Transaction, connectionId: number, apps: DiscoveredApp[], now: string) {
  for (const app of apps) {
    await tx.insert(app_store_apps).values({ ...app, connection_id: connectionId, created_at: now, updated_at: now })
      .onConflictDoUpdate({ target: [app_store_apps.connection_id, app_store_apps.apple_id], set: {
        name: app.name, bundle_id: app.bundle_id, sku: app.sku, updated_at: now,
      } });
  }
  // App selection is deliberately preserved, including apps absent from this discovery.
}

export async function createWithApps(data: ConnectionInsert, apps: DiscoveredApp[], startedAt: string): Promise<ConnectionRow> {
  return getDb().transaction(async (tx) => {
    const now = new Date().toISOString();
    const [row] = await tx.insert(app_store_connections).values({ ...data, created_at: now, updated_at: now }).returning();
    await upsertApps(tx, row.id, apps, now);
    await tx.insert(app_store_sync_runs).values({ connection_id: row.id, kind: "metadata", trigger: "manual", status: "success", started_at: startedAt, finished_at: now, duration_ms: Date.parse(now) - Date.parse(startedAt) });
    return row;
  });
}

export async function startRun(connectionId: number, kind: RunRow["kind"] = "metadata", scope: string | null = null): Promise<RunRow> {
  const values = { connection_id: connectionId, kind, scope, trigger: "manual" as const, status: "running" as const, started_at: new Date().toISOString() };
  if (isMockMode()) {
    const run = { ...values, id: mockRuns.length + 1, finished_at: null, duration_ms: null, error_message: null };
    mockRuns.push(run);
    return { ...run };
  }
  const [row] = await getDb().insert(app_store_sync_runs).values(values).returning();
  return row;
}

export async function failRun(run: RunRow, message: string) {
  return finishRun(run, "error", message);
}

export async function finishRun(run: RunRow, status: "success" | "partial" | "error", message: string | null = null) {
  const now = new Date().toISOString();
  const changes = { status, finished_at: now, duration_ms: Date.parse(now) - Date.parse(run.started_at), error_message: message };
  if (isMockMode()) { Object.assign(mockRuns.find((row) => row.id === run.id)!, changes); return; }
  await getDb().update(app_store_sync_runs).set(changes).where(eq(app_store_sync_runs.id, run.id));
}

/** Commit connection changes, discovered apps and success telemetry atomically. */
export async function saveConnection(expected: ConnectionRow, updates: Partial<ConnectionInsert>, apps?: DiscoveredApp[], run?: RunRow): Promise<ConnectionRow> {
  const now = new Date(Math.max(Date.now(), Date.parse(expected.updated_at) + 1)).toISOString();
  if (isMockMode()) {
    const row = mockConnections.find((row) => row.id === expected.id && row.deleted_at === null);
    if (!row || row.updated_at !== expected.updated_at) throw new AppStoreConflictError();
    Object.assign(row, updates, { updated_at: now });
    if (run) Object.assign(mockRuns.find((row) => row.id === run.id)!, { status: "success", finished_at: now, duration_ms: Date.parse(now) - Date.parse(run.started_at) });
    return { ...row };
  }
  return getDb().transaction(async (tx) => {
    const [row] = await tx.select().from(app_store_connections).where(eq(app_store_connections.id, expected.id)).for("update");
    if (!row || row.deleted_at !== null || row.updated_at !== expected.updated_at) throw new AppStoreConflictError();
    const [updated] = await tx.update(app_store_connections).set({ ...updates, updated_at: now }).where(eq(app_store_connections.id, row.id)).returning();
    if (apps) await upsertApps(tx, row.id, apps, now);
    if (run) await tx.update(app_store_sync_runs).set({ status: "success", finished_at: now, duration_ms: Date.parse(now) - Date.parse(run.started_at) }).where(eq(app_store_sync_runs.id, run.id));
    return updated;
  });
}

export async function setAppEnabled(connectionId: number, appId: number, isEnabled: boolean) {
  const now = new Date().toISOString();
  if (isMockMode()) {
    if (!mockConnections.some((row) => row.id === connectionId && row.deleted_at === null)) return undefined;
    const app = mockApps.find((row) => row.id === appId && row.connection_id === connectionId);
    if (app) Object.assign(app, { is_enabled: isEnabled, updated_at: now });
    return app && { ...app };
  }
  const [row] = await getDb().update(app_store_apps).set({ is_enabled: isEnabled, updated_at: now })
    .where(and(eq(app_store_apps.id, appId), eq(app_store_apps.connection_id, connectionId), sql`EXISTS (SELECT 1 FROM app_store_connections WHERE id = ${connectionId} AND deleted_at IS NULL)`)).returning();
  return row;
}
