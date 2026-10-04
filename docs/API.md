# API Reference

The browser reads authenticated UI data through page-oriented operations at `POST /api/graphql`. The GraphQL schema and page contracts are documented in [GraphQL Query Layer](GRAPHQL.md); the complete REST route inventory is in [API Boundary Inventory](API-BOUNDARY.md).

REST is reserved for commands/mutations, authentication/session, streaming, synchronization and infrastructure. Unless marked public below, requests require the existing `dash_session` cookie. `app/auth-middleware.server.ts` returns `401` for unauthenticated API calls.

## Authentication and session

| Method | Path | Description |
|---|---|---|
| POST | `/auth/login` | Authenticate with `{ username, password }`; sets session cookie |
| GET | `/auth/me` | Session bootstrap: `{ authenticated, username, role }` |
| POST | `/auth/logout` | Clear session cookie |
| POST | `/auth/change-password` | Change password with `{ currentPassword, newPassword }` |

## Accounts and fetch commands

| Method | Path | Description |
|---|---|---|
| POST | `/accounts` | Create account; accepts platform, screen name, credentials, fetch interval, and optional instance/auth type |
| PUT | `/accounts/:id` | Update account configuration |
| DELETE | `/accounts/:id` | Delete account and related data; requires `{ confirmToken }` |
| POST | `/fetch/:id` | Start an account fetch, optionally with `{ level }` |
| POST | `/confirm/token` | Issue a one-time confirmation token |

Account lists, safe metadata, fetch history, Overview, Pulse, Fetch Health, and Top Content are GraphQL reads. The schema never returns stored account credentials.

## Analytics commands and collector

| Method | Path | Description |
|---|---|---|
| POST | `/analytics/sites` | Create `{ name, host }`; the authenticated user is the owner and the server generates the site key |
| PUT | `/analytics/sites/:id` | Rename site with `{ name }`; ownership is checked, and host/key remain immutable |
| POST | `/a/e` | Public event collector; validates registered site, configured host, and request Origin |
| OPTIONS | `/a/e` | Collector CORS preflight |

Analytics site lists, installation snippets, global and selected-site dashboards are GraphQL reads. The browser tracker sends only allow-listed UTM source, medium, and campaign values, never the full query string. UTM values are persisted on entry events only. See [GraphQL Query Layer](GRAPHQL.md) for time range, timezone, and aggregation semantics.

## GitHub, GitLab, and Reddit commands

| Method | Path | Description |
|---|---|---|
| PUT | `/github/repos/pin` | Set pinned repositories with `{ accountId, repoIds }` |
| PUT | `/github/watchlist/:accountId` | Save watchlist organization and repository selections |
| PUT | `/gitlab/projects/pin` | Set pinned projects with `{ accountId, projectIds }` |
| GET | `/reddit/callback` | Public OAuth callback; completes flow and redirects to `/accounts` |

Platform list, account, repository/project, and Reddit detail reads use the GraphQL Query Plane. Repository/project reads are page-sized, range-limited, and viewer-scoped. Pin and watchlist writes remain REST commands.

## App Store Connect commands

| Method | Path | Description |
|---|---|---|
| POST | `/app-store/connections` | Create a connection |
| PUT | `/app-store/connections/:id` | Update connection settings |
| DELETE | `/app-store/connections/:id` | Delete connection; requires `{ confirmToken }` |
| POST | `/app-store/connections/:id/refresh` | Refresh app metadata |
| PUT | `/app-store/connections/:id/apps/:appId` | Enable or disable an app |
| POST | `/app-store/connections/:id/analytics` | Set up analytics |
| POST | `/app-store/connections/:id/analytics/sync` | Sync analytics |
| POST | `/app-store/connections/:id/revenue/sync` | Sync revenue sources for the requested date/region |
| POST | `/app-store/connections/:id/backfill` | Backfill analytics or revenue reports |

Connection lists/details, apps, health, analytics status, Analytics reports, and Revenue reports are GraphQL reads. GraphQL only exposes `privateKeyConfigured`; raw private keys never leave the server.

## Settings, administration, AI, and infrastructure

| Method | Path | Auth | Description |
|---|---|---|---|
| PUT | `/settings` | admin | Update AI settings; API keys remain masked in reads |
| POST | `/users` | admin | Create user |
| DELETE | `/users/:id` | admin | Delete user; requires `{ confirmToken }` |
| POST | `/ai/chat` | session | AI chat streaming response |
| GET | `/health` | public | Server health check |
| GET | `/bing-wallpaper` | public | Redirect to upstream daily wallpaper |

Settings, admin user metadata, and AI quota/status use GraphQL. AI chat remains a streaming REST response. GraphiQL is enabled only outside production and request batching is disabled.
