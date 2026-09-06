import { useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, Table, Text } from "@mantine/core";
import { BarChart3, TrendingUp } from "lucide-react";
import { api } from "@/lib/api";
import { SectionShell } from "@/components/domain/shared/SectionShell";
import type { TopContentItem } from "@/shared/types";
import { TimeRangeSelector } from "@/components/TimeRangeSelector";
import { ChartCardSkeleton } from "@/components/Skeleton";
import { GithubIcon, GitlabIcon, RedditIcon, XIcon } from "@/components/BrandIcons";

const TIME_OPTIONS = [
  { value: 7, labelKey: "timeRange.7d" },
  { value: 30, labelKey: "timeRange.30d" },
  { value: 90, labelKey: "timeRange.90d" },
];

function PlatformIcon({ platform }: { platform: string }) {
  if (platform === "twitter") return <XIcon />;
  if (platform === "github") return <GithubIcon />;
  if (platform === "gitlab") return <GitlabIcon />;
  return <RedditIcon />;
}

export function TopContentSection() {
  const { t } = useTranslation();
  const [days, setDays] = useState(7);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["top-content", days],
    queryFn: () => api.getTopContent(days),
    refetchInterval: 3 * 60_000,
  });

  const items = data?.items ?? [];

  return (
    <SectionShell icon={<BarChart3 size={16} />} title={t("overview.topContent.heading")} action={<TimeRangeSelector value={days} onChange={setDays} options={TIME_OPTIONS} />}>

      {isLoading ? (
        <ChartCardSkeleton />
      ) : isError || !data ? (
        <Card withBorder radius="md" p={{ base: "md", sm: "lg" }} style={{ background: "var(--card)" }}>
          <Text size="sm" c="dimmed">{t("overview.topContent.unavailable")}</Text>
        </Card>
      ) : items.length === 0 ? (
        <Card withBorder radius="md" p={{ base: "md", sm: "lg" }} style={{ background: "var(--card)" }}>
          <Text size="sm" c="dimmed">{t("overview.topContent.noData")}</Text>
        </Card>
      ) : (
        <Card
          withBorder
          radius="md"
          p={0}
          style={{ background: "var(--card)", color: "var(--card-foreground)" }}
        >
          <Table.ScrollContainer minWidth={680}>
            <Table highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
              <Table.Thead>
                <Table.Tr className="text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">
                  <Table.Th className="w-full font-medium">{t("overview.topContent.colContent")}</Table.Th>
                  <Table.Th className="whitespace-nowrap font-medium">{t("overview.topContent.colPlatform")}</Table.Th>
                  <Table.Th className="whitespace-nowrap text-right font-medium">{t("overview.topContent.colMetric")}</Table.Th>
                  <Table.Th className="whitespace-nowrap text-right font-medium">{t("overview.topContent.colGrowth")}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {items.slice(0, 15).map((item) => (
                  <TopContentRow key={item.id} item={item} />
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Card>
      )}
    </SectionShell>
  );
}

function TopContentRow({ item }: { item: TopContentItem }) {
  const { t } = useTranslation();
  const metricLabel = t(`overview.topContent.metric.${item.metricLabel}`);
  const secondaryLabel = item.secondaryLabel
    ? t(`overview.topContent.metric.${item.secondaryLabel}`)
    : null;

  return (
    <Table.Tr className="transition-colors active:bg-[var(--border)]/50">
      <Table.Td style={{ width: "100%" }}>
        <div className="top-content-row">
          <span className="top-content-icon" aria-hidden="true"><PlatformIcon platform={item.platform} /></span>
          <div className="top-content-primary">
            {item.route ? (
              <Link to={item.route} className="block line-clamp-1 text-sm leading-5 hover:underline">{item.title}</Link>
            ) : (
              <p className="line-clamp-1 text-sm leading-5">{item.title}</p>
            )}
            <p className="truncate text-[11px] leading-4 text-[var(--muted-foreground)]">
              {item.subtitle ?? `@${item.accountName}`}
              {secondaryLabel && item.secondaryValue !== null
                ? <> · {secondaryLabel}: {item.secondaryValue.toLocaleString()}</>
                : null}
            </p>
          </div>
        </div>
      </Table.Td>
      <Table.Td className="whitespace-nowrap text-[11px] text-[var(--muted-foreground)]">
        {t(`nav.${item.platform === "twitter" ? "x" : item.platform}`)}
      </Table.Td>
      <Table.Td className="whitespace-nowrap text-right tabular-nums">
        <span className="text-sm font-semibold">{item.metricValue.toLocaleString()}</span>
        {" "}
        <span className="text-[11px] text-[var(--muted-foreground)]">{metricLabel}</span>
      </Table.Td>
      <Table.Td className="whitespace-nowrap text-right tabular-nums">
        {item.growthRate !== null ? (
          <span className={`inline-flex items-center gap-0.5 text-sm font-semibold ${
            item.growthRate > 0
              ? "text-[var(--success)]"
              : item.growthRate < 0
                ? "text-[var(--danger)]"
                : "text-[var(--muted-foreground)]"
          }`}>
            {item.growthRate > 0 && <TrendingUp size={12} />}
            {item.growthRate > 0 ? "+" : ""}{item.growthRate}%
          </span>
        ) : (
          <span className="text-[11px] text-[var(--muted-foreground)]">—</span>
        )}
      </Table.Td>
    </Table.Tr>
  );
}
