import { createGraphQLError } from "graphql-yoga";
import { getOwnerId } from "@/lib/auth-helpers";
import { getAccounts, getVisibleAccountDetails } from "@/lib/services/accounts";
import type { GraphQLContext } from "./context";

export const accountsTypeDefs = /* GraphQL */ `
  extend type Query { accounts: AccountsQuery! }
  type AccountsQuery {
    list(platform: AccountPlatform): [AccountMetadata!]!
    detail(id: Int!): AccountDetail!
  }
  enum AccountPlatform { TWITTER GITHUB GITLAB REDDIT }
  type AccountMetadata {
    id: Int!, screen_name: String!, platform: String!, user_id: String
    fetch_interval: Int!, is_active: Int!, last_fetched_at: String
    error_message: String, instance_url: String, auth_type: String
    created_at: String!, updated_at: String!
  }
  type AccountDetail {
    id: Int!, screen_name: String!, platform: String!, user_id: String
    fetch_interval: Int!, is_active: Int!, last_fetched_at: String
    error_message: String, instance_url: String, auth_type: String
    created_at: String!, updated_at: String!, stats: AccountStats
    recentFetchRuns: [AccountFetchRun!]!
  }
  type AccountStats { followers_count: Int!, following_count: Int!, tweet_count: Int! }
  type AccountFetchRun {
    id: Int!, trigger: String!, status: String!, started_at: String!
    finished_at: String, duration_ms: Int, error_message: String
    capability_gaps: [AccountCapabilityGap!]!
  }
  type AccountCapabilityGap { capability: String!, message: String }
`;

const platformMap = { TWITTER: "twitter", GITHUB: "github", GITLAB: "gitlab", REDDIT: "reddit" } as const;

export const accountsResolvers = {
  Query: { accounts: () => ({}) },
  AccountsQuery: {
    list: async (_parent: unknown, args: { platform?: keyof typeof platformMap }, context: GraphQLContext) => {
      const rows = await getAccounts(getOwnerId(context.user));
      return args.platform ? rows.filter((row) => row.platform === platformMap[args.platform!]) : rows;
    },
    detail: async (_parent: unknown, args: { id: number }, context: GraphQLContext) => {
      try {
        const detail = await getVisibleAccountDetails(args.id, context.user);
        if (!detail) throw createGraphQLError("Not found", { extensions: { code: "NOT_FOUND" } });
        return detail;
      } catch (error) {
        if (error instanceof Error && error.name === "AccountForbiddenError") {
          throw createGraphQLError("Forbidden", { extensions: { code: "FORBIDDEN" } });
        }
        throw error;
      }
    },
  },
};
