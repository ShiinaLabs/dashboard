import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Card, Group, Stack, Text } from "@mantine/core";
import { api, type GitlabOverview, type GitlabContribution, type GitlabProject } from "@/lib/api";
import { formatDateTime } from "@/lib/client/datetime";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { MetricCard, MetricCardSkeleton } from "@/components/domain/shared/MetricCard";
import { MetricGrid } from "@/components/domain/shared/MetricGrid";
import { ChartCard } from "@/components/domain/shared/ChartCard";
import { TriggerPanel } from "@/components/TriggerPanel";
import { Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { ArrowLeft, ArrowUpRight, Trash2, AlertCircle, Star, GitFork, Code, Users, BookOpen, Settings2 } from "lucide-react";
import { useIsMobile } from "@/lib/client/useIsMobile";
import { GitlabIcon } from "@/components/BrandIcons";
import { ChartCardSkeleton, Skeleton } from "@/components/Skeleton";
import { FetchRunHistory } from "@/components/FetchRunHistory";
import { AccountActiveButton } from "@/components/AccountActiveButton";
import { Button, Checkbox, Modal } from "@/components/ui";

function ContributionHeatmap({ data, tNamespace }: { data: GitlabContribution[]; tNamespace: string }) {
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
                  title={t(`${tNamespace}.contributions`, { date: day.date, count: day.count })} />
              ))}
            </div>
          ))}
        </div>
      </div>
      {isMobile && (
        <p className="text-[11px] text-[var(--muted-foreground)] text-center mt-1.5">← scroll →</p>
      )}
      <div className="flex items-center gap-1 mt-2 justify-end text-xs text-[var(--muted-foreground)]">
        <span>{t(`${tNamespace}.less`)}</span>
        <div className={`${cellClass} bg-[var(--muted)]`} />
        <div className={`${cellClass} bg-[var(--chart-4)]/25`} />
        <div className={`${cellClass} bg-[var(--chart-4)]/50`} />
        <div className={`${cellClass} bg-[var(--chart-4)]/75`} />
        <div className={`${cellClass} bg-[var(--chart-4)]`} />
        <span>{t(`${tNamespace}.more`)}</span>
      </div>
    </div>
  );
}

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-3)", "var(--chart-4)", "var(--chart-1)"];

