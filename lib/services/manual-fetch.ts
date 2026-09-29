import { getAccountByIdWithCredential, updateAccount } from "./accounts";
import { dispatchFetch } from "../fetch-dispatch";

export type ManualFetchResult =
  | { status: "started"; screenName: string }
  | { status: "not-found" }
  | { status: "credential-error" };

/** Activate an account if needed and enqueue its manual fetch. */
export async function startManualFetch(id: number, level?: string): Promise<ManualFetchResult> {
  let account;
  try {
    account = await getAccountByIdWithCredential(id);
  } catch {
    return { status: "credential-error" };
  }
  if (!account) return { status: "not-found" };

  if (!account.is_active) {
    await updateAccount(id, { is_active: 1 });
    account.is_active = 1;
  }

  void dispatchFetch(account, "manual", level).catch((error: unknown) =>
    console.error("Background fetch error:", error instanceof Error ? error.message : String(error)),
  );
  return { status: "started", screenName: account.screen_name };
}
