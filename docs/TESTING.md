# Testing

## Running Tests

```bash
pnpm test
```

Runs `vitest run` against the test suite in `tests/`. Config lives in `vitest.config.ts` (resolves the `@/` alias to the project root).

## Test Files

| File | Coverage | Description |
|------|----------|-------------|
| `auth.test.ts` | JWT session tokens | Create, verify, reject expired/tampered/malformed tokens |
| `crypto.test.ts` | Encryption & signing | AES-256-GCM encrypt/decrypt, HMAC sign/verify, JWT secret |
| `db-queries.test.ts` | Database queries | Users, accounts, Twitter, Reddit, GitHub, GitLab CRUD + fetch-run outcomes |
| `fetch-health.test.ts` | Fetch health aggregation | Status classification, summaries, issue ordering, failure streaks, and next-due times |
| `pulse.test.ts` | Business Pulse aggregation | Metric deltas, platform summaries, content/repository rankings, incomplete-sample handling |
| `release-asset-filter.test.ts` | Release filtering | Filter release assets by platform, sum downloads |
| `github-latest-snapshot.test.ts` | GitHub snapshots | Latest snapshot resolution logic |
| `scheduler.test.ts` | Scheduler | Per-platform dispatch, cooldowns, and cycle guards (mocked fetchers) |
| `logger.test.ts` | Logging | File logger rotation and level filtering |
| `mobile-layout.test.tsx` | Responsive UI contracts | SSR-rendered components satisfy mobile touch/width contracts |
| `traffic-metric-list.test.tsx` | GitHub traffic UI | Traffic metric list rendering |
| `x-follower-growth-chart.test.tsx` | X chart UI | Follower growth chart rendering |

## Setup

- `setup.ts` — creates a test PostgreSQL pool (`getTestPool()` / `closeTestPool()`), defaults to database `dashboard_test` (override via `PG_DB`), and provides `resetTestDb()` which drops and re-creates all tables from the migration DDL
- `migrate-helper.ts` — `createMissingTables(pool)` with the same `CREATE TABLE IF NOT EXISTS` statements used by `lib/setup.ts`

Tests use `vitest` with `describe`, `it`, `expect`.

## What's Tested

### Auth (`auth.test.ts`)
- JWT token creation and verification
- Expired token rejection
- Wrong key rejection
- Malformed token rejection
- Tampered token rejection

### Crypto (`crypto.test.ts`)
- AES-256-GCM encrypt/decrypt roundtrip
- IV randomization (different ciphertexts for same plaintext)
- Corrupted/truncated ciphertext rejection
- HMAC sign/verify roundtrip
- Forged signature rejection
- JWT secret format validation

### Database (`db-queries.test.ts`)
- User CRUD (create, find, list, soft-delete, revive)
- Account CRUD (create, list, get by ID, soft-delete)
- Twitter queries (insert stats, upsert tweet, retrieve tweets)
- Reddit queries (insert stats, upsert post/comment, retrieve)
- GitHub queries (insert stats, upsert contribution, retrieve)
- GitLab queries (insert stats, upsert contribution, retrieve)

### Scheduler (`scheduler.test.ts`)
- Round-robin platform dispatch
- Per-platform cooldown enforcement
- Single-cycle concurrency guard

### Fetch health (`fetch-health.test.ts`)
- Healthy, stale, failed, partial, capability-gap, and running classifications
- Summary counts and severity-ordered issues
- Consecutive-failure counts and interval-based next-due timestamps

### Business Pulse (`pulse.test.ts`)
- Signed metric deltas
- Cross-platform activity totals and per-platform audience summaries
- Repository/project star-change ranking and internal routes
- Exclusion of accounts that lack a complete current/previous sample pair

## Adding Tests

1. Create a file in `tests/` following the `*.test.ts` / `*.test.tsx` naming convention
2. Import from `vitest`: `describe`, `it`, `expect`, `beforeAll`, `afterAll`
3. For DB tests, use `setup.ts` helpers (`getTestPool`, `resetTestDb`, `closeTestPool`)
4. Run with `pnpm test`

### Example

```typescript
import { describe, it, expect } from "vitest";

describe("my feature", () => {
  it("does something", () => {
    expect(1 + 1).toBe(2);
  });
});
```

## CI

The GitLab CI test job starts a PostgreSQL 16 service, runs lint and typecheck,
then executes the full `pnpm test` suite against the isolated `dashboard_test`
database. The test helper refuses to run destructive setup against a database
name that is not explicitly marked for tests.
