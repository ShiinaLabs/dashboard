import type { CloudflareAnalyticsConfig } from "../config";

export interface TrafficSummary {
  views: number;
  visitors: number;
  visits: number;
}

interface AnalyticsSqlResponse {
  data?: Array<Record<string, unknown>>;
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function metric(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

export function parseTrafficSummary(payload: AnalyticsSqlResponse): TrafficSummary {
  if (!Array.isArray(payload.data)) {
    throw new Error("Cloudflare Analytics Engine returned an unexpected response");
  }
  const row = payload.data?.[0];
  return {
    views: metric(row?.views),
    visitors: metric(row?.visitors),
    visits: metric(row?.visits),
  };
}

export async function getTrafficSummary(config: CloudflareAnalyticsConfig): Promise<TrafficSummary> {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(config.dataset)) {
    throw new Error("Cloudflare Analytics dataset must be a valid SQL identifier");
  }

  const query = [
    "SELECT",
    "  SUM(_sample_interval) AS views,",
    "  SUM(_sample_interval * double1) AS visitors,",
    "  SUM(_sample_interval * double2) AS visits",
    `FROM ${config.dataset}`,
    `WHERE timestamp >= NOW() - INTERVAL '7' DAY AND blob1 = ${sqlString(config.siteId)}`,
  ].join("\n");

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(config.accountId)}/analytics_engine/sql`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
        "Content-Type": "text/plain;charset=UTF-8",
      },
      body: query,
    },
  );

  if (!response.ok) {
    throw new Error(`Cloudflare Analytics Engine query failed (HTTP ${response.status})`);
  }

  return parseTrafficSummary(await response.json() as AnalyticsSqlResponse);
}
