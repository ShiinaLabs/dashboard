import { useTranslation } from "react-i18next";
import { Card, Text } from "@mantine/core";
import { type OverviewStats, type TimelineData, type Tweet, type Account } from "@/lib/api";
import { MetricCard } from "@/components/domain/shared/MetricCard";
import { MetricGrid } from "@/components/domain/shared/MetricGrid";
import { SectionShell } from "@/components/domain/shared/SectionShell";
import { XIcon } from "@/components/BrandIcons";
import { MessageSquare, Heart, Repeat2, Eye, TrendingUp } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts";
import { useIsMobile } from "@/lib/client/useIsMobile";
import { calcYAxisWidth } from "@/lib/client/utils";

interface Props {
  stats: OverviewStats | undefined;
  timeline: TimelineData | undefined;
  topLiked: Tweet[] | undefined;
  xAccounts: Account[];
}

export function XSection({ stats, timeline, topLiked, xAccounts }: Props) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const CHART_H = isMobile ? 140 : 160;

  if (xAccounts.length === 0) return null;

  return (
    <SectionShell icon={<XIcon />} title={t("overview.xHeading")}>

      <MetricGrid columns="five">
        <MetricCard label={t("overview.stats.tweetCount")} value={stats?.tweet_count ?? 0} icon={<MessageSquare size={16} />} hint={stats ? t("overview.stats.today", { count: stats.todayTweets }) : undefined} />
        <MetricCard label={t("overview.stats.tweetLikes")} value={stats?.tweet_likes ?? 0} icon={<Heart size={16} />} />
        <MetricCard label={t("overview.stats.tweetRetweets")} value={stats?.tweet_retweets ?? 0} icon={<Repeat2 size={16} />} />
        <MetricCard label={t("overview.stats.tweetViews")} value={stats?.tweet_views ?? 0} icon={<Eye size={16} />} />
        <MetricCard label={t("overview.stats.followers")} value={stats?.followersCount ?? 0} icon={<TrendingUp size={16} />} hint={stats ? t("overview.stats.following", { count: stats.followingCount }) : undefined} />
      </MetricGrid>
      <MetricGrid>
        <MetricCard label={t("overview.stats.replyCount")} value={stats?.reply_count ?? 0} icon={<MessageSquare size={16} />} />
        <MetricCard label={t("overview.stats.replyLikes")} value={stats?.reply_likes ?? 0} icon={<Heart size={16} />} />
        <MetricCard label={t("overview.stats.replyRetweets")} value={stats?.reply_retweets ?? 0} icon={<Repeat2 size={16} />} />
        <MetricCard label={t("overview.stats.replyViews")} value={stats?.reply_views ?? 0} icon={<Eye size={16} />} />
      </MetricGrid>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card withBorder radius="md" p={0} style={{ background: "var(--card)", color: "var(--card-foreground)" }}>
          <div className="overview-chart-title"><Text size="xs" fw={600} c="dimmed">{t("overview.charts.tweetActivity")}</Text></div>
          <div className="overview-chart-body">
            {timeline?.dailyTweets && timeline.dailyTweets.length > 0 ? (
              <div role="img" aria-label={t("overview.charts.tweetActivity")}>
              <ResponsiveContainer width="100%" height={CHART_H}>
                <BarChart data={timeline.dailyTweets}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickFormatter={(v: string) => v.slice(5)} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} width={calcYAxisWidth(timeline!.dailyTweets, "tweets_count")} />
                  <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "6px", fontSize: "12px" }} />
                  <Bar dataKey="tweets_count" fill="var(--primary)" radius={[3, 3, 0, 0]} name={t("overview.charts.tweetsCount")} />
                </BarChart>
              </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex items-center justify-center text-xs text-[var(--muted-foreground)]" style={{ height: CHART_H }}>{t("overview.charts.noTweetData")}</div>
            )}
          </div>
        </Card>
        <Card withBorder radius="md" p={0} style={{ background: "var(--card)", color: "var(--card-foreground)" }}>
          <div className="overview-chart-title"><Text size="xs" fw={600} c="dimmed">{t("overview.charts.dailyEngagement")}</Text></div>
          <div className="overview-chart-body">
            {timeline?.dailyTweets && timeline.dailyTweets.length > 0 ? (
              <div role="img" aria-label={t("overview.charts.dailyEngagement")}>
              <ResponsiveContainer width="100%" height={CHART_H}>
                <AreaChart data={timeline.dailyTweets}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickFormatter={(v: string) => v.slice(5)} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} width={calcYAxisWidth(timeline!.dailyTweets, "total_likes", "total_retweets")} />
                  <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "6px", fontSize: "12px" }} />
                  <Area type="monotone" dataKey="total_likes" stroke="var(--chart-5)" fill="color-mix(in oklch, var(--chart-5) 12%, transparent)" name={t("overview.charts.likes")} />
                  <Area type="monotone" dataKey="total_retweets" stroke="var(--chart-1)" fill="color-mix(in oklch, var(--chart-1) 12%, transparent)" name={t("overview.charts.retweets")} />
                </AreaChart>
              </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex items-center justify-center text-xs text-[var(--muted-foreground)]" style={{ height: CHART_H }}>{t("overview.charts.noEngagementData")}</div>
            )}
          </div>
        </Card>
      </div>
      <div className="grid grid-cols-1 gap-3">
        <Card withBorder radius="md" p={0} style={{ background: "var(--card)", color: "var(--card-foreground)" }}>
          <div className="overview-chart-title"><Text size="xs" fw={600} c="dimmed">{t("overview.charts.dailyViews")}</Text></div>
          <div className="overview-chart-body">
            {timeline?.dailyTweets && timeline.dailyTweets.length > 0 ? (
              <div role="img" aria-label={t("overview.charts.dailyViews")}>
              <ResponsiveContainer width="100%" height={CHART_H}>
                <AreaChart data={timeline.dailyTweets}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickFormatter={(v: string) => v.slice(5)} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} width={calcYAxisWidth(timeline!.dailyTweets, "total_views")} />
                  <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "6px", fontSize: "12px" }} />
                  <Area type="monotone" dataKey="total_views" stroke="var(--chart-2)" fill="color-mix(in oklch, var(--chart-2) 12%, transparent)" name={t("overview.charts.views")} />
                </AreaChart>
              </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex items-center justify-center text-xs text-[var(--muted-foreground)]" style={{ height: CHART_H }}>{t("overview.charts.noTweetData")}</div>
            )}
          </div>
        </Card>
      </div>

      {topLiked && topLiked.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium text-[var(--muted-foreground)]">{t("overview.charts.topLiked")}</p>
          {topLiked.slice(0, 3).map((tweet) => (
            <div key={tweet.id} className="flex items-start gap-2 px-2.5 py-1.5 rounded-md bg-[var(--muted)] text-xs transition-colors hover:bg-[var(--border)]/50">
              <Heart size={12} className="text-[var(--chart-5)] mt-0.5 shrink-0" />
              <span className="line-clamp-1 flex-1">{tweet.full_text}</span>
              <span className="text-[var(--muted-foreground)] shrink-0">{tweet.favorite_count.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </SectionShell>
  );
}
