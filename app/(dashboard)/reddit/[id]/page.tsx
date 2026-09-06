import { useQuery, useMutation } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Card, Group, Stack, Text } from "@mantine/core";
import { api, type RedditOverview, type RedditPost, type RedditComment } from "@/lib/api";
import { formatDateTime, formatDate } from "@/lib/client/datetime";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { MetricCard, MetricCardSkeleton } from "@/components/domain/shared/MetricCard";
import { MetricGrid } from "@/components/domain/shared/MetricGrid";
import { ChartCard } from "@/components/domain/shared/ChartCard";
import { TriggerPanel } from "@/components/TriggerPanel";
import { TimeRangeSelector } from "@/components/TimeRangeSelector";
import { calcYAxisWidth } from "@/lib/client/utils";
import { ArrowLeft, ArrowUpRight, Trash2, AlertCircle, ThumbsUp, MessageSquare, TrendingUp, FileText } from "lucide-react";
import { useIsMobile } from "@/lib/client/useIsMobile";
import { RedditIcon } from "@/components/BrandIcons";
import { ChartCardSkeleton, Skeleton } from "@/components/Skeleton";
import { FetchRunHistory } from "@/components/FetchRunHistory";
import { AccountActiveButton } from "@/components/AccountActiveButton";
import { Button } from "@/components/ui";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

