# API Boundary Inventory

The browser uses page-oriented operations at `/api/graphql` for authenticated, side-effect-free UI reads. GraphQL resolvers call viewer-aware services/read models; they do not access repositories or the database. `lib/client/graphql.ts` and domain helpers use the same `lib/client/api-transport.ts` as REST commands, including credentials, unauthorized redirects, and abort signals.

REST remains for authentication/session, commands and mutations, background fetch/sync/backfill, streaming, public collectors, OAuth callbacks, confirmation tokens, health checks, and redirects. Unless marked public below, application endpoints require the existing session. Account, site, and connection services retain owner/admin visibility checks.

## REST endpoints

| Route | Methods | Purpose |
|---|---|---|
| `/api/auth/login` | POST | Login and establish session |
| `/api/auth/logout` | POST | Clear session |
| `/api/auth/me` | GET | Session bootstrap |
| `/api/auth/change-password` | POST | Change password |
| `/api/accounts` | POST | Create account |
| `/api/accounts/:id` | PUT, DELETE | Update or delete account |
| `/api/fetch/:id` | POST | Start account fetch |
| `/api/github/repos/pin` | PUT | Pin repositories |
| `/api/github/watchlist/:accountId` | PUT | Save GitHub watchlist |
| `/api/gitlab/projects/pin` | PUT | Pin GitLab projects |
| `/api/analytics/sites` | POST | Create analytics site |
| `/api/analytics/sites/:id` | PUT | Rename analytics site |
| `/api/app-store/connections` | POST | Create connection |
| `/api/app-store/connections/:id` | PUT, DELETE | Update or delete connection |
| `/api/app-store/connections/:id/refresh` | POST | Refresh app metadata |
| `/api/app-store/connections/:id/apps/:appId` | PUT | Enable or disable app |
| `/api/app-store/connections/:id/analytics` | POST | Set up analytics |
| `/api/app-store/connections/:id/analytics/sync` | POST | Sync analytics |
| `/api/app-store/connections/:id/revenue/sync` | POST | Sync revenue sources |
| `/api/app-store/connections/:id/backfill` | POST | Backfill reports |
| `/api/settings` | PUT | Update masked AI settings |
| `/api/users` | POST | Create admin user |
| `/api/users/:id` | DELETE | Delete admin user |
| `/api/ai/chat` | POST | AI response stream |
| `/api/confirm/token` | POST | Issue a confirmation token |
| `/api/health` | GET | Health check |
| `/api/bing-wallpaper` | GET | Upstream redirect |
| `/api/reddit/callback` | GET | OAuth callback |
| `/api/graphql` | GET, POST | Authenticated GraphQL Query Plane |
| `/api/*` | — | Catch-all for unknown API paths |

## GraphQL page operations

- `overview.page`: visible accounts, X summary, batched GitHub/GitLab/Reddit summaries, Pulse, Top Content, Fetch Health, and Analytics Portfolio.
- `accounts.list(platform)` and `accounts.detail(id)`: safe account metadata and fetch history; credentials are not part of the schema.
- `x.accountPage`: account, timeline, and the selected Tweets or Replies tab.
- `github.accountPage`, `github.repoPage`, and `github.watchlistManager`: bounded account/repository dashboards and combined watchlist-manager reads.
- `gitlab.accountPage`, `gitlab.projectPage`, and `reddit.accountPage`: page-sized detail read models.
- `analytics.page`: site choices with either the global dashboard or selected-site dashboard and installation snippet.
- `appStore.analytics` and `appStore.revenue`: enabled app choices and the selected report in one operation.
- `appStore.connections` and `appStore.connection(id)`: connection list or detail, apps, recent syncs, health, and analytics status. Private keys are never returned.
- `settings.ai`, `admin.users`, and `ai.status`: safe settings, admin-only user metadata, and AI quota status.

Range changes use targeted page operations and React Query cache keys. Query helpers pass cancellation through the shared transport. GraphQL is deliberately query-only; all writes stay on REST commands.

## Public tracking collector

`POST /a/e` and `OPTIONS /a/e` are public browser-tracking routes outside `/api`. The route owns HTTP parsing, body limits, Origin/UA/country headers, and CORS/status behavior. The collector service validates site identity and event data before repository access. It stores only allow-listed UTM source, medium, and campaign values, never the full query string.
