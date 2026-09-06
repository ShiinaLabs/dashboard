import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Card, Group, Stack, Text } from "@mantine/core";
import { api, type GithubOverview, type GithubContribution, type GithubRepo } from "@/lib/api";
import { formatDateTime } from "@/lib/client/datetime";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { MetricCard, MetricCardSkeleton } from "@/components/domain/shared/MetricCard";
import { MetricGrid } from "@/components/domain/shared/MetricGrid";
import { ChartCard } from "@/components/domain/shared/ChartCard";
import { TriggerPanel } from "@/components/TriggerPanel";
import { Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import {
  ArrowLeft, ArrowUpRight, Trash2, AlertCircle, Star, GitFork, Code, Users, BookOpen, Settings2
} from "lucide-react";
import { useIsMobile } from "@/lib/client/useIsMobile";
import { GithubIcon } from "@/components/BrandIcons";
import { ChartCardSkeleton, Skeleton } from "@/components/Skeleton";
import { FetchRunHistory } from "@/components/FetchRunHistory";
import { AccountActiveButton } from "@/components/AccountActiveButton";
import { Button, Checkbox, Modal } from "@/components/ui";

function GithubHeatmap({ data }: { data: GithubContribution[] }) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const dayMap = new Map(data.map((d) => [d.date, d.count]));
  const year = new Date().getFullYear();
  const startDate = new Date(year, 0, 1);
  const endDate = new Date(year, 11, 31);
  const weeks: { date: string; count: number; dayOfWeek: number }[][] = [];
  let currentWeek: { date: string; count: number; dayOfWeek: number }[] = [];

  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    const day = { date: key, count: dayMap.get(key) || 0, dayOfWeek: d.getDay() };
    currentWeek.push(day);
    if (day.dayOfWeek === 6) { weeks.push(currentWeek); currentWeek = []; }
  }
  if (currentWeek.length > 0) weeks.push(currentWeek);

  const maxCount = Math.max(...Array.from(dayMap.values()), 1);

  const getColor = (count: number) => {
    if (count === 0) return "bg-[var(--muted)]";
    const intensity = Math.min(count / maxCount, 1);
    if (intensity < 0.25) return "bg-[var(--chart-4)]/40";
    if (intensity < 0.5) return "bg-[var(--chart-4)]/60";
    if (intensity < 0.75) return "bg-[var(--chart-4)]/80";
    return "bg-[var(--chart-4)]";
  };

  // Smaller cells on mobile for better fit
  const cellClass = isMobile ? "w-2.5 h-2.5 rounded-sm" : "w-3 h-3 rounded-sm";

  return (
    <div>
      <div className="overflow-x-auto -mx-1 px-1">
        <div className="flex gap-0.5" style={{ minWidth: isMobile ? 500 : 700 }}>
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-0.5">
              {week.map((day) => (
                <div key={day.date} className={`${cellClass} ${getColor(day.count)}`}
                  title={t("githubDetail.contributions", { date: day.date, count: day.count })} />
              ))}
            </div>
          ))}
        </div>
      </div>
      {isMobile && (
        <p className="text-[11px] text-[var(--muted-foreground)] text-center mt-1.5">← scroll →</p>
      )}
      <div className="flex items-center gap-1 mt-2 justify-end text-xs text-[var(--muted-foreground)]">
        <span>{t("githubDetail.less")}</span>
        <div className={`${cellClass} bg-[var(--muted)]`} />
        <div className={`${cellClass} bg-[var(--chart-4)]/25`} />
        <div className={`${cellClass} bg-[var(--chart-4)]/50`} />
        <div className={`${cellClass} bg-[var(--chart-4)]/75`} />
        <div className={`${cellClass} bg-[var(--chart-4)]`} />
        <span>{t("githubDetail.more")}</span>
      </div>
    </div>
  );
}

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-3)", "var(--chart-4)", "var(--chart-1)"];

