import { describe, expect, it, vi } from "vitest";
import { AppStoreConnectClient } from "../lib/infra/app-store/AppStoreConnectClient";
import { AppStoreTokenProvider } from "../lib/infra/app-store/AppStoreTokenProvider";

const tokens = { getToken: async () => "test-token" } as AppStoreTokenProvider;
const ongoing = { id: "request-1", type: "analyticsReportRequests", attributes: { accessType: "ONGOING", stoppedDueToInactivity: true } };

describe("ASC Analytics API", () => {
  it("reads stopped requests and creates requests with an App relationship", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ data: [ongoing] }))
      .mockResolvedValueOnce(Response.json({ data: { ...ongoing, id: "snapshot", attributes: { accessType: "ONE_TIME_SNAPSHOT" } } }))
      .mockResolvedValueOnce(Response.json({ data: { ...ongoing, id: "new-ongoing", attributes: { accessType: "ONGOING" } } }));
    const client = new AppStoreConnectClient(tokens, request);
    expect(await client.listAnalyticsReportRequests("123")).toEqual([ongoing]);
    for (const accessType of ["ONE_TIME_SNAPSHOT", "ONGOING"] as const) {
      const resource = await client.createAnalyticsReportRequest("123", accessType);
      expect(resource.attributes).toEqual({ accessType, stoppedDueToInactivity: false });
      expect(JSON.parse(String(request.mock.lastCall?.[1]?.body))).toEqual({ data: {
        type: "analyticsReportRequests", attributes: { accessType }, relationships: { app: { data: { type: "apps", id: "123" } } },
      } });
      expect(request.mock.lastCall?.[1]?.method).toBe("POST");
    }
  });

  it.each([
    { method: "listAnalyticsReports" as const, path: "/v1/analyticsReportRequests/id/reports", resource: { id: "one", type: "analyticsReports", attributes: { name: "App Store Downloads Standard", category: "COMMERCE" } } },
    { method: "listAnalyticsReportInstances" as const, path: "/v1/analyticsReports/id/instances", resource: { id: "one", type: "analyticsReportInstances", attributes: { granularity: "DAILY", processingDate: "2026-10-01" } } },
    { method: "listAnalyticsReportSegments" as const, path: "/v1/analyticsReportInstances/id/segments", resource: { id: "one", type: "analyticsReportSegments", attributes: { sizeInBytes: 10, checksum: "a".repeat(32), url: "https://bucket.s3.us-west-2.amazonaws.com/object" } } },
  ])("follows every $method page", async ({ method, path, resource }) => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ data: [resource], links: { next: `${path}?cursor=next` } }))
      .mockResolvedValueOnce(Response.json({ data: [{ ...resource, id: "two" }], links: { next: null } }));
    const client = new AppStoreConnectClient(tokens, request);
    expect((await client[method]("id")).map((row) => row.id)).toEqual(["one", "two"]);
    expect(request).toHaveBeenCalledTimes(2);
    if (method === "listAnalyticsReportInstances") expect(new URL(String(request.mock.calls[0][0])).searchParams.get("filter[granularity]")).toBe("DAILY");
  });

  it.each([403, 429])("preserves Apple status %i and safe detail", async (status) => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ errors: [{ code: "APPLE_ERROR", title: "Request rejected", detail: "https://signed.example/secret" }] }, { status }));
    await expect(new AppStoreConnectClient(tokens, request).listAnalyticsReports("id")).rejects.toMatchObject({ status, code: "APPLE_ERROR", message: expect.not.stringContaining("signed.example") });
  });

  it("rejects invalid resource responses and does not leak network error URLs", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ data: { id: "segment", attributes: {} } }))
      .mockRejectedValueOnce(new DOMException("https://signed.example/secret", "TimeoutError"));
    const client = new AppStoreConnectClient(tokens, request);
    await expect(client.getAnalyticsReportSegment("segment")).rejects.toMatchObject({ code: "invalid_response" });
    await expect(client.listAnalyticsReportInstances("report")).rejects.toMatchObject({ code: "request_failed", message: expect.not.stringContaining("signed.example") });
  });

  it("rejects pagination that switches to a different analytics endpoint", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ data: [], links: { next: "/v1/analyticsReportRequests/other/reports" } }));
    await expect(new AppStoreConnectClient(tokens, request).listAnalyticsReports("id")).rejects.toMatchObject({ code: "invalid_pagination" });
    expect(request).toHaveBeenCalledTimes(1);
  });
});
