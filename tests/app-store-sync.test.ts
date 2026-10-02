import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppStoreConnectClient, type AnalyticsReport } from "../lib/infra/app-store/AppStoreConnectClient";
import type { AppStoreTokenProvider } from "../lib/infra/app-store/AppStoreTokenProvider";
import { analyticsReportDefinitions, identifyStandardAnalyticsReport } from "../lib/infra/app-store/report-mapping";
import { syncAppStoreAnalytics, syncAppStoreRevenue } from "../lib/services/app-store-sync";
import { getAppStoreAnalyticsStatus } from "../lib/services/app-store-analytics";
import { reportRunDisplayStatus } from "../shared/app-store";

const mocks = vi.hoisted(() => ({
  client: vi.fn(), authorized: vi.fn(), commit: vi.fn(), finish: vi.fn(), runs: vi.fn(), partitions: vi.fn(), imports: vi.fn(),
  info: vi.fn(), warn: vi.fn(), error: vi.fn(),
}));
vi.mock("../lib/config", () => ({ isMockMode: () => false }));
vi.mock("../lib/logger", () => ({ getLogger: () => mocks }));
vi.mock("../lib/services/app-store", () => ({
  authorizedConnection: mocks.authorized,
  clientForConnection: mocks.client,
}));
vi.mock("../lib/repositories/app-store", () => ({
  startRun: async (_id: number, kind: string, scope: string) => ({ id: 10, connection_id: 1, kind, scope, started_at: "2026-10-02T00:00:00Z" }),
  finishRun: mocks.finish,
}));
vi.mock("../lib/repositories/app-store-analytics", () => ({
  enabledApps: async () => [{ id: 2, apple_id: "123" }],
  adoptRequest: async () => ({ id: 3 }),
  importsForApps: mocks.imports,
  requestsForApps: async () => [{ app_id: 2, access_type: "ONGOING", stopped_due_to_inactivity: false }],
  analyticsRuns: mocks.runs,
}));
vi.mock("../lib/repositories/app-store-facts", () => ({ commitAnalyticsInstance: mocks.commit, readAnalyticsPartitions: mocks.partitions }));

const viewer = { id: 1, role: "admin" };
function catalog(names: string[]): AnalyticsReport[] {
  return names.map((name, index) => ({ id: `report-${index}`, type: "analyticsReports", attributes: { name, category: "APP_STORE_COMMERCE" } }));
}
function clientWithCatalog(names: string[]) {
  const common = { Date: "2026-09-29", "App Apple Identifier": "123", Territory: "USA" };
  const row = { ...common, Event: "Impression", "Page Type": "No page", "Source Type": "App Store search", Counts: "10", "Unique Counts": "8", "Download Type": "First-time Download" };
  const bytes = gzipSync(Object.keys(row).join("\t") + "\n" + Object.values(row).join("\t"));
  const segment = { id: "segment", type: "analyticsReportSegments", attributes: { url: "https://synthetic.s3.amazonaws.com/segment", checksum: createHash("md5").update(bytes).digest("hex"), sizeInBytes: bytes.length } };
  const request = vi.fn<typeof fetch>().mockImplementation(async (input) => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith("/analyticsReportRequests")) return Response.json({ data: [{ id: "request", type: "analyticsReportRequests", attributes: { accessType: "ONGOING", stoppedDueToInactivity: false } }] });
    if (path.endsWith("/reports")) return Response.json({ data: catalog(names) });
    if (path.endsWith("/instances")) return Response.json({ data: [{ id: "instance", type: "analyticsReportInstances", attributes: { granularity: "DAILY", processingDate: "2026-10-02" } }] });
    if (path.endsWith("/segments")) return Response.json({ data: [segment] });
    if (path.endsWith("/analyticsReportSegments/segment")) return Response.json({ data: segment });
    if (path === "/segment") return new Response(bytes);
    throw new Error(`Unexpected test request: ${path}`);
  });
  const client = new AppStoreConnectClient({ getToken: async () => "synthetic-token" } as AppStoreTokenProvider, request);
  mocks.client.mockReturnValue(client);
  const instances = vi.spyOn(client, "listAnalyticsReportInstances");
  return { client, instances };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorized.mockResolvedValue({ id: 1, is_active: true, updated_at: "version", vendor_number: null });
  mocks.commit.mockResolvedValue("imported");
  mocks.finish.mockResolvedValue(undefined);
  mocks.imports.mockResolvedValue([]);
  mocks.runs.mockResolvedValue([]);
  mocks.partitions.mockResolvedValue([]);
});

