import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { api, type Account } from "@/lib/api";
import { formatDate } from "@/lib/client/datetime";
import { Card, CardContent } from "@/components/ui/card";
import { ChartCard } from "@/components/domain/shared/ChartCard";
import { calcYAxisWidth } from "@/lib/client/utils";
import { Badge } from "@/components/ui/badge";
import { TimeRangeSelector } from "@/components/TimeRangeSelector";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area,
} from "recharts";
import { ArrowLeft, Star, GitFork, Download, ExternalLink, TrendingUp, Activity } from "lucide-react";
import { useIsMobile } from "@/lib/client/useIsMobile";
import { Button } from "@/components/ui";

export default function ProjectDetail() {
  const { t } = useTranslation();
  const { accountId, projectId } = useParams();
  const navigate = useNavigate();
  const aid = Number(accountId);
  const pid = Number(projectId);
  const [days, setDays] = useState(30);

  const { data: overview } = useQuery({
    queryKey: ["gitlab", "overview", aid],
    queryFn: () => api.getGitlabOverview(aid),
    enabled: !!aid,
  });

  const { data: accountsData } = useQuery({
    queryKey: ["accounts"],
    queryFn: api.getAccounts,
  });

  const project = overview?.projects.find((p) => p.project_id === pid);
  const account = accountsData?.accounts.find((a: Account) => a.id === aid);
  const instanceUrl = account?.instance_url || "https://gitlab.com";

  const { data: snapshots } = useQuery({
    queryKey: ["gitlab", "snapshots", aid, pid, days],
    queryFn: () => api.getGitlabProjectSnapshots(aid, pid, days),
    enabled: !!aid && !!pid,
  });

  const { data: releases } = useQuery({
    queryKey: ["gitlab", "releases", aid, pid],
    queryFn: () => api.getGitlabReleases(aid, pid),
    enabled: !!aid && !!pid,
  });

  const isMobile = useIsMobile();
  const CHART_H = isMobile ? 200 : 300;
  const MARGIN = { top: 5, right: 5, left: 0, bottom: 5 };

  if (!project) {
    return (
      <div className="text-center py-12">
        <p className="text-[var(--muted-foreground)]">{t("projectDetail.notFound")}</p>
        <Button onClick={() => navigate(`/gitlab/${aid}`)} variant="subtle" size="sm" mt="md">{t("projectDetail.backToAccount")}</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="detail-header">
        <div className="detail-header-body">
        <Button onClick={() => navigate(`/gitlab/${aid}`)} variant="subtle" color="gray" size="lg" px="xs" title={t("projectDetail.backToAccount")} aria-label={t("projectDetail.backToAccount")}>
          <ArrowLeft size={20} />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-semibold">{project.path_with_namespace}</h2>
            {project.language && <Badge>{project.language}</Badge>}
            {project.visibility !== "public" && <Badge>{project.visibility}</Badge>}
            {project.is_fork ? <Badge>{t("badge.fork")}</Badge> : null}
          </div>
          {project.description && <p className="text-sm text-[var(--muted-foreground)] line-clamp-2">{project.description}</p>}
        </div>
        </div>
        <a href={`${instanceUrl}/${project.path_with_namespace}`} target="_blank" rel="noopener noreferrer"
          className="detail-header-actions flex items-center gap-1.5 px-3 py-2.5 min-h-11 rounded-lg bg-[var(--muted)] hover:bg-[var(--border)] transition-colors text-xs">
          <ExternalLink size={12} /> {t("projectDetail.open")}
        </a>
      </div>

      <div className="mobile-detail-controls">
        <TimeRangeSelector value={days} onChange={setDays} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
        <Card><CardContent className="p-4 pt-4 sm:p-4 sm:pt-4 text-center"><Star size={16} className="inline mb-1 text-[var(--muted-foreground)]" /><p className="text-2xl font-bold font-mono tabular-nums">{project.stars.toLocaleString()}</p><p className="text-xs text-[var(--muted-foreground)]">{t("projectDetail.stars")}</p></CardContent></Card>
        <Card><CardContent className="p-4 pt-4 sm:p-4 sm:pt-4 text-center"><GitFork size={16} className="inline mb-1 text-[var(--muted-foreground)]" /><p className="text-2xl font-bold font-mono tabular-nums">{project.forks.toLocaleString()}</p><p className="text-xs text-[var(--muted-foreground)]">{t("projectDetail.forks")}</p></CardContent></Card>
        <Card><CardContent className="p-4 pt-4 sm:p-4 sm:pt-4 text-center"><Activity size={16} className="inline mb-1 text-[var(--muted-foreground)]" /><p className="text-2xl font-bold font-mono tabular-nums">{project.open_issues.toLocaleString()}</p><p className="text-xs text-[var(--muted-foreground)]">{t("projectDetail.openIssues")}</p></CardContent></Card>
      </div>

      <ChartCard
        title={t("projectDetail.starHistory")}
        description={t("projectDetail.starHistoryDesc")}
        icon={<TrendingUp size={18} />}
      >
          {snapshots && snapshots.length > 1 ? (
            <div role="img" aria-label={t("projectDetail.starHistory")}>
            <ResponsiveContainer width="100%" height={CHART_H}>
              <AreaChart data={snapshots} margin={MARGIN}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickFormatter={(v) => v.slice(5)} />
                <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} width={calcYAxisWidth(snapshots, "stars")} />
                <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "6px", fontSize: "12px" }} />
                <Area type="monotone" dataKey="stars" stroke="var(--chart-3)" fill="color-mix(in oklch, var(--chart-3) 12%, transparent)" name={t("projectDetail.stars")} />
              </AreaChart>
            </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex items-center justify-center text-sm text-[var(--muted-foreground)]" style={{ height: CHART_H }}>
              {snapshots?.length === 1 ? t("projectDetail.onlyOneDataPoint") : t("projectDetail.noStarHistory")}
            </div>
          )}
      </ChartCard>

      <ChartCard
        title={t("projectDetail.releasesDownloads")}
        description={t("projectDetail.releasesDownloadsDesc")}
        icon={<Download size={18} />}
      >
          {releases && releases.length > 0 ? (
            <div role="img" aria-label={t("projectDetail.releasesDownloads")}>
            <ResponsiveContainer width="100%" height={Math.max(isMobile ? 140 : 200, releases.length * (isMobile ? 36 : 60))}>
              <BarChart data={releases} layout="vertical" margin={{ left: 0, right: 10, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis type="number" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                <YAxis type="category" dataKey="release_tag" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} width={isMobile ? 50 : 120} tickFormatter={(v: string) => v.length > (isMobile ? 6 : 15) ? v.slice(0, isMobile ? 6 : 15) + "…" : v} />
                <Tooltip
                  contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "6px", fontSize: "12px" }}
                  labelFormatter={(label) => {
                    const rel = releases.find((r) => r.release_tag === label);
                    return rel ? `${rel.name || rel.release_tag} — ${rel.released_at ? formatDate(rel.released_at) : ""}` : label;
                  }}
                />
                <Bar dataKey="total_downloads" fill="var(--chart-3)" radius={[0, 4, 4, 0]} name={t("projectDetail.releases")} />
              </BarChart>
            </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-[var(--muted-foreground)] text-center py-8">
              {t("projectDetail.noReleases")}
            </p>
          )}
      </ChartCard>
    </div>
  );
}
