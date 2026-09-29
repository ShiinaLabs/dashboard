# Architecture

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Runtime** | Node.js 22.12+ + pnpm |
| **Framework** | React Router 7 (Framework Mode) |
| **Backend** | React Router route handlers under `app/api/` (same process as frontend) |
| **Frontend** | React 19 + TypeScript + Vite |
| **Styling** | shadcn/ui + Radix UI + Tailwind CSS v4 |
| **Charts** | Recharts |
| **Icons** | lucide-react |
| **Data Fetching** | @tanstack/react-query |
| **ORM** | Drizzle ORM with `pg` driver |
| **Database** | PostgreSQL |
| **Auth** | JWT (HS256, `jose`) signed session cookies + Argon2id (`argon2`) |
| **Encryption** | AES-256-GCM (credentials at rest) |
| **i18n** | react-i18next (en/zh) |

## Deployment Model

Dashboard is a private multi-user internal operations dashboard for a trusted personal, family, or small-team environment.

The supported production architecture is a single Node.js process running the HTTP/SSR server, API routes, in-process scheduler, and fetchers together:

```text
Node process
├── HTTP / SSR
├── API routes
├── Scheduler
└── Fetchers
```

Single-process deployment is intentional and supported. This is a first-class architecture and may remain the production model indefinitely.

Serverless, Edge, and Function runtimes are future deployment options, not current architecture targets. Do not prepare for them by removing Node APIs, replacing `pg` or Argon2, externalizing the scheduler, introducing queues or cron services, or changing cryptography. Portability is desirable only when it does not add current operational or code complexity without present value.

## Source Layout

```
dashboard/
├── app/                        # React Router Framework Mode (pages + API)
│   ├── root.tsx                # Root layout: html shell, globals.css, Providers
│   ├── routes.ts               # Declarative route table (pages + API)
│   ├── auth-middleware.server.ts  # Session/auth middleware + application readiness gate
│   ├── providers.tsx           # QueryClientProvider + ThemeProvider + Sonner toaster
│   ├── globals.css             # Tailwind v4 preflight, theme tokens and animations
│   ├── (dashboard)/            # Dashboard layout + pages (overview, analytics, accounts, x, github, gitlab, reddit, settings, admin)
│   ├── login/                  # Login page
│   ├── a/e/                    # Public analytics event route (validated by collector service)
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
│   └── ui/                     # shadcn/ui primitives, Radix wrappers and theme tokens
├── db/
│   ├── schema/                 # Drizzle ORM schema files
│   │   ├── index.ts            # Re-exports all schemas
│   │   ├── users.ts            # users table
│   │   ├── accounts.ts         # accounts table
│   │   ├── twitter.ts          # user_stats, tweets tables
│   │   ├── github.ts           # GitHub tables (stats, repos, snapshots, traffic, releases, contributions)
│   │   ├── gitlab.ts           # GitLab tables (stats, projects, snapshots, releases, contributions)
│   │   ├── reddit.ts           # Reddit tables (stats, posts, comments)
│   │   ├── analytics.ts        # Web Analytics sites and normalized page events
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
│   ├── services/               # Application services and use cases
│   ├── scheduler.ts            # Per-platform dispatch every 60s (round-robin + cooldowns)
│   ├── scheduler-singleton.ts  # ensureScheduler() (start once per process)
│   ├── logger.ts               # Structured file logger with rotation
│   ├── http.ts                 # fetchWithConfig (TLS-configurable wrapper)
│   ├── mock/                   # Fixture data for MOCK_DATA=1 debug mode
│   ├── setup.ts                # bootstrap(): pool, schema, admin seed, token re-encryption
│   └── startup.ts              # ensureApplicationReady(): logger, bootstrap, scheduler
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

## Dependency Direction

```
Browser / UI
    ↓
API client (lib/api.ts and client utilities)
    ↓
