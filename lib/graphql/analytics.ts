import { createGraphQLError } from "graphql-yoga";
import { getOwnerId } from "@/lib/auth-helpers";
import {
  AnalyticsSiteError,
  getAnalyticsDashboardForSite,
  getAnalyticsGlobalDashboard,
  getAnalyticsPortfolio,
  getAnalyticsSites,
  getAnalyticsInstallationForSite,
  type AnalyticsSite,
} from "@/lib/services/analytics";
import type { GraphQLContext } from "./context";

export const analyticsTypeDefs = /* GraphQL */ `
  type Query {
    analytics: AnalyticsQuery!
  }

  type AnalyticsQuery {
    sites: [AnalyticsSite!]!
    installation(siteId: Int!): AnalyticsInstallation!
    dashboard(siteId: Int!, range: AnalyticsRange = DAYS_7, timezone: String = "UTC"): AnalyticsDashboard!
    globalDashboard(range: AnalyticsRange = DAYS_7, timezone: String = "UTC"): AnalyticsGlobalDashboard!
    portfolio(range: AnalyticsRange = DAYS_7, timezone: String = "UTC"): AnalyticsPortfolio!
  }

  enum AnalyticsRange { DAYS_7 DAYS_30 DAYS_90 }

  type AnalyticsSite {
    id: Int!
    name: String!
    siteKey: String!
    host: String!
    createdAt: String!
    updatedAt: String!
  }

  type AnalyticsInstallation { trackerUrl: String! snippet: String! }

  type AnalyticsCountryDimension {
    country: String!
    views: Int!
  }

  type AnalyticsBrowserDimension {
    browser: String!
    views: Int!
  }

  type AnalyticsOperatingSystemDimension {
    os: String!
    views: Int!
  }

  type AnalyticsDeviceDimension {
    device: String!
    views: Int!
  }

  type AnalyticsAcquisitionReferrer {
    referrer: String!
    visits: Int!
  }

  type AnalyticsEntryPage {
    path: String!
    visits: Int!
  }

  type AnalyticsCampaign {
    source: String!
    medium: String!
    campaign: String!
    visits: Int!
  }

  type AnalyticsDashboardPeriod {
    days: Int!
    timezone: String!
    startDate: String!
    endDate: String!
  }

  type AnalyticsDashboardOverview {
    views: Int!
    visits: Int!
    visitorDays: Int!
  }

  type AnalyticsDashboardDimensions {
    countries: [AnalyticsCountryDimension!]!
    browsers: [AnalyticsBrowserDimension!]!
    operatingSystems: [AnalyticsOperatingSystemDimension!]!
    devices: [AnalyticsDeviceDimension!]!
  }

  type AnalyticsTrafficPoint {
    date: String!
    views: Int!
    visitors: Int!
    visits: Int!
  }

  type AnalyticsTopPage {
    path: String!
    views: Int!
  }

  type AnalyticsAcquisitionSummary {
    totalVisits: Int!
    referrers: [AnalyticsAcquisitionReferrer!]!
    entryPages: [AnalyticsEntryPage!]!
    campaigns: [AnalyticsCampaign!]!
  }

  type AnalyticsDashboard {
    period: AnalyticsDashboardPeriod!
    previousPeriod: AnalyticsDashboardPeriod!
    overview: AnalyticsDashboardOverview!
    previousOverview: AnalyticsDashboardOverview!
    timeline: [AnalyticsTrafficPoint!]!
    topPages: [AnalyticsTopPage!]!
    dimensions: AnalyticsDashboardDimensions!
    acquisition: AnalyticsAcquisitionSummary!
  }

  type AnalyticsPortfolioSummary {
    trackedSites: Int!
    activeSites: Int!
    views: Int!
    visits: Int!
  }

  type AnalyticsPortfolioPreviousSummary {
    views: Int!
    visits: Int!
  }

  type AnalyticsPortfolioSite {
    id: Int!
    name: String!
    host: String!
    views: Int!
    visits: Int!
  }

  type AnalyticsPortfolio {
    period: AnalyticsDashboardPeriod!
    previousPeriod: AnalyticsDashboardPeriod!
    summary: AnalyticsPortfolioSummary!
    previousSummary: AnalyticsPortfolioPreviousSummary!
    sites: [AnalyticsPortfolioSite!]!
  }

  type AnalyticsGlobalOverview {
    trackedSites: Int!
    activeSites: Int!
    views: Int!
    visits: Int!
  }

  type AnalyticsGlobalPreviousOverview {
    views: Int!
    visits: Int!
  }

  type AnalyticsGlobalTrafficPoint {
    date: String!
    views: Int!
    visits: Int!
  }

  type AnalyticsGlobalSite {
    id: Int!
    name: String!
    host: String!
    views: Int!
    visits: Int!
  }

  type AnalyticsGlobalCampaign {
    siteId: Int!
    siteName: String!
    siteHost: String!
    source: String!
    medium: String!
    campaign: String!
    visits: Int!
  }

  type AnalyticsGlobalAcquisition {
    totalVisits: Int!
    referrers: [AnalyticsAcquisitionReferrer!]!
    campaigns: [AnalyticsGlobalCampaign!]!
  }

  type AnalyticsGlobalDashboard {
    period: AnalyticsDashboardPeriod!
    previousPeriod: AnalyticsDashboardPeriod!
    overview: AnalyticsGlobalOverview!
    previousOverview: AnalyticsGlobalPreviousOverview!
    timeline: [AnalyticsGlobalTrafficPoint!]!
    sites: [AnalyticsGlobalSite!]!
    dimensions: AnalyticsDashboardDimensions!
    acquisition: AnalyticsGlobalAcquisition!
  }
`;

