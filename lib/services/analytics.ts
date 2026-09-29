import { cloudflareAnalyticsConfig, isMockMode } from "../config";
import { getTrafficSummary } from "../integrations/cloudflare-analytics";

export interface AnalyticsOverview {
  period: "7d";
  views: number;
  visitors: number;
  visits: number;
}

export async function getAnalyticsOverview(): Promise<AnalyticsOverview> {
  if (isMockMode()) {
    return { period: "7d", views: 12_842, visitors: 2_931, visits: 4_102 };
  }

  const config = cloudflareAnalyticsConfig();
  if (!config) throw new Error("Cloudflare Analytics is not configured");

  const summary = await getTrafficSummary(config);
  return { period: "7d", ...summary };
}
