# Dashboard Agent Guide

Multi-platform dashboard for X, GitHub, GitLab, Reddit, and first-party Web Analytics.

## Project Context

- **Runtime:** Node.js + pnpm + React Router 7 Framework Mode + React 19 + TypeScript
- **UI:** Tailwind CSS v4 + shadcn/ui and Radix UI
- **Data:** PostgreSQL + Drizzle ORM
- **Commands:** `pnpm run dev`, `pnpm run mock`, `pnpm run build`, `pnpm run start`, `pnpm run lint`, `pnpm run typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm license:check`

## Context Routing

Read only the resource relevant to the task:

- [README](README.md) — product overview and quick start
- [Human documentation index](docs/README.md) — all durable user and maintainer guides
- [Collaboration rules](.agents/COLLABORATION_RULES.md) — required before commits, destructive changes, or new docs
- `.agents/plans/` — current implementation plans, when executing one
- `.agents/specs/` — design specifications, when implementing one
- `.agents/research/` — agent-only evaluations and audit records
- `.agents/archive/` — non-authoritative historical records; do not execute archived plans unless explicitly asked

Human-facing documentation belongs in `docs/`. Agent plans, specs, research, and archives belong in `.agents/`; do not write agent execution plans or scratchpads under `docs/`.
