import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import { assertSegmentUrl, downloadAnalyticsSegment, gunzipAnalyticsSegment, MAX_SEGMENT_BYTES } from "../lib/infra/app-store/analytics-segment";

const compressed = gzipSync("Column\tCount\nValue\t0\n");
const metadata = { url: "https://bucket.s3.us-west-2.amazonaws.com/report.txt.gz?temporary=secret", checksum: createHash("md5").update(compressed).digest("hex"), sizeInBytes: compressed.length };
const response = () => new Response(new Uint8Array(compressed));

describe("independent ASC report downloader", () => {
  it("verifies MD5, decompresses gzip, and sends no ASC credentials", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(response());
    expect(await gunzipAnalyticsSegment(await downloadAnalyticsSegment(metadata, request))).toBe("Column\tCount\nValue\t0\n");
    expect(request.mock.calls[0][1]).toMatchObject({ redirect: "error", signal: expect.any(AbortSignal) });
    expect(request.mock.calls[0][1]).not.toHaveProperty("headers");
    expect(metadata).not.toHaveProperty("token");
  });

  it.each(["http://bucket.s3.amazonaws.com/file", "https://localhost/file", "https://s3.amazonaws.com.evil.example/file", "https://user:pass@bucket.s3.amazonaws.com/file", "https://bucket.s3.amazonaws.com:8443/file"])("rejects unsafe URL %s", (url) => {
    expect(() => assertSegmentUrl(url)).toThrow("trusted HTTPS");
  });

  it("rejects checksum mismatches and truncated data", async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(async () => response());
    await expect(downloadAnalyticsSegment({ ...metadata, checksum: "0".repeat(32) }, request)).rejects.toMatchObject({ code: "checksum_mismatch" });
    await expect(downloadAnalyticsSegment({ ...metadata, sizeInBytes: compressed.length + 1 }, request)).rejects.toMatchObject({ code: "segment_size" });
  });

  it("limits metadata size before sending a request", async () => {
    const request = vi.fn<typeof fetch>();
    await expect(downloadAnalyticsSegment({ ...metadata, sizeInBytes: MAX_SEGMENT_BYTES + 1 }, request)).rejects.toMatchObject({ code: "segment_size" });
    expect(request).not.toHaveBeenCalled();
  });

  it("cancels oversized bodies and enforces the size bound without content-length", async () => {
    const cancel = vi.fn();
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(new ReadableStream({ cancel }), { headers: { "content-length": String(MAX_SEGMENT_BYTES + 1) } }))
      .mockResolvedValueOnce(new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(compressed.length + 1)); }, cancel })));
    await expect(downloadAnalyticsSegment(metadata, request)).rejects.toMatchObject({ code: "segment_size" });
    await expect(downloadAnalyticsSegment(metadata, request)).rejects.toMatchObject({ code: "segment_size" });
    expect(cancel).toHaveBeenCalledTimes(2);
  });

  it("distinguishes an expired signed URL and hides timeout details", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("expired", { status: 403 }))
      .mockRejectedValueOnce(new DOMException(metadata.url, "TimeoutError"));
    await expect(downloadAnalyticsSegment(metadata, request)).rejects.toMatchObject({ code: "download_expired" });
    await expect(downloadAnalyticsSegment(metadata, request)).rejects.toMatchObject({ code: "download_timeout", message: expect.not.stringContaining("temporary=") });
  });

  it("rejects invalid gzip and invalid UTF-8", async () => {
    await expect(gunzipAnalyticsSegment(Buffer.from("not gzip"))).rejects.toMatchObject({ code: "invalid_gzip" });
    await expect(gunzipAnalyticsSegment(gzipSync(Buffer.from([0xff])))).rejects.toMatchObject({ code: "invalid_gzip" });
  });
});
