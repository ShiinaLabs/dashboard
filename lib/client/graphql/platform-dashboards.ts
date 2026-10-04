import { graphqlRequest } from "../graphql";
import type { AccountWithStats, GitlabContribution, GitlabOverview, RedditOverview, RedditPost, RedditComment } from "@/shared/types";

export interface GitlabAccountPage { account: AccountWithStats; overview: Omit<GitlabOverview, "languages" | "allProjects" | "topProjects"> & { allProjects: { id: number; project_id: number; name: string; path_with_namespace: string; language: string | null; pinned: number }[]; languages: { language: string; count: number }[] }; contributions: GitlabContribution[] }
export interface RedditAccountPage {
  account: AccountWithStats; overview: RedditOverview;
  posts: { data: RedditPost[]; total: number; page: number; limit: number; totalPages: number };
  comments: { data: RedditComment[]; total: number; page: number; limit: number; totalPages: number };
  timeline: { date: string; post_karma: number; comment_karma: number }[];
  activity: { posts: { date: string; count: number }[]; comments: { date: string; count: number }[] };
  subreddits: { subreddit: string; count: number }[];
}

const gitlabQuery = /* GraphQL */ `query GitlabAccountPage($accountId: Int!) { gitlab { accountPage(accountId: $accountId) {
 account { id screen_name platform user_id fetch_interval is_active last_fetched_at error_message instance_url auth_type created_at updated_at stats { followers_count following_count tweet_count } recentFetchRuns { id trigger status started_at finished_at duration_ms error_message capability_gaps { capability message } } }
 overview { stats { public_projects followers following } projects { id account_id project_id name path_with_namespace description language stars forks open_issues topics homepage is_fork pinned visibility created_at updated_at last_activity_at } allProjects { id project_id name path_with_namespace language pinned } totalStars totalForks totalProjects languages { language count } }
 contributions { date count }
} } }`;

export async function getGitlabAccountPage(accountId: number, signal?: AbortSignal) {
 const data = await graphqlRequest<{ gitlab: { accountPage: GitlabAccountPage } }, { accountId: number }>(gitlabQuery, { accountId }, signal); return data.gitlab.accountPage;
}

const gitlabProjectQuery = /* GraphQL */ `query GitlabProjectPage($accountId: Int!, $projectId: Int!, $days: Int!) { gitlab { projectPage(accountId: $accountId, projectId: $projectId, days: $days) {
 account { id screen_name platform user_id fetch_interval is_active last_fetched_at error_message instance_url auth_type created_at updated_at stats { followers_count following_count tweet_count } recentFetchRuns { id trigger status started_at finished_at duration_ms error_message capability_gaps { capability message } } }
 project { id account_id project_id name path_with_namespace description language stars forks open_issues topics homepage is_fork pinned visibility created_at updated_at last_activity_at }
 snapshots { stars forks open_issues date }
 releases { id account_id project_id release_tag name description released_at created_at fetched_at }
} } }`;

export async function getGitlabProjectPage(variables: { accountId: number; projectId: number; days: number }, signal?: AbortSignal) {
 const data = await graphqlRequest<{ gitlab: { projectPage: { account: AccountWithStats; project: import("@/shared/types").GitlabProject; snapshots: { stars: number; forks: number; open_issues: number; date: string }[]; releases: import("@/shared/types").GitlabRelease[] } } }, typeof variables>(gitlabProjectQuery, variables, signal); return data.gitlab.projectPage;
}

const redditQuery = /* GraphQL */ `query RedditAccountPage($accountId: Int!, $days: Int!) { reddit { accountPage(accountId: $accountId, days: $days) {
 account { id screen_name platform user_id fetch_interval is_active last_fetched_at error_message instance_url auth_type created_at updated_at stats { followers_count following_count tweet_count } recentFetchRuns { id trigger status started_at finished_at duration_ms error_message capability_gaps { capability message } }
 }
 overview { stats { post_karma comment_karma } totalPosts totalComments totalScore topPosts { id title subreddit score num_comments upvote_ratio permalink created_utc } }
 posts { data { id title selftext subreddit score upvote_ratio num_comments permalink url is_self created_utc } total page limit totalPages }
 comments { data { id body subreddit score link_id parent_id depth permalink created_utc is_submitter } total page limit totalPages }
 timeline { date post_karma comment_karma } activity { posts { date count } comments { date count } } subreddits { subreddit count }
} } }`;

export async function getRedditAccountPage(accountId: number, days: number, signal?: AbortSignal) {
 const data = await graphqlRequest<{ reddit: { accountPage: RedditAccountPage } }, { accountId: number; days: number }>(redditQuery, { accountId, days }, signal); return data.reddit.accountPage;
}
