import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { createHash } from "node:crypto";
import { brotliCompressSync, gzipSync } from "node:zlib";

const baseUrl = process.env.BASE_URL;
const storageStatePath = process.env.PLAYWRIGHT_STORAGE_STATE;
const outputPath = process.env.PERF_OUTPUT || "performance/network-baseline.json";
const profileNames = (process.env.PERF_PROFILES || "normal,high-latency,weak")
  .split(",").map((name) => name.trim()).filter(Boolean);
const paths = (process.env.PERF_PATHS || [
  "/overview", "/analytics", "/app-store", "/revenue", "/accounts",
  "/github", "/github/:accountId", "/github/:accountId/repos/:repoId",
  "/gitlab", "/gitlab/:accountId", "/gitlab/:accountId/projects/:projectId",
  "/reddit", "/reddit/:accountId", "/x", "/x/:accountId", "/settings", "/admin",
].join(",")).split(",").map((path) => path.trim()).filter(Boolean);

const profiles = {
  normal: { latency: 0, downloadThroughput: -1, uploadThroughput: -1 },
  "high-latency": { latency: Number(process.env.PERF_HIGH_LATENCY_MS || 300), downloadThroughput: -1, uploadThroughput: -1 },
  weak: {
    latency: Number(process.env.PERF_WEAK_LATENCY_MS || 300),
    downloadThroughput: Math.floor(Number(process.env.PERF_WEAK_DOWNLOAD_KBPS || 1024) * 1024 / 8),
    uploadThroughput: Math.floor(Number(process.env.PERF_WEAK_UPLOAD_KBPS || 256) * 1024 / 8),
  },
};

const fixtureEnv = {
  githubAccountId: process.env.PERF_GITHUB_ACCOUNT_ID,
  githubRepoId: process.env.PERF_GITHUB_REPO_ID,
  gitlabAccountId: process.env.PERF_GITLAB_ACCOUNT_ID,
  gitlabProjectId: process.env.PERF_GITLAB_PROJECT_ID,
  redditAccountId: process.env.PERF_REDDIT_ACCOUNT_ID,
  xAccountId: process.env.PERF_X_ACCOUNT_ID,
};
const fixturePaths = {
  "/github/:accountId": fixtureEnv.githubAccountId && `/github/${fixtureEnv.githubAccountId}`,
  "/github/:accountId/repos/:repoId": fixtureEnv.githubAccountId && fixtureEnv.githubRepoId && `/github/${fixtureEnv.githubAccountId}/repos/${fixtureEnv.githubRepoId}`,
  "/gitlab/:accountId": fixtureEnv.gitlabAccountId && `/gitlab/${fixtureEnv.gitlabAccountId}`,
  "/gitlab/:accountId/projects/:projectId": fixtureEnv.gitlabAccountId && fixtureEnv.gitlabProjectId && `/gitlab/${fixtureEnv.gitlabAccountId}/projects/${fixtureEnv.gitlabProjectId}`,
  "/reddit/:accountId": fixtureEnv.redditAccountId && `/reddit/${fixtureEnv.redditAccountId}`,
  "/x/:accountId": fixtureEnv.xAccountId && `/x/${fixtureEnv.xAccountId}`,
};
const resolvedPaths = paths.map((path) => ({
  requestedPath: path,
  path: fixturePaths[path] || (path.includes(":") ? null : path),
  skipReason: path.includes(":") && !fixturePaths[path]
    ? `Set the matching PERF_*_ID fixture variables to measure ${path}.`
    : null,
}));
const selectedProfiles = Object.fromEntries(profileNames.map((name) => {
  if (!(name in profiles)) throw new Error(`Unknown profile "${name}". Choose normal, high-latency, or weak.`);
  return [name, profiles[name]];
}));

if (!baseUrl || !storageStatePath) {
  throw new Error("Set BASE_URL and PLAYWRIGHT_STORAGE_STATE (an authenticated Playwright storage-state file).");
}

const storageState = JSON.parse(await readFile(storageStatePath, "utf8"));
const browser = await chromium.launch({ headless: true });
const browserVersion = browser.version();
const result = {
  schemaVersion: 1,
  environment: {
    baseUrl,
    commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    workingTreeDiffSha256: createHash("sha256").update(execFileSync("git", ["diff", "--binary"])).digest("hex"),
    nodeVersion: process.version,
    browser: `Chromium ${browserVersion}`,
    capturedAt: new Date().toISOString(),
    fixtureEnv,
    profileConfig: selectedProfiles,
    mockServer: process.env.MOCK_DATA === "1" || process.env.MOCK_DATA === "true",
  },
  skippedPages: resolvedPaths.filter(({ path }) => !path),
  results: [],
};

