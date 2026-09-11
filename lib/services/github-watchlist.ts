import { GithubClient } from "../infra/fetchers/GithubClient";
import { PgRepoRepository } from "../infra/drizzle/PgRepoRepository";
import { toRepo } from "../infra/fetchers/GithubMapper";
import {
  listGithubSources,
  listGithubSourceRows,
  setGithubSources,
  markGithubSourceOk,
  markGithubSourceError,
  type GithubSourceRow,
} from "../repositories/github-sources";
import { listGithubWatchlist, setGithubWatchlist } from "../repositories/github-watchlist";
import type { AccountRow } from "../repositories/accounts";
import type { Repo } from "../domain/repo";

/**
 * GitHub logins: up to 39 characters, alphanumerics and single hyphens, and
 * never starting or ending with a hyphen. The lookahead is what enforces the
 * last two rules — without it a trailing or doubled hyphen would pass and only
 * be caught later by a wasted API call.
 */
const LOGIN_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;
/** Keeps the number of listing requests per modal open bounded. */
const MAX_ORGS = 20;

export interface GithubWatchlistCandidate {
  /** Stable GitHub repository id. Null only for a legacy row with no id yet. */
  githubId: number | null;
  /** `github_repos.id` once a local row exists, else null. */
  githubReposId: number | null;
  fullName: string;
  ownerLogin: string | null;
  ownerType: string | null;
  isPrivate: boolean;
  /**
   * Which source listed it: "own" for the account's own repositories, the
   * organization login otherwise. Null means it is not currently listed at all
   * (access lost, or transferred away) and only survives in the watchlist.
   */
  listedFrom: string | null;
  watched: boolean;
  /** Why the repository could not be read last time it was fetched. */
  lastError: string | null;
}

export interface GithubWatchlistPayload {
  accountId: number;
  sources: GithubSourceRow[];
  candidates: GithubWatchlistCandidate[];
  /** Organizations that could not be listed this time, with the reason. */
  warnings: string[];
}

export interface GithubWatchlistInput {
  orgs: string[];
  /** Stable GitHub repository ids the user wants monitored. */
  watched: number[];
}

/**
 * Canonicalize a user-typed organization login: accept a pasted URL or an
 * @-prefixed handle, then enforce GitHub's own login rule. Case is preserved
 * here because the canonical casing comes from the API response instead.
 */
