import { z } from "zod";
import { AppStoreTokenProvider } from "./AppStoreTokenProvider";
import { downloadAnalyticsSegment, AppStoreReportError, MAX_SEGMENT_BYTES } from "./analytics-segment";

const ORIGIN = "https://api.appstoreconnect.apple.com";
const resourceId = z.string().min(1).max(200);
const appResource = z.object({
  id: resourceId, type: z.literal("apps"),
  attributes: z.object({ name: z.string(), bundleId: z.string(), sku: z.string() }),
});
const requestResource = z.object({
  id: resourceId, type: z.literal("analyticsReportRequests"),
  attributes: z.object({ accessType: z.enum(["ONE_TIME_SNAPSHOT", "ONGOING"]), stoppedDueToInactivity: z.boolean().default(false) }),
});
const reportResource = z.object({
  id: resourceId, type: z.literal("analyticsReports"),
  attributes: z.object({ name: z.string(), category: z.string() }),
});
const instanceResource = z.object({
  id: resourceId, type: z.literal("analyticsReportInstances"),
  attributes: z.object({ granularity: z.enum(["DAILY", "WEEKLY", "MONTHLY"]), processingDate: z.iso.date() }),
});
const segmentResource = z.object({
  id: resourceId, type: z.literal("analyticsReportSegments"),
  attributes: z.object({ checksum: z.string().regex(/^[a-f\d]{32}$/i), sizeInBytes: z.number().int().nonnegative(), url: z.string().url() }),
});

export type AnalyticsReportRequest = z.infer<typeof requestResource>;
export type AnalyticsReport = z.infer<typeof reportResource>;
export type AnalyticsReportInstance = z.infer<typeof instanceResource>;
export type AnalyticsReportSegment = z.infer<typeof segmentResource>;
export type AnalyticsAccessType = AnalyticsReportRequest["attributes"]["accessType"];
export interface DiscoveredApp { apple_id: string; name: string; bundle_id: string; sku: string }

export class AppStoreApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
    this.name = "AppStoreApiError";
  }
}

function safeAppleMessage(message: string): string {
  return message.replace(/-----BEGIN [\s\S]*?-----END [^-]+-----/g, "[redacted]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redacted]")
    .replace(/https?:\/\/\S+/g, "[URL redacted]").slice(0, 1000);
}

export class AppStoreConnectClient {
  constructor(private readonly tokens: AppStoreTokenProvider, private readonly request: typeof fetch = fetch) {}

