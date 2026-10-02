# Fetchers

The scheduler (`lib/scheduler.ts`) runs every 60 seconds, dispatching a single platform per tick in round-robin order. First run is delayed 60–90 seconds (jittered) to avoid hammering APIs on restart.

## App Store Connect — Metadata and Analytics Setup

ASC uses `lib/services/app-store.ts` and `lib/infra/app-store/AppStoreConnectClient.ts`, independently of account fetchers. A five-minute ES256 Team JWT authorizes `GET /v1/apps`; pagination is restricted to Apple's API origin and the requested endpoint, and redirects are rejected. Apple permission, authentication, malformed-response and network errors remain explicit failures rather than empty app lists.

Refresh commits app metadata and successful run telemetry atomically. It retains app enablement choices; failed attempts keep existing app data and record an error in `app_store_sync_runs`. Disabled or deleted connections cannot refresh, and concurrent connection changes invalidate stale results. Current ASC refresh is manual only; no account fetch policy is applied.

Explicit Analytics setup reads existing requests for enabled apps and creates only a missing `ONE_TIME_SNAPSHOT` or non-stopped `ONGOING` request. Request creation permission failures remain Analytics errors; Apps discovery can still work. New requests may wait for the first report; setup wall time never supplies data freshness.

The report client follows Requests → Reports → DAILY Instances → Segments. Only Standard `App Store Discovery and Engagement` and `App Store Downloads` are eligible. Segment detail is refreshed immediately before downloading; signed HTTPS URLs stay in memory, receive no ASC Bearer header, and cannot redirect. Compressed segments are capped at 32 MiB, timed out after 30 seconds and checked against Apple's MD5 and size metadata. Decompressed instances are capped at 128 MiB. Every segment must validate and parse with consistent headers before preparation returns rows. Empty TSV fields remain null, extra columns and unknown enum strings are retained, and missing required columns fail explicitly.

To capture real sanitized fixtures from a configured database and an enabled app with existing requests:

```sh
node --env-file=.env --import tsx scripts/capture-app-store-analytics-fixtures.ts <connectionId>
```

The script writes sanitized TSV and provenance under `tests/fixtures/app-store/`, without original business identifiers or signed URLs. Review the sanitization against the actual headers before committing fixtures. Current synthetic TSV unit tests validate only the transport/format helpers. Production typed import, same-checksum skipping, latest-processing-date partition replacement and the required real Apple → PostgreSQL → UI gate are pending; this phase is not complete.

## X (Twitter) — `lib/fetcher.ts`

Note: The X fetcher lives at `lib/fetcher.ts` (not in `server/fetchers/`). It uses the `twitter-openapi-typescript` library.

Uses `twitter-openapi-typescript` library (wraps `twitter-openapi-typescript-generated`). Auth token stored from X.com cookies.

### Fetch flow
1. Fetch user profile via `getUserByScreenName` → extract stats (followers, following, tweet count) + pinned tweet IDs from `legacy.pinnedTweetIdsStr`
2. Discover all own tweets via `getUserTweetsAndReplies`, iterating all pages by cursor until exhausted (batchSize=100, maxTweets=800, 2s delay between pages). Own tweets are **recursively collected** from the timeline entry structure (see below).
3. For every unique own tweet ID (including pinned tweets not found in the timeline):
   - Call `getTweetDetail({ focalTweetId })` to retrieve **real** engagement counts (views, likes, retweets, etc.)
   - `getUserTweetsAndReplies` returns zeroed/absent engagement; only `getTweetDetail` provides correct data
4. Upsert each tweet into `tweets` table

### Timeline entry structure & nested replies

`getUserTweetsAndReplies` returns pages of `data[]` entries. Each entry may contain a **top-level tweet** (`entry.tweet`) AND a **`replies` array** listing replies to that tweet. Reply objects have the same `{ tweet, user, replies }` shape and can themselves contain nested replies (level 2). **Own replies are only found inside other users' `replies` arrays** — they never appear as top-level entries.

**Discovery algorithm (2026-06-10, verified against 82-tweet dump):**
```
for each entry in page.data:
    collectOwn(entry)                           // top-level tweet
    for each reply in entry.replies:
        collectOwn(reply)                       // level-1 nested reply
        for each nr in reply.replies:
            collectOwn(nr)                      // level-2 nested reply
```
where `collectOwn` checks `tweet.legacy.userIdStr === ownUserId`.

Without recursive reply walking, only ~29 of 82 own tweets were found (35%). With it, all 82 were recovered.

### Why not `getUserTweets` endpoint?
- `getUserTweets` returns a subset of `getUserTweetsAndReplies` (no replies to others) and provides **zeroed engagement counts** — the SDK/API no longer returns real values from timeline endpoints
- Only `getTweetDetail` returns real view counts, likes, retweets, etc.
- Therefore `getUserTweets` is not used at all

### Rate-limiting
- batchSize=100, maxTweets=800 (timeline discovery)
- 2s delay between timeline pages, 1s delay between detail calls
- 5s retry wait on 429

### Data stored
- `user_stats` (followers, following, tweet count snapshots)
- `tweets` (with engagement counts)

## GitHub — `lib/fetchers/github.ts`

