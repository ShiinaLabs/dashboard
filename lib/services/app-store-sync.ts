import { createHash } from "node:crypto";
import { z } from "zod";
import { authorizedConnection, clientForConnection, AppStoreError } from "./app-store";
import { startRun, finishRun, checkpointRun } from "../repositories/app-store";
import * as analytics from "../repositories/app-store-analytics";
import * as facts from "../repositories/app-store-facts";
import { analyticsReportDefinitions, analyticsReportRequiredHeaders, identifyStandardAnalyticsReport, mapAnalyticsReport, mapSalesReport, mapFinanceReport, type AnalyticsReportKind } from "../infra/app-store/report-mapping";
import { prepareAnalyticsInstance, AnalyticsInstanceError } from "../infra/app-store/analytics-instance";
import { gunzipAnalyticsSegment, AppStoreReportError } from "../infra/app-store/analytics-segment";
import { parseAnalyticsTsv, parseFinanceTsv } from "../infra/app-store/analytics-tsv";
import { AppStoreApiError } from "../infra/app-store/AppStoreConnectClient";
import { isMockMode } from "../config";
import { analyticsRunStatus } from "./app-store-analytics";
import type { ConnectionRow } from "../repositories/app-store";
import { logStructured } from "../logger";
import { latestSalesReportDate } from "../../shared/app-store-revenue";
import type { AppStoreDiagnosticSummary } from "@/db/schema/app-store";
import { readAnalyticsPartitions } from "../repositories/app-store-facts";

const ANALYTICS_CORRECTION_WINDOW_DAYS = 7;

