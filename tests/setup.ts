/**
 * Test helper — drop and re-create all tables in the test database
 * using the same SQL as db/migrate.ts.
 */
import { Pool } from "pg";

let _pool: Pool | null = null;

export function getTestPool(): Pool {
  if (!_pool) {
    _pool = new Pool({
      host: process.env.PG_HOST || "localhost",
      port: Number(process.env.PG_PORT) || 5432,
      database: process.env.PG_DB || "dashboard_test",
      user: process.env.PG_USER || "dashboard",
      password: process.env.PG_PASSWORD || "dashboard",
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

const ALL_TABLES = [
  "fetch_runs",
  "github_repository_tracking", "github_sources",
  "github_release_asset_snapshots", "github_release_assets", "github_releases", "github_paths", "github_referrers",
  "github_traffic_views", "github_traffic_clones", "github_repo_snapshots",
  "github_contributions", "github_repos", "github_stats",
  "gitlab_release_assets", "gitlab_releases", "gitlab_project_snapshots",
  "gitlab_contributions", "gitlab_projects", "gitlab_stats",
  "reddit_comments", "reddit_posts", "reddit_stats",
  "tweets", "user_stats",
  "settings",
  "accounts",
  "users",
];

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
