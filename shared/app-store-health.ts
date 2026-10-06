export type AppStoreHealthState = "healthy" | "partial" | "waiting" | "stale" | "action_required" | "error" | "never_run";
export interface AppStoreSourceHealth {
  state: AppStoreHealthState;
  lastSync: string | null;
  latestData: string | null;
  completeThrough: string | null;
  reason: string | null;
}
export type AppStoreHealth = Record<"connection" | "analytics" | "revenueAnalytics" | "sales" | "finance", AppStoreSourceHealth>;
