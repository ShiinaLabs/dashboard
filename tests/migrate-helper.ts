import type { Pool } from "pg";

// Same SQL statements as db/migrate.ts
const SCHEMA = [
  {
    table: "users",
    sql: `CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user', created_at TEXT NOT NULL DEFAULT NOW(), deleted_at TEXT
    )`,
  },
    {
      table: "accounts",
    sql: `CREATE TABLE IF NOT EXISTS accounts (
      id SERIAL PRIMARY KEY, owner_id INTEGER NOT NULL REFERENCES users(id),
      screen_name TEXT NOT NULL, platform TEXT NOT NULL DEFAULT 'twitter', user_id TEXT,
      auth_token TEXT NOT NULL, fetch_interval INTEGER DEFAULT 30, is_active INTEGER DEFAULT 1,
      last_fetched_at TEXT, error_message TEXT, instance_url TEXT, auth_type TEXT,
      created_at TEXT NOT NULL DEFAULT NOW(), updated_at TEXT NOT NULL DEFAULT NOW(), deleted_at TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_screen_name_platform ON accounts(owner_id, screen_name, platform)`,
  },
  {
    table: "settings",
    sql: `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  },
  {
    table: "user_stats",
    sql: `CREATE TABLE IF NOT EXISTS user_stats (
      id SERIAL PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id),
      followers_count INTEGER NOT NULL, following_count INTEGER NOT NULL, tweet_count INTEGER NOT NULL,
      listed_count INTEGER DEFAULT 0, recorded_at TEXT NOT NULL DEFAULT NOW()
    )`,
    },
    {
      table: "fetch_runs",
      sql: `CREATE TABLE IF NOT EXISTS fetch_runs (
        id SERIAL PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id),
        trigger TEXT NOT NULL DEFAULT 'manual', status TEXT NOT NULL DEFAULT 'running',
        started_at TEXT NOT NULL DEFAULT NOW(), finished_at TEXT, duration_ms INTEGER,
        error_message TEXT, capability_gaps TEXT NOT NULL DEFAULT '[]'
      );
      CREATE INDEX IF NOT EXISTS idx_fetch_runs_account_started ON fetch_runs(account_id, started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_fetch_runs_status ON fetch_runs(status)`,
    },
  {
    table: "tweets",
    sql: `CREATE TABLE IF NOT EXISTS tweets (
      id TEXT PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id),
      full_text TEXT NOT NULL, created_at TEXT NOT NULL, favorite_count INTEGER DEFAULT 0,
      retweet_count INTEGER DEFAULT 0, reply_count INTEGER DEFAULT 0, view_count INTEGER DEFAULT 0,
      bookmark_count INTEGER DEFAULT 0, is_quote INTEGER DEFAULT 0, is_reply INTEGER DEFAULT 0,
      is_retweet INTEGER DEFAULT 0, media_urls TEXT DEFAULT '[]', urls TEXT DEFAULT '[]',
      hashtags TEXT DEFAULT '[]', mentions TEXT DEFAULT '[]', lang TEXT DEFAULT '',
      fetched_at TEXT NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_tweets_created_at ON tweets(created_at);
    CREATE INDEX IF NOT EXISTS idx_tweets_account_id ON tweets(account_id)`,
  },
  {
    table: "github_stats",
    sql: `CREATE TABLE IF NOT EXISTS github_stats (
      id SERIAL PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id),
      public_repos INTEGER NOT NULL, public_gists INTEGER DEFAULT 0, followers INTEGER NOT NULL,
      following INTEGER NOT NULL, recorded_at TEXT NOT NULL DEFAULT NOW()
    )`,
  },
  {
    table: "github_repos",
    sql: `CREATE TABLE IF NOT EXISTS github_repos (
      id SERIAL PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id),
      repo_id INTEGER NOT NULL, github_id BIGINT, node_id TEXT,
      instance TEXT NOT NULL DEFAULT 'github.com', owner_github_id BIGINT,
      owner_node_id TEXT, owner_login TEXT, owner_type TEXT, html_url TEXT,
      is_private INTEGER DEFAULT 0, is_archived INTEGER DEFAULT 0, default_branch TEXT,
      name TEXT NOT NULL, full_name TEXT NOT NULL, description TEXT,
      language TEXT, stars INTEGER DEFAULT 0, forks INTEGER DEFAULT 0, open_issues INTEGER DEFAULT 0,
      open_issues_only INTEGER, open_pull_requests INTEGER,
      topics TEXT DEFAULT '[]', homepage TEXT, is_fork INTEGER DEFAULT 0, pinned INTEGER DEFAULT 0,
      created_at TEXT, updated_at TEXT, pushed_at TEXT, fetched_at TEXT NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_github_repos_uniq ON github_repos(account_id, repo_id);
    CREATE INDEX IF NOT EXISTS idx_github_repos_instance_github_id ON github_repos(instance, github_id);
    CREATE INDEX IF NOT EXISTS idx_github_repos_instance_node_id ON github_repos(instance, node_id)`,
  },
  {
    table: "github_sources",
    sql: `CREATE TABLE IF NOT EXISTS github_sources (
      id SERIAL PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id),
      source_type TEXT NOT NULL, login TEXT NOT NULL, github_id BIGINT, node_id TEXT,
      enabled INTEGER NOT NULL DEFAULT 1, last_discovered_at TEXT, last_success_at TEXT,
      last_error TEXT, created_at TEXT NOT NULL DEFAULT NOW(), updated_at TEXT NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_github_sources_account_type_login ON github_sources(account_id, source_type, login);
    CREATE INDEX IF NOT EXISTS idx_github_sources_account_enabled ON github_sources(account_id, enabled)`,
  },
  {
    table: "github_repository_tracking",
    sql: `CREATE TABLE IF NOT EXISTS github_repository_tracking (
      id SERIAL PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id),
      repository_id INTEGER NOT NULL REFERENCES github_repos(id), enabled INTEGER NOT NULL DEFAULT 1,
      pinned INTEGER NOT NULL DEFAULT 0, first_seen_at TEXT NOT NULL DEFAULT NOW(),
      last_seen_at TEXT, last_synced_at TEXT, last_access_ok_at TEXT, last_error TEXT,
      created_at TEXT NOT NULL DEFAULT NOW(), updated_at TEXT NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_github_tracking_account_repository ON github_repository_tracking(account_id, repository_id);
    CREATE INDEX IF NOT EXISTS idx_github_tracking_account_enabled ON github_repository_tracking(account_id, enabled);
    CREATE INDEX IF NOT EXISTS idx_github_tracking_repository ON github_repository_tracking(repository_id)`,
  },
  {
    table: "github_contributions",
    sql: `CREATE TABLE IF NOT EXISTS github_contributions (
      id SERIAL PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id),
      date TEXT NOT NULL, count INTEGER DEFAULT 0, level INTEGER DEFAULT 0, fetched_at TEXT NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_github_contributions_uniq ON github_contributions(account_id, date)`,
  },
  {
    table: "github_repo_snapshots",
    sql: `CREATE TABLE IF NOT EXISTS github_repo_snapshots (
      id SERIAL PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id),
      repo_id INTEGER NOT NULL, repository_id INTEGER REFERENCES github_repos(id), stars INTEGER NOT NULL, forks INTEGER DEFAULT 0,
      open_issues INTEGER DEFAULT 0, open_issues_only INTEGER, open_pull_requests INTEGER,
      snapshot_date TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_github_repo_snapshots_uniq ON github_repo_snapshots(account_id, repo_id, snapshot_date);
    CREATE INDEX IF NOT EXISTS idx_github_repo_snapshots_repository_id ON github_repo_snapshots(repository_id)`,
  },
  {
    table: "github_traffic_clones",
    sql: `CREATE TABLE IF NOT EXISTS github_traffic_clones (
      id SERIAL PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id),
      repo_id INTEGER NOT NULL, repository_id INTEGER REFERENCES github_repos(id), date TEXT NOT NULL, count INTEGER DEFAULT 0, uniques INTEGER DEFAULT 0
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_github_traffic_clones_uniq ON github_traffic_clones(account_id, repo_id, date);
    CREATE INDEX IF NOT EXISTS idx_github_traffic_clones_repository_id ON github_traffic_clones(repository_id)`,
  },
  {
    table: "github_traffic_views",
    sql: `CREATE TABLE IF NOT EXISTS github_traffic_views (
      id SERIAL PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id),
      repo_id INTEGER NOT NULL, repository_id INTEGER REFERENCES github_repos(id), date TEXT NOT NULL, count INTEGER DEFAULT 0, uniques INTEGER DEFAULT 0
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_github_traffic_views_uniq ON github_traffic_views(account_id, repo_id, date);
    CREATE INDEX IF NOT EXISTS idx_github_traffic_views_repository_id ON github_traffic_views(repository_id)`,
  },
  {
    table: "github_referrers",
    sql: `CREATE TABLE IF NOT EXISTS github_referrers (
      id SERIAL PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id),
      repo_id INTEGER NOT NULL, repository_id INTEGER REFERENCES github_repos(id), referrer TEXT NOT NULL, count INTEGER DEFAULT 0,
      uniques INTEGER DEFAULT 0, snapshot_date TEXT NOT NULL DEFAULT CURRENT_DATE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_github_referrers_uniq ON github_referrers(account_id, repo_id, referrer, snapshot_date);
    CREATE INDEX IF NOT EXISTS idx_github_referrers_repository_id ON github_referrers(repository_id)`,
  },
  {
    table: "github_paths",
    sql: `CREATE TABLE IF NOT EXISTS github_paths (
      id SERIAL PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id),
      repo_id INTEGER NOT NULL, repository_id INTEGER REFERENCES github_repos(id), path TEXT NOT NULL, title TEXT, count INTEGER DEFAULT 0,
      uniques INTEGER DEFAULT 0, snapshot_date TEXT NOT NULL DEFAULT CURRENT_DATE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_github_paths_uniq ON github_paths(account_id, repo_id, path, snapshot_date);
    CREATE INDEX IF NOT EXISTS idx_github_paths_repository_id ON github_paths(repository_id)`,
  },
  {
    table: "github_releases",
    sql: `CREATE TABLE IF NOT EXISTS github_releases (
      id SERIAL PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id),
      repo_id INTEGER NOT NULL, repository_id INTEGER REFERENCES github_repos(id), release_id INTEGER NOT NULL, tag_name TEXT, name TEXT,
      body TEXT, prerelease INTEGER DEFAULT 0, published_at TEXT, html_url TEXT,
      total_downloads INTEGER DEFAULT 0, fetched_at TEXT NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_github_releases_uniq ON github_releases(account_id, repo_id, release_id);
    CREATE INDEX IF NOT EXISTS idx_github_releases_repository_id ON github_releases(repository_id)`,
  },
  {
    table: "github_release_asset_snapshots",
    sql: `CREATE TABLE IF NOT EXISTS github_release_asset_snapshots (
      id SERIAL PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id),
      repo_id INTEGER NOT NULL, repository_id INTEGER REFERENCES github_repos(id), release_id INTEGER NOT NULL REFERENCES github_releases(id),
      asset_name TEXT NOT NULL, download_count INTEGER DEFAULT 0,
      snapshot_date TEXT NOT NULL, recorded_at TEXT NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_github_release_asset_snapshots_uniq
      ON github_release_asset_snapshots(release_id, asset_name, snapshot_date);
    CREATE INDEX IF NOT EXISTS idx_github_release_asset_snapshots_repository_id ON github_release_asset_snapshots(repository_id)`,
  },
  {
    table: "github_release_assets",
    sql: `CREATE TABLE IF NOT EXISTS github_release_assets (
      id SERIAL PRIMARY KEY, release_id INTEGER NOT NULL REFERENCES github_releases(id),
      name TEXT NOT NULL, download_count INTEGER DEFAULT 0, size INTEGER DEFAULT 0,
      content_type TEXT, browser_download_url TEXT
    )`,
  },
  {
    table: "gitlab_stats",
    sql: `CREATE TABLE IF NOT EXISTS gitlab_stats (
      id SERIAL PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id),
      public_projects INTEGER DEFAULT 0, followers INTEGER NOT NULL, following INTEGER NOT NULL,
      recorded_at TEXT NOT NULL DEFAULT NOW()
    )`,
  },
  {
    table: "gitlab_projects",
    sql: `CREATE TABLE IF NOT EXISTS gitlab_projects (
      id SERIAL PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id),
      project_id INTEGER NOT NULL, name TEXT NOT NULL, path_with_namespace TEXT NOT NULL,
      description TEXT, language TEXT, stars INTEGER DEFAULT 0, forks INTEGER DEFAULT 0,
      open_issues INTEGER DEFAULT 0,
      topics TEXT DEFAULT '[]', homepage TEXT, is_fork INTEGER DEFAULT 0,
      pinned INTEGER DEFAULT 0, visibility TEXT DEFAULT 'public', created_at TEXT, updated_at TEXT,
      last_activity_at TEXT, fetched_at TEXT NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_gitlab_projects_uniq ON gitlab_projects(account_id, project_id)`,
  },
  {
    table: "gitlab_project_snapshots",
    sql: `CREATE TABLE IF NOT EXISTS gitlab_project_snapshots (
      id SERIAL PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id),
      project_id INTEGER NOT NULL, stars INTEGER NOT NULL, forks INTEGER DEFAULT 0,
      open_issues INTEGER DEFAULT 0,
      snapshot_date TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_gitlab_project_snapshots_uniq ON gitlab_project_snapshots(account_id, project_id, snapshot_date)`,
  },
  {
    table: "gitlab_releases",
    sql: `CREATE TABLE IF NOT EXISTS gitlab_releases (
      id SERIAL PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id),
      project_id INTEGER NOT NULL, release_tag TEXT NOT NULL, name TEXT, description TEXT,
      released_at TEXT, created_at TEXT, fetched_at TEXT NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_gitlab_releases_uniq ON gitlab_releases(account_id, project_id, release_tag)`,
  },
  {
    table: "gitlab_release_assets",
    sql: `CREATE TABLE IF NOT EXISTS gitlab_release_assets (
      id SERIAL PRIMARY KEY, release_id INTEGER NOT NULL REFERENCES gitlab_releases(id),
      name TEXT NOT NULL, download_count INTEGER DEFAULT 0, size INTEGER DEFAULT 0,
      file_type TEXT, url TEXT
    )`,
  },
  {
    table: "gitlab_contributions",
    sql: `CREATE TABLE IF NOT EXISTS gitlab_contributions (
      id SERIAL PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id),
      date TEXT NOT NULL, count INTEGER DEFAULT 0, fetched_at TEXT NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_gitlab_contributions_uniq ON gitlab_contributions(account_id, date)`,
  },
  {
    table: "reddit_stats",
    sql: `CREATE TABLE IF NOT EXISTS reddit_stats (
      id SERIAL PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id),
      post_karma INTEGER NOT NULL, comment_karma INTEGER NOT NULL, recorded_at TEXT NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_reddit_stats_account_id ON reddit_stats(account_id)`,
  },
  {
    table: "reddit_posts",
    sql: `CREATE TABLE IF NOT EXISTS reddit_posts (
      id TEXT PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id),
      title TEXT NOT NULL, selftext TEXT NOT NULL DEFAULT '', subreddit TEXT NOT NULL,
      score INTEGER DEFAULT 0, upvote_ratio DOUBLE PRECISION DEFAULT 0,
      num_comments INTEGER DEFAULT 0, permalink TEXT NOT NULL, url TEXT DEFAULT '',
      is_self INTEGER DEFAULT 0, created_utc INTEGER NOT NULL, fetched_at TEXT NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_reddit_posts_account_id ON reddit_posts(account_id);
    CREATE INDEX IF NOT EXISTS idx_reddit_posts_created_utc ON reddit_posts(created_utc)`,
  },
  {
    table: "reddit_comments",
    sql: `CREATE TABLE IF NOT EXISTS reddit_comments (
      id TEXT PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id),
      body TEXT NOT NULL, subreddit TEXT NOT NULL, score INTEGER DEFAULT 0,
      link_id TEXT NOT NULL, parent_id TEXT, depth INTEGER DEFAULT 0,
      permalink TEXT NOT NULL, created_utc INTEGER NOT NULL, is_submitter INTEGER DEFAULT 0,
      fetched_at TEXT NOT NULL DEFAULT NOW()
    );
      CREATE INDEX IF NOT EXISTS idx_reddit_comments_account_id ON reddit_comments(account_id)`,
  },
  {
    table: "ai_quota",
    sql: `CREATE TABLE IF NOT EXISTS ai_quota (
      user_id INTEGER PRIMARY KEY REFERENCES users(id),
      tokens INTEGER NOT NULL DEFAULT 0,
      period_date TEXT NOT NULL DEFAULT CURRENT_DATE
    )`,
  },
];

export async function createMissingTables(pool: Pool) {
  for (const { sql } of SCHEMA) {
    await pool.query(sql);
  }
}
