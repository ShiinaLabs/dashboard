import { graphqlRequest } from "../graphql";
import type { Account } from "@/shared/types";
import type { FetchRun } from "@/lib/fetch-health";

export interface AccountDetail extends Account {
  stats?: Account["stats"];
  recentFetchRuns: FetchRun[];
}

const accountsListQuery = /* GraphQL */ `
  query AccountsList($platform: AccountPlatform) {
    accounts { list(platform: $platform) {
      id screen_name platform user_id fetch_interval is_active last_fetched_at
      error_message instance_url auth_type created_at updated_at
    } }
  }
`;

const accountDetailQuery = /* GraphQL */ `
  query AccountDetail($id: Int!) {
    accounts { detail(id: $id) {
      id screen_name platform user_id fetch_interval is_active last_fetched_at
      error_message instance_url auth_type created_at updated_at
      stats { followers_count following_count tweet_count }
      recentFetchRuns { id trigger status started_at finished_at duration_ms error_message capability_gaps { capability message } }
    } }
  }
`;

export async function getAccountsList(platform?: "TWITTER" | "GITHUB" | "GITLAB" | "REDDIT", signal?: AbortSignal) {
  const result = await graphqlRequest<{ accounts: { list: Account[] } }, { platform?: typeof platform }>(
    accountsListQuery,
    platform ? { platform } : {},
    signal,
  );
  return result.accounts.list;
}

export async function getAccountDetail(id: number, signal?: AbortSignal) {
  const result = await graphqlRequest<{ accounts: { detail: AccountDetail } }, { id: number }>(
    accountDetailQuery,
    { id },
    signal,
  );
  return result.accounts.detail;
}
