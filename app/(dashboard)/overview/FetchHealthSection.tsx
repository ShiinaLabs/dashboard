import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  KeyRound,
} from "lucide-react";
import { Card, Text } from "@mantine/core";
import { api } from "@/lib/api";
import { MetricCard, MetricCardSkeleton } from "@/components/domain/shared/MetricCard";
import { MetricGrid } from "@/components/domain/shared/MetricGrid";
import { SectionShell } from "@/components/domain/shared/SectionShell";
import { getPlatformLabelKey } from "@/lib/platforms";

export function FetchHealthSection() {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["fetch-health"],
    queryFn: api.getFetchHealth,
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <SectionShell icon={<CheckCircle2 size={16} />} title={t("overview.health.heading")}>
        <MetricGrid>
          {Array.from({ length: 4 }).map((_, index) => <MetricCardSkeleton key={index} />)}
        </MetricGrid>
      </SectionShell>
    );
  }

  if (isError || !data) {
    return (
      <SectionShell icon={<CheckCircle2 size={16} />} title={t("overview.health.heading")}>
        <Card withBorder radius="lg" p={{ base: "md", sm: "lg" }} style={{ background: "var(--card)" }}>
          <Text size="sm" c="dimmed">
            {t("overview.health.unavailable")}
          </Text>
        </Card>
      </SectionShell>
    );
  }

  const cards = [
    {
      icon: <CheckCircle2 size={16} />,
      label: t("overview.health.healthy"),
      value: data.summary.healthy,
      hint: t("overview.health.activeCount", { count: data.summary.activeAccounts }),
      tone: "success" as const,
    },
    {
      icon: <Clock size={16} />,
      label: t("overview.health.stale"),
      value: data.summary.stale,
      hint: t("overview.health.beyondInterval"),
      tone: "warn" as const,
    },
    {
      icon: <AlertTriangle size={16} />,
      label: t("overview.health.failed"),
      value: data.summary.failed + data.summary.partial,
      hint: t("overview.health.failedHint"),
      tone: "danger" as const,
    },
    {
      icon: <KeyRound size={16} />,
      label: t("overview.health.capabilityGap"),
      value: data.summary.capabilityGap,
      hint: t("overview.health.capabilityHint"),
      tone: "warn" as const,
    },
  ];

  return (
    <SectionShell icon={<CheckCircle2 size={16} />} title={t("overview.health.heading")}>
      <MetricGrid>
        {cards.map((card) => <MetricCard key={card.label} {...card} />)}
      </MetricGrid>

      {data.unsupportedAccounts.length > 0 && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-[var(--warn)]/5 text-[var(--warn)] text-xs">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <p className="min-w-0">
            {t("overview.health.unsupportedAccounts", {
              count: data.unsupportedAccounts.length,
              platforms: data.unsupportedAccounts.map((account) => account.platform).join(" / "),
            })}
          </p>
        </div>
      )}

      {data.issues.length > 0 && (
        <Card
          withBorder
          radius="md"
          p={0}
          className="overview-health-issues"
          style={{ background: "var(--card)", color: "var(--card-foreground)" }}
        >
            <div className="overview-health-issue-list">
              {data.issues.slice(0, 5).map((issue) => (
                <div key={issue.accountId} className="overview-health-issue-row transition-colors hover:bg-[var(--muted)] active:bg-[var(--border)]/50">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-h-5 min-w-0 truncate text-sm leading-5 font-medium">
                      {issue.screenName}
                      {getPlatformLabelKey(issue.platform) && (
                        <span className="ml-2 inline-flex items-center rounded bg-[var(--muted)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--muted-foreground)]">
                          {t(getPlatformLabelKey(issue.platform)!)}
                        </span>
                      )}
                    </p>
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${issue.status === "failed" ? "bg-[var(--danger)]/10 text-[var(--danger)]" : issue.status === "capability_gap" || issue.status === "partial" ? "bg-[var(--warn)]/10 text-[var(--warn)]" : "bg-[var(--muted)] text-[var(--muted-foreground)]"}`}>
                      {t(`overview.health.status.${issue.status}`)}
                    </span>
                  </div>
                  {(issue.latestError || issue.capabilityGaps[0]?.message) && (
                    <p className="mt-1 truncate text-[11px] leading-4 text-[var(--muted-foreground)]">
                      {issue.capabilityGaps[0]?.message || issue.latestError}
                    </p>
                  )}
                </div>
              ))}
            </div>
            {data.issues.length > 5 && (
              <p className="overview-health-more text-[11px] text-[var(--muted-foreground)]">
                {t("overview.health.moreIssues", { count: data.issues.length - 5 })}
              </p>
            )}
        </Card>
      )}
    </SectionShell>
  );
}
