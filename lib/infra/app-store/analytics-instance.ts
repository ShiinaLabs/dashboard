import type { AppStoreConnectClient, AnalyticsReportInstance, AnalyticsReportSegment } from "./AppStoreConnectClient";
import { AppStoreApiError } from "./AppStoreConnectClient";
import { gunzipAnalyticsSegment, AppStoreReportError, MAX_REPORT_BYTES } from "./analytics-segment";
import { parseAnalyticsTsv, type AnalyticsTsv } from "./analytics-tsv";

export interface PreparedAnalyticsInstance {
  instanceId: string;
  processingDate: string;
  granularity: "DAILY";
  segments: { id: string; checksum: string }[];
  table: AnalyticsTsv;
}

export type AnalyticsInstanceProgress =
  | { stage: "segment_download_started"; segmentId: string }
  | { stage: "segment_download_finished"; segmentId: string; compressedBytes: number; durationMs: number };

export class AnalyticsInstanceError extends AppStoreReportError {
  constructor(
    public readonly stage: "segment" | "download" | "parse",
    public readonly segmentId: string | undefined,
    public readonly original: unknown,
  ) {
    const reportError = original instanceof AppStoreReportError ? original : null;
    const message = reportError?.message ?? ({
      segment: "Failed to refresh report segment metadata",
      download: "Report download failed or timed out",
      parse: "Report segment could not be parsed",
    } as const)[stage];
    super(reportError?.code ?? (original instanceof AppStoreApiError ? original.code : stage === "download" ? "download_timeout" : "report_import_failed"), message);
    this.name = "AnalyticsInstanceError";
  }
}

/** Download every segment before any fact writer can commit this instance. */
export async function prepareAnalyticsInstance(
  client: AppStoreConnectClient,
  instance: AnalyticsReportInstance,
  listedSegments: AnalyticsReportSegment[],
  options: { requiredHeaders?: readonly string[]; onProgress?: (event: AnalyticsInstanceProgress) => void | Promise<void> } = {},
): Promise<PreparedAnalyticsInstance> {
  if (instance.attributes.granularity !== "DAILY") throw new AppStoreReportError("unsupported_granularity", "Only DAILY analytics reports are supported");
  const segmentIds = [...new Set(listedSegments.map((segment) => segment.id))];
  if (!segmentIds.length) throw new AppStoreReportError("segments_pending", "Report segments are not ready yet");
  let table: AnalyticsTsv | undefined;
  let size = 0;
  const segments: PreparedAnalyticsInstance["segments"] = [];
  for (const id of segmentIds) {
    // Refresh signed URLs immediately before download, including during backfills.
    let resource: AnalyticsReportSegment;
    try { resource = await client.getAnalyticsReportSegment(id); }
    catch (error) { throw new AnalyticsInstanceError("segment", id, error); }
    if (resource.id !== id) throw new AppStoreReportError("invalid_segment", "Apple returned a different segment identity");
    let compressed: Buffer;
    const startedAt = Date.now();
    await options.onProgress?.({ stage: "segment_download_started", segmentId: id });
    try {
      compressed = await client.downloadAnalyticsSegment(resource);
      await options.onProgress?.({ stage: "segment_download_finished", segmentId: id, compressedBytes: compressed.byteLength, durationMs: Date.now() - startedAt });
    } catch (error) { throw new AnalyticsInstanceError("download", id, error); }
    let text: string;
    try { text = await gunzipAnalyticsSegment(compressed); }
    catch (error) { throw new AnalyticsInstanceError("parse", id, error); }
    size += Buffer.byteLength(text);
    if (size > MAX_REPORT_BYTES) throw new AnalyticsInstanceError("parse", id, new AppStoreReportError("instance_size", "Report instance exceeds the decompressed size limit"));
    let parsed: AnalyticsTsv;
    try { parsed = parseAnalyticsTsv(text, options.requiredHeaders); }
    catch (error) { throw new AnalyticsInstanceError("parse", id, error); }
    if (table && (table.headers.length !== parsed.headers.length || table.headers.some((header, index) => header !== parsed.headers[index]))) throw new AnalyticsInstanceError("parse", id, new AppStoreReportError("inconsistent_headers", "Report segments contain inconsistent headers"));
    if (table) for (const row of parsed.rows) table.rows.push(row);
    else table = parsed;
    segments.push({ id, checksum: resource.attributes.checksum });
  }
  return { instanceId: instance.id, processingDate: instance.attributes.processingDate, granularity: "DAILY", segments, table: table! };
}
