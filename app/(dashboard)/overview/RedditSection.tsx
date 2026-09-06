import { useTranslation } from "react-i18next";
import { Card, Text } from "@mantine/core";
import { MetricCard } from "@/components/domain/shared/MetricCard";
import { MetricGrid } from "@/components/domain/shared/MetricGrid";
import { SectionShell } from "@/components/domain/shared/SectionShell";
import { RedditIcon } from "@/components/BrandIcons";
import { MessageSquare, ThumbsUp } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell,
} from "recharts";
import { useIsMobile } from "@/lib/client/useIsMobile";
import { calcYAxisWidth } from "@/lib/client/utils";

interface SubredditDatum { subreddit: string; count: number }

interface Props {
  postKarma: number;
  commentKarma: number;
  totalPosts: number;
  totalComments: number;
  karmaTimeline: { date: string; post_karma: number; comment_karma: number }[];
  dailyActivity: { date: string; posts: number; comments: number }[];
  mergedSubreddits: SubredditDatum[];
}

export function RedditSection({ postKarma, commentKarma, totalPosts, totalComments, karmaTimeline, dailyActivity, mergedSubreddits }: Props) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const CHART_H = isMobile ? 140 : 160;
  const PIE_H = isMobile ? 160 : 200;
  const PIE_RADIUS = isMobile ? 50 : 70;

  return (
    <SectionShell icon={<RedditIcon />} title={t("overview.redditHeading")}>
      <MetricGrid>
        <MetricCard label={t("overview.stats.postKarma")} value={postKarma} icon={<ThumbsUp size={16} />} />
        <MetricCard label={t("overview.stats.commentKarma")} value={commentKarma} icon={<MessageSquare size={16} />} />
        <MetricCard label={t("overview.stats.redditPosts")} value={totalPosts} icon={<MessageSquare size={16} />} />
        <MetricCard label={t("overview.stats.redditComments")} value={totalComments} icon={<MessageSquare size={16} />} />
      </MetricGrid>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card withBorder radius="md" p={0} style={{ background: "var(--card)", color: "var(--card-foreground)" }}>
          <div className="overview-chart-title"><Text size="xs" fw={600} c="dimmed">{t("overview.charts.redditKarma")}</Text></div>
          <div className="overview-chart-body">
            {karmaTimeline.length > 0 ? (
              <div role="img" aria-label={t("overview.charts.redditKarma")}>
              <div className={`flex flex-wrap gap-x-3 gap-y-0.5 mb-1 ${isMobile ? "text-[11px]" : "text-xs"}`}>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: "var(--chart-4)" }} /><span className="text-[var(--muted-foreground)]">{t("overview.charts.redditPostKarma")}</span></span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: "var(--chart-1)" }} /><span className="text-[var(--muted-foreground)]">{t("overview.charts.redditCommentKarma")}</span></span>
              </div>
              <ResponsiveContainer width="100%" height={CHART_H}>
                <LineChart data={karmaTimeline} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickFormatter={(v: string) => v.slice(5)} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} width={calcYAxisWidth(karmaTimeline, "post_karma", "comment_karma")} />
                  <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "6px", fontSize: "12px" }} />
                  <Line type="monotone" dataKey="post_karma" stroke="var(--chart-4)" name={t("overview.charts.redditPostKarma")} dot={false} />
                  <Line type="monotone" dataKey="comment_karma" stroke="var(--chart-1)" name={t("overview.charts.redditCommentKarma")} dot={false} />
                </LineChart>
              </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex items-center justify-center text-xs text-[var(--muted-foreground)]" style={{ height: CHART_H }}>{t("redditDetail.noData")}</div>
            )}
          </div>
        </Card>

        <Card withBorder radius="md" p={0} style={{ background: "var(--card)", color: "var(--card-foreground)" }}>
          <div className="overview-chart-title"><Text size="xs" fw={600} c="dimmed">{t("overview.charts.redditActivity")}</Text></div>
          <div className="overview-chart-body">
            {dailyActivity.length > 0 ? (
              <div role="img" aria-label={t("overview.charts.redditActivity")}>
              <ResponsiveContainer width="100%" height={CHART_H}>
                <BarChart data={dailyActivity}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickFormatter={(v: string) => v.slice(5)} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} width={calcYAxisWidth(dailyActivity, "posts", "comments")} />
                  <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "6px", fontSize: "12px" }} />
                  <Bar dataKey="posts" fill="var(--primary)" radius={[3, 3, 0, 0]} name={t("overview.stats.redditPosts")} />
                  <Bar dataKey="comments" fill="var(--chart-4)" radius={[3, 3, 0, 0]} name={t("overview.stats.redditComments")} />
                </BarChart>
              </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex items-center justify-center text-xs text-[var(--muted-foreground)]" style={{ height: CHART_H }}>{t("redditDetail.noData")}</div>
            )}
          </div>
        </Card>
      </div>

      {mergedSubreddits.length > 0 && (
        <Card withBorder radius="md" p={0} style={{ background: "var(--card)", color: "var(--card-foreground)" }}>
          <div className="overview-chart-title"><Text size="xs" fw={600} c="dimmed">{t("overview.charts.redditSubreddits")}</Text></div>
          <div className="overview-chart-body">
            <div role="img" aria-label={t("overview.charts.redditSubreddits")}>
            <ResponsiveContainer width="100%" height={PIE_H}>
              <PieChart>
                <Pie data={mergedSubreddits} dataKey="count" nameKey="subreddit" cx="50%" cy="50%" outerRadius={PIE_RADIUS} label={isMobile ? false : (props: { name?: string; value?: number }) => `${props.name ?? ""} (${props.value ?? 0})`} labelLine={isMobile ? false : { stroke: "var(--muted-foreground)", strokeWidth: 0.5 }}>
                  {mergedSubreddits.map((_, i) => (
                    <Cell key={i} fill={`var(--chart-${(i % 5) + 1})`} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "6px", fontSize: "12px" }} />
              </PieChart>
            </ResponsiveContainer>
            </div>
          </div>
        </Card>
      )}
    </SectionShell>
  );
}