type Viewer = { id: number; role: string };
type RunRow = Awaited<ReturnType<typeof startRun>>;
export interface ReportSyncResult { status: "success" | "partial" | "error" | "waiting"; imported: number; skipped: number; waiting: number; waitingReasons: string[]; errors: string[] }
interface RunProgress {
  apps: number;
  requests: number;
  reportsDiscovered: number;
  reportsSelected: number;
  instancesDiscovered: number;
  instancesProcessed: number;
  instancesImported: number;
  instancesSkipped: number;
  instancesWaiting: number;
  instancesFailed: number;
  segmentsDownloaded: number;
  parsedRows: number;
  mappedRows: number;
}
function runProgress(): RunProgress { return { apps: 0, requests: 0, reportsDiscovered: 0, reportsSelected: 0, instancesDiscovered: 0, instancesProcessed: 0, instancesImported: 0, instancesSkipped: 0, instancesWaiting: 0, instancesFailed: 0, segmentsDownloaded: 0, parsedRows: 0, mappedRows: 0 }; }
const inFlight = new Set<number>();
function logEvent(level: "debug" | "info" | "warn" | "error", event: string, fields: Record<string, unknown>) {
  logStructured(level, "ASC", event, fields);
}
function runContext(run: RunRow) { return { connectionId: run.connection_id, runId: run.id, source: run.kind, scope: run.scope }; }
async function finishReportRun(run: RunRow, result: ReportSyncResult, progress: RunProgress) {
  const waitingPrefix = result.status === "success" && result.imported + result.skipped > 0 ? "report_waiting" : "waiting";
  const waiting = result.waitingReasons.length ? `${waitingPrefix}: ${result.waitingReasons.join("; ")}` : "";
  const errors = result.errors.length ? result.errors.join("; ") : "";
  const errorLimit = waiting ? 1390 : 1991;
  const message = [errors ? `error: ${errors.slice(0, errorLimit)}` : "", waiting ? waiting.slice(0, 590) : ""].filter(Boolean).join("; ").slice(0, 2000) || null;
  try { await finishRun(run, result.status === "waiting" ? "success" : result.status, message); }
  catch (error) {
    const diagnostic = reportDiagnostic(error);
    result.errors.push(diagnostic);
    result.status = reportSyncStatus(result);
    logEvent("error", "report_failed", { ...runContext(run), stage: "finish", code: "report_import_failed", diagnostic });
  }
  const partialCoverage = result.waiting > 0 && result.imported + result.skipped > 0;
  logEvent(result.status === "error" ? "error" : result.status === "partial" || partialCoverage ? "warn" : "info", "sync_finished", { ...runContext(run), status: result.status, coverage: partialCoverage ? "partial" : result.waiting ? "unknown" : "complete", imported: result.imported, skipped: result.skipped, waiting: result.waiting, failures: result.errors.length, ...progress, durationMs: Date.now() - Date.parse(run.started_at) });
}
export function reportDiagnostic(error: unknown): string {
  if (error instanceof AnalyticsInstanceError) {
    return error.original instanceof AppStoreApiError
      ? reportDiagnostic(error.original)
      : `${error.code}: ${error.message}`;
  }
  if (error instanceof AppStoreReportError) return `${error.code}: ${error.message}`;
  if (error instanceof AppStoreApiError) return ["apple_report_error", `status=${error.status}`, `code=${error.code}`, error.title ? `title=${error.title}` : null, error.parameter ? `parameter=${error.parameter}` : null, `message=${error.message}`].filter(Boolean).join(" ");
  // Driver/fetch errors may contain report rows, SQL values, signed URLs or credentials.
  return "report_import_failed";
}
function reportSyncStatus(result: Pick<ReportSyncResult, "imported" | "skipped" | "waiting" | "errors">): ReportSyncResult["status"] {
  const completed = result.imported + result.skipped;
  if (!result.errors.length && !completed && result.waiting) return "waiting";
  return analyticsRunStatus(completed, result.errors.length);
}
function recordWaiting(result: ReportSyncResult, run: RunRow, stage: string, reason: string, fields: Record<string, unknown> = {}) {
  result.waiting++;
  const diagnostic = [reason, ...Object.entries(fields).map(([key, value]) => `${key}=${value}`)].join(" ");
  if (!result.waitingReasons.includes(diagnostic)) result.waitingReasons.push(diagnostic);
  logEvent("debug", "report_waiting", { ...runContext(run), ...fields, stage, reason });
}
async function syncAnalyticsReports(connection: ConnectionRow, kinds: AnalyticsReportKind[], scope: string, trigger: "manual" | "scheduler", mode: "ongoing" | "snapshot"): Promise<ReportSyncResult> {
  const result: ReportSyncResult = { status: "success", imported: 0, skipped: 0, waiting: 0, waitingReasons: [], errors: [] };
  const progress = runProgress();
  const run = await startRun(connection.id, "analytics", scope, trigger);
  const diagnostic: AppStoreDiagnosticSummary = { version: 1, checkpoint: "request", checkpointAt: new Date().toISOString(), source: "analytics", scope, trigger, counters: {}, reports: [], before: {}, after: {}, issues: [] };
  const localByReport = new Map<string, { processingDate: string; latestData: string }>();
  const checkpoint = async (stage: string, fields: Record<string, unknown> = {}) => {
    diagnostic.checkpoint = stage;
    diagnostic.checkpointAt = new Date().toISOString();
    diagnostic.counters = { apps: progress.apps, requests: progress.requests, reportsSelected: progress.reportsSelected, instancesDiscovered: progress.instancesDiscovered, instancesProcessed: progress.instancesProcessed, imported: progress.instancesImported, skipped: progress.instancesSkipped, waiting: progress.instancesWaiting, failed: progress.instancesFailed, segmentsDownloaded: progress.segmentsDownloaded, parsedRows: progress.parsedRows, mappedRows: progress.mappedRows };
    if (typeof fields.appId === "number" && typeof fields.reportKind === "string") {
      const index = diagnostic.reports.findIndex((item) => item.appId === fields.appId && item.reportKind === fields.reportKind && item.accessType === mode);
      const local = localByReport.get(`${fields.appId}:${fields.reportKind}`);
      const previous = index >= 0 ? diagnostic.reports[index] : { appId: fields.appId, reportKind: fields.reportKind, accessType: mode === "ongoing" ? "ONGOING" : "ONE_TIME_SNAPSHOT", state: stage, appleProcessingDate: null, localProcessingDate: local?.processingDate ?? null, latestData: local?.latestData ?? null };
      const entry = { ...previous, state: stage, ...(typeof fields.processingDate === "string" ? { appleProcessingDate: fields.processingDate } : {}) };
      if (index >= 0) diagnostic.reports[index] = entry; else diagnostic.reports.push(entry);
    }
    await checkpointRun(run, structuredClone(diagnostic));
  };
  await checkpoint("request");
  logEvent("info", "sync_started", runContext(run));
  const fail = (stage: string, message: string, fields: Record<string, unknown> = {}, code?: string) => {
    result.errors.push(message);
    diagnostic.issues.push({ severity: "error", stage, code: code ?? "failure", ...(typeof fields.appId === "number" ? { appId: fields.appId } : {}), ...(typeof fields.reportKind === "string" ? { reportKind: fields.reportKind } : {}) });
    logEvent("error", "report_failed", { ...runContext(run), ...fields, stage, ...(code ? { code } : {}), diagnostic: message });
  };
  const wait = (stage: string, reason: string, fields: Record<string, unknown> = {}) => {
    diagnostic.issues.push({ severity: "info", stage, code: reason, ...(typeof fields.appId === "number" ? { appId: fields.appId } : {}), ...(typeof fields.reportKind === "string" ? { reportKind: fields.reportKind } : {}) });
    recordWaiting(result, run, stage, reason, fields);
  };
  try {
    if (isMockMode()) wait("report", "no_reports_generated");
    else {
      const client = clientForConnection(connection);
      const apps = await analytics.enabledApps(connection.id);
      progress.apps = apps.length;
      const localBefore = await readAnalyticsPartitions(apps.map((app) => app.id));
      for (const partition of localBefore) {
        const key = `${partition.app_id}:${partition.report_kind}`;
        const previous = localByReport.get(key);
        if (!previous || partition.processing_date > previous.processingDate) localByReport.set(key, { processingDate: partition.processing_date, latestData: partition.date });
      }
      diagnostic.before = { latestProcessingDate: localBefore.map((item) => item.processing_date).sort().at(-1) ?? null, latestBusinessDate: localBefore.map((item) => item.date).sort().at(-1) ?? null, partitions: localBefore.length };
      await checkpoint("request");
      if (!apps.length) wait("connection", "no_enabled_apps");
      for (const app of apps) {
        let existingImports: Awaited<ReturnType<typeof analytics.importsForApps>> = [];
        let resources;
        try {
          existingImports = await analytics.importsForApps([app.id]);
          resources = await client.listAnalyticsReportRequests(app.apple_id);
          progress.requests += resources.length;
          const expectedAccessType = mode === "ongoing" ? "ONGOING" : "ONE_TIME_SNAPSHOT";
          const matching = resources.filter((request) => request.attributes.accessType === expectedAccessType);
          const active = matching.filter((request) => !request.attributes.stoppedDueToInactivity);
          await checkpoint("request", { appId: app.id });
          logEvent("info", "analytics_requests_discovered", { ...runContext(run), appId: app.id, count: matching.length, active: active.length, stopped: matching.length - active.length, accessType: expectedAccessType });
          if (!matching.length) wait("request", "no_matching_request", { appId: app.id, accessType: expectedAccessType });
          else if (!active.length) wait("request", "requests_inactive", { appId: app.id, accessType: expectedAccessType });
        } catch (error) {
          fail("request", reportDiagnostic(error), { appId: app.id }, error instanceof AppStoreApiError ? error.code : undefined);
          continue;
        }
        for (const resource of resources) {
          if (resource.attributes.accessType !== (mode === "ongoing" ? "ONGOING" : "ONE_TIME_SNAPSHOT")) continue;
          let request: Awaited<ReturnType<typeof analytics.adoptRequest>>;
          try { request = await analytics.adoptRequest(app.id, resource, connection.updated_at); }
          catch (error) { fail("request", reportDiagnostic(error), { appId: app.id, requestId: resource.id }); continue; }
          if (resource.attributes.stoppedDueToInactivity) continue;
          let reports;
          await checkpoint("catalog", { appId: app.id });
          try { reports = await client.listAnalyticsReports(resource.id); }
          catch (error) { fail("report", reportDiagnostic(error), { appId: app.id, requestId: resource.id }, error instanceof AppStoreApiError ? error.code : undefined); continue; }
          progress.reportsDiscovered += reports.length;
          await checkpoint("catalog", { appId: app.id });
          const targetsFound = new Set(reports.map((report) => identifyStandardAnalyticsReport(report.attributes.name)).filter((kind): kind is AnalyticsReportKind => Boolean(kind)));
          logEvent("info", "analytics_report_catalog", { ...runContext(run), appId: app.id, requestId: resource.id, accessType: resource.attributes.accessType, count: reports.length, targetsFound: [...targetsFound], targetsMissing: kinds.filter((kind) => !targetsFound.has(kind)) });
          logEvent("debug", "analytics_report_catalog_targets", { ...runContext(run), appId: app.id, details: reports.map(({ attributes }) => ({ name: attributes.name, category: attributes.category })) });
          const selected = reports.flatMap((report) => {
            const kind = identifyStandardAnalyticsReport(report.attributes.name);
            return kind && kinds.includes(kind) ? [{ report, kind }] : [];
          });
          progress.reportsSelected += selected.length;
          if (!reports.length) {
            wait("report", "no_reports_generated", { appId: app.id, requestId: resource.id });
            for (const kind of kinds) {
              diagnostic.reports.push({ appId: app.id, reportKind: kind, accessType: mode === "ongoing" ? "ONGOING" : "ONE_TIME_SNAPSHOT", state: "no_reports", appleProcessingDate: null, localProcessingDate: null, latestData: null });
              await checkpoint("catalog", { appId: app.id, reportKind: kind });
            }
          } else for (const kind of kinds) {
            if (selected.some((item) => item.kind === kind)) continue;
            const definition = analyticsReportDefinitions[kind];
            // Family detection diagnoses missing Standard variants; it never selects an importer.
            const received = reports.map((r) => r.attributes.name).filter((name) => name === definition.baseName || name.startsWith(`${definition.baseName} `));
            if (received.length) {
              const diagnostic = `unexpected_report_variant; expected=${definition.standardName}; received=${received.join(", ")}`;
              fail("report", diagnostic, { appId: app.id, requestId: resource.id, reportKind: kind, reason: "unexpected_report_variant", expected: definition.standardName, received }, "unexpected_report_variant");
            } else {
              diagnostic.reports.push({ appId: app.id, reportKind: kind, accessType: mode === "ongoing" ? "ONGOING" : "ONE_TIME_SNAPSHOT", state: "waiting", appleProcessingDate: null, localProcessingDate: null, latestData: null });
              await checkpoint("catalog", { appId: app.id, reportKind: kind });
              wait("report", "target_report_unavailable", { appId: app.id, requestId: resource.id, reportKind: kind });
            }
          }
          for (const { report, kind } of selected) {
            await checkpoint("instance", { appId: app.id, reportKind: kind });
            logEvent("info", "analytics_report_selected", { ...runContext(run), appId: app.id, requestId: resource.id, reportId: report.id, reportKind: kind, reportName: report.attributes.name });
            let instances;
            try { instances = (await client.listAnalyticsReportInstances(report.id)).filter((instance) => instance.attributes.granularity === "DAILY").sort((a, b) => a.attributes.processingDate.localeCompare(b.attributes.processingDate)); }
            catch (error) { fail("instance", reportDiagnostic(error), { appId: app.id, requestId: resource.id, reportId: report.id, reportKind: kind }, error instanceof AppStoreApiError ? error.code : undefined); continue; }
            progress.instancesDiscovered += instances.length;
            await checkpoint("instance", { appId: app.id, reportKind: kind, processingDate: instances.at(-1)?.attributes.processingDate });
            logEvent("info", "analytics_instances_discovered", { ...runContext(run), appId: app.id, reportId: report.id, reportKind: kind, count: instances.length, earliestProcessingDate: instances[0]?.attributes.processingDate ?? null, latestProcessingDate: instances.at(-1)?.attributes.processingDate ?? null });
            if (!instances.length) {
              progress.instancesWaiting++;
              const existing = diagnostic.reports.find((item) => item.appId === app.id && item.reportKind === kind && item.accessType === (mode === "ongoing" ? "ONGOING" : "ONE_TIME_SNAPSHOT"));
              if (existing) existing.state = "no_daily_instances";
              else diagnostic.reports.push({ appId: app.id, reportKind: kind, accessType: mode === "ongoing" ? "ONGOING" : "ONE_TIME_SNAPSHOT", state: "no_daily_instances", appleProcessingDate: null, localProcessingDate: null, latestData: null });
              await checkpoint("instance", { appId: app.id, reportKind: kind });
              wait("instance", "no_daily_instances", { appId: app.id, reportKind: kind, report: analyticsReportDefinitions[kind].standardName });
            }
            const importedInstances = new Set(mode === "snapshot" ? [] : existingImports
              .filter((item) => item.apple_report_id === report.id && item.status === "imported")
              .map((item) => item.apple_instance_id));
            for (const instance of instances) {
              progress.instancesProcessed++;
              const instanceFields = { appId: app.id, reportId: report.id, reportKind: kind, instanceId: instance.id, processingDate: instance.attributes.processingDate };
              if (mode === "snapshot") logEvent("info", "backfill_progress", { ...runContext(run), ...instanceFields, accessType: "ONE_TIME_SNAPSHOT" });
              const manifests = existingImports.filter((item) => item.apple_instance_id === instance.id && item.apple_report_id === report.id && item.status === "imported");
              const correctionCutoff = new Date(Date.now() - (ANALYTICS_CORRECTION_WINDOW_DAYS - 1) * 86_400_000).toISOString().slice(0, 10);
              const oldImported = importedInstances.has(instance.id) && instance.attributes.processingDate < correctionCutoff && manifests.length > 0;
              if (oldImported && mode === "ongoing") {
                result.skipped++;
                progress.instancesSkipped++;
                const diagnosticReport = diagnostic.reports.find((item) => item.appId === app.id && item.reportKind === kind && item.accessType === "ONGOING");
                if (diagnosticReport) Object.assign(diagnosticReport, { state: "skipped", appleProcessingDate: instance.attributes.processingDate, localProcessingDate: instance.attributes.processingDate, latestData: instance.attributes.processingDate });
                await checkpoint("verify", { ...instanceFields });
                logEvent("debug", "analytics_instance_skipped", { ...runContext(run), ...instanceFields, reason: "old_instance_imported", segmentCount: manifests.length });
                continue;
              }
              logEvent("info", "analytics_instance_started", { ...runContext(run), ...instanceFields });
              let listed;
              try { listed = await client.listAnalyticsReportSegments(instance.id); }
              catch (error) { progress.instancesFailed++; fail("segment", reportDiagnostic(error), { ...instanceFields }, error instanceof AppStoreApiError ? error.code : undefined); continue; }
              logEvent("info", "analytics_segments_discovered", { ...runContext(run), ...instanceFields, count: listed.length });
              if (listed.length > 0 && listed.length === manifests.length && listed.every((segment) => manifests.some((manifest) => manifest.apple_segment_id === segment.id && manifest.checksum === segment.attributes.checksum.toLowerCase()))) {
                result.skipped++;
                progress.instancesSkipped++;
                const diagnosticReport = diagnostic.reports.find((item) => item.appId === app.id && item.reportKind === kind && item.accessType === (mode === "ongoing" ? "ONGOING" : "ONE_TIME_SNAPSHOT"));
                if (diagnosticReport) Object.assign(diagnosticReport, { state: "skipped", appleProcessingDate: instance.attributes.processingDate, localProcessingDate: instance.attributes.processingDate, latestData: instance.attributes.processingDate });
                await checkpoint("verify", { ...instanceFields });
                logEvent("debug", "analytics_instance_skipped", { ...runContext(run), ...instanceFields, reason: "segments_unchanged", segmentCount: listed.length });
                continue;
              }
              if (!listed.length) {
                progress.instancesWaiting++;
                wait("segment", "segments_pending", instanceFields);
                continue;
              }
              let prepared;
              await checkpoint("download", { ...instanceFields });
              try {
                prepared = await prepareAnalyticsInstance(client, instance, listed, { requiredHeaders: analyticsReportRequiredHeaders(kind), onProgress: async (event) => {
                  if (event.stage === "segment_download_started") logEvent("debug", "analytics_segment_download_started", { ...runContext(run), ...instanceFields });
                  else {
                    progress.segmentsDownloaded++;
                    logEvent("debug", "analytics_segment_download_finished", { ...runContext(run), ...instanceFields, compressedBytes: event.compressedBytes, durationMs: event.durationMs });
                  }
                } });
              } catch (error) {
                if (error instanceof AppStoreReportError && error.code === "segments_pending") {
                  progress.instancesWaiting++;
                  wait("segment", "segments_pending", instanceFields);
                } else {
                  progress.instancesFailed++;
                  const stage = error instanceof AnalyticsInstanceError ? error.stage : "segment";
                  const fields = { ...instanceFields, ...(error instanceof AnalyticsInstanceError && error.segmentId ? { segmentId: error.segmentId } : {}) };
                  await checkpoint(stage, instanceFields);
                  fail(stage, `${analyticsReportDefinitions[kind].standardName}; instance ${instance.id}; stage ${stage}; ${reportDiagnostic(error)}`, fields, error instanceof AppStoreReportError ? error.code : undefined);
                }
                continue;
              }
              progress.parsedRows += prepared.table.rows.length;
              await checkpoint("parse", { ...instanceFields, processingDate: prepared.processingDate });
              logEvent("info", "analytics_instance_parsed", { ...runContext(run), ...instanceFields, segmentCount: prepared.segments.length, rowCount: prepared.table.rows.length, columnCount: prepared.table.headers.length, headers: prepared.table.headers });
              let mapped;
              await checkpoint("map", { ...instanceFields, processingDate: prepared.processingDate });
              try { mapped = mapAnalyticsReport(kind, prepared.table, { appId: app.id, appleId: app.apple_id, instanceId: instance.id, processingDate: prepared.processingDate }); }
              catch (error) { progress.instancesFailed++; await checkpoint("map", { ...instanceFields, processingDate: prepared.processingDate }); fail("map", `${analyticsReportDefinitions[kind].standardName}; ${reportDiagnostic(error)}`, instanceFields, error instanceof AppStoreReportError ? error.code : undefined); continue; }
              progress.mappedRows += mapped.rows.length;
              await checkpoint("map", { ...instanceFields, processingDate: prepared.processingDate });
              logEvent("info", "analytics_instance_mapped", { ...runContext(run), ...instanceFields, inputRows: prepared.table.rows.length, mappedRows: mapped.rows.length });
              logEvent("info", "analytics_instance_commit_started", { ...runContext(run), ...instanceFields, rows: mapped.rows.length });
              const commitStartedAt = Date.now();
              await checkpoint("commit", { ...instanceFields, processingDate: prepared.processingDate });
              let outcome: "imported" | "skipped";
              try { outcome = await facts.commitAnalyticsInstance({ appId: app.id, connectionId: connection.id, version: connection.updated_at, requestId: request.id, reportId: report.id, reportName: report.attributes.name, reportCategory: report.attributes.category }, prepared, mapped); }
              catch (error) { progress.instancesFailed++; fail("commit", `${analyticsReportDefinitions[kind].standardName}; ${reportDiagnostic(error)}`, instanceFields, error instanceof AppStoreReportError ? error.code : "report_import_failed"); continue; }
              result[outcome]++;
              if (outcome === "imported") progress.instancesImported++;
              else progress.instancesSkipped++;
              diagnostic.reports.push({ appId: app.id, reportKind: kind, accessType: mode === "ongoing" ? "ONGOING" : "ONE_TIME_SNAPSHOT", state: outcome, appleProcessingDate: prepared.processingDate, localProcessingDate: prepared.processingDate, latestData: prepared.processingDate });
              await checkpoint("verify", { ...instanceFields, processingDate: prepared.processingDate });
              logEvent("info", "analytics_instance_committed", { ...runContext(run), ...instanceFields, rows: mapped.rows.length, outcome, durationMs: Date.now() - commitStartedAt });
            }
          }
        }
      }
    }
    result.status = reportSyncStatus(result);
    const localAfter = await readAnalyticsPartitions((await analytics.enabledApps(connection.id)).map((app) => app.id));
    diagnostic.after = { latestProcessingDate: localAfter.map((item) => item.processing_date).sort().at(-1) ?? null, latestBusinessDate: localAfter.map((item) => item.date).sort().at(-1) ?? null, partitions: localAfter.length };
    if (result.waiting && result.imported + result.skipped > 0) diagnostic.issues.push({ severity: "warn", stage: "verify", code: "partial_coverage" });
    await checkpoint("finished");
    await finishReportRun(run, result, progress);
    return result;
  } catch (error) { result.status = "error"; fail("request", reportDiagnostic(error), {}, error instanceof AppStoreApiError ? error.code : undefined); await checkpoint("finished"); await finishReportRun(run, result, progress); throw error; }
}
async function withConnection<T>(id: number, viewer: Viewer, operation: (connection: ConnectionRow) => Promise<T>): Promise<T> {
  const connection = await authorizedConnection(id, viewer);
  if (!connection.is_active) throw new AppStoreError("connection_disabled", 409, "Enable this connection before syncing");
  if (inFlight.has(id)) throw new AppStoreError("sync_busy", 409, "A report sync is already running for this connection");
  inFlight.add(id);
  try { return await operation(connection); }
  finally { inFlight.delete(id); }
}
export function syncAppStoreAnalytics(id: number, viewer: Viewer) {
  return withConnection(id, viewer, async (connection) => {
    if (!(await analytics.enabledApps(id)).length) throw new AppStoreError("no_enabled_apps", 400, "Enable at least one app before syncing Analytics");
    return syncAnalyticsReports(connection, ["discovery", "downloads"], "acquisition", "manual", "ongoing");
  });
}
export async function syncAppStoreAnalyticsForConnection(connection: ConnectionRow, options: { scope: "acquisition" | "revenue"; trigger: "scheduler"; mode: "ongoing" }) {
  if (inFlight.has(connection.id)) throw new AppStoreError("sync_busy", 409, "A report sync is already running for this connection");
  inFlight.add(connection.id);
  try {
    if (!connection.is_active) throw new AppStoreError("connection_disabled", 409, "Enable this connection before syncing");
    const kinds: AnalyticsReportKind[] = options.scope === "acquisition" ? ["discovery", "downloads"] : ["purchases", "subscriptionState", "subscriptionEvent"];
    if (!(await analytics.enabledApps(connection.id)).length) throw new AppStoreError("no_enabled_apps", 400, "Enable at least one app before syncing Analytics");
    return await syncAnalyticsReports(connection, kinds, options.scope, options.trigger, options.mode ?? "ongoing");
  } finally { inFlight.delete(connection.id); }
}
const revenueSyncInput = z.object({ from: z.iso.date(), to: z.iso.date(), fiscalMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), regionCode: z.literal("ZZ") });
async function syncRevenueSources(connection: ConnectionRow, id: number, parsed: z.infer<typeof revenueSyncInput>, options: { trigger: "manual" | "scheduler"; sources: Array<"analytics" | "sales" | "finance">; mode: "ongoing" | "snapshot"; backfill?: boolean; backfillLifecycle?: boolean; salesDates?: string[] }) {
  const { from, to, fiscalMonth, regionCode } = parsed;
  const selectedSources = options.sources;
  if (options.backfill && options.backfillLifecycle !== false) logEvent("info", "backfill_started", { connectionId: id, kind: selectedSources.join(","), from, to, fiscalMonth });
  const sources = { analytics: { status: "success", imported: 0, skipped: 0, waiting: 0, waitingReasons: [], errors: [] } as ReportSyncResult, sales: { status: "success", imported: 0, skipped: 0, waiting: 0, waitingReasons: [], errors: [] } as ReportSyncResult, finance: { status: "success", imported: 0, skipped: 0, waiting: 0, waitingReasons: [], errors: [] } as ReportSyncResult };
  if (selectedSources.includes("analytics")) sources.analytics = await syncAnalyticsReports(connection, ["purchases", "subscriptionState", "subscriptionEvent"], "revenue", options.trigger, options.mode);
  const appCount = (await analytics.enabledApps(id)).length;
  for (const kind of ["sales", "finance"] as const) {
    if (!selectedSources.includes(kind)) continue;
    const result = sources[kind];
    const progress = runProgress();
    progress.apps = appCount;
    const run = await startRun(id, kind, "revenue", options.trigger);
    logEvent("info", "sync_started", { ...runContext(run), ...(kind === "sales" ? { from, to } : { fiscalMonth, regionCode }) });
    const fail = (stage: string, diagnostic: string, fields: Record<string, unknown> = {}, code?: string) => {
      const source = kind === "finance" ? `Finance; fiscal month ${fiscalMonth}; region ${regionCode}` : `Sales${typeof fields.date === "string" ? `; date ${fields.date}` : ""}`;
      const contextualDiagnostic = `${source}; ${diagnostic}`;
      result.errors.push(contextualDiagnostic);
      logEvent("error", "report_failed", { ...runContext(run), ...fields, stage, ...(code ? { code } : {}), diagnostic: contextualDiagnostic });
    };
    try {
      if (!connection.vendor_number) fail("connection", "vendor_required: Revenue setup required: add Vendor Number in Edit Connection");
      else if (isMockMode()) recordWaiting(result, run, "report", "no_reports_generated");
      else {
        const client = clientForConnection(connection);
        if (kind === "sales") {
          const latestDate = latestSalesReportDate();
          const salesDates = options.salesDates ?? Array.from({ length: Math.floor((Date.parse(to) - Date.parse(from)) / 86400000) + 1 }, (_, offset) => new Date(Date.parse(from) + offset * 86400000).toISOString().slice(0, 10));
          for (const date of salesDates) {
            if (date > latestDate) { recordWaiting(result, run, "report", "before_daily_publication", { date, latestDate }); continue; }
            logEvent("info", options.backfill ? "backfill_progress" : "sales_report_started", { ...runContext(run), date });
            let bytes: Buffer | null;
            try { bytes = await client.downloadSalesReport(connection.vendor_number, date); }
            catch (error) { fail("download", reportDiagnostic(error), { date }, error instanceof AppStoreApiError ? error.code : undefined); continue; }
            logEvent("info", "sales_report_downloaded", { ...runContext(run), date, compressedBytes: bytes?.byteLength ?? 0, noSales: bytes === null });
            let table;
            let text = "";
            if (bytes) {
              try {
                text = await gunzipAnalyticsSegment(bytes);
                table = parseAnalyticsTsv(text);
              } catch (error) { fail("parse", reportDiagnostic(error), { date }, error instanceof AppStoreReportError ? error.code : undefined); continue; }
            } else table = { headers: [], rows: [] };
            progress.parsedRows += table.rows.length;
            logEvent("info", "sales_report_parsed", { ...runContext(run), date, rowCount: table.rows.length, headers: table.headers });
            const checksum = bytes ? createHash("sha256").update(text).digest("hex") : "no-sales";
            let rows;
            try { rows = bytes ? mapSalesReport(table, id, date, checksum) : []; }
            catch (error) { fail("map", reportDiagnostic(error), { date }, error instanceof AppStoreReportError ? error.code : undefined); continue; }
            progress.mappedRows += rows.length;
            logEvent("info", "sales_report_mapped", { ...runContext(run), date, inputRows: table.rows.length, mappedRows: rows.length });
            const commitStartedAt = Date.now();
            let outcome: "imported" | "skipped";
            try { outcome = await facts.commitSalesReport(id, connection.updated_at, date, checksum, rows); }
            catch { fail("commit", "report_import_failed", { date }, "report_import_failed"); continue; }
            result[outcome]++;
            logEvent("info", "sales_report_committed", { ...runContext(run), date, rows: rows.length, outcome, durationMs: Date.now() - commitStartedAt });
          }
        } else {
          const dimensions = { fiscalMonth, regionCode };
          if (options.backfill) logEvent("info", "backfill_progress", { ...runContext(run), ...dimensions });
          logEvent("info", "finance_report_started", { ...runContext(run), ...dimensions });
          let bytes: Buffer | null;
          let downloadFailed = false;
          try { bytes = await client.downloadFinanceReport(connection.vendor_number, fiscalMonth, regionCode); }
          catch (error) { fail("download", reportDiagnostic(error), dimensions, error instanceof AppStoreApiError ? error.code : undefined); bytes = null; downloadFailed = true; }
          if (bytes === null && !downloadFailed) recordWaiting(result, run, "report", "finance_unavailable", dimensions);
          if (bytes) {
            logEvent("info", "finance_report_downloaded", { ...runContext(run), ...dimensions, compressedBytes: bytes.byteLength });
            let text: string;
            let table;
            try {
              text = await gunzipAnalyticsSegment(bytes);
              table = parseFinanceTsv(text);
            } catch (error) { fail("parse", reportDiagnostic(error), dimensions, error instanceof AppStoreReportError ? error.code : undefined); table = null; text = ""; }
            if (table) {
              progress.parsedRows += table.rows.length;
              logEvent("info", "finance_report_parsed", { ...runContext(run), ...dimensions, rowCount: table.rows.length, headers: table.headers, trailerStatus: /^Total_Rows\t/m.test(text) ? "validated" : "absent" });
              const checksum = createHash("sha256").update(text).digest("hex");
              let rows;
              try { rows = mapFinanceReport(table, id, fiscalMonth, regionCode, checksum); }
              catch (error) { fail("map", reportDiagnostic(error), dimensions, error instanceof AppStoreReportError ? error.code : undefined); rows = null; }
              if (rows) {
                progress.mappedRows += rows.length;
                logEvent("info", "finance_report_mapped", { ...runContext(run), ...dimensions, inputRows: table.rows.length, mappedRows: rows.length });
                const commitStartedAt = Date.now();
                let outcome: "imported" | "skipped" | null;
                try { outcome = await facts.commitFinanceReport(id, connection.updated_at, fiscalMonth, regionCode, checksum, rows); }
                catch { fail("commit", "report_import_failed", dimensions, "report_import_failed"); outcome = null; }
                if (outcome) {
                  result[outcome]++;
                  logEvent("info", "finance_report_committed", { ...runContext(run), ...dimensions, rows: rows.length, outcome, durationMs: Date.now() - commitStartedAt });
                }
              }
            }
          }
        }
      }
    } catch (error) { fail(error instanceof AppStoreError ? "connection" : "report", reportDiagnostic(error), {}, error instanceof AppStoreApiError ? error.code : undefined); }
    result.status = reportSyncStatus(result);
    await finishReportRun(run, result, progress);
  }
  const total: ReportSyncResult = { status: "success", imported: 0, skipped: 0, waiting: 0, waitingReasons: [], errors: [] };
  for (const result of Object.values(sources)) { total.imported += result.imported; total.skipped += result.skipped; total.waiting += result.waiting; total.errors.push(...result.errors); total.waitingReasons.push(...result.waitingReasons); }
  total.status = reportSyncStatus(total);
  if (options.backfill && options.backfillLifecycle !== false) logEvent("info", "backfill_finished", { connectionId: id, kind: selectedSources.join(","), status: total.status, imported: total.imported, skipped: total.skipped, failures: total.errors.length });
  return { status: total.status, sources };
}

