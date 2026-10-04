import { createGraphQLError } from "graphql-yoga";
import { getGitlabAccountPage, getGitlabProjectPage, getRedditAccountPage, PlatformDashboardError } from "@/lib/services/platform-dashboards";
import type { GraphQLContext } from "./context";

export const platformDashboardTypeDefs = /* GraphQL */ `
  extend type Query { gitlab: GitlabQuery!, reddit: RedditQuery! }
  type GitlabQuery { accountPage(accountId: Int!): GitlabAccountPage!, projectPage(accountId: Int!, projectId: Int!, days: Int! = 30): GitlabProjectPage! }
  type GitlabAccountPage { account: AccountDetail!, overview: GitlabOverview!, contributions: [GitlabContribution!]! }
  type GitlabOverview { stats: GitlabStats, projects: [GitlabProject!]!, allProjects: [GitlabPinProject!]!, totalStars: Int!, totalForks: Int!, totalProjects: Int!, languages: [GitlabLanguage!]! }
  type GitlabPinProject { id: Int!, project_id: Int!, name: String!, path_with_namespace: String!, language: String, pinned: Int! }
  type GitlabStats { public_projects: Int, followers: Int, following: Int }
  type GitlabProject { id: Int!, account_id: Int!, project_id: Int!, name: String!, path_with_namespace: String!, description: String, language: String, stars: Int!, forks: Int!, open_issues: Int!, topics: String!, homepage: String, is_fork: Int!, pinned: Int!, visibility: String!, created_at: String!, updated_at: String!, last_activity_at: String! }
  type GitlabContribution { date: String!, count: Int! }
  type GitlabLanguage { language: String!, count: Int! }
  type GitlabProjectPage { account: AccountDetail!, project: GitlabProject!, snapshots: [GitlabProjectSnapshot!]!, releases: [GitlabProjectRelease!]! }
  type GitlabProjectSnapshot { stars: Int!, forks: Int!, open_issues: Int!, date: String! }
  type GitlabProjectRelease { id: Int!, account_id: Int!, project_id: Int!, release_tag: String!, name: String, description: String, released_at: String, created_at: String, fetched_at: String! }
  type RedditQuery { accountPage(accountId: Int!, days: Int! = 30): RedditAccountPage! }
  type RedditAccountPage { account: AccountDetail!, overview: RedditOverview!, posts: RedditPostPage!, comments: RedditCommentPage!, timeline: [RedditKarmaDay!]!, activity: RedditActivity!, subreddits: [RedditSubreddit!]! }
  type RedditOverview { stats: RedditStats, totalPosts: Int!, totalComments: Int!, totalScore: Int!, topPosts: [RedditTopPost!]! }
  type RedditStats { post_karma: Int!, comment_karma: Int! }
  type RedditTopPost { id: String!, title: String!, subreddit: String!, score: Int!, num_comments: Int!, upvote_ratio: Float!, permalink: String!, created_utc: Int! }
  type RedditPostPage { data: [RedditPost!]!, total: Int!, page: Int!, limit: Int!, totalPages: Int! }
  type RedditPost { id: String!, title: String!, selftext: String!, subreddit: String!, score: Int!, upvote_ratio: Float!, num_comments: Int!, permalink: String!, url: String!, is_self: Int!, created_utc: Int! }
  type RedditCommentPage { data: [RedditComment!]!, total: Int!, page: Int!, limit: Int!, totalPages: Int! }
  type RedditComment { id: String!, body: String!, subreddit: String!, score: Int!, link_id: String!, parent_id: String, depth: Int!, permalink: String!, created_utc: Int!, is_submitter: Int! }
  type RedditKarmaDay { date: String!, post_karma: Int!, comment_karma: Int! }
  type RedditActivity { posts: [RedditActivityDay!]!, comments: [RedditActivityDay!]! }
  type RedditActivityDay { date: String!, count: Int! }
  type RedditSubreddit { subreddit: String!, count: Int! }
`;

function mapError(error: unknown): never {
  if (error instanceof PlatformDashboardError) {
    const code = error.code === "forbidden" ? "FORBIDDEN" : "NOT_FOUND";
    throw createGraphQLError(error.code === "forbidden" ? "Forbidden" : "Not found", { extensions: { code } });
  }
  throw error;
}
async function safely<T>(fn: () => Promise<T>): Promise<T> { try { return await fn(); } catch (error) { return mapError(error); } }

export const platformDashboardResolvers = {
  Query: { gitlab: () => ({}), reddit: () => ({}) },
  GitlabQuery: {
    accountPage: (_: unknown, args: { accountId: number }, ctx: GraphQLContext) => safely(() => getGitlabAccountPage(ctx.user, args.accountId)),
    projectPage: (_: unknown, args: { accountId: number; projectId: number; days: number }, ctx: GraphQLContext) => safely(() => getGitlabProjectPage(ctx.user, args.accountId, args.projectId, args.days)),
  },
  RedditQuery: { accountPage: (_: unknown, args: { accountId: number; days: number }, ctx: GraphQLContext) => safely(() => getRedditAccountPage(ctx.user, args.accountId, args.days)) },
};
