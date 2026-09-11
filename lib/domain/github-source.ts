/**
 * A GitHub organization used for discovery. This is deliberately separate from
 * repository identity: an organization is only somewhere to look for
 * candidates, and it never implies that anything found there is monitored.
 *
 * The account's own repositories are always candidates and are not a source —
 * there is nothing to configure about them.
 */
export interface GithubSource {
  login: string;
}

/** A repository the user explicitly chose to monitor. */
export interface GithubTrackedRepository {
  repositoryId: number;
  githubId: number;
  fullName: string;
}