  private async jsonRequest(url: URL, method = "GET", body?: unknown): Promise<unknown> {
    const token = await this.tokens.getToken();
    let response: Response;
    try {
      response = await this.request(url.href, {
        method, headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(20_000), redirect: "error",
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const parsed = z.object({ errors: z.array(z.object({ code: z.string(), title: z.string(), detail: z.string().optional() })) }).safeParse(result);
        const errors = parsed.success ? parsed.data.errors : [];
        const message = errors.map((error) => `${error.title}${error.detail ? `: ${error.detail}` : ""}`).join("; ");
        throw new AppStoreApiError(response.status, errors[0]?.code ?? "apple_error", `Apple API (${response.status}): ${safeAppleMessage(message || response.statusText)}`);
      }
      return result;
    } catch (error) {
      if (error instanceof AppStoreApiError) throw error;
      throw new AppStoreApiError(502, "request_failed", "App Store Connect request failed or timed out");
    }
  }

  private parse<T>(schema: z.ZodType<T>, body: unknown): T {
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new AppStoreApiError(502, "invalid_response", "Apple returned an invalid API response");
    return parsed.data;
  }

  private async list<T>(path: string, resource: z.ZodType<T>, query = "limit=200"): Promise<T[]> {
    const schema = z.object({ data: z.array(resource), links: z.object({ next: z.string().nullable().optional() }).optional() });
    let next: string | null = `${ORIGIN}${path}?${query}`;
    const seen = new Set<string>();
    const resources: T[] = [];
    while (next) {
      let url: URL;
      try { url = new URL(next, ORIGIN); }
      catch { throw new AppStoreApiError(502, "invalid_pagination", "Apple returned an invalid pagination link"); }
      if (url.origin !== ORIGIN || url.pathname !== path || url.username || url.password || seen.has(url.href) || seen.size >= 1000) {
        throw new AppStoreApiError(502, "invalid_pagination", "Apple returned an invalid pagination link");
      }
      seen.add(url.href);
      const page = this.parse(schema, await this.jsonRequest(url));
      resources.push(...page.data);
      next = page.links?.next ?? null;
    }
    return resources;
  }

  private async binaryReport(path: string, filters: Record<string, string>): Promise<Buffer | null> {
    const url = new URL(path, ORIGIN);
    for (const [key, value] of Object.entries(filters)) url.searchParams.set(`filter[${key}]`, value);
    try {
      const response = await this.request(url.href, { headers: { Authorization: `Bearer ${await this.tokens.getToken()}`, Accept: "application/a-gzip" }, redirect: "error", signal: AbortSignal.timeout(30_000) });
      const limit = response.ok ? MAX_SEGMENT_BYTES : 64 * 1024;
      const advertised = response.headers.get("content-length");
      if (advertised && (!/^\d+$/.test(advertised) || Number(advertised) > limit)) {
        await response.body?.cancel();
        throw new AppStoreReportError("report_size", "Report response exceeds the size limit");
      }
      if (!response.body) throw new AppStoreReportError("empty_report", "Report response has no content");
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > limit) throw new AppStoreReportError("report_size", "Report response exceeds the size limit");
          chunks.push(value);
        }
      } finally { await reader.cancel().catch(() => undefined); }
      const bytes = Buffer.concat(chunks, size);
      if (!response.ok) {
        // Only an explicit no-sales response is empty; missing/unavailable reports remain failures.
        if (path === "/v1/salesReports" && response.status === 404 && /(?:there (?:were|are) no sales|no sales for the (?:date|period))/i.test(bytes.toString("utf8"))) return null;
        throw new AppStoreApiError(response.status, "report_request_failed", `Apple report request failed (${response.status})`);
      }
      if (!size) throw new AppStoreReportError("empty_report", "Report response has no content");
      return bytes;
    } catch (error) {
      if (error instanceof AppStoreApiError || error instanceof AppStoreReportError) throw error;
      throw new AppStoreApiError(502, "report_request_failed", "Apple report request failed or timed out");
    }
  }

  downloadSalesReport(vendorNumber: string, date: string) {
    return this.binaryReport("/v1/salesReports", { vendorNumber, reportDate: date, reportType: "SALES", reportSubType: "SUMMARY", frequency: "DAILY" });
  }

  downloadFinanceReport(vendorNumber: string, fiscalMonth: string, regionCode: string) {
    return this.binaryReport("/v1/financeReports", { vendorNumber, reportDate: fiscalMonth, regionCode, reportType: "FINANCIAL" });
  }

  async listApps(): Promise<DiscoveredApp[]> {
    const resources = await this.list("/v1/apps", appResource, "limit=200&fields%5Bapps%5D=name,bundleId,sku");
    return [...new Map(resources.map((app) => [app.id, { apple_id: app.id, name: app.attributes.name, bundle_id: app.attributes.bundleId, sku: app.attributes.sku }])).values()];
  }

  listAnalyticsReportRequests(appAppleId: string) {
    return this.list(`/v1/apps/${encodeURIComponent(appAppleId)}/analyticsReportRequests`, requestResource);
  }

  async createAnalyticsReportRequest(appAppleId: string, accessType: AnalyticsAccessType) {
    const body = { data: { type: "analyticsReportRequests", attributes: { accessType }, relationships: { app: { data: { type: "apps", id: appAppleId } } } } };
    return this.parse(z.object({ data: requestResource }), await this.jsonRequest(new URL(`${ORIGIN}/v1/analyticsReportRequests`), "POST", body)).data;
  }

  listAnalyticsReports(requestId: string) {
    return this.list(`/v1/analyticsReportRequests/${encodeURIComponent(requestId)}/reports`, reportResource);
  }

  listAnalyticsReportInstances(reportId: string) {
    return this.list(`/v1/analyticsReports/${encodeURIComponent(reportId)}/instances`, instanceResource, "limit=200&filter%5Bgranularity%5D=DAILY");
  }

  listAnalyticsReportSegments(instanceId: string) {
    return this.list(`/v1/analyticsReportInstances/${encodeURIComponent(instanceId)}/segments`, segmentResource);
  }

  async getAnalyticsReportSegment(segmentId: string) {
    const path = `/v1/analyticsReportSegments/${encodeURIComponent(segmentId)}`;
    return this.parse(z.object({ data: segmentResource }), await this.jsonRequest(new URL(`${ORIGIN}${path}`))).data;
  }

  downloadAnalyticsSegment(segment: AnalyticsReportSegment) {
    return downloadAnalyticsSegment(segment.attributes, this.request);
  }
}
