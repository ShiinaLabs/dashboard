import type { XCandidateKind, XSyncCandidate } from "../../repositories/x-sync";

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
export const X_DETAIL_BUDGET = 40;

export function xRefreshIntervalMs(publishedAt: string | null, isPinned: boolean, now = Date.now()): number | null {
  if (!publishedAt) return isPinned ? 7 * DAY : null;
  const age = Math.max(0, now - Date.parse(publishedAt));
  if (age <= DAY) return 90 * 60_000;
  if (age <= 7 * DAY) return 6 * HOUR;
  if (age <= 30 * DAY) return DAY;
  if (age <= 90 * DAY) return 7 * DAY;
  return isPinned ? 7 * DAY : null;
}

export function xRetryDelayMs(failureCount: number): number {
  const hours = [1, 2, 4, 8, 24];
  return hours[Math.min(hours.length - 1, Math.max(0, failureCount))] * HOUR;
}

export function classifyXError(error: unknown): "auth" | "rate_limit" | "not_found" | "network" | "other" {
  const message = error instanceof Error ? error.message : String(error);
  if (/401|unauthorized|authentication/i.test(message)) return "auth";
  if (/429|rate.?limit/i.test(message)) return "rate_limit";
  if (/404|not.?found|deleted/i.test(message)) return "not_found";
  if (/network|fetch failed|timeout|abort|ECONN/i.test(message)) return "network";
  return "other";
}

export function xRetryAfterAt(error: unknown, fallback = Date.now() + 60 * 60_000): Date {
  if (!error || typeof error !== "object") return new Date(fallback);
  const value = error as { retryAfter?: unknown; retryAfterAt?: unknown; headers?: { get?: (name: string) => string | null } | Record<string, string> };
  const absolute = value.retryAfterAt;
  if (typeof absolute === "string" || absolute instanceof Date) {
    const parsed = Date.parse(absolute instanceof Date ? absolute.toISOString() : absolute);
    if (Number.isFinite(parsed) && parsed > Date.now()) return new Date(parsed);
  }
  if (typeof value.retryAfter === "number" && Number.isFinite(value.retryAfter) && value.retryAfter >= 0) {
    return new Date(Date.now() + value.retryAfter * 1000);
  }
  const headers = value.headers as { get?: (name: string) => string | null } | Record<string, string> | undefined;
  const header = headers && typeof (headers as { get?: unknown }).get === "function"
    ? (headers as { get: (name: string) => string | null }).get("retry-after")
    : (headers as Record<string, string> | undefined)?.["retry-after"];
  if (header) {
    const seconds = Number(header);
    const parsed = Number.isFinite(seconds) ? Date.now() + seconds * 1000 : Date.parse(header);
    if (Number.isFinite(parsed) && parsed > Date.now()) return new Date(parsed);
  }
  return new Date(fallback);
}

export function selectXDueCandidates(candidates: XSyncCandidate[], budget = X_DETAIL_BUDGET): XSyncCandidate[] {
  const byKind: Record<XCandidateKind, XSyncCandidate[]> = { new: [], retry: [], due: [] };
  for (const candidate of candidates) byKind[candidate.kind].push(candidate);
  const selected = new Set<XSyncCandidate>();
  const take = (kind: XCandidateKind, max: number) => byKind[kind].slice(0, max).forEach(x => selected.add(x));
  take("new", Math.min(20, budget));
  take("retry", Math.min(10, Math.max(0, budget - selected.size)));
  take("due", Math.min(10, Math.max(0, budget - selected.size)));
  // Give unused slots to old backlog first, then retries and new discoveries.
  for (const kind of ["due", "retry", "new"] as const) {
    for (const candidate of byKind[kind]) {
      if (selected.size >= budget) break;
      selected.add(candidate);
    }
  }
  return [...selected];
}

export function adaptiveXRefreshInterval(base: number, oldTotal: number | null, newTotal: number | null): number {
  if (oldTotal === null || newTotal === null) return base;
  const delta = newTotal - oldTotal;
  const relative = oldTotal === 0 ? (newTotal > 0 ? 1 : 0) : delta / oldTotal;
  return delta >= 5 && relative >= 0.2 ? Math.max(90 * 60_000, base / 2) : base;
}
