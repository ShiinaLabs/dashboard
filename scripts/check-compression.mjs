import { request } from "node:https";
import { request as httpRequest } from "node:http";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import { gunzipSync, brotliDecompressSync, inflateSync } from "node:zlib";

const baseUrl = new URL(process.env.BASE_URL || "http://localhost:3000");
const storageStatePath = process.env.PLAYWRIGHT_STORAGE_STATE;
const accepts = "br, gzip, deflate";

function requestRaw(pathname, { method = "GET", cookie, body } = {}) {
  return new Promise((resolve, reject) => {
    const transport = baseUrl.protocol === "https:" ? request : httpRequest;
    const req = transport(new URL(pathname, baseUrl), {
      method,
      headers: {
        "Accept-Encoding": accepts,
        ...(cookie ? { Cookie: cookie } : {}),
        ...(body ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } : {}),
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, raw: Buffer.concat(chunks) }));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function decodedBody(response) {
  const encoding = response.headers["content-encoding"];
  if (encoding === "br") return brotliDecompressSync(response.raw);
  if (encoding === "gzip") return gunzipSync(response.raw);
  if (encoding === "deflate") return inflateSync(response.raw);
  return response.raw;
}

function summary(name, response) {
  return {
    name,
    status: response.status,
    contentType: response.headers["content-type"] || null,
    contentEncoding: response.headers["content-encoding"] || "identity",
    cacheControl: response.headers["cache-control"] || null,
    contentLength: response.headers["content-length"] || null,
    wireBytes: response.raw.length,
  };
}

let cookie;
if (storageStatePath) {
  const state = JSON.parse(await readFile(storageStatePath, "utf8"));
  cookie = state.cookies
    .filter((item) => item.domain === baseUrl.hostname || item.domain === `.${baseUrl.hostname}`)
    .map((item) => `${item.name}=${item.value}`)
    .join("; ");
}

const html = await requestRaw("/login");
const reports = [summary("html", html)];
const htmlText = decodedBody(html).toString("utf8");
const assets = [...htmlText.matchAll(/(?:src|href)="([^"]+\.(?:js|css)(?:\?[^"]*)?)"/g)]
  .map((match) => match[1])
  .filter((path) => path.startsWith("/"));
const selectedAssets = [...new Set(assets)].filter((asset) => asset.endsWith(".css")).slice(0, 1)
  .concat([...new Set(assets)].filter((asset) => asset.endsWith(".js")).slice(0, 2));
for (const asset of selectedAssets) {
  reports.push(summary(asset.endsWith(".css") ? "css" : "js", await requestRaw(asset)));
}
if (cookie) {
  reports.push(summary("auth-json", await requestRaw("/api/auth/me", { cookie })));
  const query = JSON.stringify({ query: "query CompressionProbe { __typename }", operationName: "CompressionProbe" });
  reports.push(summary("graphql-json", await requestRaw("/api/graphql", { method: "POST", cookie, body: query })));
} else {
  reports.push({ name: "auth-json", skipped: "Set PLAYWRIGHT_STORAGE_STATE to probe authenticated API responses." });
  reports.push({ name: "graphql-json", skipped: "Set PLAYWRIGHT_STORAGE_STATE to probe authenticated API responses." });
}

const textResponses = reports.filter((item) => ["html", "js", "css", "auth-json", "graphql-json"].includes(item.name));
const uncompressedLarge = textResponses.filter((item) => item.wireBytes >= 1024 && item.contentEncoding === "identity");
console.log(JSON.stringify({ baseUrl: baseUrl.origin, acceptEncoding: accepts, reports, uncompressedLargeCount: uncompressedLarge.length }, null, 2));
if (uncompressedLarge.length) process.exitCode = 1;
