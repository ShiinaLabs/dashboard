// @ts-nocheck — setup/bootstrap; types are loose
import { join } from "path";
import { existsSync } from "fs";
import { initCrypto, encrypt, decrypt, isEncryptedCredential } from "./crypto";
import { loadConfig, loadOrGenerateKey, dataDir, isMockMode } from "./config";
import { initPgPool, getPgPool } from "./db/connection";
import type { Pool } from "pg";

// ═══════════════════════════════════════════════════════════════════
// Main entry
// ═══════════════════════════════════════════════════════════════════

export async function bootstrap() {
  // Mock/debug mode: serve fixture data with no PostgreSQL. Skip all DB work
  // so `next dev` boots without a backend.
  if (isMockMode()) {
    console.log("[Bootstrap] MOCK_DATA enabled — skipping database init, migrations, and admin bootstrap");
    return;
  }

  // 1. Parse config (DATABASE_URL → PostgreSQL)
  loadConfig();

  // 2. Encryption key
  const key = loadOrGenerateKey();
  initCrypto(key);

  // 3. Connect to PostgreSQL
  try {
    await initPgPool();
  } catch (e: unknown) {
    console.error("❌ PostgreSQL unavailable:", e instanceof Error ? e.message : String(e));
    process.exit(1);
  }

  // 4. Create missing tables (must run before migration)
  await createMissingTables();
  await ensureSchemaColumns();
  await backfillGithubIdentityAndTracking();

  // 5. Check for legacy SQLite migration (no-op once flagged)
  await autoMigrate();

  // 6. Re-encrypt any tokens that were stored in plaintext
  await reEncryptPlaintextTokens();

  // 7. Bootstrap admin user
  try {
    await bootstrapAdminUser();
  } catch (e: unknown) {
    console.error("❌ Failed to bootstrap admin user:", e instanceof Error ? e.message : String(e));
    process.exit(1);
  }

  console.log("[Bootstrap] Ready");
}

// ═══════════════════════════════════════════════════════════════════
// SQLite auto-migration
// ═══════════════════════════════════════════════════════════════════

async function autoMigrate() {
  const sqlitePath = join(dataDir(), "db", "dashboard.db");
  if (!existsSync(sqlitePath)) {
    console.log("[Migrate] No SQLite data found — fresh start");
    return;
  }

  const pool = getPgPool()!;

  // Check migration status — do it once, never again
  const { rows: flag } = await pool.query(
    `SELECT value FROM settings WHERE key = 'migrated_from_sqlite'`
  );
  if (flag.length > 0) {
    console.log("[Migrate] Already migrated — skipping");
    return;
  }

  // A legacy SQLite database exists without a migration flag. The SQLite →
  // PostgreSQL migration previously required Bun's `bun:sqlite`, which is no
  // longer present in the pnpm/Node runtime. Migration is complete in all
  // deployed environments, so we no longer attempt it here — warn instead of
  // importing `bun:sqlite` and crashing bootstrap.
  console.warn(
    "[Migrate] Legacy SQLite database found at %s without a migration flag. " +
    "SQLite → PostgreSQL migration is disabled in this runtime; historical data " +
    "will not be imported.",
    sqlitePath,
  );
}

// ═══════════════════════════════════════════════════════════════════
// Schema — CREATE TABLE IF NOT EXISTS
// ═══════════════════════════════════════════════════════════════════

