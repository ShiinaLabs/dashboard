import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppStoreConnectClient, type AnalyticsReport, type AnalyticsReportRequest } from "../lib/infra/app-store/AppStoreConnectClient";
import type { AppStoreTokenProvider } from "../lib/infra/app-store/AppStoreTokenProvider";
import { AppStoreReportError } from "../lib/infra/app-store/analytics-segment";
import { analyticsReportDefinitions, identifyStandardAnalyticsReport } from "../lib/infra/app-store/report-mapping";
import { backfillAppStoreAnalytics, backfillAppStoreRevenue, syncAppStoreAnalytics, syncAppStoreRevenue } from "../lib/services/app-store-sync";
import { getAppStoreAnalyticsStatus } from "../lib/services/app-store-analytics";
import { reportRunDisplayStatus } from "../shared/app-store";
import { latestSalesReportDate } from "../shared/app-store-revenue";

const mocks = vi.hoisted(() => ({
  client: vi.fn(), authorized: vi.fn(), commit: vi.fn(), commitSales: vi.fn(), commitFinance: vi.fn(), finish: vi.fn(), runs: vi.fn(), partitions: vi.fn(), imports: vi.fn(), requests: vi.fn(),
  info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
  checkpoints: vi.fn(),
}));
vi.mock("../lib/config", () => ({ isMockMode: () => false }));
vi.mock("../lib/logger", () => ({ getLogger: () => mocks, logStructured: (level: "debug" | "info" | "warn" | "error", component: string, event: string, fields: Record<string, unknown>) => mocks[level](component, JSON.stringify({ event, ...fields })) }));
vi.mock("../lib/services/app-store", () => ({
  AppStoreError: class AppStoreError extends Error {},
  authorizedConnection: mocks.authorized,
  clientForConnection: mocks.client,
}));
vi.mock("../lib/repositories/app-store", () => ({
  startRun: async (_id: number, kind: string, scope: string) => ({ id: 10, connection_id: 1, kind, scope, started_at: "2026-10-02T00:00:00Z" }),
  finishRun: mocks.finish,
  checkpointRun: mocks.checkpoints,
}));
vi.mock("../lib/repositories/app-store-analytics", () => ({
  enabledApps: async () => [{ id: 2, apple_id: "123" }],
  adoptRequest: async () => ({ id: 3 }),
  importsForApps: mocks.imports,
  requestsForApps: mocks.requests,
  analyticsRuns: async () => mocks.runs(),
}));
vi.mock("../lib/repositories/app-store-facts", () => ({ commitAnalyticsInstance: mocks.commit, commitSalesReport: mocks.commitSales, commitFinanceReport: mocks.commitFinance, readAnalyticsPartitions: mocks.partitions }));

const viewer = { id: 1, role: "admin" };
function catalog(names: string[]): AnalyticsReport[] {
  return names.map((name, index) => ({ id: `report-${index}`, type: "analyticsReports", attributes: { name, category: "APP_STORE_COMMERCE" } }));
}
function clientWithCatalog(names: string[], processingDate = "2026-10-02") {
  const common = { Date: "2026-09-29", "App Apple Identifier": "123", Territory: "USA" };
  const row = { ...common, Event: "Impression", "Page Type": "No page", "Source Type": "App Store search", Counts: "10", "Unique Counts": "8", "Download Type": "First-time Download" };
  const bytes = gzipSync(Object.keys(row).join("\t") + "\n" + Object.values(row).join("\t"));
  const segment = { id: "segment", type: "analyticsReportSegments", attributes: { url: "https://synthetic.s3.amazonaws.com/segment", checksum: createHash("md5").update(bytes).digest("hex"), sizeInBytes: bytes.length } };
  const request = vi.fn<typeof fetch>().mockImplementation(async (input) => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith("/analyticsReportRequests")) return Response.json({ data: [{ id: "request", type: "analyticsReportRequests", attributes: { accessType: "ONGOING", stoppedDueToInactivity: false } }] });
    if (path.endsWith("/reports")) return Response.json({ data: catalog(names) });
    if (path.endsWith("/instances")) return Response.json({ data: [{ id: "instance", type: "analyticsReportInstances", attributes: { granularity: "DAILY", processingDate } }] });
    if (path.endsWith("/segments")) return Response.json({ data: [segment] });
    if (path.endsWith("/analyticsReportSegments/segment")) return Response.json({ data: segment });
    if (path === "/segment") return new Response(bytes);
    throw new Error(`Unexpected test request: ${path}`);
  });
  const client = new AppStoreConnectClient({ getToken: async () => "synthetic-token" } as AppStoreTokenProvider, request);
  mocks.client.mockReturnValue(client);
  const instances = vi.spyOn(client, "listAnalyticsReportInstances");
  return { client, instances, bytes, segment };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorized.mockResolvedValue({ id: 1, is_active: true, updated_at: "version", vendor_number: null });
  mocks.commit.mockResolvedValue("imported");
  mocks.commitSales.mockResolvedValue("imported");
  mocks.commitFinance.mockResolvedValue("imported");
  mocks.finish.mockResolvedValue(undefined);
  mocks.imports.mockResolvedValue([]);
  mocks.runs.mockResolvedValue([]);
  mocks.requests.mockResolvedValue([{ app_id: 2, access_type: "ONGOING", stopped_due_to_inactivity: false, created_at: new Date().toISOString() }]);
  mocks.partitions.mockResolvedValue([]);
});

