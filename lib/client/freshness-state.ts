export interface FreshnessTimestamps {
  lastServerCheckAt: number | null;
  lastSuccessfulDataRefreshAt: number | null;
}

export function recordServerCheck(state: FreshnessTimestamps, at: number): FreshnessTimestamps {
  return { lastServerCheckAt: at, lastSuccessfulDataRefreshAt: state.lastSuccessfulDataRefreshAt };
}

export function recordDataRefresh(state: FreshnessTimestamps, at: number): FreshnessTimestamps {
  return { lastServerCheckAt: state.lastServerCheckAt, lastSuccessfulDataRefreshAt: at };
}

export function isResumeGap(previousTickAt: number, now: number): boolean {
  return now - previousTickAt > 90_000;
}