try {
  for (const [profile, conditions] of Object.entries(selectedProfiles)) {
    for (const { requestedPath, path, skipReason } of resolvedPaths) {
      if (!path) continue;
      const context = await browser.newContext({ storageState });
      const page = await context.newPage();
      const session = await context.newCDPSession(page);
      await session.send("Network.enable");
      await session.send("Network.emulateNetworkConditions", { offline: false, ...conditions, connectionType: profile === "normal" ? "none" : "cellular3g" });
      const network = [];
      const payloads = [];
      const payloadReads = [];
      let firstApplicationDataMs = null;
      const start = performance.now();
      const cdpRequests = new Map();
      session.on("Network.requestWillBeSent", ({ requestId, request, type }) => {
        let operationName = null;
        try {
          const payload = JSON.parse(request.postData || "{}");
          operationName = payload.operationName ?? payload.query?.match(/\bquery\s+([A-Za-z0-9_]+)/)?.[1] ?? null;
        } catch { /* Non-JSON requests have no operation name. */ }
        cdpRequests.set(requestId, { url: request.url, path: new URL(request.url).pathname, resourceType: type, operationName, encodedBytes: 0, headers: {} });
      });
      session.on("Network.responseReceived", ({ requestId, response }) => {
        const item = cdpRequests.get(requestId);
        if (item) {
          item.status = response.status;
          item.mimeType = response.mimeType;
          item.headers = response.headers;
        }
      });
      session.on("Network.loadingFinished", ({ requestId, encodedDataLength }) => {
        const item = cdpRequests.get(requestId);
        if (item) {
          item.encodedBytes = encodedDataLength;
          network.push(item);
        }
      });
      page.on("response", (response) => {
        if (new URL(response.url()).pathname !== "/api/graphql") return;
        const requestBody = response.request().postData() || "";
        const operation = requestBody.match(/"operationName"\s*:\s*"([^"]+)"/)?.[1]
          ?? requestBody.match(/\bquery\s+([A-Za-z0-9_]+)/)?.[1]
          ?? "unknown";
        payloadReads.push(response.body().then((body) => payloads.push({
          operation,
          rawBytes: body.length,
          gzipBytes: gzipSync(body).length,
          brotliBytes: brotliCompressSync(body).length,
        })).catch(() => {}));
      });
      page.on("requestfinished", (request) => {
        if (new URL(request.url()).pathname === "/api/graphql" && firstApplicationDataMs === null) {
          firstApplicationDataMs = performance.now() - start;
        }
      });

      const dataResponse = page.waitForResponse(
        (response) => new URL(response.url()).pathname === "/api/graphql",
        { timeout: Number(process.env.PERF_DATA_TIMEOUT_MS || (profile === "weak" ? 45_000 : 20_000)) },
      ).catch(() => null);
      const shellVisible = page.locator("[data-app-shell]").waitFor({ state: "visible", timeout: Number(process.env.PERF_SHELL_TIMEOUT_MS || 20_000) })
        .then(() => performance.now() - start).catch(() => null);
      let navigationError = null;
      try {
        await page.goto(new URL(path, baseUrl).toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
      } catch (error) {
        navigationError = error instanceof Error ? error.message : String(error);
      }
      await dataResponse;
      const dclMs = await page.evaluate(() => performance.getEntriesByType("navigation").at(-1)?.domContentLoadedEventEnd ?? null).catch(() => null);
      const shellMs = await shellVisible;
      await page.waitForTimeout(Number(process.env.PERF_SETTLE_MS || 250));
      await Promise.all(payloadReads);
      const pageNetwork = network;
      const byType = (type) => pageNetwork.filter((entry) => entry.resourceType === type).reduce((sum, entry) => sum + entry.encodedBytes, 0);
      const apiRequests = pageNetwork.filter((entry) => entry.path.startsWith("/api/") && entry.path !== "/api/auth/me");
      const apiBytes = apiRequests.reduce((sum, entry) => sum + entry.encodedBytes, 0);
      const graphqlRequests = apiRequests.filter((entry) => entry.path === "/api/graphql");
      const largestRequest = [...pageNetwork].sort((left, right) => right.encodedBytes - left.encodedBytes)[0] ?? null;
      const graphqlOperationNames = graphqlRequests.map(({ operationName }) => operationName).filter(Boolean);
      const item = {
        profile,
        requestedPath,
        route: path,
        applicationRequestCount: apiRequests.length,
        graphqlRequestCount: graphqlRequests.length,
        graphqlOperations: graphqlOperationNames,
        payloads,
        apiBytes,
        graphqlBytes: graphqlRequests.reduce((sum, entry) => sum + entry.encodedBytes, 0),
        restJsonBytes: apiRequests.filter((entry) => entry.path !== "/api/graphql").reduce((sum, entry) => sum + entry.encodedBytes, 0),
        htmlBytes: byType("Document"),
        jsBytes: byType("Script"),
        cssBytes: byType("Stylesheet"),
        totalTransferredBytes: pageNetwork.reduce((sum, entry) => sum + entry.encodedBytes, 0),
        domContentLoadedMs: dclMs,
        firstMeaningfulAppShellMs: shellMs,
        usefulContentMs: firstApplicationDataMs,
        largestRequest: largestRequest && { path: largestRequest.path, resourceType: largestRequest.resourceType, bytes: largestRequest.encodedBytes },
        clientAssets: pageNetwork
          .filter((entry) => entry.resourceType === "Script" || entry.resourceType === "Stylesheet")
          .map(({ path: assetPath, resourceType, encodedBytes }) => ({ path: assetPath, resourceType, bytes: encodedBytes })),
        criticalRequestChain: apiRequests.map(({ path: requestPath, status, encodedBytes }) => ({ path: requestPath, status, bytes: encodedBytes })),
        error: navigationError,
        skipReason,
      };
      result.results.push(item);
      await mkdir(dirname(resolve(outputPath)), { recursive: true });
      await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
      console.log(`${profile} ${path}: ${item.applicationRequestCount} app requests, ${item.totalTransferredBytes} bytes, shell ${item.firstMeaningfulAppShellMs ?? "missing"}ms`);
      await context.close();
    }
  }
} finally {
  await browser.close();
}

await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