export default function RedditDetail() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const accountId = Number(id);
  const [days, setDays] = useState(30);

  const { data: account, isLoading: accountLoading } = useQuery({
    queryKey: ["account", accountId],
    queryFn: () => api.getAccount(accountId),
    enabled: !!accountId,
  });

  const { data: overview, isLoading: overviewLoading } = useQuery<RedditOverview>({
    queryKey: ["reddit", "overview", accountId],
    queryFn: () => api.getRedditOverview(accountId!),
    enabled: !!accountId,
    refetchInterval: 3 * 60_000,
  });

  const { data: postsData } = useQuery({
    queryKey: ["reddit", "posts", accountId, 1],
    queryFn: () => api.getRedditPosts(accountId!, 1, 50, "score"),
    enabled: !!accountId,
  });

  const { data: commentsData } = useQuery({
    queryKey: ["reddit", "comments", accountId, 1],
    queryFn: () => api.getRedditComments(accountId!, 1, 50),
    enabled: !!accountId,
  });

  const { data: timeline } = useQuery({
    queryKey: ["reddit", "timeline", accountId, days],
    queryFn: () => api.getRedditTimeline(accountId!, days),
    enabled: !!accountId,
  });

  const { data: activity } = useQuery({
    queryKey: ["reddit", "activity", accountId, days],
    queryFn: () => api.getRedditActivity(accountId!, days),
    enabled: !!accountId,
  });

  const { data: subreddits } = useQuery({
    queryKey: ["reddit", "subreddits", accountId],
    queryFn: () => api.getRedditSubreddits(accountId!),
    enabled: !!accountId,
  });

  const deleteMutation = useMutation({
    mutationFn: ({ token }: { token: string }) => api.deleteAccount(accountId, token),
    onSuccess: () => navigate("/reddit"),
  });

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);


  const isMobile = useIsMobile();
  const CHART_H = isMobile ? 180 : 250;
  const MARGIN = { top: 5, right: 5, left: 0, bottom: 5 };

  const legendPayload = timeline && timeline.length > 1 ? [
    { value: t("redditDetail.postKarma"), color: "var(--chart-4)" },
    { value: t("redditDetail.commentKarma"), color: "var(--chart-1)" },
  ] : [];

  if (accountLoading) {
    return (
      <div className="space-y-6">
        <div className="detail-header">
          <div className="detail-header-body">
            <Skeleton className="h-11 w-11 rounded-lg shrink-0" />
            <div className="flex-1"><Skeleton className="h-6 w-32 mb-2" /><Skeleton className="h-3 w-48" /></div>
          </div>
        </div>
        <MetricGrid>
          {Array.from({ length: 4 }).map((_, i) => <MetricCardSkeleton key={i} />)}
        </MetricGrid>
        <ChartCardSkeleton />
      </div>
    );
  }

  if (!account) {
    return (
      <div className="text-center py-12">
        <p className="text-[var(--muted-foreground)]">{t("redditDetail.notFound")}</p>
        <Button onClick={() => navigate("/reddit")} variant="subtle" size="sm" mt="md">{t("redditDetail.backToReddit")}</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="detail-header">
        <div className="detail-header-body">
        <Button onClick={() => navigate("/reddit")} variant="subtle" color="gray" size="lg" px="xs" title={t("redditDetail.backToReddit")} aria-label={t("redditDetail.backToReddit")}>
          <ArrowLeft size={20} />
        </Button>
        <div className="flex items-start gap-2 min-w-0 flex-1">
          <RedditIcon size={18} className="shrink-0 mt-1" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-semibold">{account.screen_name}</h2>
              {!account.is_active && <Badge>{t("badge.inactive")}</Badge>}
            </div>
            <p className="text-sm text-[var(--muted-foreground)]">
              {t("redditDetail.fetchInterval", { minutes: account.fetch_interval })}
              {account.last_fetched_at && ` • ${t("redditDetail.lastFetched", { date: formatDateTime(account.last_fetched_at) })}`}
            </p>
          </div>
        </div>
        </div>
        <div className="detail-header-actions">
          <TriggerPanel accountId={accountId} platform="reddit" />
<AccountActiveButton accountId={accountId} isActive={!!account.is_active} />
          <Button onClick={() => setShowDeleteDialog(true)} variant="light" color="danger" size="sm" leftSection={<Trash2 size={14} />} title={t("redditDetail.delete")} aria-label={t("redditDetail.delete")}>{t("redditDetail.delete")}</Button>
        </div>
      </div>

      {account.error_message && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-[var(--danger)]/5 text-[var(--danger)] text-sm">
          <AlertCircle size={14} /> {account.error_message}
        </div>
      )}

      <FetchRunHistory account={account} runs={account.recentFetchRuns} />

      {overviewLoading ? (
        <div className="text-center py-12 text-[var(--muted-foreground)]">{t("redditDetail.loadingData")}</div>
      ) : overview ? (
        <>
          <div className="mobile-detail-controls">
            <TimeRangeSelector value={days} onChange={setDays} />
          </div>

          <MetricGrid>
            <MetricCard label={t("redditDetail.postKarma")} value={overview.stats?.post_karma ?? 0} icon={<ThumbsUp size={20} />} />
            <MetricCard label={t("redditDetail.commentKarma")} value={overview.stats?.comment_karma ?? 0} icon={<MessageSquare size={20} />} />
            <MetricCard label={t("redditDetail.totalPosts")} value={overview.totalPosts} icon={<FileText size={20} />} />
            <MetricCard label={t("redditDetail.totalScore")} value={overview.totalScore} icon={<TrendingUp size={20} />} />
          </MetricGrid>

          {/* ── Karma Timeline ── */}
          {timeline && timeline.length > 1 && (
            <ChartCard
              title={t("redditDetail.karmaTimeline")}
              description={t("redditDetail.karmaTimelineDesc")}
              icon={<TrendingUp size={18} />}
            >
                <div role="img" aria-label={t("redditDetail.karmaTimeline")}>
                <div className={`flex flex-wrap gap-x-3 gap-y-0.5 mb-2 ${isMobile ? "text-[11px]" : "text-xs"}`}>
                  {legendPayload.map((e) => (
                    <span key={e.value} className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: e.color }} />
                      <span className="text-[var(--muted-foreground)]">{e.value}</span>
                    </span>
                  ))}
                </div>
                <ResponsiveContainer width="100%" height={CHART_H}>
                  <LineChart data={timeline} margin={MARGIN}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickFormatter={(v) => v.slice(5)} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} width={calcYAxisWidth(timeline, "post_karma", "comment_karma")} />
                    <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "6px", fontSize: "12px" }} />
                    <Line type="monotone" dataKey="post_karma" stroke="var(--chart-4)" name={t("redditDetail.postKarma")} dot={false} />
                    <Line type="monotone" dataKey="comment_karma" stroke="var(--chart-1)" name={t("redditDetail.commentKarma")} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
                </div>
            </ChartCard>
          )}

          {/* ── Daily Activity + Subreddit Pie ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {activity && (activity.posts.length > 0 || activity.comments.length > 0) && (
              <ChartCard
                title={t("redditDetail.dailyActivity")}
                description={t("redditDetail.dailyActivityDesc")}
                icon={<FileText size={18} />}
              >
                  <div role="img" aria-label={t("redditDetail.dailyActivity")}>
                  <div className={`flex flex-wrap gap-x-3 gap-y-0.5 mb-2 ${isMobile ? "text-[11px]" : "text-xs"}`}>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: "var(--chart-4)" }} /><span className="text-[var(--muted-foreground)]">{t("redditDetail.totalPosts")}</span></span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: "var(--chart-1)" }} /><span className="text-[var(--muted-foreground)]">{t("redditDetail.recentComments")}</span></span>
                  </div>
                  <ResponsiveContainer width="100%" height={CHART_H}>
                    <BarChart data={(() => {
                      const map: Record<string, { date: string; posts: number; comments: number }> = {};
                      for (const p of activity.posts) map[p.date] = { ...map[p.date], date: p.date, posts: p.count, comments: 0 };
                      for (const c of activity.comments) {
                        if (map[c.date]) map[c.date].comments = c.count;
                        else map[c.date] = { date: c.date, posts: 0, comments: c.count };
                      }
                      return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
                    })()} margin={MARGIN}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickFormatter={(v) => v.slice(5)} />
                      <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} width={calcYAxisWidth((() => {
                        const map: Record<string, { date: string; posts: number; comments: number }> = {};
                        for (const p of activity.posts) map[p.date] = { ...map[p.date], date: p.date, posts: p.count, comments: 0 };
                        for (const c of activity.comments) {
                          if (map[c.date]) map[c.date].comments = c.count;
                          else map[c.date] = { date: c.date, posts: 0, comments: c.count };
                        }
                        return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
                      })(), "posts", "comments")} />
                      <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "6px", fontSize: "12px" }} />
                      <Bar dataKey="posts" fill="var(--chart-4)" name={t("redditDetail.totalPosts")} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="comments" fill="var(--chart-1)" name={t("redditDetail.recentComments")} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  </div>
              </ChartCard>
            )}
            {subreddits && subreddits.length > 0 && (
              <ChartCard
                title={t("redditDetail.topSubreddits")}
                description={t("redditDetail.topSubredditsDesc")}
                icon={<ThumbsUp size={18} />}
              >
                  <div role="img" aria-label={t("redditDetail.topSubreddits")}>
                  <ResponsiveContainer width="100%" height={CHART_H}>
                    <PieChart>
                      <Pie data={subreddits} dataKey="count" nameKey="subreddit" cx="50%" cy="50%" outerRadius={isMobile ? 60 : 80} label={isMobile ? false : (props: { name?: string; value?: number }) => `r/${props.name ?? ""} (${props.value ?? 0})`} labelLine={isMobile ? false : { stroke: "var(--muted-foreground)", strokeWidth: 0.5 }}>
                        {subreddits.map((_, i) => (
                          <Cell key={i} fill={`var(--chart-${(i % 5) + 1})`} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "6px", fontSize: "12px" }} />
                    </PieChart>
                  </ResponsiveContainer>
                  </div>
              </ChartCard>
            )}
          </div>

          <Card className="detail-list-card" withBorder radius="md" p={0} style={{ background: "var(--card)", color: "var(--card-foreground)" }}>
            <div className="detail-list-card-header">
              <Stack gap={4}>
                <Group gap="xs"><TrendingUp size={18} /><Text component="h3" fz="lg" fw={600}>{t("redditDetail.topPosts")}</Text></Group>
                <Text size="sm" c="dimmed">{t("redditDetail.topPostsDesc")}</Text>
              </Stack>
            </div>
            <div className="detail-list-card-body">
              {postsData?.data && postsData.data.length > 0 ? (
                <div className="detail-list">
                  {postsData.data.slice(0, 10).map((post: RedditPost) => (
                    <div key={post.id} className="detail-list-row flex items-start gap-3 rounded-lg bg-[var(--muted)]">
                      <ThumbsUp size={16} className="text-[var(--chart-4)] mt-1 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <a href={`https://reddit.com${post.permalink}`} target="_blank" rel="noopener noreferrer" className="min-h-11 text-sm font-medium hover:underline line-clamp-2">{post.title}</a>
                        <div className="flex items-center gap-3 text-xs text-[var(--muted-foreground)] mt-1">
                          <span>r/{post.subreddit}</span>
                          <span className="flex items-center gap-0.5"><ThumbsUp size={10} /> {post.score.toLocaleString()}</span>
                          <span className="flex items-center gap-0.5"><MessageSquare size={10} /> {post.num_comments.toLocaleString()}</span>
                          <span>{formatDate(new Date(post.created_utc * 1000))}</span>
                        </div>
                      </div>
                      <ArrowUpRight size={14} className="text-[var(--muted-foreground)] shrink-0" />
                    </div>
                  ))}
                </div>
              ) : (
                <Text size="sm" c="dimmed" ta="center" py="xl">{t("redditDetail.noPosts")}</Text>
              )}
            </div>
          </Card>

          <Card className="detail-list-card" withBorder radius="md" p={0} style={{ background: "var(--card)", color: "var(--card-foreground)" }}>
            <div className="detail-list-card-header">
              <Stack gap={4}>
                <Group gap="xs"><MessageSquare size={18} /><Text component="h3" fz="lg" fw={600}>{t("redditDetail.recentComments")}</Text></Group>
                <Text size="sm" c="dimmed">{t("redditDetail.recentCommentsDesc")}</Text>
              </Stack>
            </div>
            <div className="detail-list-card-body">
              {commentsData?.data && commentsData.data.length > 0 ? (
                <div className="detail-list">
                  {commentsData.data.slice(0, 10).map((comment: RedditComment) => (
                    <div key={comment.id} className="detail-list-row flex items-start gap-3 rounded-lg bg-[var(--muted)]">
                      <MessageSquare size={16} className="text-[var(--chart-1)] mt-1 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm line-clamp-3">{comment.body}</p>
                        <div className="flex items-center gap-3 text-xs text-[var(--muted-foreground)] mt-1">
                          <span>r/{comment.subreddit}</span>
                          <span className="flex items-center gap-0.5"><ThumbsUp size={10} /> {comment.score.toLocaleString()}</span>
                          <span>{formatDate(new Date(comment.created_utc * 1000))}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Text size="sm" c="dimmed" ta="center" py="xl">{t("redditDetail.noComments")}</Text>
              )}
            </div>
          </Card>
        </>
      ) : (
        <Card withBorder radius="md" p={{ base: "md", sm: "lg" }} style={{ background: "var(--card)", color: "var(--card-foreground)" }}>
          <Stack gap="xs">
            <Text component="h3" fz="lg" fw={600}>{t("redditDetail.noData")}</Text>
            <Text size="sm" c="dimmed">{t("redditDetail.noDataDesc")}</Text>
          </Stack>
        </Card>
      )}
      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title={t("redditDetail.delete")}
        description={t("redditDetail.deleteConfirm", { name: account.screen_name })}
        target={accountId}
        action="delete"
        onConfirm={async (token) => { deleteMutation.mutate({ token }); }}
      />
    </div>
  );
}
