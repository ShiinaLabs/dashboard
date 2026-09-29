// @ts-nocheck — Drizzle aggregate result types are complex
import { sql } from "drizzle-orm";
import { analytics_events } from "@/db/schema";
import { getAnalyticsSites as getMockAnalyticsSites } from "./analytics-sites";
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
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
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

export interface AnalyticsAcquisitionReferrer {
  referrer: string;
  visits: number;
}

export interface AnalyticsEntryPage {
  path: string;
  visits: number;
}

export interface AnalyticsCampaign {
  source: string;
  medium: string;
  campaign: string;
  visits: number;
}

export interface AnalyticsAcquisitionReport {
  period: { days: 7; timezone: string };
  totalVisits: number;
  referrers: AnalyticsAcquisitionReferrer[];
  entryPages: AnalyticsEntryPage[];
}

export interface AnalyticsDashboardOverview {
  views: number;
  visits: number;
  visitorDays: number;
}

export interface AnalyticsDashboardDimensions {
  countries: AnalyticsCountryDimension[];
  browsers: AnalyticsBrowserDimension[];
  operatingSystems: AnalyticsOperatingSystemDimension[];
  devices: AnalyticsDeviceDimension[];
}

export interface AnalyticsDashboardReport {
  period: { days: number; timezone: string; startDate: string; endDate: string };
  previousPeriod: { days: number; timezone: string; startDate: string; endDate: string };
  overview: AnalyticsDashboardOverview;
  previousOverview: AnalyticsDashboardOverview;
  timeline: AnalyticsTrafficPoint[];
  topPages: AnalyticsTopPage[];
  dimensions: AnalyticsDashboardDimensions;
  acquisition: {
    totalVisits: number;
    referrers: AnalyticsAcquisitionReferrer[];
    entryPages: AnalyticsEntryPage[];
    campaigns: AnalyticsCampaign[];
  };
}

export interface AnalyticsPortfolioSite {
  id: number;
  name: string;
  host: string;
  views: number;
  visits: number;
}

export interface AnalyticsPortfolioReport {
  period: { days: number; timezone: string; startDate: string; endDate: string };
  previousPeriod: { days: number; timezone: string; startDate: string; endDate: string };
  summary: { trackedSites: number; activeSites: number; views: number; visits: number };
  previousSummary: { views: number; visits: number };
  sites: AnalyticsPortfolioSite[];
}

export type AnalyticsGlobalSite = AnalyticsPortfolioSite;

export interface AnalyticsGlobalDashboardReport {
  period: AnalyticsPortfolioReport["period"];
  previousPeriod: AnalyticsPortfolioReport["previousPeriod"];
  overview: AnalyticsPortfolioReport["summary"];
  previousOverview: AnalyticsPortfolioReport["previousSummary"];
  timeline: Array<{ date: string; views: number; visits: number }>;
  sites: AnalyticsGlobalSite[];
  dimensions: AnalyticsDashboardDimensions;
  acquisition: {
    totalVisits: number;
    referrers: AnalyticsAcquisitionReferrer[];
    campaigns: Array<AnalyticsCampaign & { siteId: number; siteName: string; siteHost: string }>;
  };
}

const mockEvents: Array<NewAnalyticsEvent & { recorded_at: Date }> = [];

