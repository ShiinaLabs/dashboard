// @ts-nocheck — Drizzle aggregate result types are complex
import { and, eq, gte, sql } from "drizzle-orm";
import { analytics_events } from "@/db/schema";
import { getDb } from "../db/connection";
import { isMockMode } from "../config";

export interface NewAnalyticsEvent {
  site_id: number;
  path: string;
  referrer_host: string;
  os: string;
  browser: string;
  country: string;
  device_type: string;
  visitor: boolean;
  visit: boolean;
}

export interface AnalyticsTrafficSummary {
  views: number;
  visitors: number;
  visits: number;
}

const mockEvents: Array<NewAnalyticsEvent & { recorded_at: Date }> = [];

export async function insertAnalyticsEvent(event: NewAnalyticsEvent): Promise<void> {
  if (isMockMode()) {
    mockEvents.push({ ...event, recorded_at: new Date() });
    return;
  }
  await getDb().insert(analytics_events).values(event);
}

export async function getAnalyticsTrafficSummary(siteId: number, days: number): Promise<AnalyticsTrafficSummary> {
  const safeDays = Number.isFinite(days) ? Math.max(1, Math.floor(days)) : 7;
  if (isMockMode()) {
    const cutoff = Date.now() - safeDays * 24 * 60 * 60 * 1000;
    const events = mockEvents.filter((event) => event.site_id === siteId && event.recorded_at.getTime() >= cutoff);
    return {
      views: events.length,
      visitors: events.filter((event) => event.visitor).length,
      visits: events.filter((event) => event.visit).length,
    };
  }
  const [summary] = await getDb().select({
    views: sql<number>`COUNT(*)::int`,
    visitors: sql<number>`COUNT(*) FILTER (WHERE ${analytics_events.visitor})::int`,
    visits: sql<number>`COUNT(*) FILTER (WHERE ${analytics_events.visit})::int`,
  }).from(analytics_events).where(and(
    eq(analytics_events.site_id, siteId),
    gte(analytics_events.recorded_at, sql`NOW() - ${safeDays} * INTERVAL '1 day'`),
  ));
  return {
    views: Number(summary?.views ?? 0),
    visitors: Number(summary?.visitors ?? 0),
    visits: Number(summary?.visits ?? 0),
  };
}
