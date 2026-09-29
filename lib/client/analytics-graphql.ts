import { graphqlRequest } from "./graphql";

export interface AnalyticsAcquisitionReferrer {
  referrer: string;
  visits: number;
}

export interface AnalyticsEntryPage {
  path: string;
  visits: number;
}

export interface AnalyticsAcquisition {
  period: { days: 7; timezone: string };
  totalVisits: number;
  referrers: AnalyticsAcquisitionReferrer[];
  entryPages: AnalyticsEntryPage[];
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
