import { useTranslation } from "react-i18next";
import type { Account, FetchRun } from "@/shared/types";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { formatDateTime } from "@/lib/client/datetime";

interface FetchRunHistoryProps {
  account: Pick<Account, "fetch_interval" | "last_fetched_at">;
  runs?: FetchRun[];
}

export function FetchRunHistory({ account, runs }: FetchRunHistoryProps) {
  const { t } = useTranslation();
  if (!runs || runs.length === 0) return null;

  const latest = runs[0];
  const referenceAt = latest.started_at || account.last_fetched_at;
  const nextDueAt = referenceAt
    ? new Date(new Date(referenceAt).getTime() + Math.max(1, account.fetch_interval || 30) * 60_000)
    : null;

  return (
    <Card>
      <div className="fetch-history-content">
        <div className="fetch-history-header">
          <p className="text-xs font-semibold leading-4 text-[var(--muted-foreground)]">
            {t("fetchHistory.title")}
          </p>
          <p className="fetch-history-due text-[11px] leading-4 text-[var(--muted-foreground)]">
            {latest.status === "running"
              ? t("fetchHistory.runningNow")
              : t("fetchHistory.nextDue", { date: nextDueAt ? formatDateTime(nextDueAt) : t("fetchHistory.unknown") })}
          </p>
        </div>

        <div className="fetch-history-list">
          {runs.slice(0, 5).map((run) => (
            <div key={run.id} className="fetch-history-row transition-colors hover:bg-[var(--muted)]">
              <div className="flex min-w-0 items-center justify-between gap-3">
                <p className="min-w-0 truncate text-sm leading-5">
                  {formatDateTime(run.started_at)}
                  <span className="ml-2 text-[11px] text-[var(--muted-foreground)]">
                    {run.trigger === "scheduler" ? t("fetchHistory.scheduler") : t("fetchHistory.manual")}
                  </span>
                </p>
                <Badge
                  size="xs"
                  color={
                    run.status === "success"
                      ? "success"
                      : run.status === "failed"
                        ? "danger"
                        : run.status === "partial"
                          ? "warning"
                          : "gray"
                  }
                  variant="light"
                  className="shrink-0"
                >
                  {t(`fetchHistory.status.${run.status}`)}
                </Badge>
              </div>
              {(run.error_message || run.capability_gaps.length > 0) && (
                <div className="mt-1 space-y-0.5">
                  {run.error_message && (
                    <p className="truncate text-[11px] leading-4 text-[var(--danger)]">{run.error_message}</p>
                  )}
                  {run.capability_gaps.map((gap) => (
                    <p key={gap.capability} className="truncate text-[11px] leading-4 text-[var(--muted-foreground)]">
                      {gap.message || gap.capability}
                    </p>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
