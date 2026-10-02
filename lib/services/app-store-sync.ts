import { createHash } from "node:crypto";
import { z } from "zod";
import { authorizedConnection, clientForConnection, AppStoreError } from "./app-store";
import { startRun, finishRun } from "../repositories/app-store";
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
import { getLogger } from "../logger";
import { latestSalesReportDate } from "../../shared/app-store-revenue";

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
function logEvent(level: "info" | "warn" | "error", event: string, fields: Record<string, unknown>) {
  getLogger()[level]("ASC", JSON.stringify({ event, ...fields }));
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
  logEvent(result.status === "error" ? "error" : result.status === "partial" ? "warn" : "info", "sync_finished", { ...runContext(run), status: result.status, imported: result.imported, skipped: result.skipped, waiting: result.waiting, failures: result.errors.length, ...progress, durationMs: Date.now() - Date.parse(run.started_at) });
}
export function reportDiagnostic(error: unknown): string {
  if (error instanceof AnalyticsInstanceError) return reportDiagnostic(error.original);
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
  logEvent("info", "report_waiting", { ...runContext(run), ...fields, stage, reason });
}
async function syncAnalyticsReports(connection: ConnectionRow, kinds: AnalyticsReportKind[], scope: string): Promise<ReportSyncResult> {
  const result: ReportSyncResult = { status: "success", imported: 0, skipped: 0, waiting: 0, waitingReasons: [], errors: [] };
  const progress = runProgress();
  const run = await startRun(connection.id, "analytics", scope);
  logEvent("info", "sync_started", runContext(run));
  const fail = (stage: string, diagnostic: string, fields: Record<string, unknown> = {}, code?: string) => {
    result.errors.push(diagnostic);
    logEvent("error", "report_failed", { ...runContext(run), ...fields, stage, ...(code ? { code } : {}), diagnostic });
  };
  const wait = (stage: string, reason: string, fields: Record<string, unknown> = {}) => recordWaiting(result, run, stage, reason, fields);
  try {
    if (isMockMode()) wait("report", "no_reports_generated");
    else {
      const client = clientForConnection(connection);
      const apps = await analytics.enabledApps(connection.id);
      progress.apps = apps.length;
      if (!apps.length) wait("connection", "no_enabled_apps");
      for (const app of apps) {
        let existingImports: Awaited<ReturnType<typeof analytics.importsForApps>> = [];
        let resources;
        try {
          existingImports = await analytics.importsForApps([app.id]);
          resources = await client.listAnalyticsReportRequests(app.apple_id);
          progress.requests += resources.length;
          const active = resources.filter((request) => !request.attributes.stoppedDueToInactivity);
          logEvent("info", "analytics_requests_discovered", { ...runContext(run), appId: app.id, count: resources.length, active: active.length, stopped: resources.length - active.length, accessTypes: [...new Set(resources.map((request) => request.attributes.accessType))], requestIds: resources.map((request) => request.id) });
          if (!resources.length) wait("request", "no_requests", { appId: app.id });
          else if (!active.length) wait("request", "requests_inactive", { appId: app.id });
        } catch (error) {
          fail("request", reportDiagnostic(error), { appId: app.id }, error instanceof AppStoreApiError ? error.code : undefined);
          continue;
        }
        for (const resource of resources) {
          if (resource.attributes.stoppedDueToInactivity) continue;
          let request: Awaited<ReturnType<typeof analytics.adoptRequest>>;
          try { request = await analytics.adoptRequest(app.id, resource, connection.updated_at); }
          catch (error) { fail("request", reportDiagnostic(error), { appId: app.id, requestId: resource.id }); continue; }
          let reports;
          try { reports = await client.listAnalyticsReports(resource.id); }
          catch (error) { fail("report", reportDiagnostic(error), { appId: app.id, requestId: resource.id }, error instanceof AppStoreApiError ? error.code : undefined); continue; }
          progress.reportsDiscovered += reports.length;
          logEvent("info", "analytics_report_catalog", { ...runContext(run), appId: app.id, requestId: resource.id, accessType: resource.attributes.accessType, count: reports.length, reports: reports.map(({ attributes }) => ({ name: attributes.name, category: attributes.category })) });
          const selected = reports.flatMap((report) => {
            const kind = identifyStandardAnalyticsReport(report.attributes.name);
            return kind && kinds.includes(kind) ? [{ report, kind }] : [];
          });
          progress.reportsSelected += selected.length;
          if (!reports.length) wait("report", "no_reports_generated", { appId: app.id, requestId: resource.id });
          else for (const kind of kinds) {
            if (selected.some((item) => item.kind === kind)) continue;
            const definition = analyticsReportDefinitions[kind];
            // Family detection diagnoses missing Standard variants; it never selects an importer.
            const received = reports.map((r) => r.attributes.name).filter((name) => name === definition.baseName || name.startsWith(`${definition.baseName} `));
            if (received.length) {
              const diagnostic = `unexpected_report_variant; expected=${definition.standardName}; received=${received.join(", ")}`;
              fail("report", diagnostic, { appId: app.id, requestId: resource.id, reportKind: kind, reason: "unexpected_report_variant", expected: definition.standardName, received }, "unexpected_report_variant");
            } else wait("report", "target_report_unavailable", { appId: app.id, requestId: resource.id, reportKind: kind });
          }
          for (const { report, kind } of selected) {
            logEvent("info", "analytics_report_selected", { ...runContext(run), appId: app.id, requestId: resource.id, reportId: report.id, reportKind: kind, reportName: report.attributes.name });
            let instances;
            try { instances = (await client.listAnalyticsReportInstances(report.id)).filter((instance) => instance.attributes.granularity === "DAILY").sort((a, b) => a.attributes.processingDate.localeCompare(b.attributes.processingDate)); }
            catch (error) { fail("instance", reportDiagnostic(error), { appId: app.id, requestId: resource.id, reportId: report.id, reportKind: kind }, error instanceof AppStoreApiError ? error.code : undefined); continue; }
            progress.instancesDiscovered += instances.length;
            logEvent("info", "analytics_instances_discovered", { ...runContext(run), appId: app.id, reportId: report.id, reportKind: kind, count: instances.length, earliestProcessingDate: instances[0]?.attributes.processingDate ?? null, latestProcessingDate: instances.at(-1)?.attributes.processingDate ?? null });
            if (!instances.length) { progress.instancesWaiting++; wait("instance", "no_daily_instances", { appId: app.id, reportKind: kind, report: analyticsReportDefinitions[kind].standardName }); }
            for (const instance of instances) {
              progress.instancesProcessed++;
              const instanceFields = { appId: app.id, reportId: report.id, reportKind: kind, instanceId: instance.id, processingDate: instance.attributes.processingDate };
              logEvent("info", "analytics_instance_started", { ...runContext(run), ...instanceFields });
              let listed;
              try { listed = await client.listAnalyticsReportSegments(instance.id); }
              catch (error) { progress.instancesFailed++; fail("segment", reportDiagnostic(error), { ...instanceFields }, error instanceof AppStoreApiError ? error.code : undefined); continue; }
              logEvent("info", "analytics_segments_discovered", { ...runContext(run), ...instanceFields, count: listed.length });
              const manifests = existingImports.filter((item) => item.apple_instance_id === instance.id && item.apple_report_id === report.id && item.status === "imported");
              if (listed.length > 0 && listed.length === manifests.length && listed.every((segment) => manifests.some((manifest) => manifest.apple_segment_id === segment.id && manifest.checksum === segment.attributes.checksum.toLowerCase()))) {
                result.skipped++;
                progress.instancesSkipped++;
                logEvent("info", "analytics_instance_skipped", { ...runContext(run), ...instanceFields, reason: "segments_unchanged", segmentCount: listed.length });
                continue;
              }
              if (!listed.length) {
                progress.instancesWaiting++;
                wait("segment", "segments_pending", instanceFields);
                continue;
              }
              let prepared;
              try {
                prepared = await prepareAnalyticsInstance(client, instance, listed, { requiredHeaders: analyticsReportRequiredHeaders(kind), onProgress: (event) => {
                  if (event.stage === "segment_download_started") logEvent("info", "analytics_segment_download_started", { ...runContext(run), ...instanceFields, segmentId: event.segmentId });
                  else {
                    progress.segmentsDownloaded++;
                    logEvent("info", "analytics_segment_download_finished", { ...runContext(run), ...instanceFields, segmentId: event.segmentId, compressedBytes: event.compressedBytes, durationMs: event.durationMs });
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
                  fail(stage, `${analyticsReportDefinitions[kind].standardName}; instance ${instance.id}; stage ${stage}; ${reportDiagnostic(error)}`, fields, error instanceof AppStoreReportError ? error.code : undefined);
                }
                continue;
              }
              progress.parsedRows += prepared.table.rows.length;
              logEvent("info", "analytics_instance_parsed", { ...runContext(run), ...instanceFields, segmentCount: prepared.segments.length, rowCount: prepared.table.rows.length, columnCount: prepared.table.headers.length, headers: prepared.table.headers });
              let mapped;
              try { mapped = mapAnalyticsReport(kind, prepared.table, { appId: app.id, appleId: app.apple_id, instanceId: instance.id, processingDate: prepared.processingDate }); }
              catch (error) { progress.instancesFailed++; fail("map", `${analyticsReportDefinitions[kind].standardName}; ${reportDiagnostic(error)}`, instanceFields, error instanceof AppStoreReportError ? error.code : undefined); continue; }
              progress.mappedRows += mapped.rows.length;
              logEvent("info", "analytics_instance_mapped", { ...runContext(run), ...instanceFields, inputRows: prepared.table.rows.length, mappedRows: mapped.rows.length });
              logEvent("info", "analytics_instance_commit_started", { ...runContext(run), ...instanceFields, rows: mapped.rows.length });
              const commitStartedAt = Date.now();
              let outcome: "imported" | "skipped";
              try { outcome = await facts.commitAnalyticsInstance({ appId: app.id, connectionId: connection.id, version: connection.updated_at, requestId: request.id, reportId: report.id, reportName: report.attributes.name, reportCategory: report.attributes.category }, prepared, mapped); }
              catch (error) { progress.instancesFailed++; fail("commit", `${analyticsReportDefinitions[kind].standardName}; ${reportDiagnostic(error)}`, instanceFields, error instanceof AppStoreReportError ? error.code : "report_import_failed"); continue; }
              result[outcome]++;
              if (outcome === "imported") progress.instancesImported++;
              else progress.instancesSkipped++;
              logEvent("info", "analytics_instance_committed", { ...runContext(run), ...instanceFields, rows: mapped.rows.length, outcome, durationMs: Date.now() - commitStartedAt });
            }
          }
        }
      }
    }
    result.status = reportSyncStatus(result);
    await finishReportRun(run, result, progress);
    return result;
  } catch (error) { result.status = "error"; fail("request", reportDiagnostic(error), {}, error instanceof AppStoreApiError ? error.code : undefined); await finishReportRun(run, result, progress); throw error; }
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
    return syncAnalyticsReports(connection, ["discovery", "downloads"], "acquisition");
  });
}
const revenueSyncInput = z.object({ from: z.iso.date(), to: z.iso.date(), fiscalMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), regionCode: z.literal("ZZ") });
export function syncAppStoreRevenue(id: number, viewer: Viewer, input: unknown) {
  const parsed = revenueSyncInput.safeParse(input);
  if (!parsed.success) throw new AppStoreError("invalid_filters", 400, "Select Sales dates and an Apple fiscal month; consolidated Finance uses region ZZ");
  const { from, to, fiscalMonth, regionCode } = parsed.data;
  const days = (Date.parse(to) - Date.parse(from)) / 86400000 + 1;
  if (days < 1 || days > 90) throw new AppStoreError("invalid_range", 400, "Select a date range of 1–90 days");
  return withConnection(id, viewer, async (connection) => {
    const commerce = await syncAnalyticsReports(connection, ["purchases", "subscriptionState", "subscriptionEvent"], "revenue");
    const sources = { analytics: commerce, sales: { status: "success", imported: 0, skipped: 0, waiting: 0, waitingReasons: [], errors: [] } as ReportSyncResult, finance: { status: "success", imported: 0, skipped: 0, waiting: 0, waitingReasons: [], errors: [] } as ReportSyncResult };
    const appCount = (await analytics.enabledApps(id)).length;
    for (const kind of ["sales", "finance"] as const) {
      const result = sources[kind];
      const progress = runProgress();
      progress.apps = appCount;
      const run = await startRun(id, kind, "revenue");
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
            for (let time = Date.parse(from); time <= Date.parse(to); time += 86400000) {
              const date = new Date(time).toISOString().slice(0, 10);
              if (date > latestDate) { recordWaiting(result, run, "report", "before_daily_publication", { date, latestDate }); continue; }
              logEvent("info", "sales_report_started", { ...runContext(run), date });
              let bytes: Buffer | null;
              try { bytes = await client.downloadSalesReport(connection.vendor_number, date); }
              catch (error) { fail("download", reportDiagnostic(error), { date }, error instanceof AppStoreApiError ? error.code : undefined); continue; }
              logEvent("info", "sales_report_downloaded", { ...runContext(run), date, compressedBytes: bytes?.byteLength ?? 0, noSales: bytes === null });
              let table;
              if (bytes) {
                try { table = parseAnalyticsTsv(await gunzipAnalyticsSegment(bytes)); }
                catch (error) { fail("parse", reportDiagnostic(error), { date }, error instanceof AppStoreReportError ? error.code : undefined); continue; }
              } else table = { headers: [], rows: [] };
              progress.parsedRows += table.rows.length;
              logEvent("info", "sales_report_parsed", { ...runContext(run), date, rowCount: table.rows.length, headers: table.headers });
              const checksum = bytes ? createHash("sha256").update(bytes).digest("hex") : "no-sales";
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
            logEvent("info", "finance_report_started", { ...runContext(run), ...dimensions });
            let bytes: Buffer | null;
            let downloadFailed = false;
            try { bytes = await client.downloadFinanceReport(connection.vendor_number, fiscalMonth, regionCode); }
            catch (error) { fail("download", reportDiagnostic(error), dimensions, error instanceof AppStoreApiError ? error.code : undefined); bytes = null; downloadFailed = true; }
            if (bytes === null && !downloadFailed) fail("download", "finance_unavailable: Financial report is unavailable", dimensions, "finance_unavailable");
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
                const checksum = createHash("sha256").update(bytes).digest("hex");
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
      } catch (error) { fail(error instanceof AppStoreError ? "connection" : "report", `${kind === "finance" ? `Finance; fiscal month ${fiscalMonth}; region ${regionCode}` : "Sales"}; ${reportDiagnostic(error)}`, {}, error instanceof AppStoreApiError ? error.code : undefined); }
      result.status = reportSyncStatus(result);
      await finishReportRun(run, result, progress);
    }
    return { status: reportSyncStatus({ imported: Object.values(sources).reduce((n, s) => n + s.imported, 0), skipped: Object.values(sources).reduce((n, s) => n + s.skipped, 0), waiting: Object.values(sources).reduce((n, s) => n + s.waiting, 0), errors: Object.values(sources).flatMap((s) => s.errors) }), sources };
  });
}
