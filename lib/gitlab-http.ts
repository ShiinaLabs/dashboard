import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { validateUpstreamUrl, validatePublicAddress } from "./ssrf-guard";

const MAX_REDIRECTS = 5;
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;

type PinnedAddress = { address: string; family: 4 | 6 };
type SafeTransportTestHooks = {
  lookup?: typeof lookup;
  request?: (url: URL, method: string, headers: Headers, signal: AbortSignal | undefined, target: PinnedAddress) => Promise<Response>;
};

/** Fetch GitLab API responses only after validating and pinning the connection IP. */
export async function fetchGitlabWithSafety(url: string, init: RequestInit = {}, hooks: SafeTransportTestHooks = {}): Promise<Response> {
  let current = new URL(url);
  let headers = new Headers(init.headers);
  const method = init.method ?? "GET";
  if (method !== "GET" && method !== "HEAD") {
    throw new Error("GitLab safe transport only supports GET and HEAD requests");
  }

  for (let redirects = 0; ; redirects++) {
    const validation = validateUpstreamUrl(current.href);
    if (!validation.ok) throw new Error(`Unsafe GitLab URL: ${validation.error}`);
    const address = await resolvePublicAddress(current.hostname, hooks.lookup ?? lookup);
    const response = await (hooks.request ?? requestPinned)(current, method, headers, init.signal ?? undefined, address);
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;

    const location = response.headers.get("location");
    if (!location) return response;
    if (redirects >= MAX_REDIRECTS) throw new Error("GitLab redirect limit exceeded");
    const next = new URL(location, current);
    if (next.origin !== current.origin) {
      headers = new Headers(headers);
      headers.delete("PRIVATE-TOKEN");
      headers.delete("Authorization");
      headers.delete("Cookie");
    }
    current = next;
  }
}

async function resolvePublicAddress(hostname: string, resolve: typeof lookup): Promise<PinnedAddress> {
  const literal = hostname.replace(/^\[|\]$/g, "");
  if (isIP(literal)) {
    const result = validatePublicAddress(literal);
    if (!result.ok) throw new Error(`Unsafe GitLab address: ${literal}`);
    return { address: literal, family: isIP(literal) as 4 | 6 };
  }

  const addresses = await resolve(literal, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => !validatePublicAddress(address).ok)) {
    throw new Error(`GitLab hostname resolves to a non-public address: ${hostname}`);
  }
  const selected = addresses[0];
  return { address: selected.address, family: selected.family as 4 | 6 };
}

function requestPinned(
  url: URL,
  method: string,
  headers: Headers,
  signal: AbortSignal | undefined,
  target: { address: string; family: 4 | 6 },
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const requestHeaders: Record<string, string> = {};
    headers.forEach((value, key) => { requestHeaders[key] = value; });
    requestHeaders["accept-encoding"] = "identity";
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(url, {
      method,
      headers: requestHeaders,
      signal,
      rejectUnauthorized: process.env.TLS_REJECT_UNAUTHORIZED !== "false",
      lookup: (_hostname, _options, callback) => callback(null, target.address, target.family),
    }, (response) => {
      const chunks: Buffer[] = [];
      let length = 0;
      response.on("data", (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        length += buffer.length;
        if (length > MAX_RESPONSE_BYTES) {
          request.destroy(new Error("GitLab response exceeded the size limit"));
          return;
        }
        chunks.push(buffer);
      });
      response.on("error", reject);
      response.on("end", () => {
        const responseHeaders = new Headers();
        for (const [key, value] of Object.entries(response.headers)) {
          if (Array.isArray(value)) value.forEach((item) => responseHeaders.append(key, item));
          else if (value !== undefined) responseHeaders.set(key, value);
        }
        const status = response.statusCode ?? 502;
        resolve(new Response([204, 205, 304].includes(status) ? null : Buffer.concat(chunks), {
          status,
          statusText: response.statusMessage,
          headers: responseHeaders,
        }));
      });
    });
    request.on("error", reject);
    request.end();
  });
}