export default function GitHubDetail() {
  const { t } = useTranslation();
  const { accountId: id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const accountId = Number(id);
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [pinnedIds, setPinnedIds] = useState<Set<number>>(new Set());

  const openPinDialog = () => {
    if (overview?.allRepos) {
      setPinnedIds(new Set(overview.allRepos.filter(r => r.pinned).map(r => r.repo_id)));
    }
    setShowPinDialog(true);
  };

  const handlePinSave = async () => {
    await api.setPinnedRepos(accountId, [...pinnedIds]);
    queryClient.invalidateQueries({ queryKey: ["github", "overview", accountId] });
    setShowPinDialog(false);
  };

  // Close the pin dialog with Escape
  useEffect(() => {
    if (!showPinDialog) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowPinDialog(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [showPinDialog]);

  const { data: account, isLoading: accountLoading } = useQuery({
    queryKey: ["account", accountId],
    queryFn: () => api.getAccount(accountId),
    enabled: !!accountId,
  });

  const { data: overview, isLoading: overviewLoading } = useQuery<GithubOverview>({
    queryKey: ["github", "overview", accountId],
    queryFn: () => api.getGithubOverview(accountId!),
    enabled: !!accountId,
    refetchInterval: 3 * 60_000,
  });

  const { data: contributions } = useQuery<GithubContribution[]>({
    queryKey: ["github", "contributions", accountId],
    queryFn: () => api.getGithubContributions(accountId!),
    enabled: !!accountId,
  });

  const deleteMutation = useMutation({
    mutationFn: ({ token }: { token: string }) => api.deleteAccount(accountId, token),
    onSuccess: () => navigate("/github"),
  });


  const isMobile = useIsMobile();
  const PIE_H = isMobile ? 200 : 300;

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
        <p className="text-[var(--muted-foreground)]">{t("githubDetail.notFound")}</p>
        <Button onClick={() => navigate("/github")} variant="subtle" size="sm" mt="md">{t("githubDetail.backToGitHub")}</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="detail-header">
        <div className="detail-header-body">
        <Button onClick={() => navigate("/github")} variant="subtle" color="gray" size="lg" px="xs" title={t("githubDetail.backToGitHub")} aria-label={t("githubDetail.backToGitHub")}>
          <ArrowLeft size={20} />
        </Button>
        <div className="flex items-start gap-2 min-w-0 flex-1">
          <GithubIcon size={18} className="shrink-0 mt-1" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-semibold">{account.screen_name}</h2>
              {!account.is_active && <Badge>{t("badge.inactive")}</Badge>}
            </div>
            <p className="text-sm text-[var(--muted-foreground)]">
              {t("githubDetail.fetchInterval", { minutes: account.fetch_interval })}
              {account.last_fetched_at && ` • ${t("githubDetail.lastFetched", { date: formatDateTime(account.last_fetched_at) })}`}
            </p>
          </div>
        </div>
        </div>
        <div className="detail-header-actions">
          <TriggerPanel accountId={accountId} platform="github" />
<AccountActiveButton accountId={accountId} isActive={!!account.is_active} />
          <Button onClick={() => setShowDeleteDialog(true)} variant="light" color="danger" size="sm" leftSection={<Trash2 size={14} />} title={t("githubDetail.delete")} aria-label={t("githubDetail.delete")}>{t("githubDetail.delete")}</Button>
        </div>
      </div>

      {account.error_message && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-[var(--danger)]/5 text-[var(--danger)] text-sm">
          <AlertCircle size={14} /> {account.error_message}
        </div>
      )}

      <FetchRunHistory account={account} runs={account.recentFetchRuns} />

      {overviewLoading ? (
        <div className="text-center py-12 text-[var(--muted-foreground)]">{t("githubDetail.loadingGitHubData")}</div>
      ) : overview && overview.stats ? (
        <>
          <MetricGrid>
            <MetricCard label={t("githubDetail.repositories")} value={overview.totalRepos} icon={<BookOpen size={20} />} />
            <MetricCard label={t("githubDetail.totalStars")} value={overview.totalStars} icon={<Star size={20} />} />
            <MetricCard label={t("githubDetail.totalForks")} value={overview.totalForks} icon={<GitFork size={20} />} />
            <MetricCard label={t("githubDetail.followers")} value={overview.stats.followers} icon={<Users size={20} />} />
          </MetricGrid>

          <Card className="detail-list-card" withBorder radius="md" p={0} style={{ background: "var(--card)", color: "var(--card-foreground)" }}>
            <div className="detail-list-card-header">
              <Stack gap={4}>
                <Group justify="space-between" gap="sm">
                  <Group gap="xs"><BookOpen size={18} /><Text component="h3" fz="lg" fw={600}>{t("githubDetail.reposHeading")}</Text></Group>
                <Button
                  onClick={openPinDialog}
                  variant="light" color="gray" size="sm" leftSection={<Settings2 size={14} />}
                >
                  {t("githubDetail.managePins")}
                </Button>
                </Group>
              <Text size="sm" c="dimmed">
                {overview.allRepos && overview.allRepos.some(r => r.pinned)
                  ? t("githubDetail.reposDescPinned")
                  : t("githubDetail.reposDesc")}
              </Text>
              </Stack>
            </div>
            <div className="detail-list-card-body">
              {overview.repos.length > 0 ? (
                <div className="detail-list">
                  {overview.repos.map((repo: GithubRepo) => (
                    <Link key={repo.id}
                      to={`/github/${accountId}/repos/${repo.repo_id}`}
                      className="detail-list-row flex items-center gap-3 rounded-lg bg-[var(--muted)] hover:bg-[var(--border)] cursor-pointer transition-colors"
                    >
                      <BookOpen size={16} className="text-[var(--muted-foreground)] shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{repo.full_name}</span>
                          {repo.language && <Badge className="shrink-0">{repo.language}</Badge>}
                        </div>
                        {repo.description && <p className="text-xs text-[var(--muted-foreground)] mt-0.5 line-clamp-1">{repo.description}</p>}
                        <div className="flex items-center gap-3 text-xs text-[var(--muted-foreground)] mt-1">
                          <span className="flex items-center gap-1"><Star size={12} /> {repo.stars}</span>
                          <span className="flex items-center gap-1"><GitFork size={12} /> {repo.forks}</span>
                        </div>
                      </div>
                      <ArrowUpRight size={14} className="text-[var(--muted-foreground)] shrink-0" />
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 py-8 text-sm text-[var(--muted-foreground)]">
                  <BookOpen size={32} className="opacity-30" />
                  <p>{t("githubDetail.noPinnedRepos")}</p>
                </div>
              )}
            </div>
          </Card>

          <Modal opened={showPinDialog} onClose={() => setShowPinDialog(false)} title={t("githubDetail.managePins")} centered>
            <Stack gap="xs">
              {overview.allRepos?.map((repo: GithubRepo) => (
                <Checkbox key={repo.id} checked={pinnedIds.has(repo.repo_id)} onChange={(e) => {
                  setPinnedIds(prev => { const next = new Set(prev); if (e.currentTarget.checked) next.add(repo.repo_id); else next.delete(repo.repo_id); return next; });
                }} label={<span>{repo.full_name}{repo.language ? ` · ${repo.language}` : ""}</span>} />
              ))}
              <Button onClick={handlePinSave} mt="md">{t("common.save")}</Button>
            </Stack>
          </Modal>

          <ChartCard
            title={t("githubDetail.readmeStats")}
            description={t("githubDetail.readmeStatsDesc")}
            icon={<GithubIcon size={18} />}
          >
              <div className="flex flex-wrap justify-center gap-6">
                {/* external SVG source; rendered as a plain img */}
                <img
                  src={`https://github-readme-stats-fast.vercel.app/api?username=${account.screen_name}&show_icons=true&hide_border=true&bg_color=00000000&text_color=666&title_color=3b5998&icon_color=3b5998`}
                  alt={t("githubDetail.statsImgAlt")}
                  className="max-w-full h-auto"
                  loading="lazy"
                />
                {/* external SVG source; rendered as a plain img */}
                <img
                  src={`https://github-readme-stats-fast.vercel.app/api/top-langs?username=${account.screen_name}&layout=compact&hide_border=true&bg_color=00000000&text_color=666&title_color=3b82f6`}
                  alt={t("githubDetail.languagesImgAlt")}
                  className="max-w-full h-auto"
                  loading="lazy"
                />
              </div>
          </ChartCard>

          <ChartCard
            title={t("githubDetail.contributionCalendar")}
            description={t("githubDetail.contributionDesc")}
            icon={<GithubIcon size={18} />}
          >
            {contributions && contributions.length > 0 ? <GithubHeatmap data={contributions} />
              : <p className="text-sm text-[var(--muted-foreground)] text-center py-8">{t("githubDetail.noContributionData")}</p>}
          </ChartCard>

          <ChartCard
            title={t("githubDetail.languages")}
            description={t("githubDetail.languagesDesc")}
            icon={<Code size={18} />}
          >
            {Object.keys(overview.languages).length > 0 ? (
                <div role="img" aria-label={t("githubDetail.languages")}>
                <ResponsiveContainer width="100%" height={PIE_H}>
                  <PieChart>
                    <Pie data={Object.entries(overview.languages).map(([name, count]) => ({ name, count }))} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent = 0 }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                      {Object.keys(overview.languages).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "13px" }} />
                  </PieChart>
                </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-sm text-[var(--muted-foreground)] text-center py-12">{t("githubDetail.noLanguageData")}</p>
              )}
          </ChartCard>
        </>
      ) : (
        <Card withBorder radius="md" p={{ base: "md", sm: "lg" }} style={{ background: "var(--card)", color: "var(--card-foreground)" }}>
          <Stack gap="xs">
            <Text component="h3" fz="lg" fw={600}>{t("githubDetail.noData")}</Text>
            <Text size="sm" c="dimmed">{t("githubDetail.noDataDesc")}</Text>
          </Stack>
        </Card>
      )}
      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title={t("githubDetail.delete")}
        description={t("githubDetail.deleteConfirm", { name: account.screen_name })}
        target={accountId}
        action="delete"
        onConfirm={async (token) => { deleteMutation.mutate({ token }); }}
      />
    </div>
  );
}
