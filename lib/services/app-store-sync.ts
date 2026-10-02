import { createHash } from "node:crypto";
import { z } from "zod";
import { authorizedConnection, clientForConnection, AppStoreError } from "./app-store";
import { startRun, finishRun } from "../repositories/app-store";
import * as analytics from "../repositories/app-store-analytics";
import * as facts from "../repositories/app-store-facts";
import { analyticsReports, mapAnalyticsReport, mapSalesReport, mapFinanceReport, type AnalyticsReportKind } from "../infra/app-store/report-mapping";
import { prepareAnalyticsInstance } from "../infra/app-store/analytics-instance";
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
export interface ReportSyncResult { status: "success" | "partial" | "error"; imported: number; skipped: number; waiting: number; errors: string[] }
const inFlight = new Set<number>();
function logEvent(level: "info" | "warn" | "error", event: string, fields: Record<string, unknown>) {
  getLogger()[level]("ASC", JSON.stringify({ event, ...fields }));
}
function runContext(run: RunRow) { return { connectionId: run.connection_id, runId: run.id, source: run.kind, scope: run.scope }; }
async function finishReportRun(run: RunRow, result: ReportSyncResult) {
  await finishRun(run, result.status, result.errors.length ? result.errors.join("; ").slice(0, 2000) : null);
  logEvent(result.status === "error" ? "error" : result.status === "partial" ? "warn" : "info", "sync_finished", { ...runContext(run), status: result.status, imported: result.imported, skipped: result.skipped, waiting: result.waiting, failures: result.errors.length, durationMs: Date.now() - Date.parse(run.started_at) });
}
export function reportDiagnostic(error: unknown): string {
  if (error instanceof AppStoreReportError) return `${error.code}: ${error.message}`;
  if (error instanceof AppStoreApiError) return `apple_report_error (${error.status})`;
  // Driver/fetch errors may contain report rows, SQL values, signed URLs or credentials.
  return "report_import_failed";
}
async function syncAnalyticsReports(connection: ConnectionRow, kinds: AnalyticsReportKind[], scope: string): Promise<ReportSyncResult> {
  const result: ReportSyncResult = { status: "success", imported: 0, skipped: 0, waiting: 0, errors: [] };
  const run = await startRun(connection.id, "analytics", scope);
  logEvent("info", "sync_started", runContext(run));
  const fail = (diagnostic: string, fields: Record<string, unknown> = {}) => { result.errors.push(diagnostic); logEvent("error", "report_failed", { ...runContext(run), ...fields, diagnostic }); };
  const wait = (reason: string, fields: Record<string, unknown>) => { result.waiting++; logEvent("info", "report_waiting", { ...runContext(run), ...fields, reason }); };
  try {
    if (isMockMode()) result.waiting++;
    else {
      const client = clientForConnection(connection);
      for (const app of await analytics.enabledApps(connection.id)) {
        try {
          const existingImports = await analytics.importsForApps([app.id]);
          const resources = await client.listAnalyticsReportRequests(app.apple_id);
          if (!resources.length) wait("no_requests", { appId: app.id });
          for (const resource of resources) {
            if (resource.attributes.stoppedDueToInactivity) continue;
            const request = await analytics.adoptRequest(app.id, resource, connection.updated_at);
            const reports = await client.listAnalyticsReports(resource.id);
            const selected = reports.flatMap((report) => {
              const kind = kinds.find((key) => analyticsReports[key] === report.attributes.name);
              return kind ? [{ report, kind }] : [];
            });
            if (!selected.length) wait("no_matching_reports", { appId: app.id, requestId: resource.id });
            for (const { report, kind } of selected) {
              try {
                const instances = (await client.listAnalyticsReportInstances(report.id)).filter((i) => i.attributes.granularity === "DAILY").sort((a, b) => a.attributes.processingDate.localeCompare(b.attributes.processingDate));
                if (!instances.length) wait("no_daily_instances", { appId: app.id, report: analyticsReports[kind] });
                for (const instance of instances) {
                  try {
                    const listed = await client.listAnalyticsReportSegments(instance.id);
                    const manifests = existingImports.filter((r) => r.apple_instance_id === instance.id && r.apple_report_id === report.id && r.status === "imported");
                    if (listed.length > 0 && listed.length === manifests.length && listed.every((segment) => manifests.some((m) => m.apple_segment_id === segment.id && m.checksum === segment.attributes.checksum.toLowerCase()))) { result.skipped++; continue; }
                    const prepared = await prepareAnalyticsInstance(client, instance);
                    const mapped = mapAnalyticsReport(kind, prepared.table, { appId: app.id, appleId: app.apple_id, instanceId: instance.id, processingDate: prepared.processingDate });
                    const outcome = await facts.commitAnalyticsInstance({ appId: app.id, connectionId: connection.id, version: connection.updated_at, requestId: request.id, reportId: report.id, reportName: report.attributes.name, reportCategory: report.attributes.category }, prepared, mapped);
                    result[outcome]++;
                  } catch (error) {
                    if (error instanceof AppStoreReportError && error.code === "segments_pending") wait("segments_pending", { appId: app.id, instanceId: instance.id, report: analyticsReports[kind] });
                    else fail(`${analyticsReports[kind]}; instance ${instance.id}; processing ${instance.attributes.processingDate}; ${reportDiagnostic(error)}`, { appId: app.id });
                  }
                }
              } catch (error) { fail(`${analyticsReports[kind]}; ${reportDiagnostic(error)}`, { appId: app.id }); }
            }
          }
        } catch (error) { fail(reportDiagnostic(error), { appId: app.id }); }
      }
    }
    result.status = analyticsRunStatus(result.imported + result.skipped + result.waiting, result.errors.length);
    await finishReportRun(run, result);
    return result;
  } catch (error) { result.status = "error"; fail(reportDiagnostic(error)); await finishReportRun(run, result); throw error; }
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
    const sources = { analytics: commerce, sales: { status: "success", imported: 0, skipped: 0, waiting: 0, errors: [] } as ReportSyncResult, finance: { status: "success", imported: 0, skipped: 0, waiting: 0, errors: [] } as ReportSyncResult };
    for (const kind of ["sales", "finance"] as const) {
      const result = sources[kind];
      const run = await startRun(id, kind, "revenue");
      logEvent("info", "sync_started", { ...runContext(run), ...(kind === "sales" ? { from, to } : { fiscalMonth, regionCode }) });
      const fail = (diagnostic: string) => { result.errors.push(diagnostic); logEvent("error", "report_failed", { ...runContext(run), diagnostic }); };
      try {
        if (!connection.vendor_number) throw new AppStoreReportError("vendor_required", "Revenue setup required: add Vendor Number in Edit Connection");
        if (isMockMode()) result.waiting++;
        else {
          const client = clientForConnection(connection);
          if (kind === "sales") {
            const latestDate = latestSalesReportDate();
            for (let time = Date.parse(from); time <= Date.parse(to); time += 86400000) {
              const date = new Date(time).toISOString().slice(0, 10);
              if (date > latestDate) { result.waiting++; logEvent("info", "report_waiting", { ...runContext(run), date, reason: "before_daily_publication", latestDate }); continue; }
              try {
                const bytes = await client.downloadSalesReport(connection.vendor_number, date);
                const checksum = bytes ? createHash("sha256").update(bytes).digest("hex") : "no-sales";
                const rows = bytes ? mapSalesReport(parseAnalyticsTsv(await gunzipAnalyticsSegment(bytes)), id, date, checksum) : [];
                result[await facts.commitSalesReport(id, connection.updated_at, date, checksum, rows)]++;
              } catch (error) { fail(`Sales; date ${date}; ${reportDiagnostic(error)}`); }
            }
          } else {
            const bytes = await client.downloadFinanceReport(connection.vendor_number, fiscalMonth, regionCode);
            if (!bytes) throw new AppStoreReportError("finance_unavailable", "Financial report is unavailable");
            const checksum = createHash("sha256").update(bytes).digest("hex");
            const rows = mapFinanceReport(parseFinanceTsv(await gunzipAnalyticsSegment(bytes)), id, fiscalMonth, regionCode, checksum);
            result[await facts.commitFinanceReport(id, connection.updated_at, fiscalMonth, regionCode, checksum, rows)]++;
          }
        }
      } catch (error) { fail(`${kind === "finance" ? `Finance; fiscal month ${fiscalMonth}; region ${regionCode}` : "Sales"}; ${reportDiagnostic(error)}`); }
      result.status = analyticsRunStatus(result.imported + result.skipped + result.waiting, result.errors.length);
      await finishReportRun(run, result);
    }
    return { status: analyticsRunStatus(Object.values(sources).filter((s) => s.status !== "error").length, Object.values(sources).filter((s) => s.status !== "success").length), sources };
  });
}
