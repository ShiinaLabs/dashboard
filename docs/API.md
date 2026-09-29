# API Reference

Base path: `/api` by default. Browser requests go through `lib/api.ts` and `lib/client/api-transport.ts`; `VITE_API_BASE_URL` can set a build-time API root. Routes are declared in `app/routes.ts` and implemented as React Router route handlers under `app/api/*/route.ts`. See [API Boundary Inventory](API-BOUNDARY.md) for the complete route-to-service map.

All endpoints except the public list below require a valid `dash_session` cookie. `app/auth-middleware.server.ts` returns `401` for unauthenticated API calls (or `302` to `/login` for pages).

Public API paths: `POST /auth/login`, `GET /auth/me`, `GET /reddit/callback`, `GET /bing-wallpaper`, `GET /health`.

## Auth

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/login` | Authenticate with `{ username, password }`, sets session cookie. `400` invalid body, `401` bad credentials, `429` rate limited (10/min/IP), `500` internal error |
| GET | `/auth/me` | Check current session → `{ authenticated, username, role }` |
| POST | `/auth/logout` | Clear session cookie |
| POST | `/auth/change-password` | Change password `{ currentPassword, newPassword }` (requires session) |

## Users (admin only)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/users` | List all users (no password hashes) |
| POST | `/users` | Create user `{ username, password, role? }` |
| DELETE | `/users/:id` | Soft-delete user + all their accounts (requires `{ confirmToken }`) |

## Confirmation Tokens

| Method | Path | Description |
|--------|------|-------------|
| POST | `/confirm/token` | Get a 6-character random one-time token (5-minute TTL) |

## Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Server health check → `{ status: "ok" }` |

## Bing Wallpaper

| Method | Path | Description |
|--------|------|-------------|
| GET | `/bing-wallpaper` | Proxies Bing daily wallpaper, returns 302 redirect to image URL |

## Accounts

| Method | Path | Description |
|--------|------|-------------|
| GET | `/accounts` | List all accounts + overview stats |
| GET | `/accounts/:id` | Get account (without auth_token) + latest stats |
| POST | `/accounts` | Create account `{ screenName, authToken, fetchInterval, platform?, instanceUrl?, authType? }` |
| PUT | `/accounts/:id` | Update account fields |
| DELETE | `/accounts/:id` | Delete account + all related data (requires `{ confirmToken }`) |
| GET | `/accounts/:id` response includes `recentFetchRuns[]` | Latest attempt status, trigger, timing, errors, and capability gaps |

## Web Analytics

| Method | Path | Description |
|--------|------|-------------|
| GET | `/analytics/sites` | List sites owned by the current user; admins see all sites |
| POST | `/analytics/sites` | Create `{ name, host }`; ownership is assigned from the session and the server generates a globally unique Site ID |
| GET | `/analytics/sites/:id/overview` | Get the selected site's last-seven-day views, visitors, and visits; only its owner or an admin can access it |
| GET | `/analytics/sites/:id/installation` | Get the tracker URL and escaped installation snippet; only the site's owner or an admin can access it (`503 public_origin_not_configured` when no public origin is configured) |

The browser tracker posts events to public `POST /a/e` (with `OPTIONS /a/e` for CORS). This endpoint does not use a dashboard session; it validates the registered site key, configured host, and request Origin before storing an event.

## Fetch API

| Method | Path | Description |
|--------|------|-------------|
| POST | `/fetch/:id` | Trigger an immediate fetch for a specific account |

## Fetch Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/fetch-health` | Supported-account health, summary counts, recent runs, failure streaks, next-due times, capability gaps, and separately reported unsupported accounts |

## Business Pulse

| Method | Path | Description |
|--------|------|-------------|
| GET | `/pulse?days=7\|30\|90` | Cross-platform summary for the selected window (maximum 365 days) |

