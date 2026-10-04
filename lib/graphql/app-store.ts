import { getAppStoreAnalyticsDashboard, listEnabledAnalyticsApps } from "@/lib/services/app-store-analytics-reporting";
import { getAppStoreRevenueDashboard } from "@/lib/services/app-store-revenue";
import type { GraphQLContext } from "./context";

export const appStoreTypeDefs = /* GraphQL */ `
  extend type Query { appStore: AppStoreQuery! }
  type AppStoreQuery {
    enabledApps: [AppStoreAppOption!]!
    analytics(from: String!, to: String!, appId: Int, territory: String): AppStoreAnalyticsReport!
    revenue(from: String!, to: String!, appId: Int, territory: String, fiscalMonth: String): RevenueReport!
  }
  type AppStoreAppOption { id: Int!, name: String! }
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
    analytics: (_parent: unknown, args: { from: string; to: string; appId?: number; territory?: string }, context: GraphQLContext) =>
      getAppStoreAnalyticsDashboard(context.user, args),
    revenue: (_parent: unknown, args: { from: string; to: string; appId?: number; territory?: string; fiscalMonth?: string }, context: GraphQLContext) =>
      getAppStoreRevenueDashboard(context.user, args),
  },
};
