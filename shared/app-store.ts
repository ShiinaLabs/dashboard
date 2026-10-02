export interface AppStoreConnection {
  id: number;
  owner_id: number;
  name: string;
  issuer_id: string;
  key_id: string;
  vendor_number: string | null;
  private_key_configured: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AppStoreApp {
  id: number;
  connection_id: number;
  apple_id: string;
  bundle_id: string;
  sku: string;
  name: string;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface AppStoreSyncRun {
  id: number;
  connection_id: number;
  kind: "metadata" | "analytics" | "sales" | "finance";
  scope?: string | null;
  trigger: "manual" | "scheduler";
  status: "running" | "success" | "partial" | "error";
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  error_message: string | null;
}

export interface AppStoreConnectionDetail {
  connection: AppStoreConnection;
  apps: AppStoreApp[];
  recentSyncRuns: AppStoreSyncRun[];
  lastSuccessfulSync: AppStoreSyncRun | null;
}

export interface AppStoreConnectionInput {
  name: string;
  issuerId: string;
  keyId: string;
  privateKey: string;
  vendorNumber?: string | null;
}

export type AppStoreConnectionUpdate = Partial<AppStoreConnectionInput> & { isActive?: boolean };