export const SCHEMA = [
  { table: "users", sql: `CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user', created_at TEXT NOT NULL DEFAULT NOW(), deleted_at TEXT)` },
  { table: "accounts", sql: `CREATE TABLE IF NOT EXISTS accounts (id SERIAL PRIMARY KEY, owner_id INTEGER NOT NULL REFERENCES users(id), screen_name TEXT NOT NULL, platform TEXT NOT NULL DEFAULT 'twitter', user_id TEXT, auth_token TEXT NOT NULL, fetch_interval INTEGER DEFAULT 30, is_active INTEGER DEFAULT 1, last_fetched_at TEXT, error_message TEXT, instance_url TEXT, auth_type TEXT, created_at TEXT NOT NULL DEFAULT NOW(), updated_at TEXT NOT NULL DEFAULT NOW(), deleted_at TEXT); CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_screen_name_platform ON accounts(owner_id, screen_name, platform)` },
  { table: "fetch_policy", sql: `CREATE TABLE IF NOT EXISTS fetch_policy (platform TEXT NOT NULL, level TEXT NOT NULL, interval_minutes INTEGER NOT NULL, PRIMARY KEY(platform, level)); INSERT INTO fetch_policy (platform, level, interval_minutes) VALUES ('github','l0',1440),('github','l1',90),('github','l2',480),('gitlab','l0',1440),('gitlab','l1',90),('gitlab','l2',480),('twitter','l0',1440),('twitter','l1',90),('twitter','l2',480),('reddit','l0',1440),('reddit','l1',90),('reddit','l2',480) ON CONFLICT DO NOTHING` },
  { table: "account_fetch_state", sql: `CREATE TABLE IF NOT EXISTS account_fetch_state (id SERIAL PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, level TEXT NOT NULL, last_fetched_at TEXT, next_due_at TEXT, UNIQUE(account_id, level)); CREATE INDEX IF NOT EXISTS idx_account_fetch_state_due ON account_fetch_state(next_due_at)` },
  { table: "fetch_runs", sql: `CREATE TABLE IF NOT EXISTS fetch_runs (id SERIAL PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id), trigger TEXT NOT NULL DEFAULT 'manual', status TEXT NOT NULL DEFAULT 'running', started_at TEXT NOT NULL DEFAULT NOW(), finished_at TEXT, duration_ms INTEGER, error_message TEXT, capability_gaps TEXT NOT NULL DEFAULT '[]'); CREATE INDEX IF NOT EXISTS idx_fetch_runs_account_started ON fetch_runs(account_id, started_at DESC); CREATE INDEX IF NOT EXISTS idx_fetch_runs_status ON fetch_runs(status)` },
  { table: "settings", sql: `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)` },
  { table: "user_stats", sql: `CREATE TABLE IF NOT EXISTS user_stats (id SERIAL PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id), followers_count INTEGER NOT NULL, following_count INTEGER NOT NULL, tweet_count INTEGER NOT NULL, listed_count INTEGER DEFAULT 0, recorded_at TEXT NOT NULL DEFAULT NOW()); CREATE INDEX IF NOT EXISTS idx_user_stats_account_id ON user_stats(account_id); CREATE INDEX IF NOT EXISTS idx_user_stats_recorded_at ON user_stats(recorded_at)` },
  { table: "tweets", sql: `CREATE TABLE IF NOT EXISTS tweets (id TEXT PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id), full_text TEXT NOT NULL, created_at TEXT NOT NULL, favorite_count INTEGER DEFAULT 0, retweet_count INTEGER DEFAULT 0, reply_count INTEGER DEFAULT 0, view_count INTEGER DEFAULT 0, bookmark_count INTEGER DEFAULT 0, is_quote INTEGER DEFAULT 0, is_reply INTEGER DEFAULT 0, is_retweet INTEGER DEFAULT 0, media_urls TEXT DEFAULT '[]', urls TEXT DEFAULT '[]', hashtags TEXT DEFAULT '[]', mentions TEXT DEFAULT '[]', lang TEXT DEFAULT '', fetched_at TEXT NOT NULL DEFAULT NOW()); CREATE INDEX IF NOT EXISTS idx_tweets_created_at ON tweets(created_at); CREATE INDEX IF NOT EXISTS idx_tweets_account_id ON tweets(account_id)` },
  { table: "github_stats", sql: `CREATE TABLE IF NOT EXISTS github_stats (id SERIAL PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id), public_repos INTEGER NOT NULL, public_gists INTEGER DEFAULT 0, followers INTEGER NOT NULL, following INTEGER NOT NULL, recorded_at TEXT NOT NULL DEFAULT NOW())` },
  { table: "github_repos", sql: `CREATE TABLE IF NOT EXISTS github_repos (id SERIAL PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id), repo_id INTEGER NOT NULL, github_id BIGINT, node_id TEXT, instance TEXT NOT NULL DEFAULT 'github.com', owner_github_id BIGINT, owner_node_id TEXT, owner_login TEXT, owner_type TEXT, html_url TEXT, is_private INTEGER DEFAULT 0, is_archived INTEGER DEFAULT 0, default_branch TEXT, name TEXT NOT NULL, full_name TEXT NOT NULL, description TEXT, language TEXT, stars INTEGER DEFAULT 0, forks INTEGER DEFAULT 0, open_issues INTEGER DEFAULT 0, open_issues_only INTEGER, open_pull_requests INTEGER, topics TEXT DEFAULT '[]', homepage TEXT, is_fork INTEGER DEFAULT 0, pinned INTEGER DEFAULT 0, created_at TEXT, updated_at TEXT, pushed_at TEXT, fetched_at TEXT NOT NULL DEFAULT NOW()); CREATE UNIQUE INDEX IF NOT EXISTS idx_github_repos_uniq ON github_repos(account_id, repo_id); CREATE INDEX IF NOT EXISTS idx_github_repos_instance_github_id ON github_repos(instance, github_id); CREATE INDEX IF NOT EXISTS idx_github_repos_instance_node_id ON github_repos(instance, node_id)` },
  { table: "github_sources", sql: `CREATE TABLE IF NOT EXISTS github_sources (id SERIAL PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id), source_type TEXT NOT NULL, login TEXT NOT NULL, github_id BIGINT, node_id TEXT, enabled INTEGER NOT NULL DEFAULT 1, last_discovered_at TEXT, last_success_at TEXT, last_error TEXT, created_at TEXT NOT NULL DEFAULT NOW(), updated_at TEXT NOT NULL DEFAULT NOW()); CREATE UNIQUE INDEX IF NOT EXISTS idx_github_sources_account_type_login ON github_sources(account_id, source_type, login); CREATE INDEX IF NOT EXISTS idx_github_sources_account_enabled ON github_sources(account_id, enabled)` },
  { table: "github_repository_tracking", sql: `CREATE TABLE IF NOT EXISTS github_repository_tracking (id SERIAL PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id), repository_id INTEGER NOT NULL REFERENCES github_repos(id), enabled INTEGER NOT NULL DEFAULT 1, pinned INTEGER NOT NULL DEFAULT 0, first_seen_at TEXT NOT NULL DEFAULT NOW(), last_seen_at TEXT, last_synced_at TEXT, last_access_ok_at TEXT, last_error TEXT, created_at TEXT NOT NULL DEFAULT NOW(), updated_at TEXT NOT NULL DEFAULT NOW()); CREATE UNIQUE INDEX IF NOT EXISTS idx_github_tracking_account_repository ON github_repository_tracking(account_id, repository_id); CREATE INDEX IF NOT EXISTS idx_github_tracking_account_enabled ON github_repository_tracking(account_id, enabled); CREATE INDEX IF NOT EXISTS idx_github_tracking_repository ON github_repository_tracking(repository_id)` },
  { table: "github_contributions", sql: `CREATE TABLE IF NOT EXISTS github_contributions (id SERIAL PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id), date TEXT NOT NULL, count INTEGER DEFAULT 0, level INTEGER DEFAULT 0, fetched_at TEXT NOT NULL DEFAULT NOW()); CREATE UNIQUE INDEX IF NOT EXISTS idx_github_contributions_uniq ON github_contributions(account_id, date)` },
  { table: "github_repo_snapshots", sql: `CREATE TABLE IF NOT EXISTS github_repo_snapshots (id SERIAL PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id), repo_id INTEGER NOT NULL, repository_id INTEGER REFERENCES github_repos(id), stars INTEGER NOT NULL, forks INTEGER DEFAULT 0, open_issues INTEGER DEFAULT 0, open_issues_only INTEGER, open_pull_requests INTEGER, snapshot_date TEXT NOT NULL); CREATE UNIQUE INDEX IF NOT EXISTS idx_github_repo_snapshots_uniq ON github_repo_snapshots(account_id, repo_id, snapshot_date); CREATE INDEX IF NOT EXISTS idx_github_repo_snapshots_repository_id ON github_repo_snapshots(repository_id)` },
  { table: "github_traffic_clones", sql: `CREATE TABLE IF NOT EXISTS github_traffic_clones (id SERIAL PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id), repo_id INTEGER NOT NULL, repository_id INTEGER REFERENCES github_repos(id), date TEXT NOT NULL, count INTEGER DEFAULT 0, uniques INTEGER DEFAULT 0); CREATE UNIQUE INDEX IF NOT EXISTS idx_github_traffic_clones_uniq ON github_traffic_clones(account_id, repo_id, date); CREATE INDEX IF NOT EXISTS idx_github_traffic_clones_repository_id ON github_traffic_clones(repository_id)` },
  { table: "github_traffic_views", sql: `CREATE TABLE IF NOT EXISTS github_traffic_views (id SERIAL PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id), repo_id INTEGER NOT NULL, repository_id INTEGER REFERENCES github_repos(id), date TEXT NOT NULL, count INTEGER DEFAULT 0, uniques INTEGER DEFAULT 0); CREATE UNIQUE INDEX IF NOT EXISTS idx_github_traffic_views_uniq ON github_traffic_views(account_id, repo_id, date); CREATE INDEX IF NOT EXISTS idx_github_traffic_views_repository_id ON github_traffic_views(repository_id)` },
  { table: "github_referrers", sql: `CREATE TABLE IF NOT EXISTS github_referrers (id SERIAL PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id), repo_id INTEGER NOT NULL, repository_id INTEGER REFERENCES github_repos(id), referrer TEXT NOT NULL, count INTEGER DEFAULT 0, uniques INTEGER DEFAULT 0, snapshot_date TEXT NOT NULL DEFAULT CURRENT_DATE); CREATE UNIQUE INDEX IF NOT EXISTS idx_github_referrers_uniq ON github_referrers(account_id, repo_id, referrer, snapshot_date); CREATE INDEX IF NOT EXISTS idx_github_referrers_repository_id ON github_referrers(repository_id)` },
  { table: "github_paths", sql: `CREATE TABLE IF NOT EXISTS github_paths (id SERIAL PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id), repo_id INTEGER NOT NULL, repository_id INTEGER REFERENCES github_repos(id), path TEXT NOT NULL, title TEXT, count INTEGER DEFAULT 0, uniques INTEGER DEFAULT 0, snapshot_date TEXT NOT NULL DEFAULT CURRENT_DATE); CREATE UNIQUE INDEX IF NOT EXISTS idx_github_paths_uniq ON github_paths(account_id, repo_id, path, snapshot_date); CREATE INDEX IF NOT EXISTS idx_github_paths_repository_id ON github_paths(repository_id)` },
  { table: "github_releases", sql: `CREATE TABLE IF NOT EXISTS github_releases (id SERIAL PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id), repo_id INTEGER NOT NULL, repository_id INTEGER REFERENCES github_repos(id), release_id INTEGER NOT NULL, tag_name TEXT, name TEXT, body TEXT, prerelease INTEGER DEFAULT 0, published_at TEXT, html_url TEXT, total_downloads INTEGER DEFAULT 0, fetched_at TEXT NOT NULL DEFAULT NOW()); CREATE UNIQUE INDEX IF NOT EXISTS idx_github_releases_uniq ON github_releases(account_id, repo_id, release_id); CREATE INDEX IF NOT EXISTS idx_github_releases_repository_id ON github_releases(repository_id)` },
  { table: "github_release_asset_snapshots", sql: `CREATE TABLE IF NOT EXISTS github_release_asset_snapshots (id SERIAL PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id), repo_id INTEGER NOT NULL, repository_id INTEGER REFERENCES github_repos(id), release_id INTEGER NOT NULL REFERENCES github_releases(id), asset_name TEXT NOT NULL, download_count INTEGER DEFAULT 0, snapshot_date TEXT NOT NULL, recorded_at TEXT NOT NULL DEFAULT NOW()); CREATE UNIQUE INDEX IF NOT EXISTS idx_github_release_asset_snapshots_uniq ON github_release_asset_snapshots(release_id, asset_name, snapshot_date); CREATE INDEX IF NOT EXISTS idx_github_release_asset_snapshots_repository_id ON github_release_asset_snapshots(repository_id)` },
  { table: "github_release_assets", sql: `CREATE TABLE IF NOT EXISTS github_release_assets (id SERIAL PRIMARY KEY, release_id INTEGER NOT NULL REFERENCES github_releases(id), name TEXT NOT NULL, download_count INTEGER DEFAULT 0, size INTEGER DEFAULT 0, content_type TEXT, browser_download_url TEXT)` },
  { table: "gitlab_stats", sql: `CREATE TABLE IF NOT EXISTS gitlab_stats (id SERIAL PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id), public_projects INTEGER DEFAULT 0, followers INTEGER NOT NULL, following INTEGER NOT NULL, recorded_at TEXT NOT NULL DEFAULT NOW())` },
  { table: "gitlab_projects", sql: `CREATE TABLE IF NOT EXISTS gitlab_projects (id SERIAL PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id), project_id INTEGER NOT NULL, name TEXT NOT NULL, path_with_namespace TEXT NOT NULL, description TEXT, language TEXT, stars INTEGER DEFAULT 0, forks INTEGER DEFAULT 0, open_issues INTEGER DEFAULT 0, topics TEXT DEFAULT '[]', homepage TEXT, is_fork INTEGER DEFAULT 0, pinned INTEGER DEFAULT 0, visibility TEXT DEFAULT 'public', created_at TEXT, updated_at TEXT, last_activity_at TEXT, fetched_at TEXT NOT NULL DEFAULT NOW()); CREATE UNIQUE INDEX IF NOT EXISTS idx_gitlab_projects_uniq ON gitlab_projects(account_id, project_id)` },
  { table: "gitlab_project_snapshots", sql: `CREATE TABLE IF NOT EXISTS gitlab_project_snapshots (id SERIAL PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id), project_id INTEGER NOT NULL, stars INTEGER NOT NULL, forks INTEGER DEFAULT 0, open_issues INTEGER DEFAULT 0, snapshot_date TEXT NOT NULL); CREATE UNIQUE INDEX IF NOT EXISTS idx_gitlab_project_snapshots_uniq ON gitlab_project_snapshots(account_id, project_id, snapshot_date)` },
  { table: "gitlab_releases", sql: `CREATE TABLE IF NOT EXISTS gitlab_releases (id SERIAL PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id), project_id INTEGER NOT NULL, release_tag TEXT NOT NULL, name TEXT, description TEXT, released_at TEXT, created_at TEXT, fetched_at TEXT NOT NULL DEFAULT NOW()); CREATE UNIQUE INDEX IF NOT EXISTS idx_gitlab_releases_uniq ON gitlab_releases(account_id, project_id, release_tag)` },
  { table: "gitlab_release_assets", sql: `CREATE TABLE IF NOT EXISTS gitlab_release_assets (id SERIAL PRIMARY KEY, release_id INTEGER NOT NULL REFERENCES gitlab_releases(id), name TEXT NOT NULL, download_count INTEGER DEFAULT 0, size INTEGER DEFAULT 0, file_type TEXT, url TEXT)` },
  { table: "gitlab_contributions", sql: `CREATE TABLE IF NOT EXISTS gitlab_contributions (id SERIAL PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id), date TEXT NOT NULL, count INTEGER DEFAULT 0, fetched_at TEXT NOT NULL DEFAULT NOW()); CREATE UNIQUE INDEX IF NOT EXISTS idx_gitlab_contributions_uniq ON gitlab_contributions(account_id, date)` },
  { table: "reddit_stats", sql: `CREATE TABLE IF NOT EXISTS reddit_stats (id SERIAL PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id), post_karma INTEGER NOT NULL, comment_karma INTEGER NOT NULL, recorded_at TEXT NOT NULL DEFAULT NOW()); CREATE INDEX IF NOT EXISTS idx_reddit_stats_account_id ON reddit_stats(account_id)` },
  { table: "reddit_posts", sql: `CREATE TABLE IF NOT EXISTS reddit_posts (id TEXT PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id), title TEXT NOT NULL, selftext TEXT NOT NULL DEFAULT '', subreddit TEXT NOT NULL, score INTEGER DEFAULT 0, upvote_ratio DOUBLE PRECISION DEFAULT 0, num_comments INTEGER DEFAULT 0, permalink TEXT NOT NULL, url TEXT DEFAULT '', is_self INTEGER DEFAULT 0, created_utc INTEGER NOT NULL, fetched_at TEXT NOT NULL DEFAULT NOW()); CREATE INDEX IF NOT EXISTS idx_reddit_posts_account_id ON reddit_posts(account_id); CREATE INDEX IF NOT EXISTS idx_reddit_posts_created_utc ON reddit_posts(created_utc)` },
  { table: "reddit_comments", sql: `CREATE TABLE IF NOT EXISTS reddit_comments (id TEXT PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id), body TEXT NOT NULL, subreddit TEXT NOT NULL, score INTEGER DEFAULT 0, link_id TEXT NOT NULL, parent_id TEXT, depth INTEGER DEFAULT 0, permalink TEXT NOT NULL, created_utc INTEGER NOT NULL, is_submitter INTEGER DEFAULT 0, fetched_at TEXT NOT NULL DEFAULT NOW()); CREATE INDEX IF NOT EXISTS idx_reddit_comments_account_id ON reddit_comments(account_id)` },
  { table: "ai_quota", sql: `CREATE TABLE IF NOT EXISTS ai_quota (user_id INTEGER PRIMARY KEY REFERENCES users(id), tokens INTEGER NOT NULL DEFAULT 0, period_date TEXT NOT NULL DEFAULT CURRENT_DATE)` },
];