HTTP route adapter (app/api/**)
    ↓
Application service (lib/services/**)
    ↓
Repository / integration
    ↓
PostgreSQL / external APIs

Scheduler (lib/scheduler.ts)
    ↓
Application operation / dispatch
    ↓
Repository / integration
```

UI pages and components use the API client for browser requests. They do not access database or fetcher implementation details. API routes parse and authorize HTTP requests, then call application services. Services contain application behavior and coordinate repositories and integrations.

The scheduler is a background entry point into dispatch and application operations; it does not pass through an HTTP route. Repositories may use Drizzle and `pg` directly. Fetchers and integration clients communicate with external APIs.

Browser requests flow through `app/auth-middleware.server.ts` (application readiness + session check) into either:

- **Pages** — React Router route modules under `app/(dashboard)/`, rendered server-side with client hydration
- **API** — route handlers under `app/api/*/route.ts` that adapt HTTP requests to application services

## Request Lifecycle (Production)

1. `server/index.mjs` creates a `node:http` server; static assets under `/assets/`, the exact `/a/t.js` tracker path, and `/favicon.*` are served from `build/client` by the hand-written static handler
2. Everything else goes through `createRequestListener` from `@react-router/node`
3. `app/auth-middleware.server.ts` awaits `ensureApplicationReady()` before auth handling. Startup initializes the logger, awaits `bootstrap()`, then starts the scheduler; mock mode skips scheduler startup. Concurrent requests share the same startup promise, and a failed bootstrap can be retried by a later request.
4. API route handlers and page loaders execute within the same process

## Key Patterns

- **Singleton Drizzle client** — `getDb()` in `lib/db/connection.ts` returns a cached drizzle instance wrapping a shared `pg` pool (max 5 connections). No per-request connections.
- **Dependency boundaries** — Browser UI → API client → HTTP route adapters → application services → repositories/integrations. Routes do not import repositories, database drivers, fetchers, or dispatch implementations. Services do not depend on HTTP request/response helpers.
- **Application readiness** — `ensureApplicationReady()` in `lib/startup.ts` is the single startup contract: initialize logger, await `bootstrap()` in `lib/setup.ts` (PostgreSQL pool, missing-table creation, admin seed, plaintext-token re-encryption), then start the scheduler once per process. `MOCK_DATA=1` keeps bootstrap a no-op and does not start the scheduler.
- **Soft-delete** — All destructive operations set `deleted_at = NOW()` instead of DELETE. List queries filter with `deleted_at IS NULL`. Users with the same username can be revived on re-creation.
- **Confirmation tokens** — Destructive operations (delete account, delete user) require a 6-character random token with 5-minute TTL, stored in an in-memory `Map` (`lib/confirm-helpers.ts`).
- **Encrypted credentials** — Auth tokens and API keys are encrypted with AES-256-GCM before storage (`lib/crypto.ts`). Decrypted in-memory during fetch cycles. `bootstrap()` re-encrypts any legacy plaintext tokens.
- **JWT sessions** — Session tokens are signed JWTs (HS256, `jose`) with 7-day expiry, stored in the `dash_session` httpOnly cookie. Mock mode accepts any token.
- **Per-platform fetchers** — Each platform has an independent fetcher module (X in `lib/fetcher.ts`, GitHub/GitLab/Reddit in `lib/fetchers/`). The scheduler dispatches per-platform with per-platform cooldowns (X 5 min, others 2 min) and a 60s cycle with jitter.
- **Multi-user isolation** — `owner_id` on accounts links to `users.id`. Non-admin users only see their own accounts.
- **Memory-constrained build** — Client and server bundles are built in separate passes (`build:client` with `RR_SKIP_SSR=1`, `build:server` with `RR_SKIP_CLIENT=1`), each with bounded Node heaps, to keep CI memory usage low.
- **shadcn UI system** — `components/ui/` contains the UI primitives adapted from the pinned shadcn-admin donor. The dashboard keeps its 12 theme IDs and localStorage settings; `lib/client/theme-tokens.ts` applies shadcn CSS variables, while Sonner provides notifications. React Router, the API client, and React Query remain the page data boundary.

## Architecture Decision Rules

1. The current Node.js deployment is first-class and may remain indefinitely.
2. Do not introduce an abstraction without a second concrete implementation or clear present-day value.
3. Node-specific capabilities are allowed at runtime and infrastructure boundaries; do not ban them in pursuit of hypothetical portability.
4. Business workflows should not be independently reimplemented across HTTP, the scheduler, or future delivery mechanisms.
5. Every architecture phase must leave the application production-valid indefinitely.
6. Future deployment portability is desirable, but must not increase current operational or code complexity without present value.
