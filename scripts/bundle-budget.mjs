import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { execFileSync } from "node:child_process";

const assetDir = resolve("build/client/assets");
const reportPath = process.env.BUNDLE_REPORT || "/tmp/dashboard-bundle-budget.json";
const files = [];

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = resolve(directory, entry.name);
    if (entry.isDirectory()) await walk(file);
    else if (/\.(?:js|css)$/.test(entry.name)) files.push(file);
  }
}

await walk(assetDir);
const assets = await Promise.all(files.map(async (file) => {
  const content = await readFile(file);
  const info = await stat(file);
  return {
    path: relative(resolve("build/client"), file).replaceAll("\\", "/"),
    type: file.endsWith(".css") ? "css" : "js",
    rawBytes: info.size,
    gzipBytes: gzipSync(content).length,
    brotliBytes: brotliCompressSync(content).length,
  };
}));
const sorted = [...assets].sort((a, b) => b.rawBytes - a.rawBytes);
const totals = Object.fromEntries(["js", "css"].map((type) => [type, assets.filter((asset) => asset.type === type).reduce((sum, asset) => ({ rawBytes: sum.rawBytes + asset.rawBytes, gzipBytes: sum.gzipBytes + asset.gzipBytes, brotliBytes: sum.brotliBytes + asset.brotliBytes }), { rawBytes: 0, gzipBytes: 0, brotliBytes: 0 })]));
const report = {
  generatedAt: new Date().toISOString(),
  commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  nodeVersion: process.version,
  totals,
  largest: sorted.slice(0, 20),
  assets,
};
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ totals, largest: report.largest.slice(0, 8) }, null, 2));

const violations = [];
const largestJs = assets.filter((asset) => asset.type === "js").sort((a, b) => b.gzipBytes - a.gzipBytes)[0];
const baselinePath = resolve(process.env.BUNDLE_BASELINE || "performance/bundle-baseline.json");
try {
  const baseline = JSON.parse(await readFile(baselinePath, "utf8"));
  const baselineLargestJs = baseline.largest.filter((asset) => asset.type === "js").sort((a, b) => b.gzipBytes - a.gzipBytes)[0];
  const allowance = (baselineValue, floor, fraction) => Math.max(floor, Math.ceil(baselineValue * fraction));
  const totalLimit = baseline.totals.js.gzipBytes + allowance(baseline.totals.js.gzipBytes, 16 * 1024, 0.1);
  const chunkLimit = baselineLargestJs.gzipBytes + allowance(baselineLargestJs.gzipBytes, 8 * 1024, 0.15);
  if (totals.js.gzipBytes > totalLimit) violations.push(`Total JS gzip ${totals.js.gzipBytes} exceeds baseline budget ${totalLimit}.`);
  if (largestJs && largestJs.gzipBytes > chunkLimit) violations.push(`Largest JS chunk gzip ${largestJs.gzipBytes} exceeds baseline budget ${chunkLimit} (${largestJs.path}).`);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  console.log(`No bundle baseline at ${baselinePath}; recorded current measurements without applying a hard-coded size limit.`);
}
if (violations.length) {
  console.error(violations.join("\n"));
  process.exitCode = 1;
}
