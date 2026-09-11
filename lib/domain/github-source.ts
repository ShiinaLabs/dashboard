export type GithubSourceKind = "user" | "organization";

/**
 * A PAT-accessible GitHub namespace used for discovery.  This is deliberately
 * separate from repository identity: a source may discover a repository, but
 * it does not own the repository or define its stable identity.
 */
export interface GithubSource {
  kind: GithubSourceKind;
  login: string;
}

export interface GithubTrackedRepository {
  repositoryId: number;
  githubId: number;
  fullName: string;
}