describe("Standard report recognition", () => {
  it.each(Object.entries(analyticsReportDefinitions))("recognizes only the exact %s Standard name", (kind, definition) => {
    expect(identifyStandardAnalyticsReport(definition.standardName)).toBe(kind);
    for (const name of [definition.baseName, `${definition.baseName} Detailed`, `${definition.baseName} SomethingElse`]) expect(identifyStandardAnalyticsReport(name)).toBeUndefined();
  });

  it("recognizes Apple's App Downloads Standard name and rejects Detailed and the legacy name", () => {
    expect(identifyStandardAnalyticsReport("App Downloads Standard")).toBe("downloads");
    expect(identifyStandardAnalyticsReport("App Downloads Detailed")).toBeUndefined();
    expect(identifyStandardAnalyticsReport("App Store Downloads Standard")).toBeUndefined();
  });

  it("recognizes Apple's Subscription Report Standard names but excludes Detailed reports", () => {
    expect(identifyStandardAnalyticsReport("App Store Subscription State Report Standard")).toBe("subscriptionState");
    expect(identifyStandardAnalyticsReport("App Store Subscription Event Report Standard")).toBe("subscriptionEvent");
    expect(identifyStandardAnalyticsReport("App Store Subscription State Report Detailed")).toBeUndefined();
    expect(identifyStandardAnalyticsReport("App Store Subscription Event Report Detailed")).toBeUndefined();
  });
});

