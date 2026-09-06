# Dashboard (Claude)

This project follows the dotagents convention. Read [AGENTS.md](AGENTS.md) first — it is the canonical router for commands, documentation, and context routing.

## Key Facts

- **Runtime** — Node.js 20 (no Bun). The old Hono standalone server and `bun:sqlite` are gone.
- **Database** — PostgreSQL only. `bootstrap()` in `lib/setup.ts` creates missing tables and seeds `admin`; it is triggered lazily on the first request by `app/auth-middleware.server.ts` (once per process).
- **Mock mode** — `MOCK_DATA=1` (plus `NEXT_PUBLIC_MOCK_DATA=1` for the client banner) serves fixtures from `lib/mock` and skips PostgreSQL/auth.
- **Config** — env-only via `lib/config.ts`; `data/config.json` is a legacy artifact and is never read.
- **React Router version** — pinned to `7.18.2` (with a pnpm patch in `patches/`) for stability; do not upgrade to v8 without explicit approval.
- **Memory-constrained builds** — always use the `build:client` / `build:server` split (`RR_SKIP_SSR=1` / `RR_SKIP_CLIENT=1`) with bounded Node heaps; CI OOMs otherwise.
- **`"use client"` is not used** — React Router v7 does not need it; do not reintroduce it.

## Documentation

Human-facing documentation lives in `docs/`; agent-only resources live in `.agents/`. See [AGENTS.md](AGENTS.md) for the full routing index.