describe("Standard report recognition", () => {
  it.each(Object.entries(analyticsReportDefinitions))("recognizes only the exact %s Standard name", (kind, definition) => {
    expect(identifyStandardAnalyticsReport(definition.standardName)).toBe(kind);
    for (const name of [definition.baseName, `${definition.baseName} Detailed`, `${definition.baseName} SomethingElse`]) expect(identifyStandardAnalyticsReport(name)).toBeUndefined();
  });
});

describe("production Analytics sync selection", () => {
  it("takes both acquisition Standard reports through instances, segments and the real mapper", async () => {
    const { instances } = clientWithCatalog([analyticsReportDefinitions.discovery.standardName, analyticsReportDefinitions.downloads.standardName, "App Store Downloads Detailed"]);
    expect(await syncAppStoreAnalytics(1, viewer)).toMatchObject({ status: "success", imported: 2, waiting: 0, errors: [] });
    expect(instances.mock.calls).toEqual([["report-0"], ["report-1"]]);
    expect(mocks.commit.mock.calls.map((call) => call[2].kind)).toEqual(["discovery", "downloads"]);
    expect(mocks.commit.mock.calls[1][2].rows[0]).toMatchObject({ app_id: 2, counts: "10" });
    const events = mocks.info.mock.calls.map(([, message]) => JSON.parse(message));
    expect(events.find((event) => event.event === "analytics_report_catalog")).toMatchObject({ appId: 2, requestId: "request", accessType: "ONGOING", reports: catalog([analyticsReportDefinitions.discovery.standardName, analyticsReportDefinitions.downloads.standardName, "App Store Downloads Detailed"]).map((report) => report.attributes) });
    for (const event of ["analytics_report_instances", "analytics_report_segments", "analytics_instance_committed"]) expect(events.some((entry) => entry.event === event)).toBe(true);
    expect(JSON.stringify(events)).not.toMatch(/https:|synthetic-token|App Apple Identifier|App Store search/);
  });

  it.each(["App Store Downloads Detailed", "App Store Downloads SomethingElse", "App Store Downloads"])("diagnoses %s without calling the instance API", async (name) => {
    const { instances } = clientWithCatalog([name]);
    const result = await syncAppStoreAnalytics(1, viewer);
    expect(result).toMatchObject({ status: "error", imported: 0, skipped: 0, errors: [expect.stringContaining(`expected=App Store Downloads Standard; received=${name}`)] });
    expect(result.errors[0]).toContain("unexpected_report_variant");
    expect(instances).not.toHaveBeenCalled();
    expect(mocks.commit).not.toHaveBeenCalled();
    expect(mocks.finish).toHaveBeenCalledWith(expect.anything(), "error", expect.stringContaining("unexpected_report_variant"));
  });

  it.each([[[], "no_reports_generated"], [["App Crashes"], "target_report_unavailable"]] as const)("waits safely when the target is absent (%s)", async (names, reason) => {
    const { instances } = clientWithCatalog([...names]);
    expect(await syncAppStoreAnalytics(1, viewer)).toMatchObject({ status: "waiting", imported: 0, skipped: 0, errors: [], waitingReasons: expect.arrayContaining([expect.stringContaining(reason)]) });
    expect(instances).not.toHaveBeenCalled();
    expect(mocks.finish).toHaveBeenCalledWith(expect.anything(), "success", expect.stringMatching(/^waiting: /));
  });

  it("keeps waiting plus a variant error as error, and imported plus an error as partial", async () => {
    clientWithCatalog(["App Store Downloads Detailed"]);
    expect((await syncAppStoreAnalytics(1, viewer)).status).toBe("error");
    clientWithCatalog([analyticsReportDefinitions.discovery.standardName, "App Store Downloads SomethingElse"]);
    expect(await syncAppStoreAnalytics(1, viewer)).toMatchObject({ status: "partial", imported: 1 });
  });

  it("diagnoses the instance and segment waiting stages", async () => {
    const first = clientWithCatalog([analyticsReportDefinitions.downloads.standardName]);
    first.instances.mockResolvedValue([]);
    expect((await syncAppStoreAnalytics(1, viewer)).waitingReasons).toEqual(expect.arrayContaining([expect.stringContaining("no_daily_instances")]));
    const second = clientWithCatalog([analyticsReportDefinitions.downloads.standardName]);
    vi.spyOn(second.client, "listAnalyticsReportSegments").mockResolvedValue([]);
    expect((await syncAppStoreAnalytics(1, viewer)).waitingReasons).toEqual(expect.arrayContaining([expect.stringContaining("segments_pending")]));
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it("calls instances for all three Revenue Standard reports and excludes Detailed", async () => {
    const { instances } = clientWithCatalog([analyticsReportDefinitions.purchases.standardName, analyticsReportDefinitions.subscriptionState.standardName, analyticsReportDefinitions.subscriptionEvent.standardName, "App Store Purchases Detailed"]);
    // Missing required report headers deliberately fails after selection, without inventing facts.
    const result = await syncAppStoreRevenue(1, viewer, { from: "2026-09-29", to: "2026-09-29", fiscalMonth: "2026-09", regionCode: "ZZ" });
    expect(instances.mock.calls).toEqual([["report-0"], ["report-1"], ["report-2"]]);
    expect(result.sources.analytics.errors).toHaveLength(3);
    expect(result.status).toBe("error");
  });

  it.each([400, 403, 429])("persists safe Sales/Finance HTTP %i diagnostics while Analytics waits", async (status) => {
    const { client } = clientWithCatalog([]);
    mocks.authorized.mockResolvedValue({ id: 1, is_active: true, updated_at: "version", vendor_number: "12345678" });
    // Use the real binary client and ErrorResponse parser through the Revenue service.
    const fetchError = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ errors: [{ code: "PARAMETER_ERROR.INVALID", title: "Invalid parameter", source: { parameter: "filter[vendorNumber]" }, detail: "Invalid vendor number 12345678. See https://example.com/signed?secret=value" }] }, { status }));
    const binary = new AppStoreConnectClient({ getToken: async () => "synthetic-token" } as AppStoreTokenProvider, fetchError);
    vi.spyOn(client, "downloadSalesReport").mockImplementation((...args) => binary.downloadSalesReport(...args));
    vi.spyOn(client, "downloadFinanceReport").mockImplementation((...args) => binary.downloadFinanceReport(...args));
    const result = await syncAppStoreRevenue(1, viewer, { from: "2026-09-29", to: "2026-09-29", fiscalMonth: "2026-09", regionCode: "ZZ" });
    expect(result.status).toBe("error");
    expect(result.sources.analytics.status).toBe("waiting");
    for (const source of ["sales", "finance"] as const) {
      expect(result.sources[source]).toMatchObject({ status: "error", errors: [expect.stringContaining(`status=${status} code=PARAMETER_ERROR.INVALID`)] });
      expect(result.sources[source].errors[0]).toContain("parameter=filter[vendorNumber]");
      expect(result.sources[source].errors[0]).toContain("message=Invalid vendor number [redacted]");
    }
    const stored = JSON.stringify(mocks.finish.mock.calls);
    const logged = JSON.stringify([...mocks.info.mock.calls, ...mocks.error.mock.calls]);
    for (const output of [stored, logged]) {
      expect(output).toContain("PARAMETER_ERROR.INVALID");
      for (const secret of ["12345678", "https://", "secret=value", "synthetic-token"]) expect(output).not.toContain(secret);
    }
  });
});

