import { isbot } from "isbot";
import { UAParser } from "ua-parser-js";
import { getAnalyticsSiteByKey } from "../repositories/analytics-sites";
import { insertAnalyticsEvent } from "../repositories/analytics-events";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_HOST_LENGTH = 255;
const MAX_PATH_LENGTH = 2048;
const MAX_UTM_LENGTH = 200;

export interface AnalyticsEventPayload {
  site: string;
  host: string;
  path: string;
  referrer: string;
  visitor: boolean;
  visit: boolean;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
}

export interface AnalyticsCollectorInput {
  payload: unknown;
  origin?: string | null;
  userAgent?: string | null;
  country?: string | null;
}

export type AnalyticsCollectorOutcome = "recorded" | "bot";

export class AnalyticsCollectorError extends Error {
  constructor(readonly code: "invalid_payload" | "unknown_site" | "host_mismatch" | "origin_missing" | "origin_mismatch") {
    super(code);
    this.name = "AnalyticsCollectorError";
  }
}

function normalizeHost(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_HOST_LENGTH || /[\s/?#@\\]/.test(value)) return null;
  try {
    const url = new URL(`https://${value}`);
    if (url.pathname !== "/" || url.username || url.password || url.host.toLowerCase() !== value.toLowerCase()) return null;
    return url.host.toLowerCase();
  } catch {
    return null;
  }
}

function hasControlCharacters(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) return true;
  }
  return false;
}

function normalizeUtm(value: unknown): string {
  if (typeof value !== "string" || hasControlCharacters(value)) return "";
  return value.trim().slice(0, MAX_UTM_LENGTH);
}

function parsePayload(value: unknown): AnalyticsEventPayload {
  if (!value || typeof value !== "object") throw new AnalyticsCollectorError("invalid_payload");
  const payload = value as Record<string, unknown>;
  const host = normalizeHost(payload.host);
  if (typeof payload.site !== "string" || !UUID_V4.test(payload.site)
    || !host
    || typeof payload.path !== "string" || !payload.path.startsWith("/") || payload.path.length > MAX_PATH_LENGTH
    || hasControlCharacters(payload.path) || payload.path.includes("?") || payload.path.includes("#")
    || typeof payload.referrer !== "string" || payload.referrer.length > 4096
    || typeof payload.visitor !== "boolean" || typeof payload.visit !== "boolean") {
    throw new AnalyticsCollectorError("invalid_payload");
  }
  return {
    site: payload.site,
    host,
    path: payload.path,
    referrer: payload.referrer,
    visitor: payload.visitor,
    visit: payload.visit,
    utmSource: normalizeUtm(payload.utmSource),
    utmMedium: normalizeUtm(payload.utmMedium),
    utmCampaign: normalizeUtm(payload.utmCampaign),
  };
}

function validatedOrigin(origin: string): string | null {
  try {
    const url = new URL(origin);
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password
      || url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function referrerHost(referrer: string, siteHost: string): string {
  if (!referrer) return "";
  try {
    const url = new URL(referrer);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    const host = url.host.toLowerCase();
    return host === siteHost ? "" : host;
  } catch {
    return "";
  }
}

function normalizedOs(name: string | undefined): string {
  if (!name) return "Other";
  if (name === "Mac OS") return "macOS";
  if (name.startsWith("Windows")) return "Windows";
  if (name === "iOS" || name === "Android") return name;
  if (name.startsWith("Linux")) return "Linux";
  return name.slice(0, 64);
}

function normalizedDevice(type: string | undefined): string {
  if (type === "mobile") return "Mobile";
  if (type === "tablet") return "Tablet";
  if (!type) return "Desktop";
  return "Other";
}

export async function collectAnalyticsEvent(input: AnalyticsCollectorInput): Promise<AnalyticsCollectorOutcome> {
  const payload = parsePayload(input.payload);
  const site = await getAnalyticsSiteByKey(payload.site);
  if (!site) throw new AnalyticsCollectorError("unknown_site");
  if (site.host.toLowerCase() !== payload.host) throw new AnalyticsCollectorError("host_mismatch");
  if (!input.origin) throw new AnalyticsCollectorError("origin_missing");
  const origin = validatedOrigin(input.origin);
  if (!origin || new URL(origin).host.toLowerCase() !== site.host.toLowerCase()) {
    throw new AnalyticsCollectorError("origin_mismatch");
  }

  const userAgent = (input.userAgent ?? "").slice(0, 512);
  if (isbot(userAgent)) return "bot";
  const parsed = new UAParser(userAgent).getResult();
  const country = /^[a-z]{2}$/i.test(input.country ?? "") ? input.country!.toUpperCase() : "Unknown";
  await insertAnalyticsEvent({
    site_id: site.id,
    path: payload.path,
    referrer_host: referrerHost(payload.referrer, site.host.toLowerCase()),
    os: normalizedOs(parsed.os.name),
    browser: (parsed.browser.name || "Other").slice(0, 64),
    country,
    device_type: normalizedDevice(parsed.device.type),
    visitor: payload.visitor,
    visit: payload.visit,
    utm_source: payload.visit ? payload.utmSource : "",
    utm_medium: payload.visit ? payload.utmMedium : "",
    utm_campaign: payload.visit ? payload.utmCampaign : "",
  });
  return "recorded";
}
