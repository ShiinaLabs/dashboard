// @ts-nocheck — compatibility repository helpers intentionally accept rows
// from databases that may be one bootstrap step behind.
import { and, asc, eq, notInArray } from "drizzle-orm";
import { getDb } from "../db/connection";
import { github_sources } from "@/db/schema";
import type { GithubSource } from "../domain/github-source";

/** Organizations the account discovers candidates from (enabled ones only). */
export async function listGithubSources(accountId: number): Promise<GithubSource[]> {
  try {
    const rows = await getDb().select({ login: github_sources.login })
      .from(github_sources)
      .where(and(
        eq(github_sources.account_id, accountId),
        eq(github_sources.source_type, "organization"),
        eq(github_sources.enabled, 1),
      ))
      .orderBy(asc(github_sources.id));
    return rows.map((row) => ({ login: row.login }));
  } catch {
    // Pre-bootstrap databases have no github_sources table yet.
    return [];
  }
}

export interface GithubSourceRow {
  login: string;
  enabled: boolean;
  lastError: string | null;
}

/** Every configured organization, including disabled and failing ones. */
export async function listGithubSourceRows(accountId: number): Promise<GithubSourceRow[]> {
  try {
    const rows = await getDb().select({
      login: github_sources.login,
      enabled: github_sources.enabled,
      lastError: github_sources.last_error,
    }).from(github_sources)
      .where(and(
        eq(github_sources.account_id, accountId),
        eq(github_sources.source_type, "organization"),
      ))
      .orderBy(asc(github_sources.id));
    return rows.map((row) => ({
      login: row.login,
      enabled: row.enabled === 1,
      lastError: row.lastError ?? null,
    }));
  } catch {
    return [];
  }
}

/**
 * Make the configured organization set exactly `logins`. Removed organizations
 * are soft-disabled, never deleted, so their identity and last_* history survive
 * a re-add.
 *
 * Tracking relations are untouched on purpose: removing an organization stops
 * future discovery from it, it does NOT stop fetching repositories that are
 * already monitored. The UI must say so.
 */
export async function setGithubSources(accountId: number, logins: string[]): Promise<void> {
  const db = getDb();
  const scope = and(
    eq(github_sources.account_id, accountId),
    eq(github_sources.source_type, "organization"),
  );
  await db.update(github_sources)
    .set({ enabled: 0, updated_at: new Date().toISOString() })
    .where(logins.length > 0 ? and(scope, notInArray(github_sources.login, logins)) : scope);
  for (const login of logins) {
    await upsertGithubSource({ account_id: accountId, source_type: "organization", login });
  }
}

/** Record a successful listing of a source. */
export async function markGithubSourceOk(accountId: number, login: string, identity?: { githubId?: number | null; nodeId?: string | null }) {
  try {
    const set: Record<string, unknown> = {
      last_discovered_at: new Date().toISOString(),
      last_success_at: new Date().toISOString(),
      last_error: null,
      updated_at: new Date().toISOString(),
    };
    if (identity?.githubId !== undefined) set.github_id = identity.githubId;
    if (identity?.nodeId !== undefined) set.node_id = identity.nodeId;
    await getDb().update(github_sources).set(set).where(and(
      eq(github_sources.account_id, accountId),
      eq(github_sources.source_type, "organization"),
      eq(github_sources.login, login),
    ));
  } catch {
    // Keep listing usable while an older process is between schema steps.
  }
}

/**
 * Record that a source could not be listed. One unreadable organization must not
 * fail the whole listing, so the failure is stored per source and surfaced in
 * the picker instead.
 */
export async function markGithubSourceError(accountId: number, login: string, message: string) {
  try {
    await getDb().update(github_sources).set({
      last_discovered_at: new Date().toISOString(),
      last_error: message.slice(0, 1000),
      updated_at: new Date().toISOString(),
    }).where(and(
      eq(github_sources.account_id, accountId),
      eq(github_sources.source_type, "organization"),
      eq(github_sources.login, login),
    ));
  } catch {
    // Keep listing usable while an older process is between schema steps.
  }
}

export async function upsertGithubSource(source: {
  account_id: number;
  source_type: "organization";
  login: string;
  github_id?: number | null;
  node_id?: string | null;
}) {
  // Only touch the identity columns when a value is supplied: re-enabling an
  // existing organization must not wipe the github_id/node_id captured earlier.
  const set: Record<string, unknown> = { enabled: 1, updated_at: new Date().toISOString() };
  if (source.github_id !== undefined) set.github_id = source.github_id;
  if (source.node_id !== undefined) set.node_id = source.node_id;
  await getDb().insert(github_sources).values({
    ...source,
    enabled: 1,
    updated_at: new Date().toISOString(),
  }).onConflictDoUpdate({
    target: [github_sources.account_id, github_sources.source_type, github_sources.login],
    set,
  });
}
