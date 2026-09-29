// @ts-nocheck — Drizzle aggregate result types are complex
import { sql } from "drizzle-orm";
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

export interface AnalyticsTrafficPoint extends AnalyticsTrafficSummary {
  date: string;
}

export interface AnalyticsTopPage {
  path: string;
  views: number;
}

export interface AnalyticsReferrerDimension {
  referrer: string;
  views: number;
}

export interface AnalyticsCountryDimension {
  country: string;
  views: number;
}

export interface AnalyticsBrowserDimension {
  browser: string;
  views: number;
}

export interface AnalyticsOperatingSystemDimension {
  os: string;
  views: number;
}

export interface AnalyticsDeviceDimension {
  device: string;
  views: number;
}

export interface AnalyticsTrafficDimensions {
  referrers: AnalyticsReferrerDimension[];
  countries: AnalyticsCountryDimension[];
  browsers: AnalyticsBrowserDimension[];
  operatingSystems: AnalyticsOperatingSystemDimension[];
  devices: AnalyticsDeviceDimension[];
}

export interface AnalyticsTrafficReport {
  period: { days: 7; timezone: string };
  overview: AnalyticsTrafficSummary;
  timeline: AnalyticsTrafficPoint[];
  topPages: AnalyticsTopPage[];
  dimensions: AnalyticsTrafficDimensions;
}

const mockEvents: Array<NewAnalyticsEvent & { recorded_at: Date }> = [];

export async function insertAnalyticsEvent(event: NewAnalyticsEvent): Promise<void> {
  if (isMockMode()) {
    mockEvents.push({ ...event, recorded_at: new Date() });
    return;
  }
  await getDb().insert(analytics_events).values(event);
}

function localDateInTimezone(now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: "year" | "month" | "day") => parts.find((value) => value.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function mockTrafficReport(timezone: string): AnalyticsTrafficReport {
  const todayText = localDateInTimezone(new Date(), timezone);
  const [year, month, day] = todayText.split("-").map(Number);
  const today = new Date(Date.UTC(year, month - 1, day));
  const dates = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setUTCDate(date.getUTCDate() - 6 + index);
    return date.toISOString().slice(0, 10);
  });
  const spread = (total: number) => dates.map((_, index) => Math.floor(total / 7) + (index < total % 7 ? 1 : 0));
  const views = spread(12_842);
  const visitors = spread(2_931);
  const visits = spread(4_102);
  return {
    period: { days: 7, timezone },
    overview: { views: 12_842, visitors: 2_931, visits: 4_102 },
    timeline: dates.map((date, index) => ({ date, views: views[index], visitors: visitors[index], visits: visits[index] })),
    topPages: [
      { path: "/", views: 42 },
      { path: "/pricing", views: 21 },
      { path: "/docs", views: 12 },
    ],
    dimensions: {
      referrers: [
        { referrer: "", views: 7_420 },
        { referrer: "google.com", views: 2_930 },
        { referrer: "github.com", views: 1_180 },
      ],
      countries: [
        { country: "JP", views: 4_280 },
        { country: "US", views: 3_160 },
        { country: "DE", views: 1_040 },
      ],
      browsers: [
        { browser: "Safari", views: 5_220 },
        { browser: "Chrome", views: 4_310 },
        { browser: "Firefox", views: 1_430 },
      ],
      operatingSystems: [
        { os: "macOS", views: 4_820 },
        { os: "iOS", views: 3_410 },
        { os: "Windows", views: 2_180 },
      ],
      devices: [
        { device: "Desktop", views: 6_240 },
        { device: "Mobile", views: 5_860 },
        { device: "Tablet", views: 530 },
      ],
    },
  };
}

