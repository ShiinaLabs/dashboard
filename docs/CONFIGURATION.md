# Configuration

All configuration is via environment variables. There is no filesystem config file: the legacy `data/config.json` is no longer read by any code.

Copy `.env.example` to `.env` and fill in `DASHBOARD_SECRET`:

```bash
cp .env.example .env
# Edit .env, set DASHBOARD_SECRET=$(openssl rand -hex 32)
```

## Required

| Variable | Description | Example |
|----------|-------------|---------|
| `DASHBOARD_SECRET` | 64-char hex string for AES-256-GCM encryption and JWT signing | `openssl rand -hex 32` |

## Server

| Variable | Default | Description |
|----------|---------|-------------|
| `HOST` | `0.0.0.0` | Bind address (legacy config; the production server binds all interfaces) |
| `PORT` | `3000` | Listen port — `server/index.mjs` uses `Number(process.env.PORT \|\| 3000)` |
| `HTTPS` | `false` | Set `true` to mark session cookies `Secure` and use `https://` in the bootstrap login URL (does not terminate TLS itself) |
| `DATA_DIR` | `./data` | Root data directory (logs, legacy SQLite db/dumps) |
| `NODE_ENV` | — | Set `production` for prod mode |

## Browser API

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_BASE_URL` | `/api` | Build-time API root used by the browser transport. Set to a full API root such as `https://api.example.com/api` only when the target deployment has separately configured compatible authentication and CORS. |

## Database

The app uses PostgreSQL via Drizzle ORM + `pg` driver. SQLite is legacy only.

**Option A: `DATABASE_URL`** (takes priority)

```
DATABASE_URL=postgresql://user:password@host:5432/dbname
```

**Option B: Individual variables**

| Variable | Default | Description |
|----------|---------|-------------|
| `PG_HOST` | `localhost` | PostgreSQL host |
| `PG_PORT` | `5432` | PostgreSQL port |
| `PG_DB` | `dashboard` | Database name |
| `PG_USER` | `dashboard` | Database user |
| `PG_PASSWORD` | `""` | Database password |

## Auth

| Variable | Default | Description |
|----------|---------|-------------|
| `ADMIN_PASSWORD_HASH` | `""` | Argon2id hash used when bootstrapping the initial `admin` user. If empty, a random password is generated and printed to the console on first bootstrap |

## CORS

| Variable | Default | Description |
|----------|---------|-------------|
| `ALLOWED_ORIGINS` | `""` | Comma-separated allowed origins. The production server sets `Access-Control-Allow-Origin` on `/api/*` responses to this value (or `*` when unset) |

## Logging

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_DIR` | `data/logs` | Log file directory |
| `LOG_LEVEL` | `info` | Level: `trace`, `debug`, `info`, `warn`, `error`, `fatal` |
| `LOG_MAX_SIZE` | `10m` | Max size per log file before rotation |
| `LOG_MAX_FILES` | `5` | Number of rotated log files to keep |

## Fetcher Window

| Variable | Default | Description |
|----------|---------|-------------|
| `TWEET_WINDOW_DAYS` | `90` | Content older than this window is not discovered/fetched/recomputed (shared by X and Reddit fetchers) |

## Proxy

| Variable | Description |
|----------|-------------|
| `HTTPS_PROXY` | HTTPS proxy for outbound requests (X.com, GitLab, etc.) |
| `HTTP_PROXY` | HTTP proxy for outbound requests |

## TLS

| Variable | Default | Description |
|----------|---------|-------------|
| `TLS_REJECT_UNAUTHORIZED` | `true` | Set `false` for self-signed certs (private GitLab, MITM proxies) |

## Reddit OAuth

| Variable | Description |
|----------|-------------|
| `REDDIT_CLIENT_ID` | Reddit API client ID (for OAuth mode) |
| `REDDIT_CLIENT_SECRET` | Reddit API client secret |

### AI Analysis (optional)

| Variable | Description |
|----------|-------------|
| `AI_BASE_URL` | LLM API base URL (e.g., `https://api.openai.com/v1`) |
| `AI_API_KEY` | LLM API key |
| `AI_MODEL` | Model name (default: `gpt-4o-mini`) |
| `AI_DAILY_TOKEN_LIMIT` | Per-user daily token limit (default: `100000`) |

AI settings can also be configured via the admin Settings page after deployment.

### Web Analytics spike (optional)

| Variable | Description |
|----------|-------------|
| `CLOUDFLARE_ANALYTICS_ACCOUNT_ID` | Cloudflare account that owns the Analytics Engine dataset |
| `CLOUDFLARE_ANALYTICS_API_TOKEN` | Server-side API token with Account Analytics Read permission |
| `CLOUDFLARE_ANALYTICS_DATASET` | Analytics Engine dataset name (SQL identifier) |
| `CLOUDFLARE_ANALYTICS_SITE_ID` | Site key stored in the dataset's `blob1` field |

When all four variables are set, `/analytics` queries the configured site's views, visitors, and visits for the last seven days. `pnpm run mock` uses local fixture values and does not contact Cloudflare.

## Mock / Debug Mode

| Variable | Description |
|----------|-------------|
| `MOCK_DATA` | Set to `1`/`true`/`yes`/`on` to serve fixture data from `lib/mock`, skipping PostgreSQL and real auth. Dev/debug only — never in production |
| `NEXT_PUBLIC_MOCK_DATA` | Build-time mirror used by the client to show the "MOCK MODE" banner (`vite.config.ts` inlines it via `define`) |

`pnpm run mock` sets both.

## Scripts

| Variable | Description |
|----------|-------------|
| `AUTH_TOKEN` | X auth token for `scripts/dump-x-data.ts` / `scripts/test-fetch-algorithm.ts` |
| `GET_ID_X_TOKEN` | X guest token for the same scripts |

## Build Memory

The client and server bundles are built in separate bounded passes (`build:client` with `RR_SKIP_SSR=1`, `build:server` with `RR_SKIP_CLIENT=1`), each with a constrained Node heap (`NODE_OPTIONS=--max-old-space-size=… --max-semi-space-size=8`) to keep CI memory usage under control. See [DEPLOYMENT.md](DEPLOYMENT.md).
