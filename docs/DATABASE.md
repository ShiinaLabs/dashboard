# Database

PostgreSQL database, accessed via Drizzle ORM (`drizzle-orm/node-postgres`) with the `pg` driver. The old SQLite (`data/db/dashboard.db`) is legacy only: it is no longer read for queries, and the SQLite → PostgreSQL import is disabled in the Node runtime.

## Connection

`lib/db/connection.ts` owns the database connection:

- `initPgPool()` — creates a shared `pg` `Pool` (max 5 connections) from config, verifies connectivity
- `getDb()` — returns a cached Drizzle instance wrapping the pool (singleton, survives module identity splits via `globalThis`)
- `closeDb()` — ends the pool (used by tests)

Config comes from `DATABASE_URL` (priority) or individual `PG_*` variables; see [CONFIGURATION.md](CONFIGURATION.md).

## Schema Files

All Drizzle ORM schemas live in `db/schema/` and are re-exported from `db/schema/index.ts`:

| File | Tables |
|------|--------|
| `users.ts` | `users` |
| `accounts.ts` | `accounts` |
| `fetch-runs.ts` | `fetch_runs` |
| `twitter.ts` | `tweets`, `user_stats` |
| `github.ts` | `github_stats`, `github_repos`, `github_repo_snapshots`, `github_traffic_clones`, `github_traffic_views`, `github_referrers`, `github_paths`, `github_releases`, `github_release_assets`, `github_contributions` |
| `gitlab.ts` | `gitlab_stats`, `gitlab_projects`, `gitlab_project_snapshots`, `gitlab_releases`, `gitlab_release_assets`, `gitlab_contributions` |
| `reddit.ts` | `reddit_stats`, `reddit_posts`, `reddit_comments` |
| `settings.ts` | `settings` |

## Query Layer

Database access is organized in three layers:

- **Repositories** (`lib/repositories/`) — Drizzle query functions per domain (users, accounts, twitter, github, gitlab, reddit, settings). Each file exports typed query functions.
- **Services** (`lib/services/`) — Business logic that orchestrates repository calls. Handles multi-user isolation, validation, and cross-domain operations.
- **Connection** (`lib/db/connection.ts`) — Singleton pool + Drizzle client factory. `getDb()` returns a cached instance.

`lib/db.ts` re-exports all repositories for convenience.

## Bootstrap & Migrations

Migrations are idempotent `CREATE TABLE IF NOT EXISTS` statements executed by `bootstrap()` in `lib/setup.ts`. Bootstrap runs lazily on the first request via `app/auth-middleware.server.ts` (once per process). It:

1. Parses config and validates `DASHBOARD_SECRET`
2. Creates the PostgreSQL pool and verifies connectivity
3. Creates any missing tables from the schema list (indexes included in the DDL)
4. Adds idempotent missing columns required by newer releases
5. Checks for a legacy SQLite file — if found without a migration flag, logs a warning and skips (the old `bun:sqlite` import is not available in the Node runtime)
6. Re-encrypts only legacy plaintext `auth_token` values that are distinguishable
   from encrypted envelopes; values that look encrypted but cannot be decrypted
   are left untouched so a changed key cannot destroy recoverable ciphertext
7. Bootstraps the `admin` user if it does not exist (using `ADMIN_PASSWORD_HASH` if set, otherwise a generated random password printed to the console)

`db/migrate.ts` exists only as a backward-compat re-export of `bootstrap()`.

## Adding a new table

1. Create a Drizzle schema file in `db/schema/`
2. Export it from `db/schema/index.ts`
3. Add the `CREATE TABLE IF NOT EXISTS` DDL to the `SCHEMA` list in `lib/setup.ts` so existing deployments pick it up
4. Add a repository in `lib/repositories/`

## Adding Columns To Existing Tables

1. Add the column to the Drizzle schema and the matching bootstrap/test DDL.
2. Add an idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` entry to `ensureSchemaColumns()` in `lib/setup.ts`.
3. Use nullable columns when existing rows have no authoritative value; do not use zero for unknown data.

## Key Conventions

- **Primary keys** — `serial("id").primaryKey()` (auto-increment integer)
- **Timestamps** — `text` type with `NOW()` as the default value
- **Soft-delete** — nullable `deleted_at` text column; list queries filter `deleted_at IS NULL`
- **Unique constraints** — per-platform natural keys (e.g. `owner_id + screen_name + platform` for accounts, `account_id + tweet_id`, `account_id + repo_id`)
- **Connection pool** — one shared `pg` pool (max 5), never per-request connections

## Multi-User Isolation

The `owner_id` column on `accounts` links to `users.id`. All account queries filter by `owner_id` for non-admin users. Admin users (role=`admin`) see all accounts.

## Soft-Delete Pattern

```sql
-- Delete: mark as deleted
UPDATE users SET deleted_at = NOW() WHERE id = $1;

-- List: exclude deleted
SELECT * FROM users WHERE deleted_at IS NULL;

-- Revive: clear deleted_at
UPDATE users SET deleted_at = NULL WHERE id = $1;
```

`getUserByUsername` and `getUserById` both filter with `deleted_at IS NULL`. Reviving a soft-deleted user on re-creation is handled in `createUser()`.

## Fetch Runs

`fetch_runs` records one row per dispatch. `started_at` is the attempt time; `finished_at`, `status`, duration, and error details describe the outcome. `capability_gaps` stores a JSON array for optional capabilities that could not be collected (for example GitHub traffic without sufficient PAT scope). Health queries use these records instead of treating `accounts.last_fetched_at` as a success time.

## Tests

Unit/integration tests use a separate database (default `dashboard_test`) and
re-create all tables from the runtime bootstrap schema via `tests/setup.ts` +
`tests/migrate-helper.ts`. See [TESTING.md](TESTING.md).