export async function getAnalyticsTrafficReport(siteId: number, timezone: string): Promise<AnalyticsTrafficReport> {
  if (isMockMode()) {
    return mockTrafficReport(timezone);
  }
  const { rows } = await getDb().execute<{
    timezone: string;
    overview: AnalyticsTrafficSummary;
    timeline: AnalyticsTrafficPoint[];
    top_pages: AnalyticsTopPage[];
    dimensions: AnalyticsTrafficDimensions;
  }>(sql`
    WITH clock AS MATERIALIZED (
      SELECT ${timezone}::text AS timezone,
        (CURRENT_TIMESTAMP AT TIME ZONE ${timezone}::text)::date AS local_today
    ),
    bounds AS MATERIALIZED (
      SELECT timezone, local_today,
        ((local_today - 6)::timestamp AT TIME ZONE timezone) AS start_at,
        ((local_today + 1)::timestamp AT TIME ZONE timezone) AS end_at
      FROM clock
    ),
    scoped_events AS MATERIALIZED (
      SELECT event.path, event.visitor, event.visit,
        event.referrer_host, event.country, event.browser, event.os, event.device_type,
        (event.recorded_at AT TIME ZONE bounds.timezone)::date AS local_date
      FROM analytics_events AS event
      CROSS JOIN bounds
      WHERE event.site_id = ${siteId}
        AND event.recorded_at >= bounds.start_at
        AND event.recorded_at < bounds.end_at
    ),
    summary AS (
      SELECT COUNT(*)::int AS views,
        COUNT(*) FILTER (WHERE visitor = TRUE)::int AS visitors,
        COUNT(*) FILTER (WHERE visit = TRUE)::int AS visits
      FROM scoped_events
    ),
    daily AS (
      SELECT local_date,
        COUNT(*)::int AS views,
        COUNT(*) FILTER (WHERE visitor = TRUE)::int AS visitors,
        COUNT(*) FILTER (WHERE visit = TRUE)::int AS visits
      FROM scoped_events
      GROUP BY local_date
    ),
    dates AS (
      SELECT (bounds.local_today - offsets.offset_day)::date AS local_date
      FROM bounds
      CROSS JOIN generate_series(6, 0, -1) AS offsets(offset_day)
    ),
    top_pages AS (
      SELECT path, COUNT(*)::int AS views
      FROM scoped_events
      GROUP BY path
      ORDER BY COUNT(*) DESC, path ASC
      LIMIT 10
    ),
    top_referrers AS (
      SELECT referrer_host AS referrer, COUNT(*)::int AS views
      FROM scoped_events
      GROUP BY referrer_host
      ORDER BY COUNT(*) DESC, referrer_host ASC
      LIMIT 10
    ),
    top_countries AS (
      SELECT country, COUNT(*)::int AS views
      FROM scoped_events
      GROUP BY country
      ORDER BY COUNT(*) DESC, country ASC
    ),
    top_browsers AS (
      SELECT browser, COUNT(*)::int AS views
      FROM scoped_events
      GROUP BY browser
      ORDER BY COUNT(*) DESC, browser ASC
      LIMIT 10
    ),
    top_operating_systems AS (
      SELECT os, COUNT(*)::int AS views
      FROM scoped_events
      GROUP BY os
      ORDER BY COUNT(*) DESC, os ASC
      LIMIT 10
    ),
    top_devices AS (
      SELECT device_type AS device, COUNT(*)::int AS views
      FROM scoped_events
      GROUP BY device_type
      ORDER BY COUNT(*) DESC, device_type ASC
      LIMIT 10
    )
    SELECT bounds.timezone,
      json_build_object('views', summary.views, 'visitors', summary.visitors, 'visits', summary.visits) AS overview,
      COALESCE((
        SELECT json_agg(json_build_object(
          'date', to_char(dates.local_date, 'YYYY-MM-DD'),
          'views', COALESCE(daily.views, 0),
          'visitors', COALESCE(daily.visitors, 0),
          'visits', COALESCE(daily.visits, 0)
        ) ORDER BY dates.local_date)
        FROM dates
        LEFT JOIN daily ON daily.local_date = dates.local_date
      ), '[]'::json) AS timeline,
      COALESCE((
        SELECT json_agg(json_build_object('path', top_pages.path, 'views', top_pages.views)
          ORDER BY top_pages.views DESC, top_pages.path ASC)
        FROM top_pages
      ), '[]'::json) AS top_pages,
      json_build_object(
        'referrers', COALESCE((
          SELECT json_agg(json_build_object('referrer', referrer, 'views', views)
            ORDER BY views DESC, referrer ASC)
          FROM top_referrers
        ), '[]'::json),
        'countries', COALESCE((
          SELECT json_agg(json_build_object('country', country, 'views', views)
            ORDER BY views DESC, country ASC)
          FROM top_countries
        ), '[]'::json),
        'browsers', COALESCE((
          SELECT json_agg(json_build_object('browser', browser, 'views', views)
            ORDER BY views DESC, browser ASC)
          FROM top_browsers
        ), '[]'::json),
        'operatingSystems', COALESCE((
          SELECT json_agg(json_build_object('os', os, 'views', views)
            ORDER BY views DESC, os ASC)
          FROM top_operating_systems
        ), '[]'::json),
        'devices', COALESCE((
          SELECT json_agg(json_build_object('device', device, 'views', views)
            ORDER BY views DESC, device ASC)
          FROM top_devices
        ), '[]'::json)
      ) AS dimensions
    FROM bounds
    CROSS JOIN summary
  `);

  const report = rows[0];
  return {
    period: { days: 7, timezone: report.timezone },
    overview: report.overview,
    timeline: report.timeline,
    topPages: report.top_pages,
    dimensions: report.dimensions,
  };
}
