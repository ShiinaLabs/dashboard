import { encrypt, decrypt } from "../crypto";
import * as accountsRepo from "../repositories/accounts";
import { getLogger } from "../logger";
import type { AccountRow } from "../repositories/accounts";
import { isSupportedPlatform } from "../platforms";
import { validateUpstreamUrl } from "../ssrf-guard";
import { getOverviewStats, getLatestUserStats } from "./twitter";
import { getRecentFetchRuns } from "./fetch-health";

export type AccountMetadata = Omit<AccountRow, "auth_token">;
export type { AccountRow };

export class InvalidAccountInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidAccountInputError";
  }
}

function toMetadata({ auth_token: _authToken, ...account }: AccountRow): AccountMetadata {
  return account;
}

function encToken(plain: string): string {
  try { return encrypt(plain); } catch (e) {
    getLogger().error("Service", "encToken: encryption failed: %s", e instanceof Error ? e.message : String(e));
    throw new Error("Encryption unavailable — cannot store credentials securely", { cause: e });
  }
}

function decToken(cipher: string): string {
  try { return decrypt(cipher); } catch (e) {
    getLogger().warn("Service", "decToken: decryption failed (ENCRYPTION_KEY may have changed): %s", e instanceof Error ? e.message : String(e));
    throw new Error("Stored credential cannot be decrypted; check ENCRYPTION_KEY", { cause: e });
  }
}

/**
 * Validate a user-supplied instance URL before it is stored (or used for a
 * server-side request). Only GitLab accounts currently use instance_url, but
 * we guard any non-null value defensively here so a future platform cannot
 * bypass SSRF checks.
 */
export function assertSafeInstanceUrl(instanceUrl: string | null | undefined): void {
  if (!instanceUrl) return;
  const result = validateUpstreamUrl(instanceUrl);
  if (!result.ok) {
    throw new Error(`Invalid instance URL: ${result.error ?? "rejected"}`);
  }
}

export async function getAccounts(ownerId?: number) {
  const rows = await accountsRepo.getAccounts(ownerId);
  return rows.map((row) => toMetadata(row as AccountRow));
}

/** Compose the legacy account-list API response without exposing credentials. */
export async function getAccountsOverview(ownerId?: number) {
  const accounts = await getAccounts(ownerId);
  const overview = await getOverviewStats(accounts.map((account) => account.id));
  return { accounts, overview };
}

/** Compose account metadata and its detail panels for the legacy detail API. */
export async function getAccountDetails(id: number) {
  const account = await getAccountById(id);
  if (!account) return undefined;
  const [stats, recentFetchRuns] = await Promise.all([
    getLatestUserStats(account.id),
    getRecentFetchRuns(account.id),
  ]);
  return { ...account, stats: stats || null, recentFetchRuns };
}

export async function getActiveAccounts() {
  const rows = await accountsRepo.getActiveAccounts();
  return rows.map((row) => toMetadata(row as AccountRow));
}

export async function getAccountById(id: number) {
  const row = await accountsRepo.getAccountById(id);
  if (!row) return undefined;
  return toMetadata(row);
}

/**
 * Decrypt a credential only at an execution boundary that needs to call an
 * upstream API. Metadata and authorization paths must use getAccountById()
 * so a single damaged credential cannot lock the account out of the UI.
 */
export async function getAccountByIdWithCredential(id: number): Promise<AccountRow | undefined> {
  const row = await accountsRepo.getAccountById(id);
  if (!row) return undefined;
  return { ...row, auth_token: decToken(row.auth_token) };
}

export async function createAccount(data: {
  screenName: string; authToken: string; fetchInterval: number;
  platform?: string; instanceUrl?: string | null; authType?: string | null;
  ownerId: number;
}) {
  const platform = data.platform ?? "twitter";
  if (!isSupportedPlatform(platform)) {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  const token = encToken(data.authToken);
  const account = await accountsRepo.createAccount({
    owner_id: data.ownerId,
    screen_name: data.screenName,
    auth_token: token,
    fetch_interval: data.fetchInterval,
    platform,
    instance_url: data.instanceUrl ?? null,
    auth_type: data.authType ?? null,
  });
  return { ...account, auth_token: decToken(account.auth_token) } as AccountRow;
}

export async function updateAccount(id: number, updates: Partial<AccountRow>) {
  const safe = { ...updates };
  if (safe.auth_token) safe.auth_token = encToken(safe.auth_token);
  await accountsRepo.updateAccount(id, safe);
}

/** Translate the public account update fields to repository fields. */
export async function updateAccountFromInput(id: number, input: {
  screenName?: string;
  authToken?: string;
  fetchInterval?: number;
  isActive?: boolean;
  instanceUrl?: string | null;
  authType?: string | null;
}) {
  const updates: Partial<AccountRow> = {};
  if (input.screenName !== undefined) updates.screen_name = input.screenName;
  if (input.authToken !== undefined && input.authToken !== "") updates.auth_token = input.authToken;
  if (input.fetchInterval !== undefined) updates.fetch_interval = input.fetchInterval;
  if (input.isActive !== undefined) updates.is_active = input.isActive ? 1 : 0;
  if (input.instanceUrl !== undefined) {
    try {
      assertSafeInstanceUrl(input.instanceUrl);
    } catch (error) {
      throw new InvalidAccountInputError(error instanceof Error ? error.message : String(error));
    }
    updates.instance_url = input.instanceUrl;
  }
  if (input.authType !== undefined) updates.auth_type = input.authType;
  await updateAccount(id, updates);
}

export async function deleteAccount(id: number) {
  await accountsRepo.deleteAccount(id);
}
