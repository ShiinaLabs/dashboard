import { graphqlRequest } from "../graphql";
import type { AppStoreAnalyticsAppOption, AppStoreAnalyticsDashboard } from "@/shared/app-store-analytics";
import type { RevenueDashboard } from "@/shared/app-store-revenue";
import type { AppStoreConnection, AppStoreConnectionDetail } from "@/shared/app-store";
import type { AppStoreHealth } from "@/shared/app-store-health";
import type { AppStoreAnalyticsStatus } from "@/shared/app-store-analytics";

export type AppStoreConnectionPage = AppStoreConnectionDetail & { health: AppStoreHealth; analyticsStatus: AppStoreAnalyticsStatus };

const connectionsQuery = /* GraphQL */ `query AppStoreConnections { appStore { connections { id name issuer_id key_id vendor_number private_key_configured is_active created_at updated_at } } }`;
const connectionQuery = /* GraphQL */ `
  query AppStoreConnectionPage($id: Int!) {
    appStore { connection(id: $id) {
      connection { id name issuer_id key_id vendor_number private_key_configured is_active created_at updated_at }
      apps { id connection_id apple_id bundle_id sku name is_enabled created_at updated_at }
      recentSyncRuns { id connection_id kind scope trigger status started_at finished_at duration_ms error_message }
      lastSuccessfulSync { id connection_id kind scope trigger status started_at finished_at duration_ms error_message }
      health { connection { state lastSync latestData completeThrough reason } analytics { state lastSync latestData completeThrough reason } revenueAnalytics { state lastSync latestData completeThrough reason } sales { state lastSync latestData completeThrough reason } finance { state lastSync latestData completeThrough reason } }
      analyticsStatus { enabledApps state snapshot ongoing latestData completeThrough message lastSync { id connection_id kind scope trigger status started_at finished_at duration_ms error_message } }
    } }
  }
`;

export async function getAppStoreConnectionsQuery(signal?: AbortSignal) {
  const result = await graphqlRequest<{ appStore: { connections: AppStoreConnection[] } }, Record<string, never>>(connectionsQuery, {}, signal);
  return result.appStore.connections;
}

export async function getAppStoreConnectionPageQuery(id: number, signal?: AbortSignal) {
  const result = await graphqlRequest<{ appStore: { connection: AppStoreConnectionPage } }, { id: number }>(connectionQuery, { id }, signal);
  return result.appStore.connection;
}

const analyticsPage = /* GraphQL */ `
  query AppStoreAnalyticsPage($from: String!, $to: String!, $appId: Int, $territory: String) {
    appStore {
      enabledApps { id name }
      analytics(from: $from, to: $to, appId: $appId, territory: $territory) {
        updatedAt completeThrough
        overview { impressions views firstTimeDownloads downloads conversion }
        trend { date impressions views firstTimeDownloads downloads conversion }
        acquisition { source impressions views firstTimeDownloads downloads conversion }
        campaigns { campaign impressions views firstTimeDownloads downloads conversion trend { date downloads } }
        territories
      }
    }
  }
`;
const revenuePage = /* GraphQL */ `
  query RevenuePage($from: String!, $to: String!, $appId: Int, $territory: String, $fiscalMonth: String) {
    appStore {
      enabledApps { id name }
      revenue(from: $from, to: $to, appId: $appId, territory: $territory, fiscalMonth: $fiscalMonth) {
        updatedAt completeThrough
        overview { amounts { currency proceeds sales } units payingUsers }
        trend { date currency proceeds sales }
        byApp { app currency proceeds sales }
        byTerritory { territory currency proceeds sales }
        sales {
          completeThrough
          rows { date app item sku productType units unitProceeds unitPrice proceeds proceedsCurrency sales salesCurrency territory }
          amounts { currency proceeds sales } units
          trend { date currency proceeds sales }
          byApp { app currency proceeds sales }
          byTerritory { territory currency proceeds sales }
        }
        subscriptions {
          completeThrough active starts conversions renewals voluntaryChurn involuntaryChurn
          trend { date starts renewals churn }
          bySubscription { subscription starts renewals churn }
        }
        settlements { fiscalMonth region currency startDate endDate earned units }
        territories
      }
    }
  }
`;

export async function getAppStoreAnalyticsPage(variables: { from: string; to: string; appId?: number; territory?: string }, signal?: AbortSignal) {
  const result = await graphqlRequest<{ appStore: { enabledApps: AppStoreAnalyticsAppOption[]; analytics: AppStoreAnalyticsDashboard } }, typeof variables>(analyticsPage, variables, signal);
  return result.appStore;
}

export async function getRevenuePage(variables: { from: string; to: string; appId?: number; territory?: string; fiscalMonth?: string }, signal?: AbortSignal) {
  const result = await graphqlRequest<{ appStore: { enabledApps: AppStoreAnalyticsAppOption[]; revenue: RevenueDashboard } }, typeof variables>(revenuePage, variables, signal);
  return result.appStore;
}
