import { randomUUID } from "node:crypto";
import { analyticsPublicOrigin } from "../config";
import {
  createAnalyticsSite as createSite,
  getAnalyticsSiteById as findSite,
  getAnalyticsSites as listSites,
  type AnalyticsSiteRow,
} from "../repositories/analytics-sites";
import { getAnalyticsTrafficReport, type AnalyticsTrafficReport } from "../repositories/analytics-events";

export interface AnalyticsSiteInput {
  name: string;
  host: string;
}

export interface AnalyticsViewer {
  id: number;
  role: string;
}

export class AnalyticsSiteError extends Error {
  constructor(readonly code: "invalid_input" | "not_found" | "forbidden" | "public_origin_not_configured") {
    super(code);
    this.name = "AnalyticsSiteError";
  }
}

export type AnalyticsSite = Omit<AnalyticsSiteRow, "owner_id" | "deleted_at">;
const publicSite = ({ owner_id: _ownerId, deleted_at: _deletedAt, ...site }: AnalyticsSiteRow): AnalyticsSite => site;

export async function getAnalyticsSites(ownerId?: number): Promise<AnalyticsSite[]> {
  return (await listSites(ownerId)).map(publicSite);
}

function normalizeHost(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new AnalyticsSiteError("invalid_input");
  let url: URL;
  try {
    url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
  } catch {
    throw new AnalyticsSiteError("invalid_input");
  }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new AnalyticsSiteError("invalid_input");
  }
  return url.host.toLowerCase();
}

export async function createAnalyticsSite(ownerId: number, input: AnalyticsSiteInput): Promise<AnalyticsSite> {
  const name = input.name?.trim();
  if (!name || !input.host?.trim()) throw new AnalyticsSiteError("invalid_input");
  return publicSite(await createSite({
    owner_id: ownerId,
    name,
    host: normalizeHost(input.host),
    site_key: randomUUID(),
  }));
}

export async function getAnalyticsSiteById(id: number): Promise<AnalyticsSiteRow | undefined> {
  return findSite(id);
}

function isValidTimezone(timezone: string): boolean {
  if (typeof timezone !== "string" || timezone.length === 0 || timezone.length > 100) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export async function getAnalyticsTrafficForSite(siteId: number, viewer: AnalyticsViewer, timezone: string): Promise<AnalyticsTrafficReport> {
  const site = await getAnalyticsSiteById(siteId);
  if (!site) throw new AnalyticsSiteError("not_found");
  if (viewer.role !== "admin" && site.owner_id !== viewer.id) throw new AnalyticsSiteError("forbidden");
  if (!isValidTimezone(timezone)) throw new AnalyticsSiteError("invalid_input");
  return getAnalyticsTrafficReport(site.id, timezone);
}

export interface AnalyticsInstallation {
  trackerUrl: string;
  snippet: string;
}

function escapeHtmlAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "&#39;");
}

export async function getAnalyticsInstallationForSite(siteId: number, viewer: AnalyticsViewer): Promise<AnalyticsInstallation> {
  const site = await getAnalyticsSiteById(siteId);
  if (!site) throw new AnalyticsSiteError("not_found");
  if (viewer.role !== "admin" && site.owner_id !== viewer.id) throw new AnalyticsSiteError("forbidden");
  const publicOrigin = analyticsPublicOrigin();
  if (!publicOrigin) throw new AnalyticsSiteError("public_origin_not_configured");

  const trackerUrl = `${publicOrigin}/a/t.js`;
  const snippet = `<script defer src="${escapeHtmlAttribute(trackerUrl)}" data-site-id="${escapeHtmlAttribute(site.site_key)}" data-site-host="${escapeHtmlAttribute(site.host)}"></script>`;
  return { trackerUrl, snippet };
}