export function getSchemaTableNames(): string[] {
  return SCHEMA.map(({ table }) => table);
}

export async function createMissingTables(pool: Pool = getPgPool()!): Promise<void> {
  const { rows: existing } = await pool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
  );
  const existingSet = new Set(existing.map((r: { table_name: string }) => r.table_name));
  const created: string[] = [];
  for (const { table, sql } of SCHEMA) {
    if (!existingSet.has(table)) {
      await pool.query(sql);
      created.push(table);
    }
  }
  if (created.length > 0) {
    console.log(`[Bootstrap] Created ${created.length} table(s): ${created.join(", ")}`);
  }
}

const SCHEMA_COLUMNS = [
  { table: "github_repos", ddl: "ADD COLUMN IF NOT EXISTS github_id BIGINT" },
  { table: "github_repos", ddl: "ADD COLUMN IF NOT EXISTS node_id TEXT" },
  { table: "github_repos", ddl: "ADD COLUMN IF NOT EXISTS instance TEXT NOT NULL DEFAULT 'github.com'" },
  { table: "github_repos", ddl: "ADD COLUMN IF NOT EXISTS owner_github_id BIGINT" },
  { table: "github_repos", ddl: "ADD COLUMN IF NOT EXISTS owner_node_id TEXT" },
  { table: "github_repos", ddl: "ADD COLUMN IF NOT EXISTS owner_login TEXT" },
  { table: "github_repos", ddl: "ADD COLUMN IF NOT EXISTS owner_type TEXT" },
  { table: "github_repos", ddl: "ADD COLUMN IF NOT EXISTS html_url TEXT" },
  { table: "github_repos", ddl: "ADD COLUMN IF NOT EXISTS is_private INTEGER DEFAULT 0" },
  { table: "github_repos", ddl: "ADD COLUMN IF NOT EXISTS is_archived INTEGER DEFAULT 0" },
  { table: "github_repos", ddl: "ADD COLUMN IF NOT EXISTS default_branch TEXT" },
  { table: "github_repo_snapshots", ddl: "ADD COLUMN IF NOT EXISTS repository_id INTEGER REFERENCES github_repos(id)" },
  { table: "github_traffic_clones", ddl: "ADD COLUMN IF NOT EXISTS repository_id INTEGER REFERENCES github_repos(id)" },
  { table: "github_traffic_views", ddl: "ADD COLUMN IF NOT EXISTS repository_id INTEGER REFERENCES github_repos(id)" },
  { table: "github_referrers", ddl: "ADD COLUMN IF NOT EXISTS repository_id INTEGER REFERENCES github_repos(id)" },
  { table: "github_paths", ddl: "ADD COLUMN IF NOT EXISTS repository_id INTEGER REFERENCES github_repos(id)" },
  { table: "github_releases", ddl: "ADD COLUMN IF NOT EXISTS repository_id INTEGER REFERENCES github_repos(id)" },
  { table: "github_release_asset_snapshots", ddl: "ADD COLUMN IF NOT EXISTS repository_id INTEGER REFERENCES github_repos(id)" },
  { table: "github_repos", ddl: "ADD COLUMN IF NOT EXISTS open_issues_only INTEGER" },
  { table: "github_repos", ddl: "ADD COLUMN IF NOT EXISTS open_pull_requests INTEGER" },
  { table: "github_repo_snapshots", ddl: "ADD COLUMN IF NOT EXISTS open_issues_only INTEGER" },
  { table: "github_repo_snapshots", ddl: "ADD COLUMN IF NOT EXISTS open_pull_requests INTEGER" },
];

