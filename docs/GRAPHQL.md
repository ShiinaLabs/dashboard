# GraphQL Query Layer

The authenticated GraphQL endpoint is `GET`/`POST /api/graphql`. It is a query layer over existing application services; it does not replace or change the REST API. The endpoint requires the existing `dash_session` cookie and returns HTTP `401` before GraphQL execution when no valid session is present.

The current schema is query-only. It exposes `Query.analytics.sites` and `Query.analytics.traffic(siteId, timezone = "UTC")`. Future query-oriented features should prefer this GraphQL entry point. Site results use camelCase fields and omit owner and soft-delete fields. Traffic authorization and timezone validation are delegated to the existing analytics service, so REST and GraphQL share the same behavior.

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

Resolvers receive only the authenticated user in their context and call `lib/services/analytics.ts`. They do not import database or repository code. The browser helper in `lib/client/graphql.ts` uses the shared API transport, retaining cookie credentials and the common unauthorized redirect behavior. Dashboard analytics pages continue using their existing REST client.

GraphiQL is available only outside production. Request batching is disabled. The schema has no mutations or subscriptions; state-changing operations remain on REST endpoints for now.
