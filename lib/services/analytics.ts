import { randomUUID } from "node:crypto";
import { analyticsPublicOrigin } from "../config";
import { isValidTimezone } from "../timezone";
import {
  createAnalyticsSite as createSite,
  getAnalyticsSiteById as findSite,
  getAnalyticsSites as listSites,
  renameAnalyticsSite as renameSite,
  type AnalyticsSiteRow,
} from "../repositories/analytics-sites";
import {
  getAnalyticsAcquisitionReport,
  getAnalyticsDashboardReport,
  getAnalyticsGlobalDashboardReport,
  getAnalyticsPortfolioReport,
  getAnalyticsTrafficReport,
  type AnalyticsAcquisitionReport,
  type AnalyticsDashboardReport,
  type AnalyticsGlobalDashboardReport,
  type AnalyticsPortfolioReport,
  type AnalyticsTrafficReport,
} from "../repositories/analytics-events";

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

export async function renameAnalyticsSite(id: number, viewer: AnalyticsViewer, input: { name: string }): Promise<AnalyticsSite> {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name || name.length > 200) throw new AnalyticsSiteError("invalid_input");
  const site = await getAnalyticsSiteById(id);
  if (!site) throw new AnalyticsSiteError("not_found");
  if (viewer.role !== "admin" && site.owner_id !== viewer.id) throw new AnalyticsSiteError("forbidden");
  const updated = await renameSite(site.id, name);
  if (!updated) throw new AnalyticsSiteError("not_found");
  return publicSite(updated);
}

export async function getAnalyticsSiteById(id: number): Promise<AnalyticsSiteRow | undefined> {
  return findSite(id);
}

export async function getAnalyticsTrafficForSite(siteId: number, viewer: AnalyticsViewer, timezone: string): Promise<AnalyticsTrafficReport> {
  const site = await getAnalyticsSiteById(siteId);
  if (!site) throw new AnalyticsSiteError("not_found");
  if (viewer.role !== "admin" && site.owner_id !== viewer.id) throw new AnalyticsSiteError("forbidden");
  if (!isValidTimezone(timezone)) throw new AnalyticsSiteError("invalid_input");
  return getAnalyticsTrafficReport(site.id, timezone);
}

export async function getAnalyticsAcquisitionForSite(siteId: number, viewer: AnalyticsViewer, timezone: string): Promise<AnalyticsAcquisitionReport> {
  const site = await getAnalyticsSiteById(siteId);
  if (!site) throw new AnalyticsSiteError("not_found");
  if (viewer.role !== "admin" && site.owner_id !== viewer.id) throw new AnalyticsSiteError("forbidden");
  if (!isValidTimezone(timezone)) throw new AnalyticsSiteError("invalid_input");
  return getAnalyticsAcquisitionReport(site.id, timezone);
}

export async function getAnalyticsDashboardForSite(
  siteId: number,
  viewer: AnalyticsViewer,
  timezone: string,
  days: number,
): Promise<AnalyticsDashboardReport> {
  const site = await getAnalyticsSiteById(siteId);
  if (!site) throw new AnalyticsSiteError("not_found");
  if (viewer.role !== "admin" && site.owner_id !== viewer.id) throw new AnalyticsSiteError("forbidden");
  if (!isValidTimezone(timezone) || ![7, 30, 90].includes(days)) throw new AnalyticsSiteError("invalid_input");
  return getAnalyticsDashboardReport(site.id, timezone, days);
}

export async function getAnalyticsPortfolio(
  viewer: AnalyticsViewer,
  timezone: string,
  days: number,
): Promise<AnalyticsPortfolioReport> {
  if (!isValidTimezone(timezone) || ![7, 30, 90].includes(days)) throw new AnalyticsSiteError("invalid_input");
  const ownerId = viewer.role === "admin" ? undefined : viewer.id;
  return getAnalyticsPortfolioReport(ownerId, timezone, days);
}

export async function getAnalyticsGlobalDashboard(
  viewer: AnalyticsViewer,
  timezone: string,
  days: number,
): Promise<AnalyticsGlobalDashboardReport> {
  if (!isValidTimezone(timezone) || ![7, 30, 90].includes(days)) throw new AnalyticsSiteError("invalid_input");
  const ownerId = viewer.role === "admin" ? undefined : viewer.id;
  return getAnalyticsGlobalDashboardReport(ownerId, timezone, days);
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
