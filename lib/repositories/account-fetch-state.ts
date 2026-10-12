// @ts-nocheck — lightweight wrapper, types are loose
/* eslint-disable @typescript-eslint/no-explicit-any */
import { eq } from "drizzle-orm";
import { getDb, getPgPool } from "../db/connection";
import { accountFetchState } from "@/db/schema";
import { isMockMode } from "../config";

export async function getAccountFetchState(accountId: number) {
  if (isMockMode()) return [];
  try {
    const db = getDb();
    const rows = await db.select().from(accountFetchState).where(eq(accountFetchState.accountId, accountId));
    return rows.map((r: any) => ({ level: r.level, lastFetchedAt: r.lastFetchedAt, nextRetryAt: r.nextRetryAt, failureCount: r.failureCount ?? 0 }));
  } catch {
    try {
      const pool = getPgPool();
      if (!pool) return [];
      const { rows } = await pool.query("SELECT level, last_fetched_at, next_retry_at, failure_count FROM account_fetch_state WHERE account_id = $1", [accountId]);
      return rows.map((r: any) => ({ level: r.level, lastFetchedAt: r.last_fetched_at, nextRetryAt: r.next_retry_at, failureCount: r.failure_count ?? 0 }));
    } catch { return []; }
  }
}

export async function upsertAccountFetchState(accountId: number, level: string, iso: string) {
  if (isMockMode()) return;
  try {
    const db = getDb();
    await db.insert(accountFetchState).values({ accountId, level, lastFetchedAt: iso, nextDueAt: iso }).onConflictDoUpdate({
      target: [accountFetchState.accountId, accountFetchState.level],
      set: { lastFetchedAt: iso, nextDueAt: iso, failureCount: 0, nextRetryAt: null, lastErrorKind: null },
    });
  } catch {
    try {
      const pool = getPgPool();
      if (!pool) return;
      await pool.query(
        "INSERT INTO account_fetch_state (account_id, level, last_fetched_at, next_due_at, failure_count, next_retry_at, last_error_kind) VALUES ($1,$2,$3,$3,0,NULL,NULL) ON CONFLICT (account_id, level) DO UPDATE SET last_fetched_at = EXCLUDED.last_fetched_at, next_due_at=EXCLUDED.next_due_at, failure_count=0, next_retry_at=NULL, last_error_kind=NULL",
        [accountId, level, iso]
      );
    } catch { /* table may not exist before migration */ }
  }
}

export async function recordAccountFetchFailure(accountId: number, level: string, errorMessage: string, priorFailureCount = 0) {
  if (isMockMode()) return;
  const kind = /401|unauthorized|credential/i.test(errorMessage) ? "auth" : /429|rate.?limit/i.test(errorMessage) ? "rate_limit" : /404|not.?found/i.test(errorMessage) ? "not_found" : "transient";
  const retryHours = [1, 2, 4, 8, 24][Math.min(4, Math.max(0, priorFailureCount))];
  try {
    const pool = getPgPool();
    if (!pool) return;
    await pool.query(`INSERT INTO account_fetch_state (account_id,level,failure_count,next_retry_at,last_error_kind)
      VALUES ($1,$2,1,$3,$4) ON CONFLICT(account_id,level) DO UPDATE SET
      failure_count=account_fetch_state.failure_count+1,next_retry_at=$3,last_error_kind=$4`,
      [accountId, level, new Date(Date.now() + retryHours * 60 * 60_000).toISOString(), kind]);
  } catch { /* bootstrap upgrades apply before scheduling starts */ }
}

export async function getPlatformLastFetchFinishedAt(platform: string): Promise<string | null> {
  try {
    const pool = getPgPool();
    if (!pool) return null;
    const { rows } = await pool.query(`SELECT MAX(COALESCE(fr.finished_at, fr.started_at)) AS fetched_at
      FROM fetch_runs fr JOIN accounts a ON a.id=fr.account_id
      WHERE a.platform=$1`, [platform]);
    return rows[0]?.fetched_at ?? null;
  } catch { return null; }
}
