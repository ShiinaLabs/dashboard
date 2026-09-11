import { pgTable, text, integer, serial, bigint, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { accounts } from "./accounts";

export const github_stats = pgTable("github_stats", {
  id: serial("id").primaryKey(),
  account_id: integer("account_id").notNull().references(() => accounts.id),
  public_repos: integer("public_repos").notNull(),
  public_gists: integer("public_gists").default(0),
  followers: integer("followers").notNull(),
  following: integer("following").notNull(),
  recorded_at: text("recorded_at").notNull().default(sql`NOW()`),
});

export const github_repos = pgTable("github_repos", {
  id: serial("id").primaryKey(),
  account_id: integer("account_id").notNull().references(() => accounts.id),
  repo_id: integer("repo_id").notNull(),
  // Additive identity fields. repo_id/account_id remain during the migration
  // so old readers and historical rows remain valid.
  github_id: bigint("github_id", { mode: "number" }),
  node_id: text("node_id"),
  instance: text("instance").notNull().default("github.com"),
  owner_github_id: bigint("owner_github_id", { mode: "number" }),
  owner_node_id: text("owner_node_id"),
  owner_login: text("owner_login"),
  owner_type: text("owner_type"),
  html_url: text("html_url"),
  is_private: integer("is_private").default(0),
  is_archived: integer("is_archived").default(0),
  default_branch: text("default_branch"),
  name: text("name").notNull(),
  full_name: text("full_name").notNull(),
  description: text("description"),
  language: text("language"),
  stars: integer("stars").default(0),
  forks: integer("forks").default(0),
  open_issues: integer("open_issues").default(0),
  open_issues_only: integer("open_issues_only"),
  open_pull_requests: integer("open_pull_requests"),
  topics: text("topics").default("[]"),
  homepage: text("homepage"),
  is_fork: integer("is_fork").default(0),
  pinned: integer("pinned").default(0),
  created_at: text("created_at"),
  updated_at: text("updated_at"),
  pushed_at: text("pushed_at"),
  fetched_at: text("fetched_at").notNull().default(sql`NOW()`),
}, (table) => ({
  identity: index("idx_github_repos_instance_github_id").on(table.instance, table.github_id),
  node: index("idx_github_repos_instance_node_id").on(table.instance, table.node_id),
}));

export const github_contributions = pgTable("github_contributions", {
  id: serial("id").primaryKey(),
  account_id: integer("account_id").notNull().references(() => accounts.id),
  date: text("date").notNull(),
  count: integer("count").default(0),
  level: integer("level").default(0),
  fetched_at: text("fetched_at").notNull().default(sql`NOW()`),
});

export const github_repo_snapshots = pgTable("github_repo_snapshots", {
  id: serial("id").primaryKey(),
  account_id: integer("account_id").notNull().references(() => accounts.id),
  repo_id: integer("repo_id").notNull(),
  repository_id: integer("repository_id").references(() => github_repos.id),
  stars: integer("stars").notNull(),
  forks: integer("forks").default(0),
  open_issues: integer("open_issues").default(0),
  open_issues_only: integer("open_issues_only"),
  open_pull_requests: integer("open_pull_requests"),
  snapshot_date: text("snapshot_date").notNull(),
});

export const github_traffic_clones = pgTable("github_traffic_clones", {
  id: serial("id").primaryKey(),
  account_id: integer("account_id").notNull().references(() => accounts.id),
  repo_id: integer("repo_id").notNull(),
  repository_id: integer("repository_id").references(() => github_repos.id),
  date: text("date").notNull(),
  count: integer("count").default(0),
  uniques: integer("uniques").default(0),
});

export const github_traffic_views = pgTable("github_traffic_views", {
  id: serial("id").primaryKey(),
  account_id: integer("account_id").notNull().references(() => accounts.id),
  repo_id: integer("repo_id").notNull(),
  repository_id: integer("repository_id").references(() => github_repos.id),
  date: text("date").notNull(),
  count: integer("count").default(0),
  uniques: integer("uniques").default(0),
});

export const github_referrers = pgTable("github_referrers", {
  id: serial("id").primaryKey(),
  account_id: integer("account_id").notNull().references(() => accounts.id),
  repo_id: integer("repo_id").notNull(),
  repository_id: integer("repository_id").references(() => github_repos.id),
  referrer: text("referrer").notNull(),
  count: integer("count").default(0),
  uniques: integer("uniques").default(0),
  snapshot_date: text("snapshot_date").notNull().default(sql`CURRENT_DATE`),
});

export const github_paths = pgTable("github_paths", {
  id: serial("id").primaryKey(),
  account_id: integer("account_id").notNull().references(() => accounts.id),
  repo_id: integer("repo_id").notNull(),
  repository_id: integer("repository_id").references(() => github_repos.id),
  path: text("path").notNull(),
  title: text("title"),
  count: integer("count").default(0),
  uniques: integer("uniques").default(0),
  snapshot_date: text("snapshot_date").notNull().default(sql`CURRENT_DATE`),
});

export const github_releases = pgTable("github_releases", {
  id: serial("id").primaryKey(),
  account_id: integer("account_id").notNull().references(() => accounts.id),
  repo_id: integer("repo_id").notNull(),
  repository_id: integer("repository_id").references(() => github_repos.id),
  release_id: integer("release_id").notNull(),
  tag_name: text("tag_name"),
  name: text("name"),
  body: text("body"),
  prerelease: integer("prerelease").default(0),
  published_at: text("published_at"),
  html_url: text("html_url"),
  total_downloads: integer("total_downloads").default(0),
  fetched_at: text("fetched_at").notNull().default(sql`NOW()`),
});

export const github_release_assets = pgTable("github_release_assets", {
  id: serial("id").primaryKey(),
  release_id: integer("release_id").notNull().references(() => github_releases.id),
  name: text("name").notNull(),
  download_count: integer("download_count").default(0),
  size: integer("size").default(0),
  content_type: text("content_type"),
  browser_download_url: text("browser_download_url"),
});

export const github_release_asset_snapshots = pgTable("github_release_asset_snapshots", {
  id: serial("id").primaryKey(),
  account_id: integer("account_id").notNull().references(() => accounts.id),
  repo_id: integer("repo_id").notNull(),
  repository_id: integer("repository_id").references(() => github_repos.id),
  release_id: integer("release_id").notNull().references(() => github_releases.id),
  asset_name: text("asset_name").notNull(),
  download_count: integer("download_count").default(0),
  snapshot_date: text("snapshot_date").notNull(),
  recorded_at: text("recorded_at").notNull().default(sql`NOW()`),
});
