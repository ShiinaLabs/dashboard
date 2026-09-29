# GraphQL Query Layer

The authenticated GraphQL endpoint is `GET`/`POST /api/graphql`. It is a query layer over existing application services; it does not replace or change the REST API. The endpoint requires the existing `dash_session` cookie and returns HTTP `401` before GraphQL execution when no valid session is present.

The current schema is query-only. It exposes `Query.analytics.sites`, `Query.analytics.traffic(siteId, timezone = "UTC")`, and `Query.analytics.acquisition(siteId, timezone = "UTC")`. Future query-oriented features should prefer this GraphQL entry point. Site results use camelCase fields and omit owner and soft-delete fields. Traffic authorization and timezone validation are delegated to the existing analytics service, so REST and GraphQL share the same behavior.

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

Resolvers receive only the authenticated user in their context and call `lib/services/analytics.ts`. They do not import database or repository code. The typed Acquisition helper in `lib/client/analytics-graphql.ts` calls the shared `lib/client/graphql.ts` transport, which retains cookie credentials and the common unauthorized redirect behavior. Dashboard analytics pages continue using their existing REST client for sites, traffic, and installation.

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

The existing REST traffic contract and `analytics.traffic.dimensions.referrers` remain views-based and unchanged. The Analytics page continues to use REST for sites, traffic, and tracker installation; Acquisition is the first page query to use GraphQL.
