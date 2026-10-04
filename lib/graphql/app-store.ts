import { createGraphQLError } from "graphql-yoga";
import { getAppStoreAnalyticsDashboard, listEnabledAnalyticsApps } from "@/lib/services/app-store-analytics-reporting";
import { getAppStoreRevenueDashboard } from "@/lib/services/app-store-revenue";
import { getAppStoreConnectionPage, getAppStoreConnections } from "@/lib/services/app-store-query";
import { AppStoreError } from "@/lib/services/app-store";
import type { GraphQLContext } from "./context";

export const appStoreTypeDefs = /* GraphQL */ `
  extend type Query { appStore: AppStoreQuery! }
  type AppStoreQuery {
    enabledApps: [AppStoreAppOption!]!
    connections: [ASCConnection!]!
    connection(id: Int!): ASCConnectionPage!
    analytics(from: String!, to: String!, appId: Int, territory: String): AppStoreAnalyticsReport!
    revenue(from: String!, to: String!, appId: Int, territory: String, fiscalMonth: String): RevenueReport!
  }
  type AppStoreAppOption { id: Int!, name: String! }
  type ASCConnection { id: Int!, name: String!, issuer_id: String!, key_id: String!, vendor_number: String, private_key_configured: Boolean!, is_active: Boolean!, created_at: String!, updated_at: String! }
  type ASCApp { id: Int!, connection_id: Int!, apple_id: String!, bundle_id: String!, sku: String!, name: String!, is_enabled: Boolean!, created_at: String!, updated_at: String! }
  type ASCSyncRun { id: Int!, connection_id: Int!, kind: String!, scope: String, trigger: String!, status: String!, started_at: String!, finished_at: String, duration_ms: Int, error_message: String }
  type ASCConnectionPage { connection: ASCConnection!, apps: [ASCApp!]!, recentSyncRuns: [ASCSyncRun!]!, lastSuccessfulSync: ASCSyncRun, health: ASCHealth!, analyticsStatus: ASCAnalyticsStatus! }
  type ASCHealthItem { state: String!, lastSync: String, latestData: String, completeThrough: String, reason: String }
  type ASCHealth { connection: ASCHealthItem!, analytics: ASCHealthItem!, revenueAnalytics: ASCHealthItem!, sales: ASCHealthItem!, finance: ASCHealthItem! }
  type ASCAnalyticsStatus { enabledApps: Int!, state: String!, snapshot: String!, ongoing: String!, latestData: String, completeThrough: String, lastSync: ASCSyncRun, message: String }
  type AppStoreAnalyticsMetrics { impressions: Int, views: Int, firstTimeDownloads: Int, downloads: Int, conversion: Float }
  type AppStoreAnalyticsPoint { date: String!, impressions: Int, views: Int, firstTimeDownloads: Int, downloads: Int, conversion: Float }
  type AppStoreAnalyticsSource { source: String!, impressions: Int, views: Int, firstTimeDownloads: Int, downloads: Int, conversion: Float }
  type AppStoreAnalyticsCampaign { campaign: String!, impressions: Int, views: Int, firstTimeDownloads: Int, downloads: Int, conversion: Float, trend: [AppStoreCampaignPoint!]! }
  type AppStoreCampaignPoint { date: String!, downloads: Int }
  type AppStoreAnalyticsReport { updatedAt: String, completeThrough: String, overview: AppStoreAnalyticsMetrics!, trend: [AppStoreAnalyticsPoint!]!, acquisition: [AppStoreAnalyticsSource!]!, campaigns: [AppStoreAnalyticsCampaign!]!, territories: [String!]! }

  type RevenueAmounts { currency: String!, proceeds: String, sales: String }
  type RevenuePoint { date: String!, currency: String!, proceeds: String, sales: String }
  type RevenueAppAmount { app: String!, currency: String!, proceeds: String, sales: String }
  type RevenueTerritoryAmount { territory: String!, currency: String!, proceeds: String, sales: String }
  type RevenueOverview { amounts: [RevenueAmounts!]!, units: String, payingUsers: String }
  type RevenueSalesRow { date: String!, app: String!, item: String, sku: String, productType: String, units: String, unitProceeds: String, unitPrice: String, proceeds: String, proceedsCurrency: String, sales: String, salesCurrency: String, territory: String }
  type RevenueSales { completeThrough: String, rows: [RevenueSalesRow!]!, amounts: [RevenueAmounts!]!, units: String, trend: [RevenuePoint!]!, byApp: [RevenueAppAmount!]!, byTerritory: [RevenueTerritoryAmount!]! }
  type RevenueSubscriptionPoint { date: String!, starts: String, renewals: String, churn: String }
  type RevenueSubscription { subscription: String!, starts: String, renewals: String, churn: String }
  type RevenueSubscriptions { completeThrough: String, active: String, starts: String, conversions: String, renewals: String, voluntaryChurn: String, involuntaryChurn: String, trend: [RevenueSubscriptionPoint!]!, bySubscription: [RevenueSubscription!]! }
  type RevenueSettlement { fiscalMonth: String!, region: String!, currency: String!, startDate: String!, endDate: String!, earned: String, units: String }
  type RevenueReport { updatedAt: String, completeThrough: String, overview: RevenueOverview!, trend: [RevenuePoint!]!, byApp: [RevenueAppAmount!]!, byTerritory: [RevenueTerritoryAmount!]!, sales: RevenueSales!, subscriptions: RevenueSubscriptions!, settlements: [RevenueSettlement!]!, territories: [String!]! }
`;

export const appStoreResolvers = {
  Query: { appStore: () => ({}) },
  AppStoreQuery: {
    enabledApps: (_parent: unknown, _args: unknown, context: GraphQLContext) => listEnabledAnalyticsApps(context.user),
    connections: (_parent: unknown, _args: unknown, context: GraphQLContext) => getAppStoreConnections(context.user),
    connection: async (_parent: unknown, args: { id: number }, context: GraphQLContext) => {
      try { return await getAppStoreConnectionPage(args.id, context.user); }
      catch (error) {
        if (error instanceof AppStoreError) {
          const code = error.code === "forbidden" ? "FORBIDDEN" : error.code === "not_found" ? "NOT_FOUND" : "BAD_USER_INPUT";
          throw createGraphQLError(error.code === "forbidden" ? "Forbidden" : error.code === "not_found" ? "Not found" : error.message, { extensions: { code } });
        }
        throw error;
      }
    },
    analytics: (_parent: unknown, args: { from: string; to: string; appId?: number; territory?: string }, context: GraphQLContext) =>
      getAppStoreAnalyticsDashboard(context.user, args),
    revenue: (_parent: unknown, args: { from: string; to: string; appId?: number; territory?: string; fiscalMonth?: string }, context: GraphQLContext) =>
      getAppStoreRevenueDashboard(context.user, args),
  },
};
