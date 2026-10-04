import { createGraphQLError } from "graphql-yoga";
import { getGithubAccountPage, getGithubRepoPage, getGithubWatchlistManager, GithubDashboardError } from "@/lib/services/github-dashboard";
import type { GraphQLContext } from "./context";

export const githubTypeDefs = /* GraphQL */ `
  extend type Query { github: GithubQuery! }
  type GithubQuery {
    accountPage(accountId: Int!): GithubAccountPage!
    repoPage(accountId: Int!, repoId: Int!, days: Int! = 30, growthDays: Int! = 14): GithubRepoPage!
    watchlistManager(accountId: Int!): GithubWatchlistManager!
  }
  type GithubRepoPage { account: AccountDetail!, repo: GithubPageRepo!, snapshots: [GithubRepoSnapshot!]!, clones: [GithubTrafficPoint!]!, views: [GithubTrafficPoint!]!, referrers: [GithubReferrer!]!, referrerHistory: [GithubReferrer!]!, paths: [GithubPath!]!, pathHistory: [GithubPath!]!, releases: [GithubReleaseSummary!]!, downloadTimeline: [GithubReleaseGrowth!]! }
  type GithubRepoSnapshot { stars: Int!, forks: Int!, open_issues: Int!, open_issues_only: Int, open_pull_requests: Int, date: String! }
  type GithubTrafficPoint { date: String!, count: Int!, uniques: Int! }
  type GithubReferrer { snapshot_date: String!, referrer: String!, count: Int!, uniques: Int! }
  type GithubPath { snapshot_date: String!, path: String!, title: String, count: Int!, uniques: Int! }
  type GithubReleaseSummary { id: Int!, account_id: Int!, repo_id: Int!, release_id: Int!, tag_name: String, name: String, prerelease: Int!, published_at: String, html_url: String, total_downloads: Int!, fetched_at: String!, assets: [GithubReleaseAssetSummary!]! }
  type GithubReleaseAssetSummary { id: Int!, release_id: Int!, name: String!, download_count: Int!, size: Int!, content_type: String }
  type GithubReleaseGrowth { release_id: Int!, tag_name: String, name: String, published_at: String, points: [GithubReleaseGrowthPoint!]! }
  type GithubReleaseGrowthPoint { day: Int!, download_count: Int!, snapshot_date: String!, assets: [GithubAssetDownload!]! }
  type GithubAssetDownload { name: String!, downloadCount: Int! }
  type GithubAccountPage { account: AccountDetail!, overview: GithubAccountOverview!, contributions: [GithubContribution!]! }
  type GithubAccountOverview { stats: GithubStats, repos: [GithubPageRepo!]!, allRepos: [GithubPageRepo!]!, totalStars: Int!, totalForks: Int!, totalRepos: Int!, languages: [GithubLanguage!]! }
  type GithubStats { public_repos: Int, public_gists: Int, followers: Int, following: Int }
  type GithubPageRepo { id: Int!, account_id: Int!, repo_id: Int!, name: String!, full_name: String!, description: String, language: String, stars: Int!, forks: Int!, open_issues: Int!, open_issues_only: Int, open_pull_requests: Int, topics: String, homepage: String, is_fork: Boolean!, pinned: Boolean!, created_at: String }
  type GithubContribution { date: String!, count: Int! }
  type GithubLanguage { language: String!, count: Int! }
  type GithubWatchlistManager { watchlist: GithubWatchlist!, availableOrganizations: [GithubOrganization!]!, unavailable: [String!] }
  type GithubWatchlist { accountId: Int!, sources: [GithubWatchlistSource!]!, candidates: [GithubWatchlistCandidate!]!, warnings: [String!]! }
  type GithubWatchlistSource { login: String!, enabled: Boolean!, lastError: String }
  type GithubWatchlistCandidate { githubId: Int, githubReposId: Int, fullName: String!, ownerLogin: String, ownerType: String, isPrivate: Boolean!, listedFrom: String, watched: Boolean!, lastError: String }
  type GithubOrganization { login: String!, githubId: Int, nodeId: String }
`;

function mapError(error: unknown): never {
  if (error instanceof GithubDashboardError) {
    const code = error.code === "forbidden" ? "FORBIDDEN" : error.code === "credential_error" ? "UPSTREAM_ERROR" : "NOT_FOUND";
    throw createGraphQLError(error.code === "forbidden" ? "Forbidden" : error.code === "credential_error" ? "Could not load GitHub organizations" : "Not found", { extensions: { code } });
  }
  throw error;
}

async function safely<T>(fn: () => Promise<T>): Promise<T> { try { return await fn(); } catch (error) { return mapError(error); } }

export const githubResolvers = {
  Query: { github: () => ({}) },
  GithubQuery: {
    accountPage: (_parent: unknown, args: { accountId: number }, context: GraphQLContext) => safely(() => getGithubAccountPage(context.user, args.accountId)),
    repoPage: (_parent: unknown, args: { accountId: number; repoId: number; days: number; growthDays: number }, context: GraphQLContext) => safely(() => getGithubRepoPage(context.user, args.accountId, args.repoId, args.days, args.growthDays)),
    watchlistManager: (_parent: unknown, args: { accountId: number }, context: GraphQLContext) => safely(() => getGithubWatchlistManager(context.user, args.accountId)),
  },
};
