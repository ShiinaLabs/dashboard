import { gzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import { AppStoreConnectClient } from "../lib/infra/app-store/AppStoreConnectClient";
import type { AppStoreTokenProvider } from "../lib/infra/app-store/AppStoreTokenProvider";
import { gunzipAnalyticsSegment, MAX_SEGMENT_BYTES } from "../lib/infra/app-store/analytics-segment";
const tokens = { getToken: async () => "synthetic-token" } as AppStoreTokenProvider;
describe("Sales and Finance API binary reports", () => {
  it("requests gzip Sales Summary DAILY with the configured vendor and exact date", async () => {
    const bytes = gzipSync("synthetic\treport\n");
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(bytes));
    const data = await new AppStoreConnectClient(tokens, request).downloadSalesReport("123456", "2026-09-29");
    expect(await gunzipAnalyticsSegment(data!)).toBe("synthetic\treport\n");
    const url = new URL(String(request.mock.calls[0][0]));
    expect(url.pathname).toBe("/v1/salesReports");
    expect(Object.fromEntries(url.searchParams)).toEqual({ "filter[vendorNumber]": "123456", "filter[reportDate]": "2026-09-29", "filter[reportType]": "SALES", "filter[reportSubType]": "SUMMARY", "filter[frequency]": "DAILY" });
    expect(request.mock.calls[0][1]).toMatchObject({ redirect: "error", headers: { Accept: "application/a-gzip", Authorization: "Bearer synthetic-token" } });
  });
  it("requests FINANCIAL by fiscal month and consolidated region ZZ", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(gzipSync("synthetic")));
    await new AppStoreConnectClient(tokens, request).downloadFinanceReport("123456", "2026-09", "ZZ");
    expect(Object.fromEntries(new URL(String(request.mock.calls[0][0])).searchParams)).toEqual({ "filter[vendorNumber]": "123456", "filter[reportDate]": "2026-09", "filter[regionCode]": "ZZ", "filter[reportType]": "FINANCIAL" });
  });
  it("only treats explicit no-sales responses as empty", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ errors: [{ detail: "There were no sales for the date specified" }] }, { status: 404 })).mockResolvedValueOnce(Response.json({ errors: [{ detail: "Report not available" }] }, { status: 404 }));
    const client = new AppStoreConnectClient(tokens, request);
    expect(await client.downloadSalesReport("123", "2026-09-29")).toBeNull();
    await expect(client.downloadSalesReport("123", "2026-09-30")).rejects.toMatchObject({ status: 404 });
  });
  it.each([400, 403, 429])("does not expose upstream body content or turn %i into zero revenue", async (status) => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ errors: [{ detail: "SECRET revenue and signed-url" }] }, { status }));
    await expect(new AppStoreConnectClient(tokens, request).downloadSalesReport("123", "2026-09-29")).rejects.toMatchObject({ status, message: `Apple report request failed (${status})` });
  });
  it("bounds binary bodies and hides network errors", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("x", { headers: { "content-length": String(MAX_SEGMENT_BYTES + 1) } })).mockRejectedValueOnce(new Error("SECRET"));
    const client = new AppStoreConnectClient(tokens, request);
    await expect(client.downloadFinanceReport("123", "2026-09", "ZZ")).rejects.toMatchObject({ code: "report_size" });
    await expect(client.downloadFinanceReport("123", "2026-09", "ZZ")).rejects.toMatchObject({ message: "Apple report request failed or timed out" });
  });
});
