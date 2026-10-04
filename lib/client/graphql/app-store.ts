import { graphqlRequest } from "../graphql";
import type { AppStoreAnalyticsAppOption, AppStoreAnalyticsDashboard } from "@/shared/app-store-analytics";
import type { RevenueDashboard } from "@/shared/app-store-revenue";

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