export default function GitLabDetail() {
  const { t } = useTranslation();
  const { accountId: id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const accountId = Number(id);
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [pinnedIds, setPinnedIds] = useState<Set<number>>(new Set());

  const openPinDialog = () => {
    if (overview?.allProjects) {
      setPinnedIds(new Set(overview.allProjects.filter(r => r.pinned).map(r => r.project_id)));
    }
    setShowPinDialog(true);
  };

  const handlePinSave = async () => {
    await api.setPinnedGitlabProjects(accountId, [...pinnedIds]);
    queryClient.invalidateQueries({ queryKey: ["gitlab", "overview", accountId] });
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

  const { data: overview, isLoading: overviewLoading } = useQuery<GitlabOverview>({
    queryKey: ["gitlab", "overview", accountId],
    queryFn: () => api.getGitlabOverview(accountId!),
    enabled: !!accountId,
    refetchInterval: 3 * 60_000,
  });

  const { data: contributions } = useQuery<GitlabContribution[]>({
    queryKey: ["gitlab", "contributions", accountId],
    queryFn: () => api.getGitlabContributions(accountId!),
    enabled: !!accountId,
  });

  const deleteMutation = useMutation({
    mutationFn: ({ token }: { token: string }) => api.deleteAccount(accountId, token),
    onSuccess: () => navigate("/gitlab"),
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
        <p className="text-[var(--muted-foreground)]">{t("gitlabDetail.notFound")}</p>
        <Button onClick={() => navigate("/gitlab")} variant="subtle" size="sm" mt="md">{t("gitlabDetail.backToGitLab")}</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="detail-header">
        <div className="detail-header-body">
        <Button onClick={() => navigate("/gitlab")} variant="subtle" color="gray" size="lg" px="xs" title={t("gitlabDetail.backToGitLab")} aria-label={t("gitlabDetail.backToGitLab")}>
          <ArrowLeft size={20} />
        </Button>
        <div className="flex items-start gap-2 min-w-0 flex-1">
          <GitlabIcon size={18} className="shrink-0 mt-1" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-semibold">{account.screen_name}</h2>
              {!account.is_active && <Badge>{t("badge.inactive")}</Badge>}
            </div>
            <p className="text-sm text-[var(--muted-foreground)]">
              {t("gitlabDetail.fetchInterval", { minutes: account.fetch_interval })}
              {account.last_fetched_at && ` • ${t("gitlabDetail.lastFetched", { date: formatDateTime(account.last_fetched_at) })}`}
            </p>
          </div>
        </div>
        </div>
        <div className="detail-header-actions">
          <TriggerPanel accountId={accountId} platform="gitlab" />
<AccountActiveButton accountId={accountId} isActive={!!account.is_active} />
          <Button onClick={() => setShowDeleteDialog(true)} variant="light" color="danger" size="sm" leftSection={<Trash2 size={14} />} title={t("gitlabDetail.delete")} aria-label={t("gitlabDetail.delete")}>{t("gitlabDetail.delete")}</Button>
        </div>
      </div>

      {account.error_message && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-[var(--danger)]/5 text-[var(--danger)] text-sm">
          <AlertCircle size={14} /> {account.error_message}
        </div>
      )}

      <FetchRunHistory account={account} runs={account.recentFetchRuns} />

      {overviewLoading ? (
        <div className="text-center py-12 text-[var(--muted-foreground)]">{t("gitlabDetail.loadingGitLabData")}</div>
      ) : overview && overview.stats ? (
        <>
          <MetricGrid>
            <MetricCard label={t("gitlabDetail.projects")} value={overview.totalProjects} icon={<BookOpen size={20} />} />
            <MetricCard label={t("gitlabDetail.totalStars")} value={overview.totalStars} icon={<Star size={20} />} />
            <MetricCard label={t("gitlabDetail.totalForks")} value={overview.totalForks} icon={<GitFork size={20} />} />
            <MetricCard label={t("gitlabDetail.followers")} value={overview.stats.followers} icon={<Users size={20} />} />
          </MetricGrid>

          <Card className="detail-list-card" withBorder radius="md" p={0} style={{ background: "var(--card)", color: "var(--card-foreground)" }}>
            <div className="detail-list-card-header">
              <Stack gap={4}>
                <Group justify="space-between" gap="sm">
                  <Group gap="xs"><BookOpen size={18} /><Text component="h3" fz="lg" fw={600}>{t("gitlabDetail.projectsHeading")}</Text></Group>
                <Button
                  onClick={openPinDialog}
                  variant="light" color="gray" size="sm" leftSection={<Settings2 size={14} />}
                >
                  {t("gitlabDetail.managePins")}
                </Button>
                </Group>
              <Text size="sm" c="dimmed">
                {overview.allProjects && overview.allProjects.some(r => r.pinned)
                  ? t("gitlabDetail.projectsDescPinned")
                  : t("gitlabDetail.projectsDesc")}
              </Text>
              </Stack>
            </div>
            <div className="detail-list-card-body">
              {overview.projects.length > 0 ? (
                <div className="detail-list">
                  {overview.projects.map((p: GitlabProject) => (
                    <Link key={p.id}
                      to={`/gitlab/${accountId}/projects/${p.project_id}`}
                      className="detail-list-row flex items-center gap-3 rounded-lg bg-[var(--muted)] hover:bg-[var(--border)] cursor-pointer transition-colors"
                    >
                      <BookOpen size={16} className="text-[var(--muted-foreground)] shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{p.path_with_namespace}</span>
                          {p.language && <Badge className="shrink-0">{p.language}</Badge>}
                          {p.visibility !== "public" && <Badge className="shrink-0 text-[11px]">{p.visibility}</Badge>}
                        </div>
                        {p.description && <p className="text-xs text-[var(--muted-foreground)] mt-0.5 line-clamp-1">{p.description}</p>}
                        <div className="flex items-center gap-3 text-xs text-[var(--muted-foreground)] mt-1">
                          <span className="flex items-center gap-1"><Star size={12} /> {p.stars}</span>
                          <span className="flex items-center gap-1"><GitFork size={12} /> {p.forks}</span>
                        </div>
                      </div>
                      <ArrowUpRight size={14} className="text-[var(--muted-foreground)] shrink-0" />
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 py-8 text-sm text-[var(--muted-foreground)]">
                  <BookOpen size={32} className="opacity-30" />
                  <p>{t("gitlabDetail.noPinnedProjects")}</p>
                </div>
              )}
            </div>
          </Card>

          <Modal opened={showPinDialog} onClose={() => setShowPinDialog(false)} title={t("gitlabDetail.managePins")} centered>
            <Stack gap="xs">
              {overview.allProjects?.map((p: GitlabProject) => (
                <Checkbox key={p.id} checked={pinnedIds.has(p.project_id)} onChange={(e) => {
                  setPinnedIds(prev => { const next = new Set(prev); if (e.currentTarget.checked) next.add(p.project_id); else next.delete(p.project_id); return next; });
                }} label={<span>{p.path_with_namespace}{p.language ? ` · ${p.language}` : ""}</span>} />
              ))}
              <Button onClick={handlePinSave} mt="md">{t("common.save")}</Button>
            </Stack>
          </Modal>

          <ChartCard
            title={t("gitlabDetail.contributionCalendar")}
            description={t("gitlabDetail.contributionDesc")}
            icon={<GitlabIcon size={18} />}
          >
            {contributions && contributions.length > 0 ? (
              <ContributionHeatmap data={contributions} tNamespace="gitlabDetail" />
            ) : (
              <p className="text-sm text-[var(--muted-foreground)] text-center py-8">{t("gitlabDetail.noContributionData")}</p>
            )}
          </ChartCard>

          <ChartCard
            title={t("gitlabDetail.languages")}
            description={t("gitlabDetail.languagesDesc")}
            icon={<Code size={18} />}
          >
            {Object.keys(overview.languages).length > 0 ? (
                <div role="img" aria-label={t("gitlabDetail.languages")}>
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
                <p className="text-sm text-[var(--muted-foreground)] text-center py-12">{t("gitlabDetail.noLanguageData")}</p>
              )}
          </ChartCard>
        </>
      ) : (
        <Card withBorder radius="md" p={{ base: "md", sm: "lg" }} style={{ background: "var(--card)", color: "var(--card-foreground)" }}>
          <Stack gap="xs">
            <Text component="h3" fz="lg" fw={600}>{t("gitlabDetail.noData")}</Text>
            <Text size="sm" c="dimmed">{t("gitlabDetail.noDataDesc")}</Text>
          </Stack>
        </Card>
      )}
      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title={t("gitlabDetail.delete")}
        description={t("gitlabDetail.deleteConfirm", { name: account.screen_name })}
        target={accountId}
        action="delete"
        onConfirm={async (token) => { deleteMutation.mutate({ token }); }}
      />
    </div>
  );
}
