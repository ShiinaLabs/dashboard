import { useQuery, useMutation } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Card, Text } from "@mantine/core";
import { api, type TimelineData, type PaginatedTweets, type Tweet } from "@/lib/api";
import { formatDateTime, formatDate } from "@/lib/client/datetime";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { MetricCard, MetricCardSkeleton } from "@/components/domain/shared/MetricCard";
import { MetricGrid } from "@/components/domain/shared/MetricGrid";
import { ChartCard } from "@/components/domain/shared/ChartCard";
import { calcYAxisWidth } from "@/lib/client/utils";
import {
  ArrowLeft, Trash2, AlertCircle,
  MessageSquare, Heart, Repeat2, Eye, ExternalLink, Users, UserPlus,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area,
} from "recharts";
import { useIsMobile } from "@/lib/client/useIsMobile";
import { TriggerPanel } from "@/components/TriggerPanel";
import { ChartCardSkeleton, Skeleton } from "@/components/Skeleton";
import { TimeRangeSelector } from "@/components/TimeRangeSelector";
import { XFollowerGrowthChart } from "@/components/XFollowerGrowthChart";
import { FetchRunHistory } from "@/components/FetchRunHistory";
import { AccountActiveButton } from "@/components/AccountActiveButton";
import { Button, Tabs } from "@/components/ui";

