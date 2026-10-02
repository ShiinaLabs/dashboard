import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { initPgPool, closeDb } from "../lib/db/connection";
import { initCrypto } from "../lib/crypto";
import { loadOrGenerateKey, isMockMode } from "../lib/config";
import { getConnection } from "../lib/repositories/app-store";
import { enabledApps } from "../lib/repositories/app-store-analytics";
import { clientForConnection } from "../lib/services/app-store";
import { prepareAnalyticsInstance, isStandardP2Report } from "../lib/infra/app-store/analytics-instance";
import { sanitizeAnalyticsFixture } from "../lib/infra/app-store/analytics-fixture";
import { parseAnalyticsTsv } from "../lib/infra/app-store/analytics-tsv";

// Run against a real configured database:
// node --env-file=.env --import tsx scripts/capture-app-store-analytics-fixtures.ts <connectionId>
// This reads existing Apple requests; use Connection Detail to set up missing requests.
const connectionId = Number(process.argv[2]);
if (!Number.isSafeInteger(connectionId) || connectionId <= 0 || isMockMode()) throw new Error("Provide a real ASC connection ID; fixture capture cannot run in mock mode");

try {
  initCrypto(loadOrGenerateKey());
  await initPgPool();
  const connection = await getConnection(connectionId);
  if (!connection?.is_active) throw new Error("An active App Store Connect connection is required");
  const client = clientForConnection(connection);
  const captured = new Set<string>();
  const output = resolve("tests/fixtures/app-store");
  // A run can capture Discovery while Downloads are still pending. Preserve that
  // reviewed capture on retries rather than overwriting it or aborting immediately.
  for (const [base, reportName] of [["discovery-standard", "App Store Discovery and Engagement"], ["downloads-standard", "App Store Downloads"]]) {
    try {
      const provenance = JSON.parse(await readFile(resolve(output, `${base}.provenance.json`), "utf8"));
      const table = parseAnalyticsTsv(await readFile(resolve(output, `${base}.tsv`), "utf8"));
      if (provenance.origin !== "real-apple-analytics-report" || provenance.reportName !== reportName || !provenance.businessIdentifiersReplaced || JSON.stringify(provenance.headers) !== JSON.stringify(table.headers) || provenance.rows !== table.rows.length) throw new Error("Existing fixture provenance is inconsistent");
      captured.add(reportName);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  for (const app of await enabledApps(connectionId)) {
    const requests = await client.listAnalyticsReportRequests(app.apple_id);
    for (const request of requests.filter((request) => !request.attributes.stoppedDueToInactivity)) {
      for (const report of await client.listAnalyticsReports(request.id)) {
        if (!isStandardP2Report(report.attributes.name) || captured.has(report.attributes.name)) continue;
        const instances = (await client.listAnalyticsReportInstances(report.id)).filter((instance) => instance.attributes.granularity === "DAILY").sort((a, b) => b.attributes.processingDate.localeCompare(a.attributes.processingDate));
        if (!instances.length) continue;
        const prepared = await prepareAnalyticsInstance(client, instances[0]);
        if (!prepared.table.rows.length) continue;
        const base = report.attributes.name === "App Store Downloads" ? "downloads-standard" : "discovery-standard";
        await mkdir(output, { recursive: true });
        // Never write the original report, app IDs, request IDs, or signed URLs.
        await writeFile(resolve(output, `${base}.tsv`), sanitizeAnalyticsFixture(prepared.table), { flag: "wx" });
        await writeFile(resolve(output, `${base}.provenance.json`), JSON.stringify({ origin: "real-apple-analytics-report", reportName: report.attributes.name, category: report.attributes.category, granularity: prepared.granularity, processingDate: prepared.processingDate, headers: prepared.table.headers, rows: prepared.table.rows.length, businessIdentifiersReplaced: true }, null, 2) + "\n", { flag: "wx" });
        captured.add(report.attributes.name);
        console.log(`Captured ${base}: ${prepared.table.rows.length} rows`);
      }
    }
  }
  if (captured.size !== 2) throw new Error("Both Standard reports are required; enable an app and wait for Apple report generation");
} catch {
  // Raw network/database exceptions can include signed URLs or credential values.
  console.error("Fixture capture did not complete. Check connection access, enabled apps, report availability, and output files.");
  process.exitCode = 1;
} finally { await closeDb(); }