The response contains the time range, aggregate activity and repository-traction deltas, per-platform follower/karma summaries, top tweets and Reddit content, and repositories/projects with the largest star movement. Audience deltas are calculated only when both current and previous window samples exist for an account; platform-native audience metrics are not added into a single cross-platform total.

## Top Content

| Method | Path | Description |
|--------|------|-------------|
| GET | `/top-content?days=7\|30\|90` | Unified content leaderboard for the selected window (maximum 365 days) |

Returns tweets, Reddit posts/comments, releases, and repository growth items ranked by each platform's primary native metric (engagement, score, or downloads). Repository items include a growth rate when snapshot baselines exist; content without baseline history reports `growthRate: null`. Metrics are not normalized across platforms.

## X (Twitter)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/stats/overview` | Aggregated tweet stats (totals, today, followers) |
| GET | `/tweets?page=&limit=&sort=&order=&search=&accountIds=` | Paginated tweets with search/sort/account filter |
| GET | `/tweets/:id` | Single tweet |
| GET | `/stats/timeline?days=` | Daily tweet counts + follower growth |
| GET | `/stats/top?metric=&limit=10` | Top tweets by metric (favorite_count, retweet_count, etc.) |
| GET | `/stats/calendar?year=` | Tweet calendar heatmap data |

## GitHub

| Method | Path | Description |
|--------|------|-------------|
| GET | `/github/overview/:accountId` | Profile stats + repos + languages + top repos |
| GET | `/github/timeline/:accountId` | Follower/repo count over time |
| GET | `/github/contributions/:accountId?year=` | Contribution calendar |
| GET | `/github/:accountId/repos/:repoId/snapshots` | Star/fork/open_issues snapshots |
| GET | `/github/:accountId/repos/:repoId/clones` | Daily clone counts |
| GET | `/github/:accountId/repos/:repoId/views` | Daily page views |
| GET | `/github/:accountId/repos/:repoId/referrers` | Top referring sites |
| GET | `/github/:accountId/repos/:repoId/referrers/history` | Referrer history over time |
| GET | `/github/:accountId/repos/:repoId/paths` | Popular content paths |
| GET | `/github/:accountId/repos/:repoId/paths/history` | Path history over time |
| GET | `/github/:accountId/repos/:repoId/releases` | Releases with download stats |
| GET | `/github/:accountId/repos/:repoId/releases/:releaseId/assets` | Release asset download counts |
| GET | `/github/:accountId/repos/:repoId/releases/growth?days=7\|14\|30` | Per-asset download growth rate (downloads/day) over a time window |
| PUT | `/github/repos/pin` | Set pinned repos `{ accountId, repoIds }` |

## GitLab

| Method | Path | Description |
|--------|------|-------------|
| GET | `/gitlab/overview/:accountId` | Profile stats + projects |
| GET | `/gitlab/timeline/:accountId` | Follower/project count over time |
| GET | `/gitlab/contributions/:accountId?year=` | Contribution calendar |
| GET | `/gitlab/:accountId/projects/:projectId/snapshots` | Star/fork snapshots |
| GET | `/gitlab/:accountId/projects/:projectId/releases` | Releases with download stats |
| PUT | `/gitlab/projects/pin` | Set pinned projects `{ accountId, projectIds }` |

## Reddit

| Method | Path | Description |
|--------|------|-------------|
| GET | `/reddit/overview/:accountId` | Karma stats + post/comment counts + top posts |
| GET | `/reddit/timeline/:accountId` | Karma timeline (post + comment karma) |
| GET | `/reddit/posts/:accountId?page=&limit=&sort=` | Paginated posts |
| GET | `/reddit/comments/:accountId?page=&limit=` | Paginated comments |
| GET | `/reddit/activity/:accountId` | Daily post + comment activity counts |
| GET | `/reddit/subreddits/:accountId` | Subreddit distribution |
| GET | `/reddit/callback` | Reddit OAuth callback — completes the OAuth flow, then redirects to `/accounts` |
