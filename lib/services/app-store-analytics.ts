import { readAnalyticsPartitions } from "../repositories/app-store-facts";
import { analyticsCompleteThrough } from "./app-store-analytics-reporting";
import { isMockMode } from "../config";
import { authorizedConnection, clientForConnection, AppStoreError } from "./app-store";
import * as analytics from "../repositories/app-store-analytics";
import { startRun, finishRun, AppStoreConflictError } from "../repositories/app-store";
import { AppStoreApiError } from "../infra/app-store/AppStoreConnectClient";
import { reportRunDisplayStatus } from "../../shared/app-store";
import type { AppStoreAnalyticsStatus } from "@/shared/app-store-analytics";

type Viewer = { id: number; role: string };
const setupInFlight = new Set<number>();
const FIRST_REPORT_GRACE_MS = 72 * 60 * 60 * 1000;

export function analyticsErrorMessage(error: unknown): string {
  if (error instanceof AppStoreApiError) {
    if (error.status === 403) return "Analytics setup requires additional App Store Connect permission. " + error.message;
    return error.message;
  }
  if (error instanceof AppStoreError || error instanceof AppStoreConflictError) return error.message;
  return "App Store Analytics operation failed";
}

export function analyticsRunStatus(succeeded: number, failed: number): "success" | "partial" | "error" {
  return failed === 0 ? "success" : succeeded > 0 ? "partial" : "error";
}

export async function getAppStoreAnalyticsStatus(connectionId: number, viewer: Viewer): Promise<AppStoreAnalyticsStatus> {
  await authorizedConnection(connectionId, viewer);
  const apps = await analytics.enabledApps(connectionId);
  const [requests, runs, allPartitions] = await Promise.all([analytics.requestsForApps(apps.map((app) => app.id)), analytics.analyticsRuns(connectionId), readAnalyticsPartitions(apps.map((app) => app.id))]);
  const ongoingRequests = requests.filter((request) => request.access_type === "ONGOING");
  const ongoingReady = apps.length > 0 && apps.every((app) => ongoingRequests.some((request) => request.app_id === app.id && !request.stopped_due_to_inactivity));
  const snapshotReady = apps.length > 0 && apps.every((app) => requests.some((request) => request.app_id === app.id && request.access_type === "ONE_TIME_SNAPSHOT"));
  const partitions = allPartitions.filter((p) => p.report_kind === "discovery" || p.report_kind === "downloads");
  const lastSync = runs[0] ?? null;
  const lastStatus = lastSync ? reportRunDisplayStatus(lastSync) : null;
  const hasData = partitions.length > 0;
  const stoppedWithoutReplacement = apps.some((app) => {
    const appRequests = ongoingRequests.filter((request) => request.app_id === app.id);
    return appRequests.length > 0 && !appRequests.some((request) => !request.stopped_due_to_inactivity);
  });
  const oldestActiveCreatedAt = ongoingRequests.filter((request) => !request.stopped_due_to_inactivity).map((request) => Date.parse(request.created_at)).filter(Number.isFinite).sort((a, b) => a - b)[0];
  const withinGrace = oldestActiveCreatedAt !== undefined && Date.now() - oldestActiveCreatedAt <= FIRST_REPORT_GRACE_MS;
  const hasPartialWaiting = Boolean(lastSync?.error_message?.startsWith("report_waiting: "));
  const state: AppStoreAnalyticsStatus["state"] = lastStatus === "error" ? "error"
    : lastStatus === "partial" ? "partial"
      : stoppedWithoutReplacement && !ongoingReady ? "action_required"
        : hasData ? hasPartialWaiting || lastStatus === "waiting" ? "partial" : "active"
          : !requests.length ? "not_configured"
            : ongoingReady && withinGrace ? "waiting" : "stale";
  const dates = partitions.map((p) => p.date).sort();
  return {
    enabledApps: apps.length, state,
    snapshot: snapshotReady ? "ready" : requests.length ? "pending" : "unavailable",
    ongoing: ongoingReady ? "active" : requests.length ? "pending" : "unavailable",
    // Freshness is not inferred from setup/sync wall time, or from a manifest alone.
    latestData: dates.at(-1) ?? null, completeThrough: dates.length ? analyticsCompleteThrough(partitions, apps.map((a) => a.id), ["discovery", "downloads"], dates[0], dates.at(-1)!) : null, lastSync: lastSync ? { ...lastSync, diagnostic_summary: undefined } : null,
    message: state === "stale" && !hasData ? "No Analytics data is available after the 72-hour first-report grace period" : state === "action_required" ? "An Ongoing request stopped and has no active replacement" : lastSync?.error_message ?? null,
  };
}

/** Selecting an app never calls this use case. Only explicit Analytics setup does. */
export async function setupAppStoreAnalytics(connectionId: number, viewer: Viewer) {
  const connection = await authorizedConnection(connectionId, viewer);
  if (!connection.is_active) throw new AppStoreError("connection_disabled", 409, "Enable this connection before setting up Analytics");
  const apps = await analytics.enabledApps(connectionId);
  if (!apps.length) throw new AppStoreError("no_enabled_apps", 400, "Enable at least one app before setting up Analytics");
  if (setupInFlight.has(connectionId)) throw new AppStoreError("analytics_busy", 409, "Analytics setup is already running for this connection");
  setupInFlight.add(connectionId);
  let run;
  try {
    run = await startRun(connectionId, "analytics", "acquisition");
    const client = isMockMode() ? null : clientForConnection(connection);
    let succeeded = 0;
    const errors: string[] = [];
    for (const app of apps) {
      try {
        await analytics.assertAppStillEnabled(app.id, connectionId, connection.updated_at);
        const existing = client ? await client.listAnalyticsReportRequests(app.apple_id) : [];
        for (const resource of existing) await analytics.adoptRequest(app.id, resource, connection.updated_at);
        for (const accessType of ["ONE_TIME_SNAPSHOT", "ONGOING"] as const) {
          const present = existing.some((resource) => resource.attributes.accessType === accessType && (accessType === "ONE_TIME_SNAPSHOT" || !resource.attributes.stoppedDueToInactivity));
          if (present) continue;
          await analytics.assertAppStillEnabled(app.id, connectionId, connection.updated_at);
          let resource;
          try {
            resource = client ? await client.createAnalyticsReportRequest(app.apple_id, accessType) : {
              id: `mock-${app.id}-${accessType}`, type: "analyticsReportRequests" as const, attributes: { accessType, stoppedDueToInactivity: false },
            };
          } catch (error) {
            // A concurrent Apple-side setup may already have created the request.
            if (!(error instanceof AppStoreApiError) || error.status !== 409 || !client) throw error;
            const adopted = await client.listAnalyticsReportRequests(app.apple_id);
            resource = adopted.find((item) => item.attributes.accessType === accessType && !item.attributes.stoppedDueToInactivity);
            if (!resource) throw error;
          }
          await analytics.adoptRequest(app.id, resource, connection.updated_at);
        }
        succeeded++;
      } catch (error) { errors.push(analyticsErrorMessage(error)); }
    }
    await finishRun(run, analyticsRunStatus(succeeded, errors.length), errors.length ? errors.join("; ").slice(0, 2000) : null);
  } catch (error) {
    if (run) await finishRun(run, "error", analyticsErrorMessage(error));
    throw error;
  } finally { setupInFlight.delete(connectionId); }
  return getAppStoreAnalyticsStatus(connectionId, viewer);
}
