/**
 * Test helper — drop and re-create all tables in the test database
 * using the runtime bootstrap schema.
 */
import { Pool } from "pg";
import { getSchemaTableNames } from "../lib/setup";
import type { DatabaseConfig } from "../lib/config";

let _pool: Pool | null = null;

export function isSafeTestDatabaseName(name: string): boolean {
  return name === "test" || /[_-]test$/i.test(name);
}

export function getTestDatabaseConfig(): DatabaseConfig {
  if (process.env.DATABASE_URL?.trim()) {
    throw new Error("Refusing to run destructive tests while DATABASE_URL is set");
  }

  const database = process.env.PG_DB || "dashboard_test";
  if (!isSafeTestDatabaseName(database)) {
    throw new Error(`Refusing to run destructive test setup against unsafe database: ${database}`);
  }

  return {
    host: process.env.PG_HOST || "localhost",
    port: Number(process.env.PG_PORT) || 5432,
    database,
    user: process.env.PG_USER || "dashboard",
    password: process.env.PG_PASSWORD || "dashboard",
  };
}

export function getTestPool(): Pool {
  const config = getTestDatabaseConfig();
  if (!_pool) {
    _pool = new Pool({
      ...config,
      max: 2,
    });
  }
  return _pool;
}

export async function closeTestPool() {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}

const ALL_TABLES = getSchemaTableNames().reverse();

export async function resetTestDb() {
  const pool = getTestPool();

  // Drop all tables in reverse FK order
  for (const table of ALL_TABLES) {
    await pool.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
  }

  // Re-create from migration definitions
  // Import dynamically to avoid circular ref
  const { createMissingTables } = await import("./migrate-helper");
  await createMissingTables(pool);
}