function shiftDate(dateText: string, days: number): string {
  const date = new Date(`${dateText}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function mockDashboardReport(timezone: string, days: number): AnalyticsDashboardReport {
  const today = localDateInTimezone(new Date(), timezone);
  const startDate = shiftDate(today, 1 - days);
  const previousEndDate = shiftDate(startDate, -1);
  const previousStartDate = shiftDate(previousEndDate, 1 - days);
  const dates = Array.from({ length: days }, (_, index) => shiftDate(startDate, index));
  const spread = (total: number) => dates.map((_, index) => Math.floor(total / days) + (index < total % days ? 1 : 0));
  const views = spread(12_842);
  const visitors = spread(2_931);
  const visits = spread(4_102);
  return {
    period: { days, timezone, startDate, endDate: today },
    previousPeriod: { days, timezone, startDate: previousStartDate, endDate: previousEndDate },
    overview: { views: 12_842, visits: 4_102, visitorDays: 2_931 },
    previousOverview: { views: 11_420, visits: 3_870, visitorDays: 2_805 },
    timeline: dates.map((date, index) => ({ date, views: views[index], visitors: visitors[index], visits: visits[index] })),
    topPages: [ { path: "/", views: 42 }, { path: "/pricing", views: 21 }, { path: "/docs", views: 12 } ],
    dimensions: {
      countries: [{ country: "JP", views: 4_280 }, { country: "US", views: 3_160 }, { country: "DE", views: 1_040 }],
      browsers: [{ browser: "Safari", views: 5_220 }, { browser: "Chrome", views: 4_310 }, { browser: "Firefox", views: 1_430 }],
      operatingSystems: [{ os: "macOS", views: 4_820 }, { os: "iOS", views: 3_410 }, { os: "Windows", views: 2_180 }],
      devices: [{ device: "Desktop", views: 6_240 }, { device: "Mobile", views: 5_860 }, { device: "Tablet", views: 530 }],
    },
    acquisition: {
      totalVisits: 4_102,
      referrers: [{ referrer: "", visits: 2_100 }, { referrer: "google.com", visits: 980 }, { referrer: "github.com", visits: 520 }],
      entryPages: [{ path: "/", visits: 1_800 }, { path: "/pricing", visits: 900 }, { path: "/docs", visits: 600 }],
      campaigns: [
        { source: "newsletter", medium: "email", campaign: "launch", visits: 420 },
        { source: "google", medium: "cpc", campaign: "wifi-tool", visits: 210 },
      ],
    },
  };
}

function mockPortfolioReport(timezone: string, days: number): AnalyticsPortfolioReport {
  const today = localDateInTimezone(new Date(), timezone);
  const startDate = shiftDate(today, 1 - days);
  const previousEndDate = shiftDate(startDate, -1);
  const previousStartDate = shiftDate(previousEndDate, 1 - days);
  const sites = [
    { id: 1, name: "WiFi Lens", host: "wifi-lens.app", views: 7_200, visits: 2_300 },
    { id: 2, name: "Tazuki", host: "tazuki.dev", views: 3_800, visits: 1_200 },
    { id: 3, name: "ShiinaPlay", host: "shiina.play", views: 1_842, visits: 602 },
  ];
  return {
    period: { days, timezone, startDate, endDate: today },
    previousPeriod: { days, timezone, startDate: previousStartDate, endDate: previousEndDate },
    summary: {
      trackedSites: sites.length,
      activeSites: sites.filter((site) => site.views > 0).length,
      views: sites.reduce((total, site) => total + site.views, 0),
      visits: sites.reduce((total, site) => total + site.visits, 0),
    },
    previousSummary: { views: 11_420, visits: 3_870 },
    sites,
  };
}

async function mockGlobalDashboardReport(ownerId: number | undefined, timezone: string, days: number): Promise<AnalyticsGlobalDashboardReport> {
  const portfolio = mockPortfolioReport(timezone, days);
  const spread = (total: number) => Array.from({ length: days }, (_, index) =>
    Math.floor(total / days) + (index < total % days ? 1 : 0));
  const visibleSites = await getMockAnalyticsSites(ownerId);
  const sites = visibleSites.map((identity) => {
    const fixture = portfolio.sites.find((site) => site.id === identity.id);
    return { id: identity.id, name: identity.name, host: identity.host, views: fixture?.views ?? 0, visits: fixture?.visits ?? 0 };
  }).sort((left, right) => right.views - left.views || right.visits - left.visits || left.name.localeCompare(right.name) || left.id - right.id);
  const overview = {
    trackedSites: sites.length,
    activeSites: sites.filter((site) => site.views > 0).length,
    views: sites.reduce((sum, site) => sum + site.views, 0),
    visits: sites.reduce((sum, site) => sum + site.visits, 0),
  };
  const views = spread(overview.views);
  const visits = spread(overview.visits);
  const campaigns = [
    { siteId: 1, siteName: "WiFi Lens", siteHost: "wifi-lens.app", source: "newsletter", medium: "email", campaign: "launch", visits: 420 },
    { siteId: 2, siteName: "Tazuki", siteHost: "tazuki.dev", source: "google", medium: "cpc", campaign: "wifi-tool", visits: 210 },
  ];
  return {
    period: portfolio.period,
    previousPeriod: portfolio.previousPeriod,
    overview,
    previousOverview: portfolio.previousSummary,
    timeline: views.map((value, index) => ({ date: shiftDate(portfolio.period.startDate, index), views: value, visits: visits[index] })),
    sites,
    dimensions: {
      countries: [{ country: "JP", views: 4_280 }, { country: "US", views: 3_160 }, { country: "DE", views: 1_040 }],
      browsers: [{ browser: "Safari", views: 5_220 }, { browser: "Chrome", views: 4_310 }, { browser: "Firefox", views: 1_430 }],
      operatingSystems: [{ os: "macOS", views: 4_820 }, { os: "iOS", views: 3_410 }, { os: "Windows", views: 2_180 }],
      devices: [{ device: "Desktop", views: 6_240 }, { device: "Mobile", views: 5_860 }, { device: "Tablet", views: 530 }],
    },
    acquisition: {
      totalVisits: overview.visits,
      referrers: [{ referrer: "", visits: 2_100 }, { referrer: "google.com", visits: 980 }, { referrer: "github.com", visits: 520 }],
      campaigns,
    },
  };
}

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

function mockAcquisitionReport(timezone: string): AnalyticsAcquisitionReport {
  return {
    period: { days: 7, timezone },
    totalVisits: 4_102,
    referrers: [
      { referrer: "", visits: 2_100 },
      { referrer: "google.com", visits: 980 },
      { referrer: "github.com", visits: 520 },
    ],
    entryPages: [
      { path: "/", visits: 1_800 },
      { path: "/pricing", visits: 900 },
      { path: "/docs", visits: 600 },
    ],
  };
}

export async function getAnalyticsAcquisitionReport(siteId: number, timezone: string): Promise<AnalyticsAcquisitionReport> {
  if (isMockMode()) {
    return mockAcquisitionReport(timezone);
  }

  const { rows } = await getDb().execute<{
    timezone: string;
    total_visits: number;
    referrers: AnalyticsAcquisitionReferrer[];
    entry_pages: AnalyticsEntryPage[];
  }>(sql`
    WITH clock AS MATERIALIZED (
      SELECT ${timezone}::text AS timezone,
        (CURRENT_TIMESTAMP AT TIME ZONE ${timezone}::text)::date AS local_today
    ),
    bounds AS MATERIALIZED (
      SELECT timezone,
        ((local_today - 6)::timestamp AT TIME ZONE timezone) AS start_at,
        ((local_today + 1)::timestamp AT TIME ZONE timezone) AS end_at
      FROM clock
    ),
    visit_events AS MATERIALIZED (
      SELECT event.path, event.referrer_host
      FROM analytics_events AS event
      CROSS JOIN bounds
      WHERE event.site_id = ${siteId}
        AND event.recorded_at >= bounds.start_at
        AND event.recorded_at < bounds.end_at
        AND event.visit = TRUE
    ),
    referrers AS (
      SELECT referrer_host AS referrer, COUNT(*)::int AS visits
      FROM visit_events
      GROUP BY referrer_host
      ORDER BY COUNT(*) DESC, referrer_host ASC
      LIMIT 10
    ),
    entry_pages AS (
      SELECT path, COUNT(*)::int AS visits
      FROM visit_events
      GROUP BY path
      ORDER BY COUNT(*) DESC, path ASC
      LIMIT 10
    )
    SELECT bounds.timezone,
      (SELECT COUNT(*)::int FROM visit_events) AS total_visits,
      COALESCE((
        SELECT json_agg(json_build_object('referrer', referrer, 'visits', visits)
          ORDER BY visits DESC, referrer ASC)
        FROM referrers
      ), '[]'::json) AS referrers,
      COALESCE((
        SELECT json_agg(json_build_object('path', path, 'visits', visits)
          ORDER BY visits DESC, path ASC)
        FROM entry_pages
      ), '[]'::json) AS entry_pages
    FROM bounds
  `);

  const report = rows[0];
  return {
    period: { days: 7, timezone: report.timezone },
    totalVisits: report.total_visits,
    referrers: report.referrers,
    entryPages: report.entry_pages,
  };
}

export async function getAnalyticsDashboardReport(siteId: number, timezone: string, days: number): Promise<AnalyticsDashboardReport> {
  if (isMockMode()) return mockDashboardReport(timezone, days);

  const { rows } = await getDb().execute<{
    timezone: string;
    current_start_date: string;
    current_end_date: string;
    previous_start_date: string;
    previous_end_date: string;
    overview: AnalyticsDashboardOverview;
    previous_overview: AnalyticsDashboardOverview;
    timeline: AnalyticsTrafficPoint[];
    top_pages: AnalyticsTopPage[];
    dimensions: AnalyticsDashboardDimensions;
    acquisition: AnalyticsDashboardReport["acquisition"];
  }>(sql`
    WITH clock AS MATERIALIZED (
      SELECT ${timezone}::text AS timezone,
        ${days}::int AS days,
        (CURRENT_TIMESTAMP AT TIME ZONE ${timezone}::text)::date AS local_today
    ),
    bounds AS MATERIALIZED (
      SELECT timezone, days, local_today,
        local_today - (days - 1) AS current_start_date,
        local_today + 1 AS current_end_date,
        local_today - (days * 2 - 1) AS previous_start_date,
        local_today - (days - 1) AS previous_end_date
      FROM clock
    ),
    scoped_events AS MATERIALIZED (
      SELECT event.path, event.visitor, event.visit,
        event.referrer_host, event.country, event.browser, event.os, event.device_type,
        event.utm_source, event.utm_medium, event.utm_campaign,
        (event.recorded_at AT TIME ZONE bounds.timezone)::date AS local_date
      FROM analytics_events AS event
      CROSS JOIN bounds
      WHERE event.site_id = ${siteId}
        AND event.recorded_at >= (bounds.previous_start_date::timestamp AT TIME ZONE bounds.timezone)
        AND event.recorded_at < (bounds.current_end_date::timestamp AT TIME ZONE bounds.timezone)
    ),
    current_events AS MATERIALIZED (
      SELECT scoped_events.* FROM scoped_events CROSS JOIN bounds
      WHERE scoped_events.local_date >= bounds.current_start_date
    ),
    previous_events AS MATERIALIZED (
      SELECT scoped_events.* FROM scoped_events CROSS JOIN bounds
      WHERE scoped_events.local_date < bounds.current_start_date
    ),
    current_summary AS (
      SELECT COUNT(*)::int AS views,
        COUNT(*) FILTER (WHERE visit = TRUE)::int AS visits,
        COUNT(*) FILTER (WHERE visitor = TRUE)::int AS visitor_days
      FROM current_events
    ),
    previous_summary AS (
      SELECT COUNT(*)::int AS views,
        COUNT(*) FILTER (WHERE visit = TRUE)::int AS visits,
        COUNT(*) FILTER (WHERE visitor = TRUE)::int AS visitor_days
      FROM previous_events
    ),
    daily AS (
      SELECT local_date, COUNT(*)::int AS views,
        COUNT(*) FILTER (WHERE visitor = TRUE)::int AS visitors,
        COUNT(*) FILTER (WHERE visit = TRUE)::int AS visits
      FROM current_events
      GROUP BY local_date
    ),
    dates AS (
      SELECT (bounds.current_start_date + offsets.offset_day)::date AS local_date
      FROM bounds
      CROSS JOIN generate_series(0, bounds.days - 1) AS offsets(offset_day)
    ),
    top_pages AS (
      SELECT path, COUNT(*)::int AS views FROM current_events
      GROUP BY path ORDER BY COUNT(*) DESC, path ASC LIMIT 10
    ),
    top_countries AS (
      SELECT country, COUNT(*)::int AS views FROM current_events
      GROUP BY country ORDER BY COUNT(*) DESC, country ASC
    ),
    top_browsers AS (
      SELECT browser, COUNT(*)::int AS views FROM current_events
      GROUP BY browser ORDER BY COUNT(*) DESC, browser ASC LIMIT 10
    ),
    top_operating_systems AS (
      SELECT os, COUNT(*)::int AS views FROM current_events
      GROUP BY os ORDER BY COUNT(*) DESC, os ASC LIMIT 10
    ),
    top_devices AS (
      SELECT device_type AS device, COUNT(*)::int AS views FROM current_events
      GROUP BY device_type ORDER BY COUNT(*) DESC, device_type ASC LIMIT 10
    ),
    visit_events AS MATERIALIZED (
      SELECT path, referrer_host, utm_source, utm_medium, utm_campaign
      FROM current_events WHERE visit = TRUE
    ),
    top_referrers AS (
      SELECT referrer_host AS referrer, COUNT(*)::int AS visits FROM visit_events
      GROUP BY referrer_host ORDER BY COUNT(*) DESC, referrer_host ASC LIMIT 10
    ),
    entry_pages AS (
      SELECT path, COUNT(*)::int AS visits FROM visit_events
      GROUP BY path ORDER BY COUNT(*) DESC, path ASC LIMIT 10
    ),
    top_campaigns AS (
      SELECT utm_source AS source, utm_medium AS medium, utm_campaign AS campaign, COUNT(*)::int AS visits
      FROM visit_events
      WHERE utm_source <> '' OR utm_medium <> '' OR utm_campaign <> ''
      GROUP BY utm_source, utm_medium, utm_campaign
      ORDER BY COUNT(*) DESC, utm_campaign ASC, utm_source ASC, utm_medium ASC
      LIMIT 10
    )
    SELECT bounds.timezone,
      to_char(bounds.current_start_date, 'YYYY-MM-DD') AS current_start_date,
      to_char(bounds.local_today, 'YYYY-MM-DD') AS current_end_date,
      to_char(bounds.previous_start_date, 'YYYY-MM-DD') AS previous_start_date,
      to_char(bounds.previous_end_date - 1, 'YYYY-MM-DD') AS previous_end_date,
      json_build_object('views', current_summary.views, 'visits', current_summary.visits, 'visitorDays', current_summary.visitor_days) AS overview,
      json_build_object('views', previous_summary.views, 'visits', previous_summary.visits, 'visitorDays', previous_summary.visitor_days) AS previous_overview,
      COALESCE((
        SELECT json_agg(json_build_object('date', to_char(dates.local_date, 'YYYY-MM-DD'),
          'views', COALESCE(daily.views, 0), 'visitors', COALESCE(daily.visitors, 0), 'visits', COALESCE(daily.visits, 0))
          ORDER BY dates.local_date)
        FROM dates LEFT JOIN daily ON daily.local_date = dates.local_date
      ), '[]'::json) AS timeline,
      COALESCE((SELECT json_agg(json_build_object('path', path, 'views', views) ORDER BY views DESC, path ASC) FROM top_pages), '[]'::json) AS top_pages,
      json_build_object(
        'countries', COALESCE((SELECT json_agg(json_build_object('country', country, 'views', views) ORDER BY views DESC, country ASC) FROM top_countries), '[]'::json),
        'browsers', COALESCE((SELECT json_agg(json_build_object('browser', browser, 'views', views) ORDER BY views DESC, browser ASC) FROM top_browsers), '[]'::json),
        'operatingSystems', COALESCE((SELECT json_agg(json_build_object('os', os, 'views', views) ORDER BY views DESC, os ASC) FROM top_operating_systems), '[]'::json),
        'devices', COALESCE((SELECT json_agg(json_build_object('device', device, 'views', views) ORDER BY views DESC, device ASC) FROM top_devices), '[]'::json)
      ) AS dimensions,
      json_build_object(
        'totalVisits', current_summary.visits,
        'referrers', COALESCE((SELECT json_agg(json_build_object('referrer', referrer, 'visits', visits) ORDER BY visits DESC, referrer ASC) FROM top_referrers), '[]'::json),
        'entryPages', COALESCE((SELECT json_agg(json_build_object('path', path, 'visits', visits) ORDER BY visits DESC, path ASC) FROM entry_pages), '[]'::json),
        'campaigns', COALESCE((SELECT json_agg(json_build_object('source', source, 'medium', medium, 'campaign', campaign, 'visits', visits)
          ORDER BY visits DESC, campaign ASC, source ASC, medium ASC) FROM top_campaigns), '[]'::json)
      ) AS acquisition
    FROM bounds CROSS JOIN current_summary CROSS JOIN previous_summary
  `);

  const report = rows[0];
  return {
    period: { days, timezone: report.timezone, startDate: report.current_start_date, endDate: report.current_end_date },
    previousPeriod: { days, timezone: report.timezone, startDate: report.previous_start_date, endDate: report.previous_end_date },
    overview: report.overview,
    previousOverview: report.previous_overview,
    timeline: report.timeline,
    topPages: report.top_pages,
    dimensions: report.dimensions,
    acquisition: report.acquisition,
  };
}

export async function getAnalyticsPortfolioReport(
  ownerId: number | undefined,
  timezone: string,
  days: number,
): Promise<AnalyticsPortfolioReport> {
  if (isMockMode()) return mockPortfolioReport(timezone, days);

  const { rows } = await getDb().execute<{
    timezone: string;
    current_start_date: string;
    current_end_date: string;
    previous_start_date: string;
    previous_end_date: string;
    summary: AnalyticsPortfolioReport["summary"];
    previous_summary: AnalyticsPortfolioReport["previousSummary"];
    sites: AnalyticsPortfolioSite[];
  }>(sql`
    WITH clock AS MATERIALIZED (
      SELECT ${timezone}::text AS timezone,
        ${days}::int AS days,
        (CURRENT_TIMESTAMP AT TIME ZONE ${timezone}::text)::date AS local_today
    ),
    bounds AS MATERIALIZED (
      SELECT timezone, days, local_today,
        local_today - (days - 1) AS current_start_date,
        local_today + 1 AS current_end_date,
        local_today - (days * 2 - 1) AS previous_start_date,
        local_today - (days - 1) AS previous_end_date
      FROM clock
    ),
    site_scope AS MATERIALIZED (
      SELECT site.id, site.name, site.host
      FROM analytics_sites AS site
      WHERE site.deleted_at IS NULL
        AND (${ownerId ?? null}::int IS NULL OR site.owner_id = ${ownerId ?? null}::int)
    ),
    scoped_events AS MATERIALIZED (
      SELECT event.site_id, event.recorded_at, event.visit
      FROM analytics_events AS event
      INNER JOIN site_scope ON site_scope.id = event.site_id
      CROSS JOIN bounds
      WHERE event.recorded_at >= (bounds.previous_start_date::timestamp AT TIME ZONE bounds.timezone)
        AND event.recorded_at < (bounds.current_end_date::timestamp AT TIME ZONE bounds.timezone)
    ),
    current_events AS MATERIALIZED (
      SELECT scoped_events.site_id, scoped_events.visit
      FROM scoped_events CROSS JOIN bounds
      WHERE scoped_events.recorded_at >= (bounds.current_start_date::timestamp AT TIME ZONE bounds.timezone)
    ),
    previous_events AS MATERIALIZED (
      SELECT scoped_events.visit
      FROM scoped_events CROSS JOIN bounds
      WHERE scoped_events.recorded_at < (bounds.current_start_date::timestamp AT TIME ZONE bounds.timezone)
    ),
    current_site_metrics AS (
      SELECT site_id, COUNT(*)::int AS views,
        COUNT(*) FILTER (WHERE visit = TRUE)::int AS visits
      FROM current_events
      GROUP BY site_id
    ),
    portfolio_sites AS (
      SELECT site_scope.id, site_scope.name, site_scope.host,
        COALESCE(current_site_metrics.views, 0)::int AS views,
        COALESCE(current_site_metrics.visits, 0)::int AS visits
      FROM site_scope
      LEFT JOIN current_site_metrics ON current_site_metrics.site_id = site_scope.id
    ),
    current_summary AS (
      SELECT COUNT(*)::int AS tracked_sites,
        COUNT(*) FILTER (WHERE views > 0)::int AS active_sites,
        COALESCE(SUM(views), 0)::int AS views,
        COALESCE(SUM(visits), 0)::int AS visits
      FROM portfolio_sites
    ),
    previous_summary AS (
      SELECT COUNT(*)::int AS views,
        COUNT(*) FILTER (WHERE visit = TRUE)::int AS visits
      FROM previous_events
    )
    SELECT bounds.timezone,
      to_char(bounds.current_start_date, 'YYYY-MM-DD') AS current_start_date,
      to_char(bounds.local_today, 'YYYY-MM-DD') AS current_end_date,
      to_char(bounds.previous_start_date, 'YYYY-MM-DD') AS previous_start_date,
      to_char(bounds.previous_end_date - 1, 'YYYY-MM-DD') AS previous_end_date,
      json_build_object('trackedSites', current_summary.tracked_sites, 'activeSites', current_summary.active_sites,
        'views', current_summary.views, 'visits', current_summary.visits) AS summary,
      json_build_object('views', previous_summary.views, 'visits', previous_summary.visits) AS previous_summary,
      COALESCE((
        SELECT json_agg(json_build_object('id', id, 'name', name, 'host', host, 'views', views, 'visits', visits)
          ORDER BY views DESC, visits DESC, name ASC, id ASC)
        FROM portfolio_sites
      ), '[]'::json) AS sites
    FROM bounds CROSS JOIN current_summary CROSS JOIN previous_summary
  `);

  const report = rows[0];
  return {
    period: { days, timezone: report.timezone, startDate: report.current_start_date, endDate: report.current_end_date },
    previousPeriod: { days, timezone: report.timezone, startDate: report.previous_start_date, endDate: report.previous_end_date },
    summary: report.summary,
    previousSummary: report.previous_summary,
    sites: report.sites,
  };
}

export async function getAnalyticsGlobalDashboardReport(
  ownerId: number | undefined,
  timezone: string,
  days: number,
): Promise<AnalyticsGlobalDashboardReport> {
  if (isMockMode()) return mockGlobalDashboardReport(ownerId, timezone, days);

  const { rows } = await getDb().execute<{
    timezone: string;
    current_start_date: string;
    current_end_date: string;
    previous_start_date: string;
    previous_end_date: string;
    overview: AnalyticsGlobalDashboardReport["overview"];
    previous_overview: AnalyticsGlobalDashboardReport["previousOverview"];
    timeline: AnalyticsGlobalDashboardReport["timeline"];
    sites: AnalyticsGlobalSite[];
    dimensions: AnalyticsDashboardDimensions;
    acquisition: AnalyticsGlobalDashboardReport["acquisition"];
  }>(sql`
    WITH clock AS MATERIALIZED (
      SELECT ${timezone}::text AS timezone,
        ${days}::int AS days,
        (CURRENT_TIMESTAMP AT TIME ZONE ${timezone}::text)::date AS local_today
    ),
    bounds AS MATERIALIZED (
      SELECT timezone, days, local_today,
        local_today - (days - 1) AS current_start_date,
        local_today + 1 AS current_end_date,
        local_today - (days * 2 - 1) AS previous_start_date,
        local_today - (days - 1) AS previous_end_date
      FROM clock
    ),
    site_scope AS MATERIALIZED (
      SELECT site.id, site.name, site.host
      FROM analytics_sites AS site
      WHERE site.deleted_at IS NULL
        AND (${ownerId ?? null}::int IS NULL OR site.owner_id = ${ownerId ?? null}::int)
    ),
    scoped_events AS MATERIALIZED (
      SELECT event.site_id, event.recorded_at, event.visit,
        event.country, event.browser, event.os, event.device_type,
        event.referrer_host, event.utm_source, event.utm_medium, event.utm_campaign,
        (event.recorded_at AT TIME ZONE bounds.timezone)::date AS local_date
      FROM analytics_events AS event
      INNER JOIN site_scope ON site_scope.id = event.site_id
      CROSS JOIN bounds
      WHERE event.recorded_at >= (bounds.previous_start_date::timestamp AT TIME ZONE bounds.timezone)
        AND event.recorded_at < (bounds.current_end_date::timestamp AT TIME ZONE bounds.timezone)
    ),
    current_events AS MATERIALIZED (
      SELECT scoped_events.* FROM scoped_events CROSS JOIN bounds
      WHERE scoped_events.local_date >= bounds.current_start_date
    ),
    previous_events AS MATERIALIZED (
      SELECT scoped_events.visit FROM scoped_events CROSS JOIN bounds
      WHERE scoped_events.local_date < bounds.current_start_date
    ),
    current_site_metrics AS (
      SELECT site_id, COUNT(*)::int AS views,
        COUNT(*) FILTER (WHERE visit = TRUE)::int AS visits
      FROM current_events
      GROUP BY site_id
    ),
    portfolio_sites AS (
      SELECT site_scope.id, site_scope.name, site_scope.host,
        COALESCE(current_site_metrics.views, 0)::int AS views,
        COALESCE(current_site_metrics.visits, 0)::int AS visits
      FROM site_scope
      LEFT JOIN current_site_metrics ON current_site_metrics.site_id = site_scope.id
    ),
    current_summary AS (
      SELECT COUNT(*)::int AS tracked_sites,
        COUNT(*) FILTER (WHERE views > 0)::int AS active_sites,
        COALESCE(SUM(views), 0)::int AS views,
        COALESCE(SUM(visits), 0)::int AS visits
      FROM portfolio_sites
    ),
    previous_summary AS (
      SELECT COUNT(*)::int AS views,
        COUNT(*) FILTER (WHERE visit = TRUE)::int AS visits
      FROM previous_events
    ),
    daily AS (
      SELECT local_date, COUNT(*)::int AS views,
        COUNT(*) FILTER (WHERE visit = TRUE)::int AS visits
      FROM current_events
      GROUP BY local_date
    ),
    dates AS (
      SELECT (bounds.current_start_date + offsets.offset_day)::date AS local_date
      FROM bounds
      CROSS JOIN generate_series(0, bounds.days - 1) AS offsets(offset_day)
    ),
    countries AS (
      SELECT country, COUNT(*)::int AS views FROM current_events
      GROUP BY country ORDER BY COUNT(*) DESC, country ASC
    ),
    browsers AS (
      SELECT browser, COUNT(*)::int AS views FROM current_events
      GROUP BY browser ORDER BY COUNT(*) DESC, browser ASC LIMIT 10
    ),
    operating_systems AS (
      SELECT os, COUNT(*)::int AS views FROM current_events
      GROUP BY os ORDER BY COUNT(*) DESC, os ASC LIMIT 10
    ),
    devices AS (
      SELECT device_type AS device, COUNT(*)::int AS views FROM current_events
      GROUP BY device_type ORDER BY COUNT(*) DESC, device_type ASC LIMIT 10
    ),
    visit_events AS MATERIALIZED (
      SELECT current_events.site_id, site_scope.name AS site_name, site_scope.host AS site_host,
        current_events.referrer_host, current_events.utm_source,
        current_events.utm_medium, current_events.utm_campaign
      FROM current_events
      INNER JOIN site_scope ON site_scope.id = current_events.site_id
      WHERE current_events.visit = TRUE
    ),
    referrers AS (
      SELECT referrer_host AS referrer, COUNT(*)::int AS visits FROM visit_events
      GROUP BY referrer_host ORDER BY COUNT(*) DESC, referrer_host ASC LIMIT 10
    ),
    campaigns AS (
      SELECT site_id, site_name, site_host,
        utm_source AS source, utm_medium AS medium, utm_campaign AS campaign,
        COUNT(*)::int AS visits
      FROM visit_events
      WHERE utm_source <> '' OR utm_medium <> '' OR utm_campaign <> ''
      GROUP BY site_id, site_name, site_host, utm_source, utm_medium, utm_campaign
      ORDER BY COUNT(*) DESC, site_name ASC, utm_campaign ASC, utm_source ASC, utm_medium ASC, site_id ASC
      LIMIT 10
    )
    SELECT bounds.timezone,
      to_char(bounds.current_start_date, 'YYYY-MM-DD') AS current_start_date,
      to_char(bounds.local_today, 'YYYY-MM-DD') AS current_end_date,
      to_char(bounds.previous_start_date, 'YYYY-MM-DD') AS previous_start_date,
      to_char(bounds.previous_end_date - 1, 'YYYY-MM-DD') AS previous_end_date,
      json_build_object('trackedSites', current_summary.tracked_sites, 'activeSites', current_summary.active_sites,
        'views', current_summary.views, 'visits', current_summary.visits) AS overview,
      json_build_object('views', previous_summary.views, 'visits', previous_summary.visits) AS previous_overview,
      COALESCE((
        SELECT json_agg(json_build_object('date', to_char(dates.local_date, 'YYYY-MM-DD'),
          'views', COALESCE(daily.views, 0), 'visits', COALESCE(daily.visits, 0)) ORDER BY dates.local_date)
        FROM dates LEFT JOIN daily ON daily.local_date = dates.local_date
      ), '[]'::json) AS timeline,
      COALESCE((SELECT json_agg(json_build_object('id', id, 'name', name, 'host', host, 'views', views, 'visits', visits)
        ORDER BY views DESC, visits DESC, name ASC, id ASC) FROM portfolio_sites), '[]'::json) AS sites,
      json_build_object(
        'countries', COALESCE((SELECT json_agg(json_build_object('country', country, 'views', views) ORDER BY views DESC, country ASC) FROM countries), '[]'::json),
        'browsers', COALESCE((SELECT json_agg(json_build_object('browser', browser, 'views', views) ORDER BY views DESC, browser ASC) FROM browsers), '[]'::json),
        'operatingSystems', COALESCE((SELECT json_agg(json_build_object('os', os, 'views', views) ORDER BY views DESC, os ASC) FROM operating_systems), '[]'::json),
        'devices', COALESCE((SELECT json_agg(json_build_object('device', device, 'views', views) ORDER BY views DESC, device ASC) FROM devices), '[]'::json)
      ) AS dimensions,
      json_build_object(
        'totalVisits', current_summary.visits,
        'referrers', COALESCE((SELECT json_agg(json_build_object('referrer', referrer, 'visits', visits) ORDER BY visits DESC, referrer ASC) FROM referrers), '[]'::json),
        'campaigns', COALESCE((SELECT json_agg(json_build_object('siteId', site_id, 'siteName', site_name, 'siteHost', site_host,
          'source', source, 'medium', medium, 'campaign', campaign, 'visits', visits)
          ORDER BY visits DESC, site_name ASC, campaign ASC, source ASC, medium ASC, site_id ASC) FROM campaigns), '[]'::json)
      ) AS acquisition
    FROM bounds CROSS JOIN current_summary CROSS JOIN previous_summary
  `);

  const report = rows[0];
  return {
    period: { days, timezone: report.timezone, startDate: report.current_start_date, endDate: report.current_end_date },
    previousPeriod: { days, timezone: report.timezone, startDate: report.previous_start_date, endDate: report.previous_end_date },
    overview: report.overview,
    previousOverview: report.previous_overview,
    timeline: report.timeline,
    sites: report.sites,
    dimensions: report.dimensions,
    acquisition: report.acquisition,
  };
}
