import { useState, type CSSProperties } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, Text } from "@mantine/core";
import {
  Activity, GitFork, Layers, MessageSquare,
  Star, TrendingUp,
} from "lucide-react";
import { api } from "@/lib/api";
import type { PulseContentItem } from "@/shared/types";
import { HighlightCard } from "@/components/domain/shared/OverviewCards";
import { MetricCard, MetricCardSkeleton } from "@/components/domain/shared/MetricCard";
import { MetricGrid } from "@/components/domain/shared/MetricGrid";
import { SectionShell } from "@/components/domain/shared/SectionShell";
import { TimeRangeSelector } from "@/components/TimeRangeSelector";
import { ChartCardSkeleton } from "@/components/Skeleton";
import { GithubIcon, GitlabIcon, RedditIcon, XIcon } from "@/components/BrandIcons";

const TIME_OPTIONS = [
  { value: 7, labelKey: "timeRange.7d" },
  { value: 30, labelKey: "timeRange.30d" },
  { value: 90, labelKey: "timeRange.90d" },
];

function signed(value: number) {
  return `${value > 0 ? "+" : ""}${value.toLocaleString()}`;
}

function deltaDescription(current: number, previous: number) {
  return `${previous.toLocaleString()} → ${current.toLocaleString()}`;
}

function PlatformIcon({ platform }: { platform: string }) {
  if (platform === "twitter") return <XIcon />;
  if (platform === "github") return <GithubIcon />;
  if (platform === "gitlab") return <GitlabIcon />;
  return <RedditIcon />;
}

function ContentRow({ item, labels }: { item: PulseContentItem; labels: { metric: string; secondary?: string } }) {
  return (
    <a href={item.url} target="_blank" rel="noopener noreferrer" className="block rounded-md p-2 transition-colors hover:bg-[var(--muted)] active:bg-[var(--border)]/50">
      <div className="flex items-start justify-between gap-3">
        <p className="line-clamp-2 min-h-10 min-w-0 text-sm leading-5">{item.title}</p>
        <span className="shrink-0 text-sm font-semibold tabular-nums">{item.metricValue.toLocaleString()}</span>
      </div>
      <div className="mt-1 flex min-w-0 items-center justify-between gap-3 text-[11px] leading-4 text-[var(--muted-foreground)]">
        <span className="min-w-0 truncate">{item.subtitle || `@${item.accountName}`}</span>
        <span className="shrink-0 whitespace-nowrap">
          {labels.metric}
          {labels.secondary && <> · {labels.secondary}: {item.secondaryValue.toLocaleString()}</>}
        </span>
      </div>
    </a>
  );
}

