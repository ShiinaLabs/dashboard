import { graphqlRequest } from "./graphql";

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

export interface AnalyticsAcquisition {
  period: { days: 7; timezone: string };
  totalVisits: number;
  referrers: AnalyticsAcquisitionReferrer[];
  entryPages: AnalyticsEntryPage[];
}

export type AnalyticsRange = "DAYS_7" | "DAYS_30" | "DAYS_90";

export interface AnalyticsDashboard {
  period: { days: number; timezone: string; startDate: string; endDate: string };
  previousPeriod: { days: number; timezone: string; startDate: string; endDate: string };
  overview: { views: number; visits: number; visitorDays: number };
  previousOverview: { views: number; visits: number; visitorDays: number };
  timeline: Array<{ date: string; views: number; visitors: number; visits: number }>;
  topPages: Array<{ path: string; views: number }>;
  dimensions: {
    countries: Array<{ country: string; views: number }>;
    browsers: Array<{ browser: string; views: number }>;
    operatingSystems: Array<{ os: string; views: number }>;
    devices: Array<{ device: string; views: number }>;
  };
  acquisition: AnalyticsAcquisitionSummary;
}

export interface AnalyticsPortfolio {
  period: { days: number; timezone: string; startDate: string; endDate: string };
  previousPeriod: { days: number; timezone: string; startDate: string; endDate: string };
  summary: { trackedSites: number; activeSites: number; views: number; visits: number };
  previousSummary: { views: number; visits: number };
  sites: Array<{ id: number; name: string; host: string; views: number; visits: number }>;
}

export interface AnalyticsGlobalCampaign extends AnalyticsCampaign {
  siteId: number;
  siteName: string;
  siteHost: string;
}

export interface AnalyticsGlobalDashboard {
  period: { days: number; timezone: string; startDate: string; endDate: string };
  previousPeriod: { days: number; timezone: string; startDate: string; endDate: string };
  overview: { trackedSites: number; activeSites: number; views: number; visits: number };
  previousOverview: { views: number; visits: number };
  timeline: Array<{ date: string; views: number; visits: number }>;
  sites: Array<{ id: number; name: string; host: string; views: number; visits: number }>;
  dimensions: {
    countries: Array<{ country: string; views: number }>;
    browsers: Array<{ browser: string; views: number }>;
    operatingSystems: Array<{ os: string; views: number }>;
    devices: Array<{ device: string; views: number }>;
  };
  acquisition: {
    totalVisits: number;
    referrers: AnalyticsAcquisitionReferrer[];
    campaigns: AnalyticsGlobalCampaign[];
  };
}

export interface AnalyticsPageResult {
  sites: Array<{ id: number; name: string; site_key: string; host: string; created_at: string; updated_at: string }>;
  globalDashboard: AnalyticsGlobalDashboard | null;
  dashboard: AnalyticsDashboard | null;
  installation: { trackerUrl: string; snippet: string } | null;
}

const analyticsPageQuery = /* GraphQL */ `
  query AnalyticsPage($range: AnalyticsRange!, $timezone: String!, $siteId: Int!, $showGlobal: Boolean!, $showSite: Boolean!) {
    analytics {
      sites { id name siteKey host createdAt updatedAt }
      globalDashboard(range: $range, timezone: $timezone) @include(if: $showGlobal) {
        period { days timezone startDate endDate }
        previousPeriod { days timezone startDate endDate }
        overview { trackedSites activeSites views visits }
        previousOverview { views visits }
        timeline { date views visits }
        sites { id name host views visits }
        dimensions { countries { country views } browsers { browser views } operatingSystems { os views } devices { device views } }
        acquisition { totalVisits referrers { referrer visits } campaigns { siteId siteName siteHost source medium campaign visits } }
      }
      dashboard(siteId: $siteId, range: $range, timezone: $timezone) @include(if: $showSite) {
        period { days timezone startDate endDate }
        previousPeriod { days timezone startDate endDate }
        overview { views visits visitorDays }
        previousOverview { views visits visitorDays }
        timeline { date views visitors visits }
        topPages { path views }
        dimensions { countries { country views } browsers { browser views } operatingSystems { os views } devices { device views } }
        acquisition { totalVisits referrers { referrer visits } entryPages { path visits } campaigns { source medium campaign visits } }
      }
      installation(siteId: $siteId) @include(if: $showSite) { trackerUrl snippet }
    }
  }
`;

