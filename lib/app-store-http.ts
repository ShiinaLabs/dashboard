import { json } from "./api-server";
import { AppStoreError } from "./services/app-store";
import { AppStoreApiError } from "./infra/app-store/AppStoreConnectClient";
import { AppStoreConflictError, AppStoreSyncBusyError } from "./repositories/app-store";

export function appStoreErrorResponse(error: unknown): Response {
  if (error instanceof AppStoreError) return json({ error: error.message, code: error.code }, { status: error.status });
  if (error instanceof AppStoreApiError) return json({ error: error.message, code: error.code, upstreamStatus: error.status }, { status: 502 });
  if (error instanceof AppStoreConflictError) return json({ error: error.message, code: "connection_changed" }, { status: 409 });
  if (error instanceof AppStoreSyncBusyError) return json({ error: error.message, code: "sync_busy" }, { status: 409 });
  if (error instanceof SyntaxError) return json({ error: "Invalid JSON body" }, { status: 400 });
  // Do not expose SQL errors that might include a credential value.
  return json({ error: "App Store Connect operation failed", code: "internal_error" }, { status: 500 });
}

export function appStoreId(value: string | undefined) {
  if (!value || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) throw new AppStoreError("invalid_id", 400, "Invalid connection or app id");
  return Number(value);
}
