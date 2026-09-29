# API Boundary Inventory

This inventory mirrors the 56 API route registrations in `app/routes.ts`: 55 concrete route files plus the `/api/*` catch-all. The browser contract stays in `lib/api.ts`; its HTTP details are centralized in `lib/client/api-transport.ts`. The default API root is `/api`. `VITE_API_BASE_URL` is a build-time transport seam for an alternate API root; this step does not enable cross-origin cookie deployment.

Unless listed as public below, endpoints require the existing `dash_session` session. Endpoints that target account data additionally enforce the authorization checks present in their route adapter. Admin-only endpoints are marked **admin**.

## Endpoint inventory

`Data dependency` describes what the service uses behind the route; routes do not import these dependencies directly. `HTTP adapter` marks transport-specific behavior that remains in the route.

| Route | Method | Auth | Browser client | Service/use case | Data dependency / HTTP adapter |
|---|---|---|---|---|---|
| `/api/accounts` | GET, POST | session | `getAccounts`, `createAccount` | `accounts.getAccountsOverview`, `accounts.createAccount` | Accounts + Twitter repositories; account create validation |
| `/api/accounts/:id` | GET, PUT, DELETE | session + owner | `getAccount`, `updateAccount`, `deleteAccount` | `accounts.getAccountDetails`, `updateAccountFromInput`, `deleteAccount` | Accounts, Twitter stats, fetch health; confirmation token validation |
| `/api/analytics/overview` | GET | session | `getAnalyticsOverview` | `analytics.getAnalyticsOverview` | Cloudflare Analytics Engine SQL integration; fixed configured site and seven-day period |
| `/api/ai/chat` | GET, POST | session | `getAiStatus`, `streamAiChat` | `ai-analysis.getAiStatus`, `runAgentStream` | AI config/quota/model integration; POST streams a `Response` |
| `/api/auth/change-password` | POST | session | `changePassword` | Existing auth handler | Auth/password implementation; cookie/session semantics unchanged |
| `/api/auth/login` | POST | public | `login` | Existing auth handler | Auth implementation; rate limit and session cookie |
| `/api/auth/logout` | POST | session | `logout` | Existing auth handler | Auth implementation; clears session cookie |
| `/api/auth/me` | GET | public | `checkAuth` | Existing auth handler | Session inspection |
| `/api/bing-wallpaper` | GET | public | — | — | Special HTTP adapter: upstream request and redirect |
| `/api/confirm/token` | POST | session | `getConfirmToken` | Existing confirmation helper | In-memory confirmation token; returned by HTTP adapter |
| `/api/fetch/:id` | POST | session + owner | `triggerFetch` | `manual-fetch.startManualFetch` | Accounts + fetch dispatch; starts background work and returns immediately |
| `/api/fetch-health` | GET | session | `getFetchHealth` | `fetch-health.getFetchHealth` | Accounts and fetch-run repositories |
| `/api/github/:accountId/repos/:repoId` | GET | session + owner | — | `github.getGithubRepoSnapshots` | GitHub repository snapshots |
| `/api/github/:accountId/repos/:repoId/clones` | GET | session + owner | `getGithubTrafficClones` | `github.getGithubTrafficClones` | GitHub traffic repository |
| `/api/github/:accountId/repos/:repoId/paths` | GET | session + owner | `getGithubPaths` | `github.getGithubPaths` | GitHub traffic repository |
| `/api/github/:accountId/repos/:repoId/paths/history` | GET | session + owner | `getGithubPathHistory` | `github.getGithubPathHistory` | GitHub traffic repository |
| `/api/github/:accountId/repos/:repoId/referrers` | GET | session + owner | `getGithubReferrers` | `github.getGithubReferrers` | GitHub traffic repository |
| `/api/github/:accountId/repos/:repoId/referrers/history` | GET | session + owner | `getGithubReferrerHistory` | `github.getGithubReferrerHistory` | GitHub traffic repository |
| `/api/github/:accountId/repos/:repoId/releases` | GET | session + owner | `getGithubReleases` | `github.getGithubReleases` | GitHub release repository |
| `/api/github/:accountId/repos/:repoId/releases/growth` | GET | session + owner | `getGithubReleaseDownloadTimeline` | `github.getGithubReleaseDownloadTimeline` | GitHub release repository |
| `/api/github/:accountId/repos/:repoId/releases/:releaseId/assets` | GET | session + owner | `getGithubReleaseAssets` | `github.getGithubReleaseAssets` | GitHub release repository |
| `/api/github/:accountId/repos/:repoId/snapshots` | GET | session + owner | `getGithubRepoSnapshots` | `github.getGithubRepoSnapshots` | GitHub repository snapshots |
| `/api/github/:accountId/repos/:repoId/views` | GET | session + owner | `getGithubTrafficViews` | `github.getGithubTrafficViews` | GitHub traffic repository |
| `/api/github/contributions/:accountId` | GET | session + owner | `getGithubContributions` | `github.getGithubContributions` | GitHub repository |
| `/api/github/overview/:accountId` | GET | session + owner | `getGithubOverview` | `github.getGithubOverview` | GitHub repository |
| `/api/github/repos/pin` | PUT | session + owner | `setPinnedRepos` | `github.setPinnedRepos` | GitHub watchlist repository |
| `/api/github/sources/:accountId/available` | GET | session + owner | `getGithubAvailableOrgs` | `github.getGithubAvailableOrgs` | GitHub client and decrypted credential; upstream failure returns `{ orgs: [], unavailable }` |
| `/api/github/timeline/:accountId` | GET | session + owner | `getGithubTimeline` | `github.getGithubTimeline` | GitHub repository |
| `/api/github/watchlist/:accountId` | GET, PUT | session + owner | `getGithubWatchlist`, `saveGithubWatchlist` | `github-watchlist.GithubWatchlistService` | GitHub watchlist repository and upstream source integration |
| `/api/gitlab/:accountId/projects/:projectId` | GET | session + owner | — | `gitlab.getGitlabProjectSnapshots` | GitLab project snapshot repository |
| `/api/gitlab/:accountId/projects/:projectId/releases` | GET | session + owner | `getGitlabReleases` | `gitlab.getGitlabReleases` | GitLab release repository |
| `/api/gitlab/:accountId/projects/:projectId/snapshots` | GET | session + owner | `getGitlabProjectSnapshots` | `gitlab.getGitlabProjectSnapshots` | GitLab project snapshot repository |
| `/api/gitlab/contributions/:accountId` | GET | session + owner | `getGitlabContributions` | `gitlab.getGitlabContributions` | GitLab repository |
| `/api/gitlab/overview/:accountId` | GET | session + owner | `getGitlabOverview` | `gitlab.getGitlabOverview` | GitLab repository |
| `/api/gitlab/projects/pin` | PUT | session + owner | `setPinnedGitlabProjects` | `gitlab.setPinnedGitlabProjects` | GitLab watchlist repository |
| `/api/gitlab/timeline/:accountId` | GET | session + owner | `getGitlabTimeline` | `gitlab.getGitlabTimeline` | GitLab repository |
| `/api/health` | GET | public | — | — | Special health adapter; no application data access |
| `/api/pulse` | GET | session | `getPulse` | `accounts.getAccounts`, `pulse.getPulse` | Pulse domain aggregation and platform repositories |
| `/api/reddit/activity/:accountId` | GET | session + owner | `getRedditActivity` | `reddit.getRedditDailyActivity`, `getRedditDailyCommentActivity` | Reddit repository |
| `/api/reddit/callback` | GET | public | — | — | Special OAuth callback and redirect to `/accounts` |
| `/api/reddit/comments/:accountId` | GET | session + owner | `getRedditComments` | `reddit.getRedditComments` | Reddit repository |
| `/api/reddit/overview/:accountId` | GET | session + owner | `getRedditOverview` | `reddit.getRedditOverview` | Reddit repository |
| `/api/reddit/posts/:accountId` | GET | session + owner | `getRedditPosts` | `reddit.getRedditPosts` | Reddit repository |
| `/api/reddit/subreddits/:accountId` | GET | session + owner | `getRedditSubreddits` | `reddit.getRedditSubredditDistribution` | Reddit repository |
| `/api/reddit/timeline/:accountId` | GET | session + owner | `getRedditTimeline` | `reddit.getRedditTimeline` | Reddit repository |
| `/api/settings` | GET, PUT | admin | `getSettings`, `updateSettings` | `settings.getAiSettings`, `updateAiSettings` | Settings repository; masks stored API key |
| `/api/stats/calendar` | GET | session | `getCalendar` | `twitter.getCalendarData` + `accounts.getAccounts` | Twitter repository |
| `/api/stats/overview` | GET | session | `getOverview` | `twitter.getOverviewStats` | Twitter repository |
| `/api/stats/timeline` | GET | session | `getTimeline` | `twitter.getTimeline` | Twitter repository |
| `/api/stats/top` | GET | session | `getTopTweets` | `twitter.getTopTweets` + `accounts.getAccounts` | Twitter repository |
| `/api/top-content` | GET | session | `getTopContent` | `accounts.getAccounts`, `top-content.getTopContent` | Cross-platform content repositories |
| `/api/tweets` | GET | session | `getTweets` | `twitter.getTweets` | Twitter repository |
| `/api/tweets/:id` | GET | session | `getTweet` | `twitter.getTweetById` | Twitter repository |
| `/api/users` | GET, POST | admin | `getUsers`, `createUser` | `users.getUsers`, `createUser` | Users repository; password hashing on create |
| `/api/users/:id` | DELETE | admin | `deleteUser` | `users.deleteUser` | Users repository; confirmation token validation |
| `/api/*` | matched methods | varies | — | — | Catch-all API adapter for unregistered paths; returns not found |

## Boundary rules

- Browser pages and components call `lib/api.ts`; only `lib/client/api-transport.ts` constructs API URLs and invokes `fetch`.
- `app/api/**` adapts HTTP input/authentication to `lib/services/**`. It does not import repositories, database drivers, fetchers, or `fetch-dispatch`.
- `lib/services/**` is the Application / Use Case Layer. It may call repositories and infrastructure and returns application data, never `Response` objects or HTTP status codes.
- The browser → HTTP → service → repository contract remains in the existing single Node application. This inventory describes dependency boundaries; it does not declare an endpoint API version or runtime migration.
