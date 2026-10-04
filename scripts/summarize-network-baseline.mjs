import { readFile, writeFile } from "node:fs/promises";

const beforePath = process.env.PERF_BEFORE || "performance/network-baseline.before.json";
const afterPath = process.env.PERF_AFTER || "performance/network-baseline.after.json";
const outputPath = process.env.PERF_SUMMARY || "performance/baseline.json";
let priorSummary = null;
try { priorSummary = JSON.parse(await readFile(outputPath, "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }
const [before, after] = await Promise.all([
  readFile(beforePath, "utf8").then(JSON.parse),
  readFile(afterPath, "utf8").then(JSON.parse),
]);
const key = ({ profile, requestedPath }) => `${profile}\0${requestedPath}`;
const oldResults = new Map(before.results.map((row) => [key(row), row]));
const newResults = new Map(after.results.map((row) => [key(row), row]));
const keys = [...new Set([...oldResults.keys(), ...newResults.keys()])].sort();
const metrics = [
  "applicationRequestCount", "graphqlRequestCount", "apiBytes", "graphqlBytes", "restJsonBytes",
  "htmlBytes", "jsBytes", "cssBytes", "totalTransferredBytes", "domContentLoadedMs",
  "firstMeaningfulAppShellMs", "usefulContentMs",
];
const results = keys.map((entryKey) => {
  const previous = oldResults.get(entryKey);
  const current = newResults.get(entryKey);
  const [profile, requestedPath] = entryKey.split("\0");
  return {
    profile,
    requestedPath,
    before: previous ? Object.fromEntries(metrics.map((metric) => [metric, previous[metric] ?? null])) : null,
    after: current ? Object.fromEntries(metrics.map((metric) => [metric, current[metric] ?? null])) : null,
    operations: current?.graphqlOperations ?? [],
    payloads: current?.payloads ?? [],
    largestRequest: current?.largestRequest ?? null,
    criticalRequestChain: current?.criticalRequestChain ?? [],
    clientAssets: current?.clientAssets ?? [],
    skipped: current?.skipReason ?? null,
  };
});
const afterRows = [...newResults.values()];
const requestViolations = afterRows.filter((row) => !row.skipReason && row.applicationRequestCount !== 1);
const priorRows = new Map((priorSummary?.results ?? []).map((row) => [key(row), row.after]));
const regressionViolations = [];
for (const [entryKey, current] of newResults) {
  const previous = priorRows.get(entryKey);
  if (!previous) continue;
  for (const [metric, floor, fraction] of [["jsBytes", 24 * 1024, 0.1], ["graphqlBytes", 1024, 0.1]]) {
    if (current[metric] === null || previous[metric] === null) continue;
    const limit = previous[metric] + Math.max(floor, Math.ceil(previous[metric] * fraction));
    if (current[metric] > limit) regressionViolations.push({ profile: current.profile, requestedPath: current.requestedPath, metric, observed: current[metric], limit });
  }
}
const summary = {
  schemaVersion: 1,
  capturedAt: after.environment.capturedAt,
  environment: after.environment,
  beforeCommit: before.environment.commit,
  comparisonMethod: "Cold direct navigation; fresh browser context per page; unauthenticated session bootstrap excluded from application request count.",
  pageOperationBudget: { expectedApplicationRequests: 1, violations: requestViolations.map(({ profile, requestedPath, applicationRequestCount }) => ({ profile, requestedPath, applicationRequestCount })) },
  relativeByteBudget: { source: priorSummary ? outputPath : "first measured baseline", regressions: regressionViolations },
  routeCount: new Set(afterRows.map((row) => row.requestedPath)).size,
  profiles: [...new Set(afterRows.map((row) => row.profile))],
  results,
};
await writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, routeCount: summary.routeCount, profiles: summary.profiles, pageOperationViolations: summary.pageOperationBudget.violations.length }, null, 2));
if (requestViolations.length || regressionViolations.length) process.exitCode = 1;
