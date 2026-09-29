import { cloudflareAnalyticsConfig, isMockMode } from "../config";
import {
  createAnalyticsSite as createSite,
  getAnalyticsSiteById as findSite,
  getAnalyticsSites as listSites,
  type AnalyticsSiteRow,
} from "../repositories/analytics-sites";
import { getTrafficSummary } from "../integrations/cloudflare-analytics";

export interface AnalyticsOverview {
  period: "7d";
  views: number;
  visitors: number;
  visits: number;
}

export interface AnalyticsSiteInput {
  name: string;
  siteKey: string;
  host: string;
}

export interface AnalyticsViewer {
  id: number;
  role: string;
}

export class AnalyticsSiteError extends Error {
  constructor(readonly code: "invalid_input" | "not_found" | "forbidden") {
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
  const siteKey = input.siteKey?.trim();
  if (!name || !siteKey || !input.host?.trim()) throw new AnalyticsSiteError("invalid_input");
  return publicSite(await createSite({ owner_id: ownerId, name, site_key: siteKey, host: normalizeHost(input.host) }));
}

export async function getAnalyticsSiteById(id: number): Promise<AnalyticsSiteRow | undefined> {
  return findSite(id);
}

export async function getAnalyticsOverviewForSite(siteId: number, viewer: AnalyticsViewer): Promise<AnalyticsOverview> {
  const site = await getAnalyticsSiteById(siteId);
  if (!site) throw new AnalyticsSiteError("not_found");
  if (viewer.role !== "admin" && site.owner_id !== viewer.id) throw new AnalyticsSiteError("forbidden");
  if (isMockMode()) return { period: "7d", views: 12_842, visitors: 2_931, visits: 4_102 };
  const config = cloudflareAnalyticsConfig();
  if (!config) throw new Error("Cloudflare Analytics is not configured");
  return { period: "7d", ...await getTrafficSummary(config, site.site_key) };
}
