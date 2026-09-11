import { Stars, Forks } from "../../domain/repo";
// Maps full GitHub API repo; L0 uses static subset, L1 timely uses stars/forks

export function toRepo(raw: Record<string, unknown>, accountId: number) {
  return {
    accountId,
    repoId: raw.id as number,
    githubId: raw.id as number,
    nodeId: (raw.node_id as string | null) ?? null,
    instance: "github.com",
    ownerGithubId: ((raw.owner as Record<string, unknown> | undefined)?.id as number | undefined) ?? null,
    ownerNodeId: ((raw.owner as Record<string, unknown> | undefined)?.node_id as string | undefined) ?? null,
    ownerLogin: ((raw.owner as Record<string, unknown> | undefined)?.login as string | undefined) ?? null,
    ownerType: ((raw.owner as Record<string, unknown> | undefined)?.type as string | undefined) ?? null,
    htmlUrl: (raw.html_url as string | null) ?? null,
    isPrivate: raw.private ? 1 : 0,
    isArchived: raw.archived ? 1 : 0,
    defaultBranch: (raw.default_branch as string | null) ?? null,
    name: raw.name as string,
    fullName: raw.full_name as string,
    stars: new Stars((raw.stargazers_count as number) ?? 0),
    forks: new Forks((raw.forks_count as number) ?? 0),
    isFork: (raw.fork as boolean) ? 1 : 0,
    language: (raw.language as string | null) ?? null,
    description: (raw.description as string | null) ?? null,
    homepage: (raw.homepage as string | null) ?? null,
    topics: JSON.stringify((raw.topics as unknown[]) ?? []),
    openIssues: (raw.open_issues_count as number) ?? null,
  };
}
