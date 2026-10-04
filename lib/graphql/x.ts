import { createGraphQLError } from "graphql-yoga";
import { XDashboardError, getXAccountPage } from "@/lib/services/x-dashboard";
import type { GraphQLContext } from "./context";

export const xTypeDefs = /* GraphQL */ `
  extend type Query { x: XQuery! }
  type XQuery { accountPage(accountId: Int!, days: Int!, kind: XContentKind!): XAccountPage! }
  enum XContentKind { TWEETS REPLIES }
  type XAccountPage { account: XAccount!, timeline: XTimeline!, content: XPaginatedTweets! }
  type XAccount {
    id: Int!, screen_name: String!, platform: String!, user_id: String, instance_url: String
    fetch_interval: Int!, is_active: Int!, last_fetched_at: String, error_message: String, auth_type: String
    created_at: String!, updated_at: String!, stats: XAccountStats, recentFetchRuns: [XFetchRun!]!
  }
  type XAccountStats { followers_count: Int!, following_count: Int!, tweet_count: Int! }
  type XFetchRun { id: Int!, trigger: String!, status: String!, started_at: String!, finished_at: String, duration_ms: Int, error_message: String, capability_gaps: [XCapabilityGap!]! }
  type XCapabilityGap { capability: String!, message: String }
  type XTimeline {
    dailyTweets: [XDailyTweet!]!
    followerGrowth: [XFollowerGrowth!]!
  }
  type XDailyTweet { date: String!, tweets_count: Int!, total_likes: Int!, total_retweets: Int!, total_replies: Int!, total_views: Int! }
  type XFollowerGrowth { date: String!, followers_count: Int!, following_count: Int!, tweet_count: Int! }
  type XTweet { id: String!, account_id: Int!, full_text: String!, created_at: String!, favorite_count: Int!, retweet_count: Int!, reply_count: Int!, view_count: Int!, bookmark_count: Int!, is_quote: Int!, is_reply: Int!, is_retweet: Int!, media_urls: String!, urls: String!, hashtags: String!, mentions: String!, lang: String! }
  type XPaginatedTweets { data: [XTweet!]!, total: Int!, page: Int!, limit: Int!, totalPages: Int! }
`;

export const xResolvers = {
  Query: { x: () => ({}) },
  XQuery: {
    accountPage: async (_parent: unknown, args: { accountId: number; days: number; kind: "TWEETS" | "REPLIES" }, context: GraphQLContext) => {
      try {
        return await getXAccountPage(context.user, args.accountId, args.days, args.kind);
      } catch (error) {
        if (error instanceof XDashboardError) {
          const code = error.code === "forbidden" ? "FORBIDDEN" : error.code === "not_found" ? "NOT_FOUND" : "BAD_USER_INPUT";
          const message = error.code === "forbidden" ? "Forbidden" : error.code === "not_found" ? "Not found" : error.code === "invalid_range" ? "Invalid range" : "Invalid X account";
          throw createGraphQLError(message, { extensions: { code } });
        }
        throw error;
      }
    },
  },
};