async function ensureSchemaColumns(pool: Pool = getPgPool()!): Promise<void> {
  for (const { table, ddl } of SCHEMA_COLUMNS) {
    await pool.query(`ALTER TABLE ${table} ${ddl}`);
  }
  await pool.query("CREATE INDEX IF NOT EXISTS idx_github_repos_instance_github_id ON github_repos(instance, github_id)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_github_repos_instance_node_id ON github_repos(instance, node_id)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_github_repo_snapshots_repository_id ON github_repo_snapshots(repository_id)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_github_traffic_clones_repository_id ON github_traffic_clones(repository_id)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_github_traffic_views_repository_id ON github_traffic_views(repository_id)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_github_referrers_repository_id ON github_referrers(repository_id)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_github_paths_repository_id ON github_paths(repository_id)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_github_releases_repository_id ON github_releases(repository_id)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_github_release_asset_snapshots_repository_id ON github_release_asset_snapshots(repository_id)");
}

/**
 * Purely additive compatibility backfill. It copies the already persisted
 * external id into the new identity column and creates tracking rows. It does
 * not call GitHub, delete rows, or change any metric/history table.
 */
async function backfillGithubIdentityAndTracking(): Promise<void> {
  const pool = getPgPool()!;
  await pool.query(`UPDATE github_repos SET github_id = repo_id WHERE github_id IS NULL`);
  await pool.query(`
    INSERT INTO github_repository_tracking
      (account_id, repository_id, enabled, pinned, first_seen_at, last_seen_at, created_at, updated_at)
    SELECT r.account_id, r.id, 1, COALESCE(r.pinned, 0), NOW()::text, r.fetched_at::text, NOW()::text, NOW()::text
    FROM github_repos r
    ON CONFLICT (account_id, repository_id) DO NOTHING
  `);
  const metricTables = [
    "github_repo_snapshots",
    "github_traffic_clones",
    "github_traffic_views",
    "github_referrers",
    "github_paths",
    "github_releases",
  ];
  for (const table of metricTables) {
    await pool.query(`
      UPDATE ${table} m
      SET repository_id = r.id
      FROM github_repos r
      WHERE m.repository_id IS NULL
        AND m.account_id = r.account_id
        AND m.repo_id = r.repo_id
    `);
  }
  await pool.query(`
    UPDATE github_release_asset_snapshots a
    SET repository_id = COALESCE(rel.repository_id, repo.id)
    FROM github_releases rel
    LEFT JOIN github_repos repo
      ON repo.account_id = rel.account_id AND repo.repo_id = rel.repo_id
    WHERE a.repository_id IS NULL
      AND a.release_id = rel.id
  `);
}