describe("Analytics status uses internal partitions", () => {
  it("reports active and freshness from discovery/downloads without reading raw-name manifests", async () => {
    mocks.partitions.mockResolvedValue(["discovery", "downloads"].map((report_kind) => ({ app_id: 2, report_kind, date: "2026-09-29", processing_date: "2026-10-02" })));
    expect(await getAppStoreAnalyticsStatus(1, viewer)).toMatchObject({ state: "active", latestData: "2026-09-29", completeThrough: "2026-09-29" });
    expect(mocks.imports).not.toHaveBeenCalled();
  });

  it("ignores Revenue-only partitions and shows durable waiting even after older data", async () => {
    mocks.partitions.mockResolvedValue([{ app_id: 2, report_kind: "purchases", date: "2026-09-29" }]);
    expect(await getAppStoreAnalyticsStatus(1, viewer)).toMatchObject({ state: "waiting", latestData: null, completeThrough: null });
    const run = { status: "success", error_message: "waiting: no_reports_generated" } as const;
    mocks.runs.mockResolvedValue([run]);
    mocks.partitions.mockResolvedValue([{ app_id: 2, report_kind: "downloads", date: "2026-09-29", processing_date: "2026-10-02" }]);
    expect(await getAppStoreAnalyticsStatus(1, viewer)).toMatchObject({ state: "waiting", message: "waiting: no_reports_generated" });
    expect(reportRunDisplayStatus(run)).toBe("waiting");
    expect(reportRunDisplayStatus({ status: "success", error_message: "report_waiting: target_report_unavailable" })).toBe("success");
    expect(reportRunDisplayStatus({ status: "error", error_message: "waiting: no_reports_generated" })).toBe("error");
  });
});