export function syncAppStoreRevenue(id: number, viewer: Viewer, input: unknown) {
  const parsed = revenueSyncInput.safeParse(input);
  if (!parsed.success) throw new AppStoreError("invalid_filters", 400, "Select Sales dates and an Apple fiscal month; consolidated Finance uses region ZZ");
  const { from, to } = parsed.data;
  const days = (Date.parse(to) - Date.parse(from)) / 86400000 + 1;
  if (days < 1 || days > 90) throw new AppStoreError("invalid_range", 400, "Select a date range of 1–90 days");
  return withConnection(id, viewer, async (connection) => syncRevenueSources(connection, id, parsed.data, { trigger: "manual", sources: ["analytics", "sales", "finance"], mode: "ongoing" }));
}

export async function syncAppStoreRevenueForConnection(connection: ConnectionRow, input: { from: string; to: string; fiscalMonth: string; regionCode: "ZZ" }, options: { trigger: "scheduler"; sources: Array<"analytics" | "sales" | "finance">; mode: "ongoing" | "snapshot"; backfill?: boolean; salesDates?: string[] }) {
  if (inFlight.has(connection.id)) throw new AppStoreError("sync_busy", 409, "A report sync is already running for this connection");
  inFlight.add(connection.id);
  try {
    if (!connection.is_active) throw new AppStoreError("connection_disabled", 409, "Enable this connection before syncing");
    const parsed = revenueSyncInput.parse(input);
    const days = (Date.parse(parsed.to) - Date.parse(parsed.from)) / 86400000 + 1;
    if (days < 1 || days > 90) throw new AppStoreError("invalid_range", 400, "Select a date range of 1–90 days");
    return syncRevenueSources(connection, connection.id, parsed, options);
  } finally { inFlight.delete(connection.id); }
}
function monthDistance(from: string, to: string) { const [fy, fm] = from.split("-").map(Number); const [ty, tm] = to.split("-").map(Number); return (ty - fy) * 12 + tm - fm; }