interface AnalyticsSiteGraphQL {
  id: number;
  name: string;
  siteKey: string;
  host: string;
  createdAt: string;
  updatedAt: string;
}

type AnalyticsDashboardReport = Awaited<ReturnType<typeof getAnalyticsDashboardForSite>>;
type AnalyticsPortfolioReport = Awaited<ReturnType<typeof getAnalyticsPortfolio>>;
type AnalyticsGlobalDashboardReport = Awaited<ReturnType<typeof getAnalyticsGlobalDashboard>>;

function rangeDays(range: "DAYS_7" | "DAYS_30" | "DAYS_90"): number {
  switch (range) {
    case "DAYS_7": return 7;
    case "DAYS_30": return 30;
    case "DAYS_90": return 90;
    default: throw new AnalyticsSiteError("invalid_input");
  }
}

function toGraphQLSite(site: AnalyticsSite): AnalyticsSiteGraphQL {
  return {
    id: site.id,
    name: site.name,
    siteKey: site.site_key,
    host: site.host,
    createdAt: site.created_at,
    updatedAt: site.updated_at,
  };
}

function mapAnalyticsError(error: unknown) {
  if (error instanceof AnalyticsSiteError || (error instanceof Error && error.name === "AnalyticsSiteError")) {
    switch ((error as AnalyticsSiteError).code) {
      case "invalid_input":
        return createGraphQLError("Invalid input", { extensions: { code: "BAD_USER_INPUT" } });
      case "not_found":
        return createGraphQLError("Not found", { extensions: { code: "NOT_FOUND" } });
      case "forbidden":
        return createGraphQLError("Forbidden", { extensions: { code: "FORBIDDEN" } });
      case "public_origin_not_configured":
        return createGraphQLError("Analytics public URL is not configured", { extensions: { code: "INTERNAL_SERVER_ERROR" } });
      default:
        break;
    }
  }
  return createGraphQLError("Internal server error", { extensions: { code: "INTERNAL_SERVER_ERROR" } });
}

async function mapServiceError<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw mapAnalyticsError(error);
  }
}

export const analyticsResolvers = {
  Query: {
    analytics: () => ({}),
  },
  AnalyticsQuery: {
    sites: async (_parent: unknown, _args: Record<string, never>, context: GraphQLContext) => {
      const sites = await mapServiceError(() => getAnalyticsSites(getOwnerId(context.user)));
      return sites.map(toGraphQLSite);
    },
    installation: async (_parent: unknown, args: { siteId: number }, context: GraphQLContext) =>
      mapServiceError(() => getAnalyticsInstallationForSite(args.siteId, { id: context.user.id, role: context.user.role })),
    dashboard: async (
      _parent: unknown,
      args: { siteId: number; range: "DAYS_7" | "DAYS_30" | "DAYS_90"; timezone: string },
      context: GraphQLContext,
    ): Promise<AnalyticsDashboardReport> => {
      const days = rangeDays(args.range);
      return mapServiceError(() => getAnalyticsDashboardForSite(
        args.siteId,
        { id: context.user.id, role: context.user.role },
        args.timezone,
        days,
      ));
    },
    portfolio: async (
      _parent: unknown,
      args: { range: "DAYS_7" | "DAYS_30" | "DAYS_90"; timezone: string },
      context: GraphQLContext,
    ): Promise<AnalyticsPortfolioReport> => mapServiceError(() => getAnalyticsPortfolio(
      { id: context.user.id, role: context.user.role },
      args.timezone,
      rangeDays(args.range),
    )),
    globalDashboard: async (
      _parent: unknown,
      args: { range: "DAYS_7" | "DAYS_30" | "DAYS_90"; timezone: string },
      context: GraphQLContext,
    ): Promise<AnalyticsGlobalDashboardReport> => mapServiceError(() => getAnalyticsGlobalDashboard(
      { id: context.user.id, role: context.user.role },
      args.timezone,
      rangeDays(args.range),
    )),
  },
};
