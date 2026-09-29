import { createGraphQLError } from "graphql-yoga";
import { getOwnerId } from "@/lib/auth-helpers";
import {
  AnalyticsSiteError,
  getAnalyticsSites,
  getAnalyticsTrafficForSite,
  type AnalyticsSite,
} from "@/lib/services/analytics";
import type { GraphQLContext } from "./context";

export const analyticsTypeDefs = /* GraphQL */ `
  type Query {
    analytics: AnalyticsQuery!
  }

  type AnalyticsQuery {
    sites: [AnalyticsSite!]!
    traffic(siteId: Int!, timezone: String = "UTC"): AnalyticsTraffic!
  }

  type AnalyticsSite {
    id: Int!
    name: String!
    siteKey: String!
    host: String!
    createdAt: String!
    updatedAt: String!
  }

  type AnalyticsPeriod {
    days: Int!
    timezone: String!
  }

  type AnalyticsTrafficOverview {
    views: Int!
    visitors: Int!
    visits: Int!
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

  type AnalyticsReferrerDimension {
    referrer: String!
    views: Int!
  }

  type AnalyticsTrafficDimensions {
    referrers: [AnalyticsReferrerDimension!]!
    countries: [AnalyticsCountryDimension!]!
    browsers: [AnalyticsBrowserDimension!]!
    operatingSystems: [AnalyticsOperatingSystemDimension!]!
    devices: [AnalyticsDeviceDimension!]!
  }

  type AnalyticsTraffic {
    period: AnalyticsPeriod!
    overview: AnalyticsTrafficOverview!
    timeline: [AnalyticsTrafficPoint!]!
    topPages: [AnalyticsTopPage!]!
    dimensions: AnalyticsTrafficDimensions!
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

type AnalyticsTrafficReport = Awaited<ReturnType<typeof getAnalyticsTrafficForSite>>;

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
    traffic: async (
      _parent: unknown,
      args: { siteId: number; timezone: string },
      context: GraphQLContext,
    ): Promise<AnalyticsTrafficReport> => mapServiceError(() => getAnalyticsTrafficForSite(
      args.siteId,
      { id: context.user.id, role: context.user.role },
      args.timezone,
    )),
  },
};
