# GraphQL Query Layer

The authenticated GraphQL endpoint is `GET`/`POST /api/graphql`. It is an authenticated, side-effect-free UI read layer over existing application services. It requires the existing `dash_session` cookie and returns HTTP `401` before GraphQL execution when no valid session is present. Commands, sync/backfill, authentication, public collectors, confirmation, and streaming remain REST.

The current schema exposes `Query.analytics.sites`, the compatibility fields `traffic(siteId, timezone = "UTC")` and `acquisition(siteId, timezone = "UTC")`, the ranged site `dashboard(siteId, range = DAYS_7, timezone = "UTC")`, the portfolio `portfolio(range = DAYS_7, timezone = "UTC")`, and `globalDashboard(range = DAYS_7, timezone = "UTC")`. `AnalyticsRange` accepts only `DAYS_7`, `DAYS_30`, or `DAYS_90`. Site results use camelCase fields and omit owner and soft-delete fields. Analytics timezone/range behavior is delegated to the analytics service.

Example:

```graphql
query AnalyticsTraffic($siteId: Int!, $timezone: String!) {
  analytics {
    traffic(siteId: $siteId, timezone: $timezone) {
      period { days timezone }
      overview { views visitors visits }
      timeline { date views visitors visits }
      topPages { path views }
      dimensions {
        referrers { referrer views }
        countries { country views }
        browsers { browser views }
        operatingSystems { os views }
        devices { device views }
      }
    }
  }
}
```

Resolvers receive only the authenticated user in their context and call domain services. They do not import database or repository code. Typed helpers call `lib/client/graphql.ts`, which uses the shared transport, cookie credentials, cancellation, and common unauthorized redirect behavior. The `/analytics` page uses one `AnalyticsPage` operation for site options plus either the global dashboard or the selected-site dashboard and installation.

App Store Analytics and Revenue use page operations that fetch enabled app options alongside their existing report read models. Their result types are explicit and request only the fields rendered by the current pages. Filter variables and operations are typed in `lib/client/graphql/app-store.ts`. `settings.ai`, `admin.users`, and `ai.status` provide safe settings, admin user-list, and quota reads. Settings and user reads keep service-level masking/admin checks; their former REST GET handlers were removed. AI streaming and settings/user mutations remain REST. X account detail combines account metadata, its ranged timeline, and only the selected Tweets or Replies tab in one `x.accountPage` operation. The query passes React Query's abort signal to the shared transport.

## Ranged dashboard

The Analytics page's primary read is `analytics.dashboard`. It returns current and previous equal-length local-calendar periods, the current-period timeline and view dimensions, and visit-based acquisition summaries from one repository statement. Its overview calls the sum of `visitor = true` markers `visitorDays`: markers represent a browser's first event on each local calendar day, so this is not a count of unique visitors over the selected range. The UI displays `Average Daily Visitors` as `round(visitorDays / period.days)`. `timeline.visitors` remains a daily count. Site options and tracker installation are included in the same page operation; the legacy traffic and acquisition GraphQL fields and REST traffic contract remain unchanged.

GraphiQL is available only outside production. Request batching is disabled. The schema has no mutations or subscriptions; state-changing operations remain on REST endpoints for now.

## Acquisition

Acquisition counts visit-entry events (`visit = true`) within the same seven local calendar days used by traffic reports. `analytics.acquisition` returns a self-contained `totalVisits`, up to 10 referrer groups, and up to 10 entry-page groups. Referrers group the entry event's `referrer_host`; entry pages group its `path`. A blank referrer remains `""` in the API and is presented as “Direct” by the UI. These values count Visits, not Page Views.

```graphql
query AnalyticsAcquisition($siteId: Int!, $timezone: String!) {
  analytics {
    acquisition(siteId: $siteId, timezone: $timezone) {
      period { days timezone }
      totalVisits
      referrers { referrer visits }
      entryPages { path visits }
    }
  }
}
```

The existing REST traffic contract and `analytics.traffic.dimensions.referrers` remain views-based and unchanged. The standalone Acquisition field and helper also remain available for compatibility.

## Campaign attribution

The ranged `analytics.dashboard.acquisition.campaigns` field groups only explicit `utm_source`, `utm_medium`, and `utm_campaign` values on `visit = true` entry events. It uses the selected dashboard range and returns at most 10 groups ordered by visits descending, then campaign, source, and medium ascending. The complete source/medium/campaign tuple defines a group; a visit with all three fields blank is un-attributed and is excluded. The campaign UI reports Visits and divides each campaign's visits by all dashboard Visits.

The tracker reads only those three allow-listed query parameters. It never sends or stores the full query string, any other parameter, or a full landing URL. UTM values are decoded, trimmed, and limited to 200 characters; the collector treats malformed values as empty. UTM fields are persisted only on visit-entry events. Referrers are independent data and are never used to infer UTM attribution. The compatibility `analytics.acquisition` field remains unchanged.

## Portfolio overview

`analytics.portfolio` provides the site-level summary used by `/overview`. One authenticated GraphQL request returns the tracked-site count, active sites, aggregate Views and Visits, previous-period Views and Visits, and every visible site's summary. It does not issue one dashboard query per site. The typed `getAnalyticsPortfolio` client calls the shared `graphqlRequest` transport.

The service applies the same visibility rule as `analytics.sites`: regular users see their own sites and admins see all users' sites. The repository excludes soft-deleted sites and scopes events to the visible sites before aggregating. A single PostgreSQL statement uses one database clock and viewer-local calendar bounds for the current period and the immediately preceding equal-length period. Sites without events remain in the result. Portfolio Views and Visits equal the sum of the per-site values; Active Sites counts sites with at least one current-period event. Portfolio does not report cross-site visitors because site-local visitor markers cannot identify unique people across sites.

## Global Analytics dashboard

`analytics.globalDashboard` is the `/analytics` All Sites read model. One repository statement returns current and previous viewer-local periods, Views and Visits, a zero-filled Views/Visits timeline, every visible site's metrics (including zero-traffic sites), dimensions, and visit-based acquisition. The overview also reports `trackedSites` (non-deleted visible sites, independent of range) and `activeSites` (visible sites with at least one view in the selected period). Site sums equal overview totals.

Global dimensions count views. Countries are complete for the map; browsers, operating systems, and devices are limited to ten. Referrers count visit-entry events and aggregate by raw referrer host across sites; an empty host remains `""` and the UI renders it as Direct. Campaigns count visit-entry events with a non-empty UTM value and are grouped by site plus source/medium/campaign so identical campaign tuples on different sites stay distinct. The global result intentionally has no visitors, Top Pages, or Entry Pages: visitor markers are site-local and page paths are site-relative. The portfolio contract for `/overview` and the site dashboard contract remain separate and unchanged.

Regular users are scoped to their own non-deleted sites; admins use the portfolio's existing global visibility rule. The UI includes only the global dashboard in All Sites mode or only the site dashboard and installation in selected-site mode, while fetching site options in the same operation. Site creation and rename remain REST-backed.
