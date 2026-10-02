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
| `analytics.ts` | `analytics_sites`, `analytics_events` |
| `app-store.ts` | `app_store_connections`, `app_store_apps`, `app_store_sync_runs`, `app_store_analytics_requests`, `app_store_report_imports` |
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

The `owner_id` column on `accounts` links to `users.id`. All account queries filter by `owner_id` for non-admin users. Admin users (role=`admin`) see all accounts. `analytics_sites.owner_id` links to `users.id`; site listings are owner-scoped, `site_key` is globally unique, and sites use soft deletion. `analytics_events` stores normalized page events by `site_id` and `recorded_at`; it does not duplicate the site key or store IP addresses, raw user agents, full referrer URLs, or complete query strings. Its `utm_source`, `utm_medium`, and `utm_campaign` fields default to empty text and contain only normalized values from explicit allow-listed query parameters on `visit = true` entry events. Its only secondary index is `(site_id, recorded_at DESC)`.

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

## App Store Connect

ASC has its own owner-scoped, soft-deleted connections. `app_store_connections` stores the Team API Key's Issuer ID, Key ID and AES-256-GCM encrypted `.p8` private key, plus an optional Vendor Number. Public API objects expose only `private_key_configured`; private keys and encrypted values are excluded. Generated ES256 JWTs are never stored.

`app_store_apps` is unique on `(connection_id, apple_id)`. Newly discovered apps start disabled; metadata upserts preserve the user's selection. Connection creation, app discovery writes and successful sync telemetry commit in one transaction. Credential edits validate Apple access before replacing credentials. Concurrent connection edits or soft deletion prevent a stale sync from committing.

`app_store_sync_runs` reuses kinds `metadata`, `analytics`, `sales` and `finance`, with `running`, `success`, `partial` and `error` statuses. Its nullable `scope` separates acquisition and Revenue Analytics history; existing null Analytics scopes remain acquisition history. Permission failures do not disable a connection. The last successful Apps refresh only considers metadata runs. Failed refreshes preserve apps and credentials. `app_store_analytics_requests` is app-scoped, globally unique by Apple request ID and retains stopped ongoing history.

Typed facts are `app_store_discovery_daily`, `app_store_downloads_daily`, `app_store_purchases_daily`, `app_store_subscription_state_daily` and `app_store_subscription_event_daily`. All retain app/date, source instance, processing date and timestamps; dimensions needed by the current queries use explicit columns. Blank fields remain null and future enum strings remain text. `app_store_report_imports` stores instance/segment/checksum provenance without signed URLs. `app_store_report_partitions` uniquely identifies app/report/date/DAILY, including empty corrected partitions. All segments validate before one transaction replaces eligible whole-day partitions and marks every segment imported. Older or different equal-date instances cannot overwrite newer data; a changed checksum on the same instance can replace its partition. Failed transactions preserve both old facts and provenance.

`app_store_sales_daily` keeps connection, report dates, SKU/item/parent identifiers, product type, territory, Units, per-unit Developer Proceeds and Customer Price with their separate currencies. `app_store_sales_imports` records connection/date/checksum identity, including explicit no-sales responses. `app_store_finance_rows` keeps connection/vendor scope, fiscal month, report region, real fiscal period, vendor/SKU/product identifiers, units, extended earned amount and currency. It has no required app foreign key. `app_store_finance_imports` identifies connection/month/region/checksum. Whole-file replacement and provenance commit atomically.

Money and counts use exact `NUMERIC(38,12)` values and decimal-string arithmetic. Sales proceeds multiply signed Units by per-unit proceeds; customer sales multiply absolute Units by the already-signed Customer Price. Zero-unit/nonzero-price partial refunds yield unknown totals while retaining their raw unit prices. Purchases retain Apple's supplied USD; local FX conversion and cross-currency sums are absent. Finance consolidated `ZZ` reports are the supported final source, avoiding overlapping regional copies. Individual-app Finance queries require a unique exact app/SKU or Sales parent-SKU match; All Apps retains unassigned vendor rows. No ASC tables enter `accounts`, `fetch_runs`, a Product model, EAV dimensions, or cross-source associations.

## Account Fetch Runs

`fetch_runs` records one row per dispatch. `started_at` is the attempt time; `finished_at`, `status`, duration, and error details describe the outcome. `capability_gaps` stores a JSON array for optional capabilities that could not be collected (for example GitHub traffic without sufficient PAT scope). Health queries use these records instead of treating `accounts.last_fetched_at` as a success time.

## Tests

Unit/integration tests use a separate database (default `dashboard_test`) and
re-create all tables from the runtime bootstrap schema via `tests/setup.ts` +
`tests/migrate-helper.ts`. See [TESTING.md](TESTING.md).
