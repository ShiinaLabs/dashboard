// @ts-nocheck — Drizzle ORM result types are complex
import { and, desc, eq, isNull } from "drizzle-orm";
import { analytics_sites } from "@/db/schema";
import { getDb } from "../db/connection";
import { isMockMode } from "../config";

export interface AnalyticsSiteRow {
  id: number;
  owner_id: number;
  name: string;
  site_key: string;
  host: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

const mockSites: AnalyticsSiteRow[] = [
  { id: 1, owner_id: 1, name: "WiFi Lens", site_key: "123e4567-e89b-42d3-a456-426614174000", host: "wifi-lens.app", created_at: new Date(0).toISOString(), updated_at: new Date(0).toISOString(), deleted_at: null },
  { id: 2, owner_id: 1, name: "Tazuki", site_key: "123e4567-e89b-42d3-a456-426614174001", host: "tazuki.dev", created_at: new Date(0).toISOString(), updated_at: new Date(0).toISOString(), deleted_at: null },
  { id: 3, owner_id: 1, name: "ShiinaPlay", site_key: "123e4567-e89b-42d3-a456-426614174002", host: "shiina.play", created_at: new Date(0).toISOString(), updated_at: new Date(0).toISOString(), deleted_at: null },
];
let nextMockId = 4;

export async function getAnalyticsSites(ownerId?: number): Promise<AnalyticsSiteRow[]> {
  if (isMockMode()) return mockSites.filter((site) => site.deleted_at === null && (ownerId === undefined || site.owner_id === ownerId));
  const conditions = [isNull(analytics_sites.deleted_at)];
  if (ownerId !== undefined) conditions.push(eq(analytics_sites.owner_id, ownerId));
  return getDb().select().from(analytics_sites).where(and(...conditions)).orderBy(desc(analytics_sites.created_at));
}

export async function getAnalyticsSiteById(id: number): Promise<AnalyticsSiteRow | undefined> {
  if (isMockMode()) return mockSites.find((site) => site.id === id && site.deleted_at === null);
  const rows = await getDb().select().from(analytics_sites)
    .where(and(eq(analytics_sites.id, id), isNull(analytics_sites.deleted_at))).limit(1);
  return rows[0];
}

export async function getAnalyticsSiteByKey(siteKey: string): Promise<AnalyticsSiteRow | undefined> {
  if (isMockMode()) return mockSites.find((site) => site.site_key === siteKey && site.deleted_at === null);
  const rows = await getDb().select().from(analytics_sites)
    .where(and(eq(analytics_sites.site_key, siteKey), isNull(analytics_sites.deleted_at))).limit(1);
  return rows[0];
}

export async function createAnalyticsSite(data: Pick<AnalyticsSiteRow, "owner_id" | "name" | "site_key" | "host">): Promise<AnalyticsSiteRow> {
  if (isMockMode()) {
    const now = new Date().toISOString();
    const row = { id: nextMockId++, ...data, created_at: now, updated_at: now, deleted_at: null };
    mockSites.unshift(row);
    return row;
  }
  const rows = await getDb().insert(analytics_sites).values(data).returning();
  return rows[0];
}

export async function renameAnalyticsSite(id: number, name: string): Promise<AnalyticsSiteRow | undefined> {
  if (isMockMode()) {
    const site = mockSites.find((candidate) => candidate.id === id && candidate.deleted_at === null);
    if (!site) return undefined;
    site.name = name;
    site.updated_at = new Date().toISOString();
    return site;
  }
  const rows = await getDb().update(analytics_sites)
    .set({ name, updated_at: new Date().toISOString() })
    .where(and(eq(analytics_sites.id, id), isNull(analytics_sites.deleted_at)))
    .returning();
  return rows[0];
}