// ═══════════════════════════════════════════════════════════════════
// Admin user
// ═══════════════════════════════════════════════════════════════════

async function bootstrapAdminUser(): Promise<void> {
  const pool = getPgPool()!;
  const cfg = loadConfig();

  const { rows } = await pool.query(
    "SELECT id FROM users WHERE username = 'admin' AND deleted_at IS NULL"
  );
  if (rows.length > 0) return;

  // Use the same npm argon2 package that login verification uses
  // (lib/auth.ts verifyPassword). `bun`'s argon2 is not available in the
  // production Node container, which previously made bootstrap throw.
  const argon2 = await import("argon2");

  let pwHash: string;
  let generated: string | null = null;

  if (cfg.passwordHash) {
    pwHash = cfg.passwordHash;
  } else {
    const { randomBytes } = await import("crypto");
    generated = randomBytes(12).toString("base64url");
    pwHash = await argon2.hash(generated);
  }

  await pool.query(
    "INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3)",
    ["admin", pwHash, "admin"]
  );

  if (generated) {
    const protocol = cfg.https ? "https" : "http";
    const host = cfg.host;
    const port = cfg.port;
    const url = `${protocol}://${host}${port === 443 || port === 80 ? "" : `:${port}`}/login`;

    console.log("");
    console.log("╔══════════════════════════════════════════════════════╗");
    console.log("║  🔐  Initial admin password                         ║");
    console.log("║     Change it after your first login.               ║");
    console.log("║                                                      ║");
    console.log(`║  Username: admin                                     ║`);
    console.log(`║  Password: ${generated.padEnd(41)}║`);
    console.log("║                                                      ║");
    console.log(`║  Login:   ${url.padEnd(43)}║`);
    console.log("╚══════════════════════════════════════════════════════╝");
    console.log("");
  }
}

