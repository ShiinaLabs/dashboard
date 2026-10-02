import { gzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import { AppStoreConnectClient, type AnalyticsReportInstance } from "../lib/infra/app-store/AppStoreConnectClient";
import { prepareAnalyticsInstance } from "../lib/infra/app-store/analytics-instance";

const instance: AnalyticsReportInstance = { id: "instance", type: "analyticsReportInstances", attributes: { processingDate: "2026-10-01", granularity: "DAILY" } };
function mockClient() {
  const order: string[] = [];
  const segment = (id: string) => ({ id, type: "analyticsReportSegments", attributes: { url: `https://bucket.s3.amazonaws.com/${id}`, checksum: "a".repeat(32), sizeInBytes: 10 } });
  const client = {
    listAnalyticsReportSegments: vi.fn().mockResolvedValue([segment("one"), segment("two")]),
    getAnalyticsReportSegment: vi.fn().mockImplementation(async (id: string) => { order.push(`refresh:${id}`); return segment(id); }),
    downloadAnalyticsSegment: vi.fn().mockImplementation(async (resource: { id: string }) => { order.push(`download:${resource.id}`); return gzipSync(`Column\tCount\n${resource.id}\t0\n`); }),
  };
  return { client, order, typed: client as unknown as AppStoreConnectClient };
}

describe("whole-instance preparation", () => {
  it("refreshes each URL just before downloading and combines every segment", async () => {
    const { typed, order } = mockClient();
    const prepared = await prepareAnalyticsInstance(typed, instance, ["Column", "Count"]);
    expect(order).toEqual(["refresh:one", "download:one", "refresh:two", "download:two"]);
    expect(prepared.table.rows.map((row) => row.Column)).toEqual(["one", "two"]);
    expect(prepared.segments).toHaveLength(2);
    expect(JSON.stringify(prepared)).not.toContain("https:");
  });

  it("never returns a partial instance when a later segment fails", async () => {
    const { client, typed } = mockClient();
    client.downloadAnalyticsSegment.mockResolvedValueOnce(gzipSync("Column\tCount\none\t0\n")).mockRejectedValueOnce(new Error("download failed"));
    const writer = vi.fn();
    await expect(prepareAnalyticsInstance(typed, instance).then(writer)).rejects.toThrow("download failed");
    expect(writer).not.toHaveBeenCalled();
  });

  it("rejects inconsistent headers, missing segments and a different refreshed identity", async () => {
    const first = mockClient();
    first.client.downloadAnalyticsSegment.mockResolvedValueOnce(gzipSync("A\none\n")).mockResolvedValueOnce(gzipSync("B\ntwo\n"));
    await expect(prepareAnalyticsInstance(first.typed, instance)).rejects.toMatchObject({ code: "inconsistent_headers" });
    const second = mockClient(); second.client.listAnalyticsReportSegments.mockResolvedValueOnce([]);
    await expect(prepareAnalyticsInstance(second.typed, instance)).rejects.toMatchObject({ code: "segments_pending" });
    const third = mockClient(); third.client.getAnalyticsReportSegment.mockResolvedValueOnce({ id: "wrong" });
    await expect(prepareAnalyticsInstance(third.typed, instance)).rejects.toMatchObject({ code: "invalid_segment" });
  });

  it("accepts only DAILY instances", async () => {
    const { typed, client } = mockClient();
    await expect(prepareAnalyticsInstance(typed, { ...instance, attributes: { ...instance.attributes, granularity: "WEEKLY" } })).rejects.toMatchObject({ code: "unsupported_granularity" });
    expect(client.listAnalyticsReportSegments).not.toHaveBeenCalled();
  });
});
