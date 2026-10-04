import { graphqlRequest } from "../graphql";
import type { AccountWithStats, TimelineData, Tweet } from "@/shared/types";

export type XDetailTweet = Pick<Tweet, "id" | "full_text" | "created_at" | "favorite_count" | "retweet_count" | "reply_count" | "view_count">;

export interface XAccountPage {
  account: AccountWithStats;
  timeline: TimelineData;
  content: { data: XDetailTweet[]; total: number; page: number; limit: number; totalPages: number };
}

const xAccountPageQuery = /* GraphQL */ `
  query XAccountPage($accountId: Int!, $days: Int!, $kind: XContentKind!) {
    x {
      accountPage(accountId: $accountId, days: $days, kind: $kind) {
        account {
          id screen_name platform user_id instance_url fetch_interval is_active last_fetched_at error_message auth_type created_at updated_at
          stats { followers_count following_count tweet_count }
          recentFetchRuns { id trigger status started_at finished_at duration_ms error_message capability_gaps { capability message } }
        }
        timeline {
          dailyTweets { date tweets_count total_likes total_retweets total_replies total_views }
          followerGrowth { date followers_count following_count tweet_count }
        }
        content {
          data { id full_text created_at favorite_count retweet_count reply_count view_count }
          total page limit totalPages
        }
      }
    }
  }
`;

export async function getXAccountPageQuery(variables: { accountId: number; days: number; kind: "TWEETS" | "REPLIES" }, signal?: AbortSignal) {
  const result = await graphqlRequest<{ x: { accountPage: XAccountPage } }, typeof variables>(xAccountPageQuery, variables, signal);
  return result.x.accountPage;
}