describe("production Analytics sync selection", () => {
  it("backfills only ONE_TIME_SNAPSHOT requests through the existing importer", async () => {
    const { client, instances } = clientWithCatalog([analyticsReportDefinitions.discovery.standardName, analyticsReportDefinitions.downloads.standardName]);
    const requests: AnalyticsReportRequest[] = [
      { id: "snapshot-request", type: "analyticsReportRequests", attributes: { accessType: "ONE_TIME_SNAPSHOT", stoppedDueToInactivity: false } },
      { id: "ongoing-request", type: "analyticsReportRequests", attributes: { accessType: "ONGOING", stoppedDueToInactivity: false } },
    ];
    vi.spyOn(client, "listAnalyticsReportRequests").mockResolvedValue(requests);
    const result = await backfillAppStoreAnalytics(1, viewer);
    expect(result.imported).toBe(2);
    expect(instances.mock.calls).toEqual([["report-0"], ["report-1"]]);
    expect(mocks.commit).toHaveBeenCalledTimes(2);
  });

  it("takes both acquisition Standard reports through instances, segments and the real mapper", async () => {
    const { client, instances } = clientWithCatalog([analyticsReportDefinitions.discovery.standardName, analyticsReportDefinitions.downloads.standardName, "App Downloads Detailed"]);
    const listSegments = vi.spyOn(client, "listAnalyticsReportSegments");
    expect(await syncAppStoreAnalytics(1, viewer)).toMatchObject({ status: "success", imported: 2, waiting: 0, errors: [] });
    expect(instances.mock.calls).toEqual([["report-0"], ["report-1"]]);
    expect(listSegments).toHaveBeenCalledTimes(2);
    expect(mocks.commit.mock.calls.map((call) => call[2].kind)).toEqual(["discovery", "downloads"]);
    expect(mocks.commit.mock.calls[1][2].rows[0]).toMatchObject({ app_id: 2, counts: "10" });
    const events = [...mocks.info.mock.calls, ...mocks.debug.mock.calls].map(([, message]) => JSON.parse(message));
    expect(events.find((event) => event.event === "analytics_report_catalog")).toMatchObject({ appId: 2, requestId: "request", accessType: "ONGOING", count: 3, targetsFound: ["discovery", "downloads"] });
    expect(events.find((event) => event.event === "analytics_report_catalog_targets").details).toEqual(catalog([analyticsReportDefinitions.discovery.standardName, analyticsReportDefinitions.downloads.standardName, "App Downloads Detailed"]).map((report) => report.attributes));
    for (const event of ["analytics_report_selected", "analytics_instances_discovered", "analytics_instance_started", "analytics_segments_discovered", "analytics_segment_download_started", "analytics_segment_download_finished", "analytics_instance_parsed", "analytics_instance_mapped", "analytics_instance_commit_started", "analytics_instance_committed", "sync_finished"]) expect(events.some((entry) => entry.event === event)).toBe(true);
    const ordered = ["sync_started", "analytics_requests_discovered", "analytics_report_catalog", "analytics_report_selected", "analytics_instances_discovered", "analytics_instance_started", "analytics_segments_discovered", "analytics_segment_download_started", "analytics_segment_download_finished", "analytics_instance_parsed", "analytics_instance_mapped", "analytics_instance_commit_started", "analytics_instance_committed", "sync_finished"];
    const eventNames = events.map((entry) => entry.event);
    const positions = ordered.map((name) => eventNames.indexOf(name));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(JSON.stringify(events)).not.toMatch(/https:|synthetic-token|App Store search/);
    const diagnostics = mocks.checkpoints.mock.calls.map(([, summary]) => summary);
    for (const checkpoint of ["request", "catalog", "instance", "download", "parse", "map", "commit", "verify", "finished"]) expect(diagnostics.some((summary) => summary.checkpoint === checkpoint), JSON.stringify(diagnostics.map((summary) => summary.checkpoint))).toBe(true);
    expect(JSON.stringify(diagnostics)).not.toMatch(/https:|synthetic-token|App Store search|Counts|raw report/i);
    const infoEvents = mocks.info.mock.calls.map(([, message]) => JSON.parse(message).event);
    expect(infoEvents).toEqual(["sync_started", "sync_finished"]);
    expect(mocks.debug.mock.calls.map(([, message]) => JSON.parse(message).event)).toEqual(expect.arrayContaining(["analytics_report_selected", "analytics_instances_discovered", "analytics_instance_started", "analytics_segments_discovered", "analytics_instance_parsed", "analytics_instance_mapped", "analytics_instance_commit_started", "analytics_instance_committed"]));
  });

  it("stores unique semantic report state from verified local dates after a correction import", async () => {
    clientWithCatalog([analyticsReportDefinitions.discovery.standardName], "2026-10-05");
    const preSync = [{ app_id: 2, report_kind: "discovery", date: "2026-10-03", processing_date: "2026-10-04" }];
    const postSync = [
      { app_id: 2, report_kind: "discovery", date: "2026-10-03", processing_date: "2026-10-05" },
      { app_id: 2, report_kind: "discovery", date: "2026-10-04", processing_date: "2026-10-04" },
    ];
    mocks.partitions.mockResolvedValueOnce(preSync).mockResolvedValueOnce(postSync);

    expect(await syncAppStoreAnalytics(1, viewer)).toMatchObject({ status: "success", imported: 1 });
    const diagnostic = mocks.checkpoints.mock.calls.at(-1)![1];
    expect(diagnostic.checkpoint).toBe("finished");
    expect(diagnostic.reports.filter((report: { appId: number; reportKind: string; accessType: string }) => report.appId === 2 && report.reportKind === "discovery" && report.accessType === "ONGOING")).toEqual([{
      appId: 2,
      reportKind: "discovery",
      accessType: "ONGOING",
      state: "imported",
      appleProcessingDate: "2026-10-05",
      localProcessingDate: "2026-10-05",
      latestData: "2026-10-04",
    }]);
    expect(new Set(diagnostic.reports.map((report: { appId: number; reportKind: string; accessType: string }) => `${report.appId}:${report.reportKind}:${report.accessType}`)).size).toBe(diagnostic.reports.length);
    expect(diagnostic.after).toMatchObject({ latestProcessingDate: "2026-10-05", latestBusinessDate: "2026-10-04" });
  });

  it("normal sync selects only Ongoing requests when Apple lists both access types", async () => {
    const { client } = clientWithCatalog([analyticsReportDefinitions.downloads.standardName]);
    vi.spyOn(client, "listAnalyticsReportRequests").mockResolvedValue([
      { id: "snapshot-request", type: "analyticsReportRequests", attributes: { accessType: "ONE_TIME_SNAPSHOT", stoppedDueToInactivity: false } },
      { id: "ongoing-request", type: "analyticsReportRequests", attributes: { accessType: "ONGOING", stoppedDueToInactivity: false } },
    ]);
    const reports = vi.spyOn(client, "listAnalyticsReports");
    await syncAppStoreAnalytics(1, viewer);
    expect(reports).toHaveBeenCalledTimes(1);
    expect(reports.mock.calls[0][0]).toBe("ongoing-request");
  });

  it.each(["App Downloads Detailed", "App Downloads SomethingElse", "App Downloads"])("diagnoses %s without calling the instance API", async (name) => {
    const { instances } = clientWithCatalog([name]);
    const result = await syncAppStoreAnalytics(1, viewer);
    expect(result).toMatchObject({ status: "error", imported: 0, skipped: 0, errors: [expect.stringContaining(`expected=App Downloads Standard; received=${name}`)] });
    expect(result.errors[0]).toContain("unexpected_report_variant");
    expect(instances).not.toHaveBeenCalled();
    expect(mocks.commit).not.toHaveBeenCalled();
    expect(mocks.finish).toHaveBeenCalledWith(expect.anything(), "error", expect.stringContaining("unexpected_report_variant"));
  });

  it("does not select the legacy App Store Downloads Standard name", async () => {
    const { instances } = clientWithCatalog(["App Store Downloads Standard"]);
    const result = await syncAppStoreAnalytics(1, viewer);
    expect(result).toMatchObject({ status: "waiting", imported: 0, skipped: 0, errors: [], waitingReasons: expect.arrayContaining([expect.stringContaining("target_report_unavailable")]) });
    expect(instances).not.toHaveBeenCalled();
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it.each([[[], "no_reports_generated"], [["App Crashes"], "target_report_unavailable"]] as const)("waits safely when the target is absent (%s)", async (names, reason) => {
    const { instances } = clientWithCatalog([...names]);
    expect(await syncAppStoreAnalytics(1, viewer)).toMatchObject({ status: "waiting", imported: 0, skipped: 0, errors: [], waitingReasons: expect.arrayContaining([expect.stringContaining(reason)]) });
    expect(instances).not.toHaveBeenCalled();
    expect(mocks.finish).toHaveBeenCalledWith(expect.anything(), "success", expect.stringMatching(/^waiting: /));
  });

  it("keeps waiting plus a variant error as error, and imported plus an error as partial", async () => {
    clientWithCatalog(["App Downloads Detailed"]);
    expect((await syncAppStoreAnalytics(1, viewer)).status).toBe("error");
    clientWithCatalog([analyticsReportDefinitions.discovery.standardName, "App Downloads SomethingElse"]);
    expect(await syncAppStoreAnalytics(1, viewer)).toMatchObject({ status: "partial", imported: 1 });
  });

  it("persists waiting alongside successful imports with the success-plus-waiting marker", async () => {
    clientWithCatalog([analyticsReportDefinitions.discovery.standardName]);
    expect(await syncAppStoreAnalytics(1, viewer)).toMatchObject({ status: "success", imported: 1, waiting: 1 });
    const call = mocks.finish.mock.calls.at(-1)!;
    expect(call[1]).toBe("success");
    expect(call[2]).toMatch(/^report_waiting: /);
  });

  it("retains safe error and waiting summaries together", async () => {
    const { client } = clientWithCatalog([analyticsReportDefinitions.discovery.standardName, analyticsReportDefinitions.downloads.standardName]);
    vi.spyOn(client, "listAnalyticsReportInstances").mockImplementation(async (reportId) => reportId === "report-0" ? [{ id: "instance", type: "analyticsReportInstances", attributes: { granularity: "DAILY", processingDate: "2026-10-02" } }] : []);
    mocks.commit.mockRejectedValueOnce(new Error("SECRET SQL VALUE"));
    const result = await syncAppStoreAnalytics(1, viewer);
    expect(result.status).toBe("error");
    const call = mocks.finish.mock.calls.at(-1)!;
    expect(call[1]).toBe("error");
    expect(call[2]).toContain("error: App Store Discovery and Engagement Standard; report_import_failed");
    expect(call[2]).toContain("waiting: no_daily_instances");
    expect(call[2]).not.toContain("SECRET SQL VALUE");
  });

  it("records a safe finish-stage failure when run history cannot be finalized", async () => {
    clientWithCatalog([]);
    mocks.finish.mockRejectedValueOnce(new Error("SECRET database detail"));
    const result = await syncAppStoreAnalytics(1, viewer);
    expect(result).toMatchObject({ status: "error", errors: ["report_import_failed"] });
    const failures = mocks.error.mock.calls.map(([, message]) => JSON.parse(message));
    expect(failures).toContainEqual(expect.objectContaining({ event: "report_failed", stage: "finish", code: "report_import_failed", diagnostic: "report_import_failed" }));
    expect(JSON.stringify(failures)).not.toContain("SECRET database detail");
  });

  it.each([
    ["download_timeout", new Error("https://signed.example/path?token=secret raw fetch error: synthetic network failure"), "Report download failed or timed out"],
    ["checksum_mismatch", new AppStoreReportError("checksum_mismatch", "Report checksum does not match Apple metadata"), "Report checksum does not match Apple metadata"],
    ["download_expired", new AppStoreReportError("download_expired", "Report download failed (403); refresh segment metadata and retry"), "Report download failed (403); refresh segment metadata and retry"],
  ] as const)("persists %s at the download stage without exposing signed URLs", async (code, error, safeMessage) => {
    const { client } = clientWithCatalog([analyticsReportDefinitions.downloads.standardName]);
    vi.spyOn(client, "downloadAnalyticsSegment").mockRejectedValue(error);
    const result = await syncAppStoreAnalytics(1, viewer);
    expect(result).toMatchObject({ status: "error", errors: [expect.stringContaining(`${code}: ${safeMessage}`)] });
    const events = mocks.error.mock.calls.map(([, message]) => JSON.parse(message));
    expect(events).toEqual(expect.arrayContaining([expect.objectContaining({ event: "report_failed", stage: "download", code, instanceId: "instance", segmentId: "segment" })]));
    const durableSummary = JSON.stringify(mocks.finish.mock.calls);
    for (const output of [JSON.stringify(events), durableSummary, JSON.stringify(result)]) {
      expect(output).toContain(`${code}: ${safeMessage}`);
      expect(output).not.toMatch(/signed\.example|token=secret|raw fetch error|synthetic network failure/);
    }
  });

  it.each(["sales", "finance"] as const)("does not duplicate the %s prefix when the outer revenue boundary catches", async (source) => {
    const { client } = clientWithCatalog([]);
    mocks.authorized.mockResolvedValue({ id: 1, is_active: true, updated_at: "version", vendor_number: "12345678" });
    vi.spyOn(client, "downloadSalesReport").mockResolvedValue(null);
    vi.spyOn(client, "downloadFinanceReport").mockResolvedValue(null);
    const normalClient = client;
    let call = 0;
    mocks.client.mockImplementation(() => {
      call++;
      if ((source === "sales" && call === 2) || (source === "finance" && call === 3)) throw new Error("SECRET raw client failure");
      return normalClient;
    });

    const result = await syncAppStoreRevenue(1, viewer, { from: "2026-09-29", to: "2026-09-29", fiscalMonth: "2026-09", regionCode: "ZZ" });
    const expected = source === "sales" ? "Sales; report_import_failed" : "Finance; fiscal month 2026-09; region ZZ; report_import_failed";
    expect(result.sources[source].errors).toContain(expected);
    expect(result.sources[source].errors).not.toContain(expect.stringMatching(/Sales; Sales;|Finance; fiscal month .*; Finance;/));
    expect(JSON.stringify(mocks.finish.mock.calls)).not.toContain("SECRET raw client failure");
  });

  it.each([
    [Buffer.from("not gzip"), "invalid_gzip"],
    [gzipSync('"unterminated'), "malformed_tsv"],
    [gzipSync("not a table"), "missing_headers"],
  ])("logs parse failures at the parse stage (%s)", async (bytes, code) => {
    const { client } = clientWithCatalog([analyticsReportDefinitions.downloads.standardName]);
    vi.spyOn(client, "downloadAnalyticsSegment").mockResolvedValue(bytes);
    vi.spyOn(client, "getAnalyticsReportSegment").mockResolvedValue({ id: "segment", type: "analyticsReportSegments", attributes: { url: "https://synthetic.s3.amazonaws.com/segment", checksum: createHash("md5").update(bytes).digest("hex"), sizeInBytes: bytes.length } });
    await syncAppStoreAnalytics(1, viewer);
    const events = mocks.error.mock.calls.map(([, message]) => JSON.parse(message));
    expect(events).toEqual(expect.arrayContaining([expect.objectContaining({ event: "report_failed", stage: "parse", code, instanceId: "instance", segmentId: "segment" })]));
    expect(JSON.stringify(events)).not.toContain("not gzip");
  });

  it("logs map and commit failures with stages while hiding row and SQL values", async () => {
    const sensitiveAppIdentifier = "app-id-should-not-be-logged-7f39";
    const badRow = { Date: "2026-09-29", "App Apple Identifier": sensitiveAppIdentifier, "Download Type": "First-time Download", "Source Type": "Search", Territory: "USA", Counts: "0" };
    const badBytes = gzipSync(Object.keys(badRow).join("\t") + "\n" + Object.values(badRow).join("\t"));
    const { client } = clientWithCatalog([analyticsReportDefinitions.downloads.standardName]);
    vi.spyOn(client, "downloadAnalyticsSegment").mockResolvedValueOnce(badBytes);
    vi.spyOn(client, "getAnalyticsReportSegment").mockResolvedValue({ id: "segment", type: "analyticsReportSegments", attributes: { url: "https://synthetic.s3.amazonaws.com/segment", checksum: createHash("md5").update(badBytes).digest("hex"), sizeInBytes: badBytes.length } });
    await syncAppStoreAnalytics(1, viewer);
    const mapFailures = mocks.error.mock.calls.map(([, message]) => JSON.parse(message));
    expect(mapFailures).toContainEqual(expect.objectContaining({ event: "report_failed", stage: "map", code: "app_identity_mismatch" }));
    expect(JSON.stringify(mocks.error.mock.calls)).not.toContain(sensitiveAppIdentifier);

    clientWithCatalog([analyticsReportDefinitions.downloads.standardName]);
    mocks.commit.mockRejectedValueOnce(new Error("SECRET SQL VALUE"));
    await syncAppStoreAnalytics(1, viewer);
    const events = mocks.error.mock.calls.map(([, message]) => JSON.parse(message));
    expect(events).toEqual(expect.arrayContaining([expect.objectContaining({ event: "report_failed", stage: "commit", code: "report_import_failed", instanceId: "instance" })]));
    expect(JSON.stringify(events)).not.toContain("SECRET SQL VALUE");
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

  it("skips old imported instances before segment API while still checking recent and unimported instances", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-02T00:00:00Z"));
    try {
      const { client } = clientWithCatalog([analyticsReportDefinitions.downloads.standardName]);
      vi.spyOn(client, "listAnalyticsReportInstances").mockResolvedValue([
        { id: "old-imported", type: "analyticsReportInstances", attributes: { granularity: "DAILY", processingDate: "2026-09-01" } },
        { id: "recent-imported", type: "analyticsReportInstances", attributes: { granularity: "DAILY", processingDate: "2026-10-01" } },
        { id: "old-unimported", type: "analyticsReportInstances", attributes: { granularity: "DAILY", processingDate: "2026-08-31" } },
      ]);
      mocks.imports.mockResolvedValue([
        { apple_instance_id: "old-imported", apple_report_id: "report-0", apple_segment_id: "old-segment", checksum: "old-checksum", status: "imported", processing_date: "2026-09-01" },
        { apple_instance_id: "recent-imported", apple_report_id: "report-0", apple_segment_id: "recent-segment", checksum: "recent-checksum", status: "imported", processing_date: "2026-10-01" },
      ]);
      const listSegments = vi.spyOn(client, "listAnalyticsReportSegments").mockResolvedValue([]);
      const result = await syncAppStoreAnalytics(1, viewer);
      expect(result.skipped).toBe(1);
      expect(listSegments.mock.calls).toEqual([["old-unimported"], ["recent-imported"]]);
      const events = mocks.debug.mock.calls.map(([, message]) => JSON.parse(message));
      expect(events).toContainEqual(expect.objectContaining({ event: "analytics_instance_skipped", instanceId: "old-imported", reason: "old_instance_imported" }));
      expect(mocks.imports).toHaveBeenCalledWith([2]);
    } finally { vi.useRealTimers(); }
  });

  it("does not fast-skip imported instances during a ONE_TIME_SNAPSHOT backfill", async () => {
    const { client } = clientWithCatalog([analyticsReportDefinitions.downloads.standardName]);
    vi.spyOn(client, "listAnalyticsReportRequests").mockResolvedValue([{ id: "snapshot", type: "analyticsReportRequests", attributes: { accessType: "ONE_TIME_SNAPSHOT", stoppedDueToInactivity: false } }]);
    mocks.imports.mockResolvedValue([{ apple_instance_id: "instance", apple_report_id: "report-0", apple_segment_id: "segment", checksum: "old", status: "imported", processing_date: "2020-01-01" }]);
    const listSegments = vi.spyOn(client, "listAnalyticsReportSegments");
    const listReports = vi.spyOn(client, "listAnalyticsReports");
    await backfillAppStoreAnalytics(1, viewer);
    expect(listSegments).toHaveBeenCalledWith("instance");
    expect(mocks.imports).toHaveBeenCalled();
    expect(listReports).toHaveBeenCalledWith("snapshot");
  });

  it("skips unchanged instances after the single segment listing without downloading or parsing", async () => {
    const { client, segment } = clientWithCatalog([analyticsReportDefinitions.downloads.standardName]);
    mocks.imports.mockResolvedValue([{ apple_instance_id: "instance", apple_report_id: "report-0", apple_segment_id: "segment", checksum: segment.attributes.checksum, status: "imported" }]);
    const listSegments = vi.spyOn(client, "listAnalyticsReportSegments");
    const download = vi.spyOn(client, "downloadAnalyticsSegment");
    expect(await syncAppStoreAnalytics(1, viewer)).toMatchObject({ skipped: 1, imported: 0 });
    expect(listSegments).toHaveBeenCalledTimes(1);
    expect(download).not.toHaveBeenCalled();
    expect(mocks.commit).not.toHaveBeenCalled();
    const events = mocks.debug.mock.calls.map(([, message]) => JSON.parse(message));
    expect(events).toContainEqual(expect.objectContaining({ event: "analytics_instance_skipped", reason: "segments_unchanged", segmentCount: 1 }));
    expect(events.some((event) => ["analytics_instance_parsed", "analytics_instance_mapped", "analytics_instance_commit_started"].includes(event.event))).toBe(false);
  });

  it("uses decompressed report text as the Sales and Finance checksum", async () => {
    const { client } = clientWithCatalog([]);
    mocks.authorized.mockResolvedValue({ id: 1, is_active: true, updated_at: "version", vendor_number: "12345678" });
    const reportDate = latestSalesReportDate();
    const usDate = `${reportDate.slice(5, 7)}/${reportDate.slice(8, 10)}/${reportDate.slice(0, 4)}`;
    const salesRow = { "Begin Date": usDate, "End Date": usDate, SKU: "synthetic-sku", "Apple Identifier": "123", "Parent Identifier": "", "Product Type Identifier": "1", "Country Code": "JP", Units: "2", "Developer Proceeds": "0.70", "Currency of Proceeds": "USD", "Customer Price": "100", "Customer Currency": "JPY" };
    const salesText = Object.keys(salesRow).join("\t") + "\n" + Object.values(salesRow).join("\t");
    const financeText = "Start Date\tEnd Date\tVendor Identifier\tApple Identifier\tProduct Type Identifier\tCountry Of Sale\tQuantity\tExtended Partner Share\tPartner Share Currency\n08/30/2026\t09/26/2026\tprivate-sku\t456\t1\tJP\t2\t1.4\tUSD\nTotal_Rows\t1\nTotal_Amount\t2.80\nTotal_Units\t2\n";
    vi.spyOn(client, "downloadSalesReport").mockResolvedValueOnce(gzipSync(salesText, { level: 1 })).mockResolvedValueOnce(gzipSync(salesText, { level: 9 }));
    vi.spyOn(client, "downloadFinanceReport").mockResolvedValueOnce(gzipSync(financeText, { level: 1 })).mockResolvedValueOnce(gzipSync(financeText, { level: 9 }));
    mocks.commitSales.mockResolvedValueOnce("imported").mockResolvedValueOnce("skipped");
    mocks.commitFinance.mockResolvedValueOnce("imported").mockResolvedValueOnce("skipped");
    await syncAppStoreRevenue(1, viewer, { from: reportDate, to: reportDate, fiscalMonth: "2026-09", regionCode: "ZZ" });
    await syncAppStoreRevenue(1, viewer, { from: reportDate, to: reportDate, fiscalMonth: "2026-09", regionCode: "ZZ" });
    expect(gzipSync(salesText, { level: 1 })).not.toEqual(gzipSync(salesText, { level: 9 }));
    expect(mocks.commitSales.mock.calls[0][3]).toBe(mocks.commitSales.mock.calls[1][3]);
    expect(mocks.commitFinance.mock.calls[0][4]).toBe(mocks.commitFinance.mock.calls[1][4]);
    expect(mocks.commitSales.mock.calls[1][2]).toBe(reportDate);
    expect(mocks.commitFinance.mock.calls[1][2]).toBe("2026-09");
  });

  it("logs the complete Sales and Finance report stages using safe metadata only", async () => {
    const { client } = clientWithCatalog([]);
    mocks.authorized.mockResolvedValue({ id: 1, is_active: true, updated_at: "version", vendor_number: "12345678" });
    const reportDate = latestSalesReportDate();
    const usDate = `${reportDate.slice(5, 7)}/${reportDate.slice(8, 10)}/${reportDate.slice(0, 4)}`;
    const salesRow = { "Begin Date": usDate, "End Date": usDate, SKU: "sensitive-sku", "Apple Identifier": "123", "Parent Identifier": "", "Product Type Identifier": "1", "Country Code": "JP", Units: "2", "Developer Proceeds": "0.70", "Currency of Proceeds": "USD", "Customer Price": "100", "Customer Currency": "JPY" };
    const salesBytes = gzipSync(Object.keys(salesRow).join("\t") + "\n" + Object.values(salesRow).join("\t"));
    const financeBody = "Start Date\tEnd Date\tVendor Identifier\tApple Identifier\tProduct Type Identifier\tCountry of Sale\tQuantity\tExtended Partner Share\tPartner Share Currency\n08/30/2026\t09/26/2026\tprivate-sku\t456\t1\tJP\t2\t1.4\tUSD\nTotal_Rows\t1\nTotal_Amount\t2.80\nTotal_Units\t2\n";
    const financeBytes = gzipSync(financeBody);
    vi.spyOn(client, "downloadSalesReport").mockResolvedValue(salesBytes);
    vi.spyOn(client, "downloadFinanceReport").mockResolvedValue(financeBytes);
    mocks.commitSales.mockResolvedValue("imported");
    mocks.commitFinance.mockResolvedValue("imported");
    const result = await syncAppStoreRevenue(1, viewer, { from: reportDate, to: reportDate, fiscalMonth: "2026-09", regionCode: "ZZ" });
    expect(result.sources.sales.status).toBe("success");
    expect(result.sources.finance.status).toBe("success");
    const events = [...mocks.info.mock.calls, ...mocks.debug.mock.calls, ...mocks.error.mock.calls].map(([, message]) => JSON.parse(message));
    const infoEvents = mocks.info.mock.calls.map(([, message]) => JSON.parse(message).event);
    expect(infoEvents.filter((event) => event === "sync_finished")).toHaveLength(3);
    expect(infoEvents.some((event) => /^sales_report_|^finance_report_/.test(event))).toBe(false);
    expect(mocks.debug.mock.calls.map(([, message]) => JSON.parse(message).event)).toEqual(expect.arrayContaining(["sales_report_started", "sales_report_downloaded", "sales_report_parsed", "sales_report_mapped", "finance_report_started", "finance_report_downloaded", "finance_report_parsed", "finance_report_mapped"]));
    for (const event of ["sales_report_started", "sales_report_downloaded", "sales_report_parsed", "sales_report_mapped", "sales_report_committed", "finance_report_started", "finance_report_downloaded", "finance_report_parsed", "finance_report_mapped", "finance_report_committed"]) expect(events.some((entry) => entry.event === event)).toBe(true);
    expect(events.find((entry) => entry.event === "finance_report_parsed")).toMatchObject({ trailerStatus: "validated", rowCount: 1, fiscalMonth: "2026-09", regionCode: "ZZ" });
    expect(JSON.stringify(events)).not.toMatch(/12345678|sensitive-sku|private-sku|"1\.4"|"100"|https:|synthetic-token/);
  });

  it("rejects Sales backfills over 90 days and Finance backfills over 12 months", async () => {
    await expect(backfillAppStoreRevenue(1, viewer, { from: "2026-01-01", to: "2026-04-01", fiscalMonthFrom: "2026-01", fiscalMonthTo: "2026-01", regionCode: "ZZ" })).rejects.toThrow("invalid_range");
    await expect(backfillAppStoreRevenue(1, viewer, { from: "2026-01-01", to: "2026-01-01", fiscalMonthFrom: "2025-01", fiscalMonthTo: "2026-01", regionCode: "ZZ" })).rejects.toThrow("invalid_range");
    expect(mocks.authorized).not.toHaveBeenCalled();
  });

  it("treats an unpublished Finance report as waiting", async () => {
    const { client } = clientWithCatalog([]);
    mocks.authorized.mockResolvedValue({ id: 1, is_active: true, updated_at: "version", vendor_number: "12345678" });
    vi.spyOn(client, "downloadFinanceReport").mockResolvedValue(null);
    const result = await syncAppStoreRevenue(1, viewer, { from: "2026-09-29", to: "2026-09-29", fiscalMonth: "2026-09", regionCode: "ZZ" });
    expect(result.sources.finance).toMatchObject({ status: "waiting", waitingReasons: [expect.stringContaining("finance_unavailable")], errors: [] });
    const waiting = mocks.debug.mock.calls.map(([, message]) => JSON.parse(message));
    expect(waiting).toContainEqual(expect.objectContaining({ event: "report_waiting", source: "finance", reason: "finance_unavailable" }));
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
    expect(await getAppStoreAnalyticsStatus(1, viewer)).toMatchObject({ state: "partial", message: "waiting: no_reports_generated" });
    expect(reportRunDisplayStatus(run)).toBe("waiting");
    expect(reportRunDisplayStatus({ status: "success", error_message: "report_waiting: target_report_unavailable" })).toBe("success");
    expect(reportRunDisplayStatus({ status: "error", error_message: "waiting: no_reports_generated" })).toBe("error");
  });

  it("expires first-report waiting after 72 hours and flags stopped requests", async () => {
    mocks.requests.mockResolvedValue([{ app_id: 2, access_type: "ONGOING", stopped_due_to_inactivity: false, created_at: new Date(Date.now() - 73 * 60 * 60_000).toISOString() }]);
    expect(await getAppStoreAnalyticsStatus(1, viewer)).toMatchObject({ state: "stale", latestData: null });
    mocks.requests.mockResolvedValue([{ app_id: 2, access_type: "ONGOING", stopped_due_to_inactivity: true, created_at: new Date().toISOString() }]);
    expect(await getAppStoreAnalyticsStatus(1, viewer)).toMatchObject({ state: "action_required" });
  });
});
