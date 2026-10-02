import { createHash } from "node:crypto";
import { gunzip } from "node:zlib";
import { promisify } from "node:util";

export const MAX_SEGMENT_BYTES = 32 * 1024 * 1024;
export const MAX_REPORT_BYTES = 128 * 1024 * 1024;
const decompress = promisify(gunzip);

export class AppStoreReportError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}

export function assertSegmentUrl(value: string): URL {
  let url: URL;
  try { url = new URL(value); }
  catch { throw new AppStoreReportError("invalid_download_url", "Invalid Apple report download URL"); }
  // Apple serves signed report objects from S3; allow its public CDN domains only.
  const cdn = /(?:^|\.)s3(?:[.-][a-z0-9-]+)?\.amazonaws\.com$/.test(url.hostname)
    || /\.(?:apple\.com|mzstatic\.com)$/.test(url.hostname);
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") || !cdn) {
    throw new AppStoreReportError("invalid_download_url", "Report downloads require a trusted HTTPS CDN URL");
  }
  return url;
}

export async function downloadAnalyticsSegment(
  segment: { url: string; checksum: string; sizeInBytes: number },
  request: typeof fetch = fetch,
): Promise<Buffer> {
  const url = assertSegmentUrl(segment.url);
  if (!Number.isSafeInteger(segment.sizeInBytes) || segment.sizeInBytes <= 0 || segment.sizeInBytes > MAX_SEGMENT_BYTES) {
    throw new AppStoreReportError("segment_size", "Report segment exceeds the download size limit or has invalid size metadata");
  }
  if (!/^[a-f\d]{32}$/i.test(segment.checksum)) throw new AppStoreReportError("invalid_checksum", "Invalid report checksum metadata");
  let response: Response;
  try {
    // This signed URL is deliberately never given an ASC Authorization header.
    response = await request(url.href, { signal: AbortSignal.timeout(30_000), redirect: "error" });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new AppStoreReportError(response.status === 403 ? "download_expired" : "download_error", `Report download failed (${response.status}); refresh segment metadata and retry`);
    }
    const advertised = response.headers.get("content-length");
    if (advertised && (!/^\d+$/.test(advertised) || Number(advertised) > MAX_SEGMENT_BYTES || Number(advertised) !== segment.sizeInBytes)) {
      await response.body?.cancel().catch(() => undefined);
      throw new AppStoreReportError("segment_size", "Report segment exceeds the download size limit or does not match its metadata");
    }
    if (!response.body) throw new AppStoreReportError("empty_segment", "Report segment has no content");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > MAX_SEGMENT_BYTES || length > segment.sizeInBytes) throw new AppStoreReportError("segment_size", "Report segment exceeded its declared or maximum size");
        chunks.push(value);
      }
    } finally { await reader.cancel().catch(() => undefined); }
    const compressed = Buffer.concat(chunks, length);
    if (length !== segment.sizeInBytes) throw new AppStoreReportError("segment_size", "Report segment size does not match Apple metadata");
    if (createHash("md5").update(compressed).digest("hex") !== segment.checksum.toLowerCase()) throw new AppStoreReportError("checksum_mismatch", "Report checksum does not match Apple metadata");
    return compressed;
  } catch (error) {
    if (error instanceof AppStoreReportError) throw error;
    // Signed URLs contain temporary credentials: never expose fetch errors or URLs.
    throw new AppStoreReportError("download_timeout", "Report download failed or timed out; refresh segment metadata and retry");
  }
}

export async function gunzipAnalyticsSegment(compressed: Buffer): Promise<string> {
  try {
    const data = await decompress(compressed, { maxOutputLength: MAX_REPORT_BYTES });
    return new TextDecoder("utf-8", { fatal: true }).decode(data);
  } catch { throw new AppStoreReportError("invalid_gzip", "Report segment is invalid gzip, invalid UTF-8, or exceeds the decompressed size limit"); }
}
