import type { AppStoreDiagnosticReport } from "../../shared/app-store";

export interface LocalAnalyticsPartition {
  app_id: number;
  report_kind: string;
  date: string;
  processing_date: string;
}

export interface LocalReportSummary {
  appId: number;
  reportKind: string;
  localProcessingDate: string;
  latestData: string;
}

export function summarizeLocalReportPartitions(partitions: LocalAnalyticsPartition[]): LocalReportSummary[] {
  const summaries = new Map<string, LocalReportSummary>();
  for (const partition of partitions) {
    const key = `${partition.app_id}:${partition.report_kind}`;
    const summary = summaries.get(key) ?? {
      appId: partition.app_id,
      reportKind: partition.report_kind,
      localProcessingDate: partition.processing_date,
      latestData: partition.date,
    };
    if (partition.processing_date > summary.localProcessingDate) summary.localProcessingDate = partition.processing_date;
    if (partition.date > summary.latestData) summary.latestData = partition.date;
    summaries.set(key, summary);
  }
  return [...summaries.values()];
}

export function upsertDiagnosticReport(reports: AppStoreDiagnosticReport[], report: AppStoreDiagnosticReport): void {
  const existing = reports.find((item) => item.appId === report.appId
    && item.reportKind === report.reportKind
    && item.accessType === report.accessType);
  if (existing) Object.assign(existing, report);
  else reports.push(report);
}

export function hasAppleProcessingAhead(reports: Pick<AppStoreDiagnosticReport, "reportKind" | "appleProcessingDate" | "localProcessingDate">[], kinds: string[]): boolean {
  return reports.some((report) => kinds.includes(report.reportKind)
    && report.appleProcessingDate !== null
    && (report.localProcessingDate === null || report.appleProcessingDate > report.localProcessingDate));
}
