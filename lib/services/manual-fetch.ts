import { getAccountByIdWithCredential, updateAccount } from "./accounts";
import { dispatchFetch } from "../fetch-dispatch";

export type ManualFetchResult =
  | { status: "started"; screenName: string }
  | { status: "busy" }
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

  let signalStarted!: () => void;
  const started = new Promise<void>(resolve => { signalStarted = resolve; });
  const task = dispatchFetch(account, "manual", level, signalStarted).catch((error: unknown) => {
    console.error("Background fetch error:", error instanceof Error ? error.message : String(error));
    return { status: "failed" as const };
  });
  const outcome = await Promise.race([started.then(() => "started" as const), task.then(() => "finished-before-start" as const)]);
  return outcome === "started" ? { status: "started", screenName: account.screen_name } : { status: "busy" };
}
