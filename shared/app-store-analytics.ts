import type { AppStoreSyncRun } from "./app-store";

export type AppStoreAnalyticsState = "not_configured" | "waiting" | "active" | "partial" | "stale" | "action_required" | "error";
export interface AppStoreAnalyticsStatus {
  enabledApps: number;
  state: AppStoreAnalyticsState;
  snapshot: "ready" | "pending" | "unavailable";
  ongoing: "active" | "pending" | "unavailable";
  latestData: string | null;
  completeThrough: string | null;
  lastSync: AppStoreSyncRun | null;
  message: string | null;
}

export interface AppStoreAnalyticsAppOption { id: number; name: string }
export interface AppStoreAnalyticsMetrics {
  impressions: number | null;
  views: number | null;
  firstTimeDownloads: number | null;
  downloads: number | null;
  conversion: number | null;
}
export interface AppStoreMetricCoverage { state: "unknown" | "partial" | "complete"; reportingApps: number; totalApps: number }
export type AppStoreAnalyticsCoverage = Record<keyof AppStoreAnalyticsMetrics, AppStoreMetricCoverage>;
export interface AppStoreAnalyticsDashboard {
  updatedAt: string | null;
  completeThrough: string | null;
  overview: AppStoreAnalyticsMetrics;
  coverage: AppStoreAnalyticsCoverage;
  trend: ({ date: string; coverage: AppStoreAnalyticsCoverage } & AppStoreAnalyticsMetrics)[];
  acquisition: ({ source: string } & AppStoreAnalyticsMetrics)[];
  campaigns: ({ campaign: string; trend: { date: string; downloads: number | null }[] } & AppStoreAnalyticsMetrics)[];
  territories: string[];
}
