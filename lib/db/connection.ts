import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import { loadConfig } from "../config";
import type { DatabaseConfig } from "../config";
import * as schema from "@/db/schema";

// Use globalThis to survive Next.js standalone module identity splits.
const g = globalThis as unknown as {
  __pgPool?: Pool;
  __db?: ReturnType<typeof drizzle>;
};

export async function initPgPool(databaseConfig?: DatabaseConfig): Promise<void> {
  if (g.__pgPool) return; // already initialized
  const cfg = databaseConfig ?? loadConfig().database;
  if (!cfg) throw new Error("PostgreSQL config missing");
  const { Pool } = await import("pg");
  g.__pgPool = new Pool({
    host: cfg.host,
    port: cfg.port,
    database: cfg.database,
    user: cfg.user,
    password: cfg.password,
    max: cfg.max ?? 5,
    ssl: cfg.ssl ? { rejectUnauthorized: false } : undefined,
  });

  const client = await g.__pgPool.connect();
  client.release();
  console.log("[DB] Connected to PostgreSQL at %s:%d/%s", cfg.host, cfg.port, cfg.database);
}

export function getDb() {
  if (!g.__db) {
    if (!g.__pgPool) throw new Error("PostgreSQL pool not initialized. Call initPgPool() first.");
    g.__db = drizzle(g.__pgPool, { schema });
  }
  return g.__db;
}

export function getPgPool(): Pool | null {
  return g.__pgPool ?? null;
}

export async function closeDb() {
  g.__db = undefined;
  if (g.__pgPool) {
    await g.__pgPool.end();
    g.__pgPool = undefined;
  }
}
