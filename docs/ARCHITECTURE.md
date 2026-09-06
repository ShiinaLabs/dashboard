# Architecture

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Runtime** | Node.js 20 + pnpm |
| **Framework** | React Router 7 (Framework Mode) |
| **Backend** | React Router route handlers under `app/api/` (same process as frontend) |
| **Frontend** | React 19 + TypeScript + Vite |
| **Styling** | Mantine 9.6 theme/components + Tailwind CSS v4 layout utilities |
| **Charts** | Recharts |
| **Icons** | lucide-react |
| **Data Fetching** | @tanstack/react-query |
| **ORM** | Drizzle ORM with `pg` driver |
| **Database** | PostgreSQL |
| **Auth** | JWT (HS256, `jose`) signed session cookies + Argon2id (`argon2`) |
| **Encryption** | AES-256-GCM (credentials at rest) |
| **i18n** | react-i18next (en/zh) |

## Source Layout

```
dashboard/
├── app/                        # React Router Framework Mode (pages + API)
│   ├── root.tsx                # Root layout: html shell, globals.css, Providers
│   ├── routes.ts               # Declarative route table (pages + API)
│   ├── auth-middleware.server.ts  # Session/auth middleware + lazy DB bootstrap
│   ├── providers.tsx           # QueryClientProvider + single MantineProvider + ThemeProvider
│   ├── globals.css             # Mantine layered styles + Tailwind theme/utilities + animations
│   ├── (dashboard)/            # Dashboard layout + pages (overview, accounts, x, github, gitlab, reddit, settings, admin)
│   ├── login/                  # Login page
│   ├── api/                    # API route handlers, one file per endpoint
│   └── catch-all/              # 404 fallbacks for pages (`*`) and API (`api/*`)
├── components/                 # Shared UI components
│   ├── Layout.tsx              # Sidebar + title bar + content shell (responsive)
│   ├── AccountListPage.tsx     # Reusable account list component
│   ├── BrandIcons.tsx          # Platform brand icons
│   ├── domain/shared/          # MetricCard, MetricGrid and data-display components
│   ├── Skeleton.tsx            # Skeleton loading primitives
│   ├── NavigationProgress.tsx  # Top progress bar on route changes
│   ├── NavigatingOverlay.tsx   # Full-screen loading overlay
│   ├── ThemeProvider.tsx       # Theme context provider
│   ├── MockModeBanner.tsx      # MOCK MODE indicator when running on fixtures
│   └── ui/                     # Mantine-backed wrappers and compatibility facades
├── db/
│   ├── schema/                 # Drizzle ORM schema files
│   │   ├── index.ts            # Re-exports all schemas
│   │   ├── users.ts            # users table
│   │   ├── accounts.ts         # accounts table
│   │   ├── twitter.ts          # user_stats, tweets tables
│   │   ├── github.ts           # GitHub tables (stats, repos, snapshots, traffic, releases, contributions)
│   │   ├── gitlab.ts           # GitLab tables (stats, projects, snapshots, releases, contributions)
│   │   ├── reddit.ts           # Reddit tables (stats, posts, comments)
│   │   └── settings.ts         # settings table
│   └── migrate.ts              # Re-exports bootstrap() from lib/setup (backward compat)
├── lib/
│   ├── api.ts                  # Client-side API client + shared type re-exports
│   ├── api-server.ts           # Server helpers: json(), cookieHeader(), getRequestCookie()
│   ├── auth.ts                 # Argon2id password hashing + multi-user verification
│   ├── auth-helpers.ts         # JWT session token create/validate (jose)
│   ├── config.ts               # Env-only config (PORT, DATABASE_URL/PG_*, logging, mock)
│   ├── crypto.ts               # AES-256-GCM encryption, HMAC signing, JWT secret
│   ├── confirm-helpers.ts      # In-memory confirmation tokens (6 chars, 5-min TTL)
│   ├── db.ts                   # Re-exports all repositories
│   ├── db/connection.ts        # PostgreSQL pg pool + Drizzle singleton
│   ├── fetcher.ts              # X (Twitter) fetcher
│   ├── fetchers/               # GitHub, GitLab, Reddit fetchers
│   ├── repositories/           # Drizzle query layer per domain
│   ├── services/               # Business logic (accounts, users)
│   ├── scheduler.ts            # Per-platform dispatch every 60s (round-robin + cooldowns)
│   ├── scheduler-singleton.ts  # ensureScheduler() (start once per process)
│   ├── logger.ts               # Structured file logger with rotation
│   ├── http.ts                 # fetchWithConfig (TLS-configurable wrapper)
│   ├── mock/                   # Fixture data for MOCK_DATA=1 debug mode
│   ├── setup.ts                # bootstrap(): pool, schema, admin seed, token re-encryption
│   └── startup.ts              # Legacy Next.js startup path (bootstrap + logger + scheduler)
├── server/
│   └── index.mjs               # Production entry: node http + @react-router/node + static serving
├── shared/
│   └── types.ts                # Shared TypeScript types (client + server)
├── scripts/                    # Utility scripts (tsx)
├── tests/                      # Vitest test suite
├── locales/                    # i18n (en.json, zh.json)
├── public/                     # Static public assets (favicons)
├── patches/                    # pnpm patch files (@react-router/dev@7.18.2)
└── data/                       # Runtime data (logs, legacy SQLite db/dumps)
```

## Data Flow

```
User clicks "Fetch" (or scheduler ticks)
        │
        ▼
  Scheduler (lib/scheduler.ts) → fetchAccount / fetch*Account
        │
        ▼
  Fetcher (lib/fetcher.ts, lib/fetchers/*.ts)
    → External API (X, GitHub, GitLab, Reddit)
    → Parse + transform
        │
        ▼
  Repository (lib/repositories/*.ts)  ← Drizzle ORM queries
    → PostgreSQL (pg pool)
        │
        ▼
  React Query cache invalidation (client refetches)
        │
        ▼
  Frontend re-render
```

Browser requests flow through `app/auth-middleware.server.ts` (session check + lazy bootstrap) into either:

- **Pages** — React Router route modules under `app/(dashboard)/`, rendered server-side with client hydration
- **API** — route handlers under `app/api/*/route.ts` that call services/repositories directly

## Request Lifecycle (Production)

1. `server/index.mjs` creates a `node:http` server; static assets under `/assets/`, `/favicon.*` are served from `build/client` by the hand-written static handler
2. Everything else goes through `createRequestListener` from `@react-router/node`
3. `app/auth-middleware.server.ts` runs first: it lazily runs `bootstrap()` once per process (idempotent), then enforces auth (public paths pass through, API returns 401, pages redirect to `/login`)
4. API route handlers and page loaders execute within the same process

## Key Patterns

- **Singleton Drizzle client** — `getDb()` in `lib/db/connection.ts` returns a cached drizzle instance wrapping a shared `pg` pool (max 5 connections). No per-request connections.
- **Three-layer architecture** — Route handlers (HTTP) → Services (business logic) → Repositories (data access). Fetchers sit alongside services, called by route handlers or the scheduler.
- **Lazy bootstrap** — `bootstrap()` in `lib/setup.ts` (PostgreSQL pool, missing-table creation, admin seed, plaintext-token re-encryption) is triggered on the first request via `app/auth-middleware.server.ts`, so the production Node server starts without a DB dependency and `MOCK_DATA=1` never touches PostgreSQL.
- **Soft-delete** — All destructive operations set `deleted_at = NOW()` instead of DELETE. List queries filter with `deleted_at IS NULL`. Users with the same username can be revived on re-creation.
- **Confirmation tokens** — Destructive operations (delete account, delete user) require a 6-character random token with 5-minute TTL, stored in an in-memory `Map` (`lib/confirm-helpers.ts`).
- **Encrypted credentials** — Auth tokens and API keys are encrypted with AES-256-GCM before storage (`lib/crypto.ts`). Decrypted in-memory during fetch cycles. `bootstrap()` re-encrypts any legacy plaintext tokens.
- **JWT sessions** — Session tokens are signed JWTs (HS256, `jose`) with 7-day expiry, stored in the `dash_session` httpOnly cookie. Mock mode accepts any token.
- **Per-platform fetchers** — Each platform has an independent fetcher module (X in `lib/fetcher.ts`, GitHub/GitLab/Reddit in `lib/fetchers/`). The scheduler dispatches per-platform with per-platform cooldowns (X 5 min, others 2 min) and a 60s cycle with jitter.
- **Multi-user isolation** — `owner_id` on accounts links to `users.id`. Non-admin users only see their own accounts.
- **Memory-constrained build** — Client and server bundles are built in separate passes (`build:client` with `RR_SKIP_SSR=1`, `build:server` with `RR_SKIP_CLIENT=1`), each with bounded Node heaps, to keep CI memory usage low.
- **Mantine UI system** — `app/providers.tsx` mounts exactly one `MantineProvider` and one `Notifications` host. `lib/client/mantine-theme.ts` bridges all 12 dashboard themes into Mantine tokens while preserving `data-theme` for legacy CSS during migration. Tailwind preflight is disabled; Tailwind remains a layout utility layer.