export async function backfillAppStoreAnalytics(id: number, viewer: Viewer) {
  return withConnection(id, viewer, async (connection) => {
    if (!(await analytics.enabledApps(id)).length) throw new AppStoreError("no_enabled_apps", 400, "Enable at least one app before backfilling Analytics");
    logEvent("info", "backfill_started", { connectionId: id, kind: "analytics", accessType: "ONE_TIME_SNAPSHOT" });
    const acquisition = await syncAnalyticsReports(connection, ["discovery", "downloads"], "acquisition", "manual", "snapshot");
    const revenue = await syncAnalyticsReports(connection, ["purchases", "subscriptionState", "subscriptionEvent"], "revenue", "manual", "snapshot");
    const result: ReportSyncResult = { status: "success", imported: acquisition.imported + revenue.imported, skipped: acquisition.skipped + revenue.skipped, waiting: acquisition.waiting + revenue.waiting, waitingReasons: [...acquisition.waitingReasons, ...revenue.waitingReasons], errors: [...acquisition.errors, ...revenue.errors] };
    result.status = reportSyncStatus(result);
    logEvent("info", "backfill_finished", { connectionId: id, kind: "analytics", status: result.status, imported: result.imported, skipped: result.skipped, failures: result.errors.length });
    return result;
  });
}