### Fetch flow
1. User profile stats via REST API
2. Repos list (up to 100)
3. Daily snapshots of star/fork counts and GitHub's aggregate open item count
4. Traffic data (clones, views, referrers, paths) — requires PAT with repo scope
5. Releases with asset download counts — requires PAT
6. Open Issue and open Pull Request totals via batched GraphQL (requires PAT)
7. Contribution calendar via GraphQL

### Data stored
- `github_stats` (public_repos, followers, following)
- `github_repos` + `github_repo_snapshots`
- `github_traffic_clones`, `github_traffic_views`, `github_referrers`, `github_paths`
- `github_releases` + `github_release_assets`
- `github_contributions`

Steps 4–5 are silently skipped if no PAT is configured on the account.

In the new architecture these split by level: L1 (90m) refreshes release
download counts, L2 (8h) refreshes traffic/clones/views/referrers/paths. L2 uses
upserts keyed by account, repository, metric date, and snapshot identity because
GitHub revises values within its rolling traffic window; ignoring conflicts
leaves overlapping dates stale until a later snapshot replaces them.

GitHub REST `open_issues_count` includes both Issues and Pull Requests. The dashboard preserves this value in `open_issues` and adds nullable `open_issues_only` / `open_pull_requests` fields where split data is available; null means unknown, not zero.

## GitLab — `lib/fetchers/gitlab.ts`

### Fetch flow
1. User profile stats via GitLab API
2. Projects list with star/fork counts
3. Daily snapshots of star/fork/open_issues counts
4. Releases with asset download counts
5. Contribution calendar

### Data stored
- `gitlab_stats` (public_projects, followers)
- `gitlab_projects` + `gitlab_project_snapshots`
- `gitlab_releases` + `gitlab_release_assets`
- `gitlab_contributions`

## Reddit — `lib/fetchers/reddit.ts`

Supports two auth modes:

| Mode | Function | Auth |
|------|----------|------|
| OAuth | `fetchRedditAccount` | Reddit API with refresh-token flow |
| Public | `fetchRedditPublicAccount` | Browser cookies through the standard application HTTP client; no API access token |

### Fetch flow (both modes)
1. User profile karma stats
2. Posts (up to 100)
3. Comments (up to 100)
4. Subreddit activity distribution

### Data stored
- `reddit_stats` (post_karma, comment_karma)
- `reddit_posts` (title, score, subreddit, etc.)
- `reddit_comments` (body, score, subreddit, etc.)

## Fetcher hardening (2026-06-14)

All four platform fetchers were audited and hardened against the same class of issues discovered in GitHub.

### Request timeouts

Every HTTP request now has a 30-second timeout (`AbortController`), preventing fetchers from hanging indefinitely on unresponsive API endpoints.

| Fetcher | Mechanism |
|---------|-----------|
| X (Twitter) | Client library — no timeout added (library handles internally) |
| GitHub | `AbortController` / 30s per `ghFetch` call |
| GitLab | `AbortController` / 30s per `glFetch` call |
| Reddit OAuth | `AbortController` / 30s per `redditFetch`, 15s for token exchange |
| Reddit Public | `fetchWithConfig` / `AbortController` (30s) |

### Concurrency guards

A per-platform `Set<number>` of in-flight account IDs prevents the same account from being fetched concurrently (e.g., scheduler and manual trigger overlapping). If an account fetch is already running, subsequent calls log a skip and return immediately.

Manual and scheduler dispatches are also wrapped by `lib/fetch-dispatch.ts`, which owns a process-level in-flight guard, creates a `fetch_runs` record, marks the terminal status (`success`, `partial`, or `failed`), and stores structured capability gaps. Fetchers return structured results when optional data fails (for example GitHub traffic permissions) so partial success remains distinguishable from a complete failure.

Only X/Twitter, GitHub, GitLab, and Reddit are dispatchable. Scheduler queries filter out other platform values, manual dispatch rejects them before creating a run, and account creation validates the allowlist.

```
if (runningAccounts.has(account.id)) {
  getLogger().info(...);
  return;
}
runningAccounts.add(account.id);
// ... fetch ...
finally { runningAccounts.delete(account.id); }
```

### Progress logging

Long-running loops (GitHub traffic + releases per repo, GitLab projects) now log progress every 5–10 items so operators can distinguish "slow" from "stuck":

```
GitHub:    @user: traffic + releases 20/44 done
GitLab:    user: projects 10/30 done
```

### Batch upserts

Contribution records were previously inserted one-by-one in a loop (365 round-trips for GitHub contributions, potentially hundreds for GitLab). New batch functions send all records in a single `INSERT ... ON CONFLICT DO UPDATE`:

| Platform | Batch function | Records |
|----------|---------------|---------|
| GitHub | `upsertGithubContributions(accountId, contributions[])` | Up to 365 contributions |
| GitLab | `upsertGitlabContributions(accountId, contributions[])` | Variable, one per event-day |

### Type conversion bug (GitHub GraphQL)

GitHub's GraphQL API returns `contributionLevel` as a string enum (`"FIRST_QUARTILE"`, `"SECOND_QUARTILE"`, etc.), but the database column expects an integer. The code previously passed the string through as-is (`day.contributionLevel || 0`), which never triggered the fallback because non-empty strings are truthy. Now mapped explicitly:

```typescript
level: { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 }[day.contributionLevel] ?? 0
```
