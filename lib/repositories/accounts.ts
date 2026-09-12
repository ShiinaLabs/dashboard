// @ts-nocheck — Drizzle ORM types are complex
import { eq, and, desc, sql, isNull, type SQL } from "drizzle-orm";
import { getDb } from "../db/connection";
import { accounts } from "@/db/schema";
import { isMockMode } from "../config";
import { accounts as mockAccounts } from "../mock";

export interface AccountRow {
  id: number;
  owner_id: number;
  screen_name: string;
  platform: string;
  user_id: string | null;
  auth_token: string;
  fetch_interval: number;
  is_active: number;
  last_fetched_at: string | null;
  error_message: string | null;
  instance_url: string | null;
  auth_type: string | null;
  created_at: string;
  updated_at: string;
}

export type AccountPublic = Omit<AccountRow, "auth_token">;

export async function getAccounts(ownerId?: number) {
  if (isMockMode()) return ownerId === undefined ? mockAccounts : mockAccounts.filter((a) => a.owner_id === ownerId);
  const db = getDb();
  const conditions: SQL<unknown>[] = [isNull(accounts.deleted_at)];
  if (ownerId !== undefined) conditions.push(eq(accounts.owner_id, ownerId));
  return db.select({
    id: accounts.id,
    owner_id: accounts.owner_id,
    screen_name: accounts.screen_name,
    platform: accounts.platform,
    user_id: accounts.user_id,
    auth_token: accounts.auth_token,
    fetch_interval: accounts.fetch_interval,
    is_active: accounts.is_active,
    last_fetched_at: accounts.last_fetched_at,
    error_message: accounts.error_message,
    instance_url: accounts.instance_url,
    auth_type: accounts.auth_type,
    created_at: accounts.created_at,
    updated_at: accounts.updated_at,
  }).from(accounts)
    .where(and(...conditions))
    .orderBy(desc(accounts.created_at));
}

export async function getActiveAccounts() {
  if (isMockMode()) return mockAccounts.filter((a) => a.is_active);
  return getDb().select().from(accounts)
    .where(and(eq(accounts.is_active, 1), isNull(accounts.deleted_at))) as Promise<AccountRow[]>;
}

export async function getAccountById(id: number) {
  if (isMockMode()) return mockAccounts.find((a) => a.id === id);
  const rows = await getDb().select().from(accounts)
    .where(and(eq(accounts.id, id), isNull(accounts.deleted_at)))
    .limit(1);
  return rows[0] as AccountRow | undefined;
}

export async function createAccount(data: {
  owner_id: number;
  screen_name: string;
  auth_token: string;
  fetch_interval: number;
  platform: string;
  instance_url: string | null;
  auth_type: string | null;
}) {
  if (isMockMode()) return { id: 999, ...data, user_id: null, last_fetched_at: null, error_message: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() } as AccountRow;
  const inserted = await getDb().insert(accounts).values(data).returning();
  return inserted[0] as AccountRow;
}

export async function updateAccount(id: number, updates: Partial<AccountRow>) {
  if (isMockMode()) return;
  await getDb().update(accounts).set({ ...updates, updated_at: sql`NOW()` }).where(eq(accounts.id, id));
}

export async function deleteAccount(id: number) {
  if (isMockMode()) return;
  await getDb().update(accounts)
    .set({ deleted_at: sql`NOW()` })
    .where(eq(accounts.id, id));
}
