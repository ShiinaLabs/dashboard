import { chromium } from "@playwright/test";
import { writeFile } from "node:fs/promises";

const baseUrl = process.env.BASE_URL;
const storageState = process.env.PLAYWRIGHT_STORAGE_STATE;
const paths = (process.env.PERF_PATHS || "/overview,/analytics,/app-store,/revenue,/github,/gitlab,/reddit,/accounts,/settings,/admin")
  .split(",").map((path) => path.trim()).filter(Boolean);
const outputPath = process.env.PERF_OUTPUT || "query-plane-perf.json";

if (!baseUrl || !storageState) {
  throw new Error("Set BASE_URL and PLAYWRIGHT_STORAGE_STATE (an authenticated Playwright storage-state file).");
}

const profiles = {
  normal: { latency: 0, downloadThroughput: -1, uploadThroughput: -1 },
  highLatency: { latency: Number(process.env.PERF_HIGH_LATENCY_MS || 300), downloadThroughput: -1, uploadThroughput: -1 },
  weak: {
    latency: Number(process.env.PERF_WEAK_LATENCY_MS || 300),
    downloadThroughput: Math.floor(Number(process.env.PERF_WEAK_DOWNLOAD_KBPS || 1024) * 1024 / 8),
    uploadThroughput: Math.floor(Number(process.env.PERF_WEAK_UPLOAD_KBPS || 256) * 1024 / 8),
  },
};

const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const [profile, conditions] of Object.entries(profiles)) {
    const context = await browser.newContext({ storageState });
    const page = await context.newPage();
    const session = await context.newCDPSession(page);
    await session.send("Network.enable");
    await session.send("Network.emulateNetworkConditions", { offline: false, ...conditions, connectionType: "cellular3g" });
    const cdpPaths = new Map();
    const encodedRequests = [];
    session.on("Network.requestWillBeSent", ({ requestId, request }) => cdpPaths.set(requestId, new URL(request.url).pathname));
    session.on("Network.loadingFinished", ({ requestId, encodedDataLength }) => encodedRequests.push({ path: cdpPaths.get(requestId), bytes: encodedDataLength }));
    for (const path of paths) {
      const requests = new Map();
      const onRequest = (request) => {
        const url = new URL(request.url());
        if (url.pathname.startsWith("/api/") && url.pathname !== "/api/auth/me") {
          requests.set(request, { method: request.method(), path: url.pathname, startedAt: Date.now(), status: null, bytes: 0 });
        }
      };
      const onResponse = (response) => {
        const item = requests.get(response.request());
        if (item) item.status = response.status();
      };
      const onRequestFinished = (request) => {
        const item = requests.get(request);
        if (item) item.durationMs = Date.now() - item.startedAt;
      };
      const byteStart = encodedRequests.length;
      page.on("request", onRequest);
      page.on("response", onResponse);
      page.on("requestfinished", onRequestFinished);
      const start = Date.now();
      await page.goto(new URL(path, baseUrl).toString(), { waitUntil: "domcontentloaded" });
      await page.locator("main").waitFor({ state: "visible", timeout: 30_000 }).catch(() => {});
      const usefulContentMs = Date.now() - start;
      await page.waitForTimeout(Number(process.env.PERF_SETTLE_MS || 1200));
      const applicationRequests = [...requests.values()];
      results.push({
        profile, path, usefulContentMs,
        applicationRequestCount: applicationRequests.length,
        applicationRequests,
        transferredBytes: encodedRequests.slice(byteStart).filter(({ path }) => path?.startsWith("/api/") && path !== "/api/auth/me").reduce((total, request) => total + request.bytes, 0),
      });
      page.off("request", onRequest);
      page.off("response", onResponse);
      page.off("requestfinished", onRequestFinished);
    }
    await context.close();
  }
} finally {
  await browser.close();
}

await writeFile(outputPath, `${JSON.stringify({ baseUrl, profiles, results }, null, 2)}\n`);
console.log(`Wrote ${results.length} measurements to ${outputPath}`);