function ChartEmptyCard({ title, message, height }: { title: string; message: string; height: number }) {
  return (
    <ChartCard title={title}>
      <Text size="sm" c="dimmed" ta="center" style={{ height, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {message}
      </Text>
    </ChartCard>
  );
}

function TweetListItem({ tweet, screenName }: { tweet: Tweet; screenName: string }) {
  return (
    <a
      href={`https://x.com/${screenName}/status/${tweet.id}`}
      target="_blank"
      rel="noopener noreferrer"
      className="detail-list-row block rounded-lg bg-[var(--muted)] hover:bg-[var(--border)] transition-colors space-y-2 group"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm whitespace-pre-wrap break-words">{tweet.full_text}</p>
        <ExternalLink size={12} className="shrink-0 mt-1 text-[var(--muted-foreground)] hover-reveal-icon" />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[var(--muted-foreground)]">
        <span className="flex items-center gap-1"><Heart size={12} /> {tweet.favorite_count}</span>
        <span className="flex items-center gap-1"><Repeat2 size={12} /> {tweet.retweet_count}</span>
        <span className="flex items-center gap-1"><MessageSquare size={12} /> {tweet.reply_count}</span>
        {tweet.view_count > 0 && <span className="flex items-center gap-1"><Eye size={12} /> {tweet.view_count}</span>}
        <span>{formatDate(tweet.created_at)}</span>
      </div>
    </a>
  );
}

export default function XDetail() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();

  const accountId = Number(id);
  const [tab, setTab] = useState<"tweets" | "replies">("tweets");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [days, setDays] = useState(30);

  const { data: account, isLoading } = useQuery({
    queryKey: ["account", accountId],
    queryFn: () => api.getAccount(accountId),
    enabled: !!accountId,
  });

  const { data: tweets } = useQuery<PaginatedTweets>({
    queryKey: ["tweets", accountId],
    queryFn: () => api.getTweets(1, 50, "created_at", "desc", undefined, [accountId], 0),
    enabled: !!accountId,
  });

  const { data: replies } = useQuery<PaginatedTweets>({
    queryKey: ["replies", accountId],
    queryFn: () => api.getTweets(1, 50, "created_at", "desc", undefined, [accountId], 1),
    enabled: !!accountId,
  });

  const { data: timeline } = useQuery<TimelineData>({
    queryKey: ["timeline", accountId, days],
    queryFn: () => api.getTimeline(days, accountId),
    enabled: !!accountId,
  });

  const deleteMutation = useMutation({
    mutationFn: ({ token }: { token: string }) => api.deleteAccount(accountId, token),
    onSuccess: () => navigate("/x"),
  });


  const isMobile = useIsMobile();
  const CHART_H = isMobile ? 180 : 250;
  const MARGIN = { top: 5, right: 5, left: 0, bottom: 5 };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="detail-header">
          <div className="detail-header-body">
            <Skeleton className="h-11 w-11 rounded-lg shrink-0" />
            <div className="flex-1"><Skeleton className="h-6 w-32 mb-2" /><Skeleton className="h-3 w-48" /></div>
          </div>
        </div>
        <MetricGrid columns="three">
          {Array.from({ length: 3 }).map((_, i) => <MetricCardSkeleton key={i} />)}
        </MetricGrid>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartCardSkeleton /><ChartCardSkeleton />
        </div>
      </div>
    );
  }

  if (!account) {
    return (
      <div className="text-center py-12">
        <p className="text-[var(--muted-foreground)]">{t("xDetail.notFound")}</p>
        <Button onClick={() => navigate("/x")} variant="subtle" size="sm" mt="md">{t("xDetail.backToX")}</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="detail-header">
        <div className="detail-header-body">
        <Button onClick={() => navigate("/x")} variant="subtle" color="gray" size="lg" px="xs" title={t("xDetail.backToX")} aria-label={t("xDetail.backToX")}>
          <ArrowLeft size={20} />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-semibold">@{account.screen_name}</h2>
            {!account.is_active && <Badge>{t("badge.inactive")}</Badge>}
          </div>
          <p className="text-sm text-[var(--muted-foreground)]">
            {t("xDetail.fetchInterval", { minutes: account.fetch_interval })}
            {account.last_fetched_at && ` • ${t("xDetail.lastFetched", { date: formatDateTime(account.last_fetched_at) })}`}
          </p>
        </div>
        </div>
        <div className="detail-header-actions">
          <TriggerPanel accountId={accountId} platform="twitter" />
          <AccountActiveButton accountId={accountId} isActive={!!account.is_active} />
          <Button
            onClick={() => setShowDeleteDialog(true)}
            variant="light" color="danger" size="sm" leftSection={<Trash2 size={14} />}
            title={t("xDetail.delete")}
            aria-label={t("xDetail.delete")}
          >
            {t("xDetail.delete")}
          </Button>
        </div>
      </div>

      {account.error_message && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-[var(--danger)]/5 text-[var(--danger)] text-sm">
          <AlertCircle size={14} /> {account.error_message}
        </div>
      )}

      <FetchRunHistory account={account} runs={account.recentFetchRuns} />

      {account.stats && (
        <MetricGrid columns="three">
          <MetricCard label={t("xDetail.followers")} value={account.stats.followers_count ?? 0} icon={<Users size={20} />} />
          <MetricCard label={t("xDetail.following")} value={account.stats.following_count ?? 0} icon={<UserPlus size={20} />} />
          <MetricCard label={t("xDetail.tweets")} value={account.stats.tweet_count ?? 0} icon={<MessageSquare size={20} />} />
        </MetricGrid>
      )}

      <div className="mobile-detail-controls">
        <TimeRangeSelector value={days} onChange={setDays} />
      </div>

      {timeline && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <XFollowerGrowthChart data={timeline.followerGrowth} />
          {timeline.dailyTweets.length > 0 ? (
            <ChartCard title={t("xDetail.tweetActivity")}>
                <div role="img" aria-label={t("xDetail.tweetActivity")}>
                <ResponsiveContainer width="100%" height={CHART_H}>
                  <BarChart data={timeline.dailyTweets} margin={MARGIN}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickFormatter={(v) => v.slice(5)} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} width={calcYAxisWidth(timeline.dailyTweets, "tweets_count")} />
                    <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "6px", fontSize: "12px" }} />
                    <Bar dataKey="tweets_count" fill="var(--primary)" radius={[4, 4, 0, 0]} name={t("xDetail.tweetsCount")} />
                  </BarChart>
                </ResponsiveContainer>
                </div>
            </ChartCard>
          ) : (
            <ChartEmptyCard title={t("xDetail.tweetActivity")} message={t("xDetail.noTweetData")} height={CHART_H} />
          )}
        </div>
      )}
      {timeline && timeline.dailyTweets.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartCard title={t("xDetail.views")}>
              <div role="img" aria-label={t("xDetail.views")}>
              <ResponsiveContainer width="100%" height={CHART_H}>
                <AreaChart data={timeline.dailyTweets} margin={MARGIN}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickFormatter={(v) => v.slice(5)} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} width={calcYAxisWidth(timeline.dailyTweets, "total_views")} />
                  <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "6px", fontSize: "12px" }} />
                  <Area type="monotone" dataKey="total_views" stroke="var(--chart-2)" fill="color-mix(in oklch, var(--chart-2) 12%, transparent)" name={t("xDetail.views")} />
                </AreaChart>
              </ResponsiveContainer>
              </div>
          </ChartCard>
          <ChartCard title={t("xDetail.engagement")}>
              <div role="img" aria-label={t("xDetail.engagement")}>
              <ResponsiveContainer width="100%" height={CHART_H}>
                <AreaChart data={timeline.dailyTweets} margin={MARGIN}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickFormatter={(v) => v.slice(5)} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} width={calcYAxisWidth(timeline.dailyTweets, "total_likes", "total_retweets")} />
                  <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "6px", fontSize: "12px" }} />
                  <Area type="monotone" dataKey="total_likes" stroke="var(--chart-5)" fill="color-mix(in oklch, var(--chart-5) 12%, transparent)" name={t("xDetail.likes")} />
                  <Area type="monotone" dataKey="total_retweets" stroke="var(--chart-1)" fill="color-mix(in oklch, var(--chart-1) 12%, transparent)" name={t("xDetail.retweets")} />
                </AreaChart>
              </ResponsiveContainer>
              </div>
          </ChartCard>
        </div>
      )}

      {(tweets || replies) && (
        <Card className="detail-list-card" withBorder radius="md" p={0} style={{ background: "var(--card)", color: "var(--card-foreground)" }}>
          <div className="detail-list-card-header">
            <Tabs value={tab} onChange={(value) => { if (value === "tweets" || value === "replies") setTab(value); }}>
              <Tabs.List aria-label={t("xDetail.recentTweets")}>
                <Tabs.Tab value="tweets">{t("xDetail.recentTweets")}</Tabs.Tab>
                <Tabs.Tab value="replies">{t("xDetail.recentReplies")}</Tabs.Tab>
              </Tabs.List>
            </Tabs>
          </div>
          <div
            className="detail-list-card-body"
            role="tabpanel"
            id={tab === "tweets" ? "panel-tweets" : "panel-replies"}
            aria-labelledby={tab === "tweets" ? "tab-tweets" : "tab-replies"}
          >
            <div className="detail-list">
              {tab === "tweets" && tweets && tweets.data.length > 0 && tweets.data.slice(0, 20).map((tweet: Tweet) => (
                <TweetListItem key={tweet.id} tweet={tweet} screenName={account.screen_name} />
              ))}
              {tab === "replies" && replies && replies.data.length > 0 && replies.data.slice(0, 20).map((tweet: Tweet) => (
                <TweetListItem key={tweet.id} tweet={tweet} screenName={account.screen_name} />
              ))}
            </div>
          </div>
        </Card>
      )}
      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title={t("xDetail.delete")}
        description={t("xDetail.deleteConfirm", { name: account.screen_name })}
        target={accountId}
        action="delete"
        onConfirm={async (token) => { deleteMutation.mutate({ token }); }}
      />
    </div>
  );
}
