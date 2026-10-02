import type { AppStoreConnectClient, AnalyticsReportInstance } from "./AppStoreConnectClient";
import { gunzipAnalyticsSegment, AppStoreReportError, MAX_REPORT_BYTES } from "./analytics-segment";
import { parseAnalyticsTsv, type AnalyticsTsv } from "./analytics-tsv";

export interface PreparedAnalyticsInstance {
  instanceId: string;
  processingDate: string;
  granularity: "DAILY";
  segments: { id: string; checksum: string }[];
  table: AnalyticsTsv;
}

/** Download every segment before any fact writer can commit this instance. */
export async function prepareAnalyticsInstance(
  client: AppStoreConnectClient,
  instance: AnalyticsReportInstance,
  requiredHeaders: readonly string[] = [],
): Promise<PreparedAnalyticsInstance> {
  if (instance.attributes.granularity !== "DAILY") throw new AppStoreReportError("unsupported_granularity", "Only DAILY analytics reports are supported");
  const listed = await client.listAnalyticsReportSegments(instance.id);
  const segmentIds = [...new Set(listed.map((segment) => segment.id))];
  if (!segmentIds.length) throw new AppStoreReportError("segments_pending", "Report segments are not ready yet");
  let table: AnalyticsTsv | undefined;
  let size = 0;
  const segments: PreparedAnalyticsInstance["segments"] = [];
  for (const id of segmentIds) {
    // Refresh signed URLs immediately before download, including during backfills.
    const resource = await client.getAnalyticsReportSegment(id);
    if (resource.id !== id) throw new AppStoreReportError("invalid_segment", "Apple returned a different segment identity");
    const text = await gunzipAnalyticsSegment(await client.downloadAnalyticsSegment(resource));
    size += Buffer.byteLength(text);
    if (size > MAX_REPORT_BYTES) throw new AppStoreReportError("instance_size", "Report instance exceeds the decompressed size limit");
    const parsed = parseAnalyticsTsv(text, requiredHeaders);
    if (table && (table.headers.length !== parsed.headers.length || table.headers.some((header, index) => header !== parsed.headers[index]))) throw new AppStoreReportError("inconsistent_headers", "Report segments contain inconsistent headers");
    if (table) for (const row of parsed.rows) table.rows.push(row);
    else table = parsed;
    segments.push({ id, checksum: resource.attributes.checksum });
  }
  return { instanceId: instance.id, processingDate: instance.attributes.processingDate, granularity: "DAILY", segments, table: table! };
}

export function isStandardP2Report(name: string): boolean {
  return name === "App Store Discovery and Engagement" || name === "App Store Downloads";
}