export function PulseSection() {
  const { t } = useTranslation();
  const [days, setDays] = useState(7);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["pulse", days],
    queryFn: () => api.getPulse(days),
    refetchInterval: 3 * 60_000,
  });

  return (
    <SectionShell
      icon={<Activity size={16} />}
      title={t("overview.pulse.heading")}
      action={<TimeRangeSelector value={days} onChange={setDays} options={TIME_OPTIONS} />}
    >
      {isLoading ? (
        <div className="space-y-2">
          <MetricGrid>
            {Array.from({ length: 4 }).map((_, index) => <MetricCardSkeleton density="compact" key={index} />)}
          </MetricGrid>
          <ChartCardSkeleton />
        </div>
      ) : isError || !data ? (
        <Card withBorder radius="md" p={{ base: "md", sm: "lg" }} style={{ background: "var(--card)" }}>
          <Text size="sm" c="dimmed">{t("overview.pulse.unavailable")}</Text>
        </Card>
      ) : data.platforms.length === 0 ? (
        <Card withBorder radius="md" p={{ base: "md", sm: "lg" }} style={{ background: "var(--card)" }}>
          <Text size="sm" c="dimmed">{t("overview.pulse.noData")}</Text>
        </Card>
      ) : (
        <>
          <MetricGrid>
            <MetricCard
              density="compact"
              icon={<Layers size={16} />}
              label={t("overview.pulse.activePlatforms")}
              value={data.platforms.length}
              hint={t("overview.pulse.rangeDays", { count: data.range.days })}
            />
            <MetricCard
              density="compact"
              icon={<Activity size={16} />}
              label={t("overview.pulse.activity")}
              value={data.totals.activity.change}
              valuePrefix={data.totals.activity.change > 0 ? "+" : undefined}
              hint={deltaDescription(data.totals.activity.previous, data.totals.activity.current)}
              tone={data.totals.activity.change < 0 ? "danger" : data.totals.activity.change > 0 ? "success" : "primary"}
            />
            <MetricCard
              density="compact"
              icon={<Star size={16} />}
              label={t("overview.pulse.stars")}
              value={data.totals.traction.stars.change}
              valuePrefix={data.totals.traction.stars.change > 0 ? "+" : undefined}
              hint={deltaDescription(data.totals.traction.stars.previous, data.totals.traction.stars.current)}
              tone={data.totals.traction.stars.change < 0 ? "danger" : data.totals.traction.stars.change > 0 ? "success" : "primary"}
            />
            <MetricCard
              density="compact"
              icon={<GitFork size={16} />}
              label={t("overview.pulse.forks")}
              value={data.totals.traction.forks.change}
              valuePrefix={data.totals.traction.forks.change > 0 ? "+" : undefined}
              hint={deltaDescription(data.totals.traction.forks.previous, data.totals.traction.forks.current)}
              tone={data.totals.traction.forks.change < 0 ? "danger" : data.totals.traction.forks.change > 0 ? "success" : "primary"}
            />
          </MetricGrid>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {data.platforms.map((platform) => (
              <Card
                key={platform.platform}
                withBorder
                radius="md"
                p="md"
                className="flex flex-col justify-center"
                style={{ background: "var(--card)", color: "var(--card-foreground)" }}
              >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
                      <PlatformIcon platform={platform.platform} />
                      <span className="truncate">{t(`nav.${platform.platform === "twitter" ? "x" : platform.platform}`)}</span>
                    </span>
                    <span className={`text-sm font-semibold tabular-nums ${
                      platform.audience.change > 0
                        ? "text-[var(--success)]"
                        : platform.audience.change < 0
                          ? "text-[var(--danger)]"
                          : "text-[var(--muted-foreground)]"
                    }`}>
                      {signed(platform.audience.change)}
                    </span>
                  </div>
                  <p className="mt-2 truncate text-[11px] leading-4 text-[var(--muted-foreground)]">
                    {platform.audienceMetric === "karma"
                      ? t("overview.pulse.karma")
                      : t("overview.pulse.followers")}
                    {" · "}
                    {t("overview.pulse.activityShort", { count: platform.activity.current })}
                  </p>
              </Card>
            ))}
          </div>

          <div
            className="overview-highlight-grid"
            style={{ "--highlight-columns": Math.min(
            (data.content.tweets.length > 0 ? 1 : 0) +
            (data.content.redditPosts.length > 0 || data.content.redditComments.length > 0 ? 1 : 0) +
            (data.repositories.length > 0 ? 1 : 0),
            3
          ) } as CSSProperties}
          >
            {data.content.tweets.length > 0 && (
              <HighlightCard title={t("overview.pulse.topTweets")} icon={<MessageSquare size={16} />}>
                {data.content.tweets.map((item) => (
                  <ContentRow
                    key={item.id}
                    item={item}
                    labels={{
                      metric: t("overview.pulse.likes"),
                      secondary: t("overview.pulse.engagement"),
                    }}
                  />
                ))}
              </HighlightCard>
            )}

            {(data.content.redditPosts.length > 0 || data.content.redditComments.length > 0) && (
              <HighlightCard title={t("overview.pulse.topReddit")} icon={<TrendingUp size={16} />}>
                {[...data.content.redditPosts, ...data.content.redditComments].slice(0, 5).map((item) => (
                  <ContentRow
                    key={`${item.kind}-${item.id}`}
                    item={item}
                    labels={{
                      metric: t("overview.pulse.score"),
                      secondary: item.kind === "reddit_post" ? t("overview.pulse.comments") : undefined,
                    }}
                  />
                ))}
              </HighlightCard>
            )}

            {data.repositories.length > 0 && (
              <HighlightCard title={t("overview.pulse.projectMovers")} icon={<Star size={16} />}>
                {data.repositories.map((item) => (
                  <Link key={item.id} to={item.route} className="block rounded-md p-2 transition-colors hover:bg-[var(--muted)] active:bg-[var(--border)]/50">
                    <div className="flex items-start justify-between gap-3">
                      <p className="line-clamp-2 min-h-10 min-w-0 text-sm font-medium leading-5">{item.name}</p>
                      <span className={`shrink-0 text-sm font-semibold tabular-nums ${item.starChange >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>
                        {signed(item.starChange)}
                      </span>
                    </div>
                    <div className="mt-1 flex min-w-0 items-center justify-between gap-3 text-[11px] leading-4 text-[var(--muted-foreground)]">
                      <span className="min-w-0 truncate">{item.fullName}</span>
                      <span className="shrink-0 whitespace-nowrap">{t("overview.stats.totalStars")}: {item.stars.toLocaleString()}</span>
                    </div>
                  </Link>
                ))}
              </HighlightCard>
            )}
          </div>
        </>
      )}
    </SectionShell>
  );
}
