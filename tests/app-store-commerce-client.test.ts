import { gzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import { AppStoreConnectClient } from "../lib/infra/app-store/AppStoreConnectClient";
import type { AppStoreTokenProvider } from "../lib/infra/app-store/AppStoreTokenProvider";
import { reportDiagnostic } from "../lib/services/app-store-sync";
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
    expect(Object.fromEntries(url.searchParams)).toEqual({ "filter[vendorNumber]": "123456", "filter[reportDate]": "2026-09-29", "filter[reportType]": "SALES", "filter[reportSubType]": "SUMMARY", "filter[frequency]": "DAILY", "filter[version]": "1_0" });
    expect(request.mock.calls[0][1]).toMatchObject({ redirect: "error", headers: { Accept: "application/a-gzip", Authorization: "Bearer synthetic-token" } });
  });
  it("requests FINANCIAL by fiscal month and consolidated region ZZ", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(gzipSync("synthetic")));
    await new AppStoreConnectClient(tokens, request).downloadFinanceReport("123456", "2026-09", "ZZ");
    expect(Object.fromEntries(new URL(String(request.mock.calls[0][0])).searchParams)).toEqual({ "filter[vendorNumber]": "123456", "filter[reportDate]": "2026-09", "filter[regionCode]": "ZZ", "filter[reportType]": "FINANCIAL" });
  });
  it("retries transient Sales and Finance responses before returning reports", async () => {
    vi.useFakeTimers();
    try {
      const bytes = gzipSync("synthetic");
      const request = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ errors: [{ code: "BUSY", title: "Busy" }] }, { status: 429 }))
        .mockResolvedValueOnce(new Response(bytes));
      const operation = new AppStoreConnectClient(tokens, request).downloadSalesReport("123", "2026-09-29");
      await vi.runAllTimersAsync();
      await expect(operation).resolves.toEqual(bytes);
      expect(request).toHaveBeenCalledTimes(2);

      const financeRequest = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("", { status: 503 }))
        .mockResolvedValueOnce(new Response(bytes));
      const finance = new AppStoreConnectClient(tokens, financeRequest).downloadFinanceReport("123", "2026-09", "ZZ");
      await vi.runAllTimersAsync();
      await expect(finance).resolves.toEqual(bytes);
      expect(financeRequest).toHaveBeenCalledTimes(2);
    } finally { vi.useRealTimers(); }
  });

  it("honors Retry-After but caps each wait at eight seconds", async () => {
    vi.useFakeTimers();
    try {
      const request = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("", { status: 429, headers: { "Retry-After": "60" } })).mockResolvedValueOnce(new Response(gzipSync("synthetic")));
      const operation = new AppStoreConnectClient(tokens, request).downloadFinanceReport("123", "2026-09", "ZZ");
      await vi.advanceTimersByTimeAsync(7999);
      expect(request).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await expect(operation).resolves.toBeTruthy();
    } finally { vi.useRealTimers(); }
  });

  it("only treats explicit no-sales responses as empty", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ errors: [{ detail: "There were no sales for the date specified" }] }, { status: 404 })).mockResolvedValueOnce(Response.json({ errors: [{ detail: "Report not available" }] }, { status: 404 }));
    const client = new AppStoreConnectClient(tokens, request);
    expect(await client.downloadSalesReport("123", "2026-09-29")).toBeNull();
    await expect(client.downloadSalesReport("123", "2026-09-30")).rejects.toMatchObject({ status: 404 });
  });
  it("treats explicit Finance no-results as no_data but preserves unrelated 404 failures", async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ errors: [{ detail: "No results for the requested period" }] }, { status: 404 }))
      .mockResolvedValueOnce(Response.json({ errors: [{ detail: "Finance report not found" }] }, { status: 404 }));
    const client = new AppStoreConnectClient(tokens, request);
    expect(await client.downloadFinanceReport("123", "2026-09", "ZZ")).toBeNull();
    await expect(client.downloadFinanceReport("123", "2026-08", "ZZ")).rejects.toMatchObject({ status: 404 });
  });
  describe.each(["sales", "finance"] as const)("%s Apple ErrorResponse diagnostics", (source) => {
    it.each([400, 403, 429])("preserves safe fields for HTTP %i and redacts every sent value", async (status) => {
      const vendor = "12345678", date = source === "sales" ? "2026-09-29" : "2026-09";
      const token = "eyJhbGciOiJFUzI1NiJ9.eyJpc3MiOiJzeW50aGV0aWMifQ.signature";
      const values = source === "sales" ? [vendor, date, "SALES", "SUMMARY", "DAILY", "1_0"] : [vendor, date, "ZZ", "FINANCIAL"];
      const request = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ errors: [{
        code: "PARAMETER_ERROR.INVALID", title: "Invalid parameter", source: { parameter: "filter[vendorNumber]" },
        detail: `Invalid vendor number: ${values.join(" ")} ${token} https://example.com/signed?secret=hidden -----BEGIN PRIVATE KEY-----\nPRIVATE-CONTENT\n-----END PRIVATE KEY----- Authorization: Bearer opaque-secret`,
      }] }, { status }));
      const client = new AppStoreConnectClient({ getToken: async () => token } as AppStoreTokenProvider, request);
      const operation = source === "sales" ? client.downloadSalesReport(vendor, date) : client.downloadFinanceReport(vendor, date, "ZZ");
      const error = await operation.catch((error: unknown) => error);
      expect(error).toMatchObject({ status, code: "PARAMETER_ERROR.INVALID", title: "Invalid parameter", parameter: "filter[vendorNumber]", message: expect.stringContaining("Invalid vendor number") });
      const diagnostic = reportDiagnostic(error);
      expect(diagnostic).toContain(`status=${status}`);
      expect(diagnostic).toContain("parameter=filter[vendorNumber]");
      for (const value of [...values, token, "https://", "PRIVATE-CONTENT", "opaque-secret", "hidden"]) expect(diagnostic).not.toContain(value);
    });
  });
  it.each(["not JSON", JSON.stringify({ errors: [{ detail: "SECRET" }] })])("hides malformed error bodies", async (body) => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(body, { status: 400 }));
    await expect(new AppStoreConnectClient(tokens, request).downloadSalesReport("123", "2026-09-29")).rejects.toMatchObject({ status: 400, message: "Apple report request failed (400)" });
  });
  it("bounds binary bodies and hides network errors", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("x", { headers: { "content-length": String(MAX_SEGMENT_BYTES + 1) } })).mockRejectedValueOnce(new Error("SECRET"));
    const client = new AppStoreConnectClient(tokens, request);
    await expect(client.downloadFinanceReport("123", "2026-09", "ZZ")).rejects.toMatchObject({ code: "report_size" });
    await expect(client.downloadFinanceReport("123", "2026-09", "ZZ")).rejects.toMatchObject({ message: "Apple report request failed or timed out" });
  });
});