export function normalizeGithubLogin(input: unknown): string | null {
  const raw = typeof input === "string" ? input.trim() : "";
  const stripped = raw
    .replace(/^https?:\/\/(?:www\.)?github\.com\//i, "")
    .replace(/^@/, "")
    .replace(/\/+$/, "");
  return LOGIN_PATTERN.test(stripped) ? stripped : null;
}

interface RawRepo {
  id?: unknown;
  full_name?: unknown;
  private?: unknown;
  owner?: { login?: unknown; type?: unknown };
}

function toCandidate(raw: unknown, listedFrom: string | null): GithubWatchlistCandidate | null {
  const repo = raw as RawRepo | null;
  const githubId = typeof repo?.id === "number" ? repo.id : null;
  const fullName = typeof repo?.full_name === "string" ? repo.full_name : null;
  if (githubId === null || !fullName) return null;
  return {
    githubId,
    githubReposId: null,
    fullName,
    ownerLogin: typeof repo?.owner?.login === "string" ? repo.owner.login : null,
    ownerType: typeof repo?.owner?.type === "string" ? repo.owner.type : null,
    isPrivate: Boolean(repo?.private),
    listedFrom,
    watched: false,
    lastError: null,
  };
}

export class GithubWatchlistService {
  constructor(
    private client: GithubClient = new GithubClient(),
    private repos: PgRepoRepository = new PgRepoRepository(),
  ) {}

  /**
   * Candidates = the account's own repositories, plus every enabled
   * organization's repositories, plus anything already in the watchlist (so a
   * repository that can no longer be listed stays selectable).
   *
   * One unreadable organization must not fail the whole view: it is recorded on
   * the source row and reported in `warnings`.
   */
  async get(account: AccountRow): Promise<GithubWatchlistPayload> {
    const token = account.auth_token;
    const warnings: string[] = [];
    const tracked = await listGithubWatchlist(account.id);
    const trackedByGithubId = new Map<number, (typeof tracked)[number]>();
    for (const row of tracked) {
      if (row.githubId !== null) trackedByGithubId.set(row.githubId, row);
    }

    const listed: GithubWatchlistCandidate[] = [];
    const seen = new Set<number>();
    const add = (raw: unknown, listedFrom: string | null) => {
      const candidate = toCandidate(raw, listedFrom);
      if (!candidate || candidate.githubId === null || seen.has(candidate.githubId)) return;
      seen.add(candidate.githubId);
      const existing = trackedByGithubId.get(candidate.githubId);
      candidate.githubReposId = existing?.githubReposId ?? null;
      candidate.watched = existing?.enabled ?? false;
      candidate.lastError = existing?.lastError ?? null;
      listed.push(candidate);
    };

    try {
      for (const raw of await this.client.fetchOwnedRepos(token)) add(raw, "own");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`own repositories could not be listed: ${message}`);
    }

    for (const source of await listGithubSources(account.id)) {
      try {
        for (const raw of await this.client.fetchOrgRepos(source.login, token)) add(raw, source.login);
        await markGithubSourceOk(account.id, source.login);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`${source.login} could not be listed: ${message}`);
        await markGithubSourceError(account.id, source.login, message);
      }
    }

    // Repositories in the watchlist that no source lists any more must stay
    // visible: they are still monitored, just not discoverable.
    const unavailable: GithubWatchlistCandidate[] = tracked
      .filter((row) => row.githubId !== null && !seen.has(row.githubId))
      .map((row) => ({
        githubId: row.githubId,
        githubReposId: row.githubReposId,
        fullName: row.fullName,
        ownerLogin: row.ownerLogin,
        ownerType: row.ownerType,
        isPrivate: false,
        listedFrom: null,
        watched: row.enabled,
        lastError: row.lastError,
      }));

    return {
      accountId: account.id,
      sources: await listGithubSourceRows(account.id),
      candidates: [...listed, ...unavailable],
      warnings,
    };
  }

  /**
   * Apply the user's selection. Organizations are validated first so a typo is
   * rejected instead of silently doing nothing; repositories that are newly
   * selected are read from GitHub (the client's payload is never trusted for
   * repository metadata), then the watchlist is set exactly.
   */
  async save(account: AccountRow, input: GithubWatchlistInput): Promise<GithubWatchlistPayload & { errors: string[] }> {
    const errors: string[] = [];
    const token = account.auth_token;

    const requested = Array.isArray(input.orgs) ? input.orgs : [];
    if (requested.length > MAX_ORGS) {
      throw new Error(`At most ${MAX_ORGS} organizations can be configured`);
    }
    const logins: string[] = [];
    for (const raw of requested) {
      const login = normalizeGithubLogin(raw);
      if (!login) throw new Error(`Invalid GitHub organization login: ${String(raw).slice(0, 40)}`);
      if (logins.some((seen) => seen.toLowerCase() === login.toLowerCase())) continue;
      const probe = await this.client.probeOrg(login, token);
      if (!probe.ok) {
        throw new Error(`${login}: ${probe.message}`);
      }
      logins.push(probe.login);
      await markGithubSourceOk(account.id, probe.login, { githubId: probe.githubId, nodeId: probe.nodeId });
    }
    await setGithubSources(account.id, logins);

    const tracked = await listGithubWatchlist(account.id);
    const knownGithubIds = new Set(tracked.map((row) => row.githubId).filter((id): id is number => id !== null));
    const wanted = Array.isArray(input.watched) ? input.watched.filter((id) => Number.isInteger(id) && id > 0) : [];

    // Create local rows for repositories selected for the first time. Their
    // tracking relation is created enabled by the existing upsert path.
    for (const githubId of wanted) {
      if (knownGithubIds.has(githubId)) continue;
      try {
        const raw = await this.client.fetchRepositoryById(githubId, token);
        await this.repos.upsertRepos([toRepo(raw as Record<string, unknown>, account.id) as unknown as Repo]);
      } catch (error) {
        errors.push(`${githubId} could not be added: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const refreshed = await listGithubWatchlist(account.id);
    const wantedSet = new Set(wanted);
    const watchedIds = refreshed
      .filter((row) => row.githubId !== null && wantedSet.has(row.githubId))
      .map((row) => row.githubReposId);
    await setGithubWatchlist(account.id, watchedIds);

    return { ...(await this.get(account)), errors };
  }
}
