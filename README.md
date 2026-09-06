# Dashboard

Multi-platform data dashboard with web UI. Track activity and stats across X (Twitter), GitHub, GitLab, and Reddit — all in one place.

## Features

- **Multi-platform tracking** — X (Twitter), GitHub, GitLab, Reddit in a single dashboard
- **Rich visualizations** — charts, stat cards, activity timelines, contribution heatmaps
- **Fetch health** — run history, staleness, failure streaks, and capability-gap visibility
- **Business Pulse** — cross-platform activity, traction, audience, and content highlights over 7/30/90-day windows
- **Auto-fetching** — configurable per-account fetch intervals via background scheduler
- **Multi-user** — admin and regular users with full data isolation
- **Password auth** — Argon2id hashing, JWT session cookies
- **OAuth support** — Reddit OAuth; personal access tokens for GitHub/GitLab
- **Local-first** — all data stored in PostgreSQL (Drizzle ORM), no cloud dependencies
- **Encrypted credentials** — AES-256-GCM encryption for tokens and API keys at rest
- **Responsive design** — works on desktop and mobile with adaptive sidebar
- **i18n** — English and Chinese locale support
- **Theming** — 12 light and dark themes

## Quick Start

### Docker (Recommended)

```bash
cp .env.example .env
# Edit .env and set DASHBOARD_SECRET
openssl rand -hex 32  # generate a secret
docker compose up -d
```

Open `http://localhost:3000`. On first run, the bootstrap prints an initial admin password (or use `ADMIN_PASSWORD_HASH` to preset one), then set a password in Settings.

### Standalone

```bash
pnpm install
pnpm run dev
```

The app starts on port 3000.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Runtime** | Node.js 20 + pnpm |
| **Backend** | React Router 7 route handlers (same process, under `app/api/`) |
| **Frontend** | React 19 + React Router 7 Framework Mode + TypeScript |
| **Build** | `react-router build` (client + server, memory-bounded passes) |
| **Styling** | Mantine 9.6 + Tailwind CSS v4 layout utilities |
| **Charts** | Recharts |
| **Icons** | lucide-react |
| **Data Fetching** | @tanstack/react-query |
| **ORM** | Drizzle ORM |
| **Database** | PostgreSQL |
| **Auth** | Argon2id + JWT (HS256) session cookies |
| **Encryption** | AES-256-GCM for credentials at rest |
| **i18n** | react-i18next |

## Configuration

All configuration is via environment variables. Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

### Required

| Variable | Description |
|----------|-------------|
| `DASHBOARD_SECRET` | 64-char hex string for encryption and JWT signing (`openssl rand -hex 32`) |

### Database

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | — | PostgreSQL connection string (takes priority) |
| `PG_HOST` | `localhost` | PostgreSQL host |
| `PG_PORT` | `5432` | PostgreSQL port |
| `PG_DB` | `dashboard` | Database name |
| `PG_USER` | `dashboard` | Database user |
| `PG_PASSWORD` | `""` | Database password |

### Server

| Variable | Default | Description |
|----------|---------|-------------|
| `HOST` | `0.0.0.0` | Bind address |
| `PORT` | `3000` | Listen port |
| `NODE_ENV` | — | Set `production` for prod mode |

### Auth & Security

| Variable | Default | Description |
|----------|---------|-------------|
| `ADMIN_PASSWORD_HASH` | `""` | Argon2id hash for bootstrap admin password |
| `ALLOWED_ORIGINS` | `""` | Comma-separated allowed origins (`*` for all) |
| `TLS_REJECT_UNAUTHORIZED` | `true` | Set `false` for self-signed certs |

### Proxy

| Variable | Description |
|----------|-------------|
| `HTTPS_PROXY` | HTTPS proxy for outbound requests |
| `HTTP_PROXY` | HTTP proxy for outbound requests |

### Reddit OAuth

| Variable | Description |
|----------|-------------|
| `REDDIT_CLIENT_ID` | Reddit API client ID |
| `REDDIT_CLIENT_SECRET` | Reddit API client secret |

### Logging

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_DIR` | `data/logs` | Log file directory |
| `LOG_LEVEL` | `info` | Level: `debug`, `info`, `warn`, `error` |
| `LOG_MAX_SIZE` | `10m` | Max size per log file before rotation |
| `LOG_MAX_FILES` | `5` | Number of rotated log files to keep |

See [docs/CONFIGURATION.md](docs/CONFIGURATION.md) for the full reference, including mock mode (`MOCK_DATA=1`).

## Deployment

### Docker Compose

```bash
docker compose up -d
```

The compose stack includes:
- **dashboard** — the app (port 3000)
- **postgres** — PostgreSQL 16 (port 5432)

### Standalone Production

```bash
pnpm install --frozen-lockfile
pnpm run build
pnpm run start
```

The production app runs as a single Node process (`node server/index.mjs`) using `@react-router/node` with a hand-written static-file server for `build/client`.

### Kubernetes

The project includes a GitLab CI pipeline (`.gitlab-ci.yml`) that builds and deploys to a Kubernetes cluster via Kaniko and kubectl.

### Reverse Proxy

Place nginx, Caddy, or Traefik in front:

```nginx
server {
    listen 443 ssl;
    server_name dashboard.example.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Project Structure

```
dashboard/
├── app/                    # React Router pages + API route handlers
├── components/             # Shared UI components
├── db/schema/              # Drizzle ORM schema files
├── lib/                    # Server/client shared utilities, DB, fetchers, config
├── server/                 # Production entry (server/index.mjs)
├── shared/                 # Shared TypeScript types
├── tests/                  # Vitest test suite
├── docs/                   # Human-facing documentation
├── .agents/                # Agent-only docs (plans, specs, research, rules)
└── data/                   # Runtime data (logs, legacy SQLite db)
```

## API Overview

Base path: `/api`. All endpoints require the `dash_session` JWT cookie unless noted. See [docs/API.md](docs/API.md) for the full reference.

### Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login with username/password (public) |
| GET | `/api/auth/me` | Check authentication status (public) |
| POST | `/api/auth/logout` | Logout |
| POST | `/api/auth/change-password` | Change password |

### Accounts

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/accounts` | List accounts |
| POST | `/api/accounts` | Create account |
| PUT | `/api/accounts/:id` | Update account |
| DELETE | `/api/accounts/:id` | Delete account (requires confirmation) |
| POST | `/api/fetch/:id` | Trigger immediate fetch |

### Platform Data

Each platform (x, github, gitlab, reddit) has dedicated endpoints for stats, timeline, and detailed data. See [docs/API.md](docs/API.md) for full reference.

## Development

### Prerequisites

- Node.js 20+
- pnpm
- PostgreSQL (or use `MOCK_DATA=1` / `pnpm run mock` for fixture mode)

The UI uses one Mantine provider/theme bridge for components, tokens, overlays and notifications. Tailwind is limited to layout and responsive utilities; its preflight reset is intentionally disabled to avoid overriding Mantine controls. Data cards use the shared `MetricCard`/`MetricGrid` contracts.

### Setup

```bash
pnpm install
cp .env.example .env
# Set DASHBOARD_SECRET in .env
pnpm run dev
```

### Scripts

| Command | Description |
|---------|-------------|
| `pnpm run dev` | Start React Router dev server |
| `pnpm run mock` | Dev server in mock/fixture mode (no DB needed) |
| `pnpm run build` | Build client + server (memory-bounded passes) |
| `pnpm run start` | Run the production server |
| `pnpm run lint` | ESLint |
| `pnpm run typecheck` | TypeScript check |
| `pnpm test` | Vitest test suite |