// ═══════════════════════════════════════════════════════════════════
// Re-encrypt plaintext auth tokens (backwards compatibility)
// ═══════════════════════════════════════════════════════════════════

async function reEncryptPlaintextTokens(): Promise<void> {
  const pool = getPgPool()!;
  const { rows } = await pool.query(
    "SELECT id, screen_name, platform, auth_token FROM accounts WHERE deleted_at IS NULL"
  );

  let fixed = 0;
  for (const row of rows) {
    try {
      decrypt(row.auth_token);
    } catch (error) {
      // A failed decrypt can mean the key changed, not that the value is
      // plaintext. Never overwrite a value that has an encrypted envelope;
      // doing so would destroy the only copy of a credential we can recover.
      if (isEncryptedCredential(row.auth_token)) {
        console.warn(
          `[Bootstrap] Could not decrypt encrypted token for ${row.platform}:${row.screen_name} (id=${row.id}); leaving it unchanged`,
          error instanceof Error ? error.message : String(error),
        );
        continue;
      }
      const encrypted = encrypt(row.auth_token);
      await pool.query("UPDATE accounts SET auth_token = $1 WHERE id = $2", [encrypted, row.id]);
      console.log(`[Bootstrap] Re-encrypted token for ${row.platform}:${row.screen_name} (id=${row.id})`);
      fixed++;
    }
  }

  if (fixed > 0) {
    console.log(`[Bootstrap] Re-encrypted ${fixed} plaintext token(s)`);
  }
}