export async function getAnalyticsPage(variables: { range: AnalyticsRange; timezone: string; siteId: number; showGlobal: boolean; showSite: boolean }, signal?: AbortSignal): Promise<AnalyticsPageResult> {
  const result = await graphqlRequest<{ analytics: Omit<AnalyticsPageResult, "sites"> & { sites: Array<{ id: number; name: string; siteKey: string; host: string; createdAt: string; updatedAt: string }> } }, typeof variables>(analyticsPageQuery, variables, signal);
  return { ...result.analytics, sites: result.analytics.sites.map((site) => ({ id: site.id, name: site.name, site_key: site.siteKey, host: site.host, created_at: site.createdAt, updated_at: site.updatedAt })) };
}

interface AnalyticsAcquisitionSummary {
  totalVisits: number;
  referrers: AnalyticsAcquisitionReferrer[];
  entryPages: AnalyticsEntryPage[];
  campaigns: AnalyticsCampaign[];
}

const acquisitionQuery = /* GraphQL */ `
  query AnalyticsAcquisition($siteId: Int!, $timezone: String!) {
    analytics {
      acquisition(siteId: $siteId, timezone: $timezone) {
        period { days timezone }
        totalVisits
        referrers { referrer visits }
        entryPages { path visits }
      }
    }
  }
`;

export async function getAnalyticsAcquisition(siteId: number, timezone: string): Promise<AnalyticsAcquisition> {
  const result = await graphqlRequest<
    { analytics: { acquisition: AnalyticsAcquisition } },
    { siteId: number; timezone: string }
  >(acquisitionQuery, { siteId, timezone });
  return result.analytics.acquisition;
}

const dashboardQuery = /* GraphQL */ `
  query AnalyticsDashboard($siteId: Int!, $range: AnalyticsRange!, $timezone: String!) {
    analytics {
      dashboard(siteId: $siteId, range: $range, timezone: $timezone) {
        period { days timezone startDate endDate }
        previousPeriod { days timezone startDate endDate }
        overview { views visits visitorDays }
        previousOverview { views visits visitorDays }
        timeline { date views visitors visits }
        topPages { path views }
        dimensions {
          countries { country views }
          browsers { browser views }
          operatingSystems { os views }
          devices { device views }
        }
        acquisition {
          totalVisits
          referrers { referrer visits }
          entryPages { path visits }
          campaigns { source medium campaign visits }
        }
      }
    }
  }
`;

const portfolioQuery = /* GraphQL */ `
  query AnalyticsPortfolio($range: AnalyticsRange!, $timezone: String!) {
    analytics {
      portfolio(range: $range, timezone: $timezone) {
        period { days timezone startDate endDate }
        previousPeriod { days timezone startDate endDate }
        summary { trackedSites activeSites views visits }
        previousSummary { views visits }
        sites { id name host views visits }
      }
    }
  }
`;

const globalDashboardQuery = /* GraphQL */ `
  query AnalyticsGlobalDashboard($range: AnalyticsRange!, $timezone: String!) {
    analytics {
      globalDashboard(range: $range, timezone: $timezone) {
        period { days timezone startDate endDate }
        previousPeriod { days timezone startDate endDate }
        overview { trackedSites activeSites views visits }
        previousOverview { views visits }
        timeline { date views visits }
        sites { id name host views visits }
        dimensions {
          countries { country views }
          browsers { browser views }
          operatingSystems { os views }
          devices { device views }
        }
        acquisition {
          totalVisits
          referrers { referrer visits }
          campaigns { siteId siteName siteHost source medium campaign visits }
        }
      }
    }
  }
`;

export async function getAnalyticsDashboard(siteId: number, range: AnalyticsRange, timezone: string): Promise<AnalyticsDashboard> {
  const result = await graphqlRequest<
    { analytics: { dashboard: AnalyticsDashboard } },
    { siteId: number; range: AnalyticsRange; timezone: string }
  >(dashboardQuery, { siteId, range, timezone });
  return result.analytics.dashboard;
}

export async function getAnalyticsPortfolio(range: AnalyticsRange, timezone: string): Promise<AnalyticsPortfolio> {
  const result = await graphqlRequest<
    { analytics: { portfolio: AnalyticsPortfolio } },
    { range: AnalyticsRange; timezone: string }
  >(portfolioQuery, { range, timezone });
  return result.analytics.portfolio;
}

export async function getAnalyticsGlobalDashboard(range: AnalyticsRange, timezone: string): Promise<AnalyticsGlobalDashboard> {
  const result = await graphqlRequest<
    { analytics: { globalDashboard: AnalyticsGlobalDashboard } },
    { range: AnalyticsRange; timezone: string }
  >(globalDashboardQuery, { range, timezone });
  return result.analytics.globalDashboard;
}