export async function backfillAppStoreRevenue(id: number, viewer: Viewer, input: unknown) {
  const schema = z.object({ from: z.iso.date(), to: z.iso.date(), fiscalMonthFrom: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), fiscalMonthTo: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), regionCode: z.literal("ZZ") });
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new AppStoreError("invalid_filters", 400, "Select Sales dates and fiscal months; consolidated Finance uses region ZZ");
  const { from, to, fiscalMonthFrom, fiscalMonthTo, regionCode } = parsed.data;
  const days = (Date.parse(to) - Date.parse(from)) / 86400000 + 1;
  const monthCount = monthDistance(fiscalMonthFrom, fiscalMonthTo) + 1;
  if (days < 1 || days > 90) throw new AppStoreError("invalid_range", 400, "Select a date range of 1–90 days");
  if (monthCount < 1 || monthCount > 12) throw new AppStoreError("invalid_range", 400, "Select a fiscal month range of 1–12 months");
  return withConnection(id, viewer, async (connection) => {
    const all = { analytics: { status: "success", imported: 0, skipped: 0, waiting: 0, waitingReasons: [], errors: [] } as ReportSyncResult, sales: { status: "success", imported: 0, skipped: 0, waiting: 0, waitingReasons: [], errors: [] } as ReportSyncResult, finance: { status: "success", imported: 0, skipped: 0, waiting: 0, waitingReasons: [], errors: [] } as ReportSyncResult };
    const base = { from, to, fiscalMonth: fiscalMonthFrom, regionCode };
    logEvent("info", "backfill_started", { connectionId: id, kind: "revenue", from, to, fiscalMonthFrom, fiscalMonthTo });
    const salesAndAnalytics = await syncRevenueSources(connection, id, base, { trigger: "manual", sources: ["analytics", "sales"], backfill: true, backfillLifecycle: false, mode: "snapshot" });
    all.analytics = salesAndAnalytics.sources.analytics; all.sales = salesAndAnalytics.sources.sales;
    for (let index = 0; index < monthCount; index++) {
      const [year, month] = fiscalMonthFrom.split("-").map(Number);
      const time = Date.UTC(year, month - 1 + index, 1);
      const fiscalMonth = new Date(time).toISOString().slice(0, 7);
      const result = await syncRevenueSources(connection, id, { ...base, fiscalMonth }, { trigger: "manual", sources: ["finance"], backfill: true, backfillLifecycle: false, mode: "snapshot" });
      const current = result.sources.finance;
      all.finance.imported += current.imported; all.finance.skipped += current.skipped; all.finance.waiting += current.waiting; all.finance.waitingReasons.push(...current.waitingReasons); all.finance.errors.push(...current.errors);
    }
    for (const source of Object.values(all)) source.status = reportSyncStatus(source);
    const status = reportSyncStatus({ imported: Object.values(all).reduce((sum, source) => sum + source.imported, 0), skipped: Object.values(all).reduce((sum, source) => sum + source.skipped, 0), waiting: Object.values(all).reduce((sum, source) => sum + source.waiting, 0), errors: Object.values(all).flatMap((source) => source.errors) });
    logEvent("info", "backfill_finished", { connectionId: id, kind: "revenue", status, imported: Object.values(all).reduce((sum, source) => sum + source.imported, 0), failures: Object.values(all).reduce((sum, source) => sum + source.errors.length, 0) });
    return { status, sources: all };
  });
}
