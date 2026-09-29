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
