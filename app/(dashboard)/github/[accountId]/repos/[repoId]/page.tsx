import { useQuery } from "@tanstack/react-query";
import { useState, useRef, useEffect, useMemo, type CSSProperties } from "react";
import { useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { api, type GithubRepo, type GithubRelease } from "@/lib/api";
import { formatDate } from "@/lib/client/datetime";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TimeRangeSelector } from "@/components/TimeRangeSelector";
import { TrafficMetricList } from "@/components/TrafficMetricList";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, LineChart, Line,
} from "recharts";
import { ArrowLeft, Star, GitFork, Download, ExternalLink, Globe, TrendingUp, Eye, CircleDot, GitPullRequest, FileText } from "lucide-react";
import { useIsMobile } from "@/lib/client/useIsMobile";
import { calcYAxisWidth } from "@/lib/client/utils";
import { sumSelectedAssetDownloads } from "@/lib/utils/download-growth";
import { ActionIcon, Button, Checkbox, TextInput } from "@/components/ui";
import { ChartCard } from "@/components/domain/shared/ChartCard";

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#10b981", "#6366f1"];

const CHART_TOOLTIP_CONTENT_STYLE = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: "6px",
  fontSize: "12px",
  maxWidth: "min(28rem, calc(100vw - 2rem))",
  overflowWrap: "anywhere",
  whiteSpace: "normal",
} satisfies CSSProperties;

const CHART_TOOLTIP_ITEM_STYLE = {
  overflowWrap: "anywhere",
  whiteSpace: "normal",
} satisfies CSSProperties;

const CHART_TOOLTIP_WRAPPER_STYLE = {
  maxWidth: "calc(100% - 1rem)",
} satisfies CSSProperties;

type HistoryPoint = Record<string, string | number | null>;

function MultiSelectDropdown({ items, selected, onToggle, onSelectAll, onShowLatest, onDeselectAll, label, latestLabel, isMobile }: {
  items: Array<{ id: string; label: string }>;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onShowLatest: () => void;
  onDeselectAll: () => void;
  label: string;
  latestLabel: string;
  isMobile: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = items.filter((item) =>
    item.label.toLowerCase().includes(search.toLowerCase())
  );

  const selectedItems = items.filter((item) => selected.has(item.id));

  return (
    <div ref={ref} className="relative">
      <div className="mb-2 flex flex-wrap items-center gap-1">
        <span className="text-xs text-[var(--muted-foreground)] font-medium">{label}</span>
        <Button onClick={onSelectAll} variant="subtle" size="compact-xs">{t("repoDetail.selectAll")}</Button>
        <Button onClick={onShowLatest} variant="subtle" size="compact-xs">{latestLabel}</Button>
        <Button onClick={onDeselectAll} variant="subtle" size="compact-xs">{t("repoDetail.hideAll")}</Button>
      </div>

      {selectedItems.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selectedItems.map((item) => (
            <span key={item.id} className="inline-flex items-center gap-1 px-2 py-1 bg-[var(--secondary)] rounded-md text-xs text-[var(--secondary-foreground)]">
              {item.label.length > (isMobile ? 8 : 15) ? item.label.slice(0, isMobile ? 8 : 15) + "..." : item.label}
              <ActionIcon onClick={() => onToggle(item.id)} variant="subtle" color="gray" size="xs" aria-label={`Remove ${item.label}`}>&times;</ActionIcon>
            </span>
          ))}
        </div>
      )}

      <Button
        onClick={() => setOpen(!open)}
        variant="default" color="gray" fullWidth justify="space-between"
      >
        <span className="text-[var(--muted-foreground)]">
          {selected.size === items.length ? t("repoDetail.allSelected") : t("repoDetail.nSelected", { count: selected.size })}
        </span>
        <span className="text-[var(--muted-foreground)] text-xs">{open ? "\u25B2" : "\u25BC"}</span>
      </Button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-[var(--card)] border border-[var(--border)] rounded-md shadow-lg max-h-64 overflow-hidden">
          <div className="p-2 border-b border-[var(--border)]">
            <TextInput
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              placeholder={t("repoDetail.searchVersions")}
            />
          </div>
          <div className="overflow-y-auto max-h-48">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-sm text-[var(--muted-foreground)]">{t("repoDetail.noResults")}</p>
            ) : (
              filtered.map((item) => (
                <label key={item.id} className="flex min-h-11 cursor-pointer select-none items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--accent)]">
                  <Checkbox
                    checked={selected.has(item.id)}
                    onChange={() => onToggle(item.id)}
                  />
                  <span className="text-[var(--foreground)] truncate">{item.label}</span>
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const DEFAULT_VISIBLE = 10;

const GROWTH_TIME_OPTIONS = [
  { value: 7, labelKey: "timeRange.7d" },
  { value: 14, labelKey: "timeRange.14d" },
  { value: 30, labelKey: "timeRange.30d" },
];

function ReleaseChartControls({ releases, topAssets, hiddenAssets, hiddenReleases, onToggleAsset, onToggleRelease, onSelectAllAssets, onHideAllAssets, onSelectAllReleases, onShowLatestReleases, onDeselectAllReleases, isMobile }: {
  releases: GithubRelease[];
  topAssets: string[];
  hiddenAssets: Set<string>;
  hiddenReleases: Set<number>;
  onToggleAsset: (name: string) => void;
  onToggleRelease: (id: number) => void;
  onSelectAllAssets: () => void;
  onHideAllAssets: () => void;
  onSelectAllReleases: () => void;
  onShowLatestReleases: () => void;
  onDeselectAllReleases: () => void;
  isMobile: boolean;
}) {
  const { t } = useTranslation();
  const versionItems = releases.map((r) => ({ id: String(r.id), label: r.tag_name || `#${r.release_id}` }));
  const selectedVersions = new Set(releases.filter((r) => !hiddenReleases.has(r.id)).map((r) => String(r.id)));

  return (
    <>
      {releases.length > 1 && (
        <div className="mb-3">
          <MultiSelectDropdown
            items={versionItems}
            selected={selectedVersions}
            onToggle={(id) => onToggleRelease(Number(id))}
            onSelectAll={onSelectAllReleases}
            onShowLatest={onShowLatestReleases}
            onDeselectAll={onDeselectAllReleases}
            label={t("repoDetail.versions")}
            latestLabel={t("repoDetail.latestN", { n: DEFAULT_VISIBLE })}
            isMobile={isMobile}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
        <span className="text-xs text-[var(--muted-foreground)] font-medium">{t("repoDetail.assets")}</span>
        <Button onClick={onSelectAllAssets} variant="subtle" size="compact-xs">{t("repoDetail.selectAll")}</Button>
        <Button onClick={onHideAllAssets} variant="subtle" size="compact-xs">{t("repoDetail.hideAll")}</Button>
        {topAssets.map((name, i) => (
          <label key={name} className="flex min-h-11 cursor-pointer select-none items-center gap-1.5 text-xs">
            <Checkbox
              checked={!hiddenAssets.has(name)}
              onChange={() => onToggleAsset(name)}
            />
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
            <span className="text-[var(--muted-foreground)] truncate max-w-[120px]" title={name}>
              {name.length > (isMobile ? 10 : 20) ? name.slice(0, isMobile ? 10 : 20) + "..." : name}
            </span>
          </label>
        ))}
      </div>
    </>
  );
}

function ReleaseDownloadsChart({ releases, topAssets, visibleAssets, visibleReleases, isMobile }: {
  releases: GithubRelease[];
  topAssets: string[];
  visibleAssets: string[];
  visibleReleases: GithubRelease[];
  isMobile: boolean;
}) {
  const { t } = useTranslation();

  const chartData = visibleReleases.map((rel) => {
    const row: Record<string, string | number> = { tag_name: rel.tag_name || "" };
    for (const name of visibleAssets) {
      const asset = rel.assets.find((a) => a.name === name);
      row[name] = asset?.download_count || 0;
    }
    return row;
  });

  const chartHeight = Math.max(isMobile ? 140 : 200, visibleReleases.length * (isMobile ? 36 : 50));

  return (
    <div role="img" aria-label={t("repoDetail.releasesDownloads")}>
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 10, top: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis type="number" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
          <YAxis type="category" dataKey="tag_name" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} width={isMobile ? 50 : 120} tickFormatter={(v: string) => v.length > (isMobile ? 6 : 15) ? v.slice(0, isMobile ? 6 : 15) + "..." : v} />
          <Tooltip
            contentStyle={CHART_TOOLTIP_CONTENT_STYLE}
            itemStyle={CHART_TOOLTIP_ITEM_STYLE}
            wrapperStyle={CHART_TOOLTIP_WRAPPER_STYLE}
            formatter={(value, name) => [String(value), String(name)]}
            labelFormatter={(label) => {
              const rel = releases.find((r) => r.tag_name === label);
              return rel ? `${rel.name || rel.tag_name} — ${rel.published_at ? formatDate(rel.published_at) : ""}` : label;
            }}
          />
          {visibleAssets.map((name) => (
            <Bar
              key={name}
              dataKey={name}
              stackId="assets"
              fill={COLORS[topAssets.indexOf(name) % COLORS.length]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ReleaseGrowthChart({ visibleReleases, growthData, growthDays, isPending, isMobile }: {
  visibleReleases: GithubRelease[];
  growthData: HistoryPoint[];
  growthDays: number;
  isPending: boolean;
  isMobile: boolean;
}) {
  const { t } = useTranslation();

  if (isPending) {
    return <p className="text-xs text-[var(--muted-foreground)] text-center py-4">{t("common.loading")}</p>;
  }

  const releaseKey = (releaseId: number) => `release:${releaseId}`;
  const hasGrowth = growthData.some((row) =>
    visibleReleases.some((release) => row[releaseKey(release.id)] != null),
  );
  if (!hasGrowth) {
    return <p className="text-xs text-[var(--muted-foreground)] text-center py-4">{t("repoDetail.noGrowthData")}</p>;
  }

  return (
    <div role="img" aria-label={t("repoDetail.downloadGrowthRate")}>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-2">
        {visibleReleases.map((release) => (
          <div key={release.id} className="flex items-center gap-1.5 text-xs">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: COLORS[release.id % COLORS.length] }}
            />
            <span>{release.tag_name || `#${release.release_id}`}</span>
          </div>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={isMobile ? 200 : 280}>
        <LineChart data={growthData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="day"
            type="number"
            domain={[1, growthDays]}
            ticks={Array.from({ length: growthDays }, (_, index) => index + 1)}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            interval={isMobile ? "preserveStartEnd" : 0}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            width={calcYAxisWidth(growthData, ...visibleReleases.map((release) => releaseKey(release.id)))}
            tickFormatter={(value: number) => value.toLocaleString()}
          />
          <Tooltip
            contentStyle={CHART_TOOLTIP_CONTENT_STYLE}
            itemStyle={CHART_TOOLTIP_ITEM_STYLE}
            wrapperStyle={CHART_TOOLTIP_WRAPPER_STYLE}
            formatter={(value, name) => [
              Number(value).toLocaleString(),
              String(name),
            ]}
            labelFormatter={(day) => String(day)}
          />
          {visibleReleases.map((release) => (
            <Line
              key={release.id}
              type="monotone"
              dataKey={releaseKey(release.id)}
              name={release.tag_name || `#${release.release_id}`}
              stroke={COLORS[release.id % COLORS.length]}
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function RepoDetail() {
  const { t } = useTranslation();
  const { accountId, repoId } = useParams();
  const navigate = useNavigate();
  const aid = Number(accountId);
  const rid = Number(repoId);
  const [days, setDays] = useState(30);
  const [growthDays, setGrowthDays] = useState(14);
  const [hiddenAssets, setHiddenAssets] = useState<Set<string>>(new Set());
  const [hiddenReleases, setHiddenReleases] = useState<Set<number> | null>(null);

  const { data: overview } = useQuery({
    queryKey: ["github", "overview", aid],
    queryFn: () => api.getGithubOverview(aid),
    enabled: !!aid,
  });

  const repo: GithubRepo | undefined = overview?.repos.find((r) => r.repo_id === rid);

  const { data: snapshots } = useQuery({
    queryKey: ["github", "snapshots", aid, rid, days],
    queryFn: () => api.getGithubRepoSnapshots(aid, rid, days),
    enabled: !!aid && !!rid,
  });

  const { data: clones } = useQuery({
    queryKey: ["github", "clones", aid, rid, days],
    queryFn: () => api.getGithubTrafficClones(aid, rid, days),
    enabled: !!aid && !!rid,
  });

  const { data: views } = useQuery({
    queryKey: ["github", "views", aid, rid, days],
    queryFn: () => api.getGithubTrafficViews(aid, rid, days),
    enabled: !!aid && !!rid,
  });

  const { data: referrers } = useQuery({
    queryKey: ["github", "referrers", aid, rid],
    queryFn: () => api.getGithubReferrers(aid, rid),
    enabled: !!aid && !!rid,
  });

  const { data: referrerHistory } = useQuery({
    queryKey: ["github", "referrers", "history", aid, rid, days],
    queryFn: () => api.getGithubReferrerHistory(aid, rid, days),
    enabled: !!aid && !!rid,
  });

  const { data: paths } = useQuery({
    queryKey: ["github", "paths", aid, rid],
    queryFn: () => api.getGithubPaths(aid, rid),
    enabled: !!aid && !!rid,
  });

  const { data: pathHistory } = useQuery({
    queryKey: ["github", "paths", "history", aid, rid, days],
    queryFn: () => api.getGithubPathHistory(aid, rid, days),
    enabled: !!aid && !!rid,
  });

  const { data: releases } = useQuery({
    queryKey: ["github", "releases", aid, rid],
    queryFn: () => api.getGithubReleases(aid, rid),
    enabled: !!aid && !!rid,
  });

  const { data: downloadTimeline, isPending: growthPending } = useQuery({
    queryKey: ["github", "release-growth", aid, rid, growthDays],
    queryFn: () => api.getGithubReleaseDownloadTimeline(aid, rid, growthDays),
    enabled: !!aid && !!rid,
  });

  const topAssets = useMemo(() => {
    if (!releases) return [];
    const sums = new Map<string, number>();
    for (const rel of releases) {
      for (const a of rel.assets) {
        sums.set(a.name, (sums.get(a.name) || 0) + a.download_count);
      }
    }
    return [...sums.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name]) => name);
  }, [releases]);

  const effectiveHiddenReleases = hiddenReleases ?? new Set((releases ?? []).slice(DEFAULT_VISIBLE).map((r) => r.id));
  const visibleAssets = topAssets.filter((name) => !hiddenAssets.has(name));
  const visibleReleases = (releases ?? []).filter((r) => !effectiveHiddenReleases.has(r.id));

  const growthData = useMemo(() => {
    const timelineByRelease = new Map(
      (downloadTimeline ?? []).map((release) => [release.release_id, release.points]),
    );
    return Array.from({ length: growthDays }, (_, index) => {
      const day = index + 1;
      const row: HistoryPoint = { day };
      for (const release of visibleReleases) {
        const point = timelineByRelease.get(release.id)?.find((item) => item.day === day);
        row[`release:${release.id}`] = point
          ? sumSelectedAssetDownloads(point, visibleAssets)
          : null;
      }
      return row;
    });
  }, [downloadTimeline, growthDays, visibleAssets, visibleReleases]);

  const toggleAsset = (name: string) => {
    setHiddenAssets((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleRelease = (id: number) => {
    setHiddenReleases((prev) => {
      const base = prev ?? new Set((releases ?? []).slice(DEFAULT_VISIBLE).map((r) => r.id));
      const next = new Set(base);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isMobile = useIsMobile();
  const CHART_H = isMobile ? 180 : 250;
  const TALL_CHART_H = isMobile ? 200 : 300;
  const MARGIN = { top: 5, right: 5, left: 0, bottom: 5 };

  if (!repo) {
    return (
      <div className="text-center py-12">
        <p className="text-[var(--muted-foreground)]">{t("repoDetail.notFound")}</p>
        <Button onClick={() => navigate(`/github/${aid}`)} variant="subtle" size="sm" mt="md">{t("repoDetail.backToAccount")}</Button>
      </div>
    );
  }

  const openIssues = repo.open_issues_only ?? (
    repo.open_pull_requests == null ? null : Math.max(repo.open_issues - repo.open_pull_requests, 0)
  );
  const openPullRequests = repo.open_pull_requests;
  const splitUnavailable = openIssues == null || openPullRequests == null;

  let referrerHistoryChart: HistoryPoint[] | null = null;
  const referrerHistoryData = referrerHistory;
  const referrersData = referrers;
  if (referrerHistoryData && referrerHistoryData.length > 0 && referrersData?.length) {
    const refs = referrersData.slice(0, 10).map(r => r.referrer);
    if (refs.length > 0) {
      const dates = [...new Set(referrerHistoryData.map((r) => r.snapshot_date))].sort() as string[];
      referrerHistoryChart = dates.map((date: string) => {
        const point: HistoryPoint = { date };
        for (const ref of refs) {
          const entry = referrerHistoryData.find((r) => r.referrer === ref && r.snapshot_date === date);
          point[ref] = entry?.count || 0;
        }
        return point;
      });
    }
  }

  let pathHistoryChart: HistoryPoint[] | null = null;
  const pathHistoryData = pathHistory;
  const pathsData = paths;
  if (pathHistoryData && pathHistoryData.length > 0 && pathsData?.length) {
    const pts = pathsData.slice(0, 10).map(p => p.path);
    if (pts.length > 0) {
      const dates = [...new Set(pathHistoryData.map((p) => p.snapshot_date))].sort() as string[];
      pathHistoryChart = dates.map((date: string) => {
        const point: HistoryPoint = { date };
        for (const pp of pts) {
          const entry = pathHistoryData.find((h) => h.path === pp && h.snapshot_date === date);
          point[pp] = entry?.count || 0;
        }
        return point;
      });
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="detail-header">
        <div className="detail-header-body">
        <Button onClick={() => navigate(`/github/${aid}`)} variant="subtle" color="gray" size="lg" px="xs" title={t("repoDetail.backToAccount")} aria-label={t("repoDetail.backToAccount")}>
          <ArrowLeft size={20} />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-semibold leading-tight">{repo.full_name}</h2>
            {repo.language && <Badge>{repo.language}</Badge>}
            {repo.is_fork ? <Badge>{t("badge.fork")}</Badge> : null}
          </div>
          {repo.description && <p className="text-sm text-[var(--muted-foreground)] line-clamp-2">{repo.description}</p>}
        </div>
        </div>
        <a href={`https://github.com/${repo.full_name}`} target="_blank" rel="noopener noreferrer"
          className="detail-header-actions flex items-center gap-1.5 px-3 py-2.5 min-h-11 rounded-lg bg-[var(--muted)] hover:bg-[var(--border)] transition-colors text-xs">
          <ExternalLink size={12} /> {t("repoDetail.open")}
        </a>
      </div>

      <div className="mobile-detail-controls">
        <TimeRangeSelector value={days} onChange={setDays} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
        <Card><CardContent className="p-4 pt-4 sm:p-4 sm:pt-4 text-center"><Star size={16} className="inline mb-1 text-[var(--muted-foreground)]" /><p className="text-2xl font-bold font-mono tabular-nums">{repo.stars.toLocaleString()}</p><p className="text-xs text-[var(--muted-foreground)]">{t("repoDetail.stars")}</p></CardContent></Card>
        <Card><CardContent className="p-4 pt-4 sm:p-4 sm:pt-4 text-center"><GitFork size={16} className="inline mb-1 text-[var(--muted-foreground)]" /><p className="text-2xl font-bold font-mono tabular-nums">{repo.forks.toLocaleString()}</p><p className="text-xs text-[var(--muted-foreground)]">{t("repoDetail.forks")}</p></CardContent></Card>
        <Card>
          <CardContent className="p-4 pt-4 sm:p-4 sm:pt-4 text-center">
            <CircleDot size={16} className="inline mb-1 text-[var(--muted-foreground)]" />
            <p className="text-2xl font-bold font-mono tabular-nums" title={splitUnavailable ? t("repoDetail.splitUnavailable") : undefined}>{openIssues == null ? "—" : openIssues.toLocaleString()}</p>
            <p className="text-xs text-[var(--muted-foreground)]">{t("repoDetail.openIssues")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 pt-4 sm:p-4 sm:pt-4 text-center">
            <GitPullRequest size={16} className="inline mb-1 text-[var(--muted-foreground)]" />
            <p className="text-2xl font-bold font-mono tabular-nums" title={splitUnavailable ? t("repoDetail.splitUnavailable") : undefined}>{openPullRequests == null ? "—" : openPullRequests.toLocaleString()}</p>
            <p className="text-xs text-[var(--muted-foreground)]">{t("repoDetail.openPullRequests")}</p>
          </CardContent>
        </Card>
      </div>

      <ChartCard
        title={t("repoDetail.starHistory")}
        description={t("repoDetail.starHistoryDesc")}
        icon={<TrendingUp size={18} />}
      >
          {snapshots && snapshots.length > 1 ? (
            <div role="img" aria-label={t("repoDetail.starHistory")}>
            <ResponsiveContainer width="100%" height={CHART_H}>
              <AreaChart data={snapshots} margin={MARGIN}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickFormatter={(v) => v.slice(5)} />
                <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} width={calcYAxisWidth(snapshots, "stars")} />
                <Tooltip contentStyle={CHART_TOOLTIP_CONTENT_STYLE} itemStyle={CHART_TOOLTIP_ITEM_STYLE} wrapperStyle={CHART_TOOLTIP_WRAPPER_STYLE} />
                <Area type="monotone" dataKey="stars" stroke="var(--chart-3)" fill="color-mix(in oklch, var(--chart-3) 12%, transparent)" name={t("repoDetail.stars")} />
              </AreaChart>
            </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex items-center justify-center text-sm text-[var(--muted-foreground)]" style={{ height: CHART_H }}>
              {snapshots?.length === 1 ? t("repoDetail.onlyOneDataPoint") : t("repoDetail.noStarHistory")}
            </div>
          )}
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard
          title={t("repoDetail.gitClones")}
          description={t("repoDetail.gitClonesDesc")}
          icon={<Download size={18} />}
        >
            {clones && clones.length > 0 ? (
              <div role="img" aria-label={t("repoDetail.gitClones")}>
              <ResponsiveContainer width="100%" height={CHART_H}>
                <BarChart data={clones} margin={MARGIN}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickFormatter={(v) => v.slice(5)} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} width={calcYAxisWidth(clones, "count", "uniques")} />
                  <Tooltip contentStyle={CHART_TOOLTIP_CONTENT_STYLE} itemStyle={CHART_TOOLTIP_ITEM_STYLE} wrapperStyle={CHART_TOOLTIP_WRAPPER_STYLE} />
                  <Bar dataKey="count" fill="var(--chart-1)" radius={[4, 4, 0, 0]} name={t("repoDetail.clones")} />
                  <Bar dataKey="uniques" fill="var(--chart-3)" radius={[4, 4, 0, 0]} name={t("repoDetail.uniqueCloners")} />
                </BarChart>
              </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex items-center justify-center text-sm text-[var(--muted-foreground)]" style={{ height: CHART_H }}>
                {t("repoDetail.noCloneData")}
              </div>
            )}
        </ChartCard>

        <ChartCard
          title={t("repoDetail.visitors")}
          description={t("repoDetail.visitorsDesc")}
          icon={<Eye size={18} />}
        >
            {views && views.length > 0 ? (
              <div role="img" aria-label={t("repoDetail.visitors")}>
              <ResponsiveContainer width="100%" height={CHART_H}>
                <BarChart data={views} margin={MARGIN}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickFormatter={(v) => v.slice(5)} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} width={calcYAxisWidth(views, "count", "uniques")} />
                  <Tooltip contentStyle={CHART_TOOLTIP_CONTENT_STYLE} itemStyle={CHART_TOOLTIP_ITEM_STYLE} wrapperStyle={CHART_TOOLTIP_WRAPPER_STYLE} />
                  <Bar dataKey="count" fill="var(--chart-2)" radius={[4, 4, 0, 0]} name={t("repoDetail.views")} />
                  <Bar dataKey="uniques" fill="var(--chart-5)" radius={[4, 4, 0, 0]} name={t("repoDetail.uniqueVisitors")} />
                </BarChart>
              </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex items-center justify-center text-sm text-[var(--muted-foreground)]" style={{ height: CHART_H }}>
                {t("repoDetail.noTrafficData")}
              </div>
            )}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard
          title={t("repoDetail.referringSites")}
          description={t("repoDetail.referringSitesDesc")}
          icon={<Globe size={18} />}
        >
            {referrers && referrers.length > 0 ? (
              <div className="space-y-4">
                <TrafficMetricList
                  label={t("repoDetail.referrerSource")}
                  primaryLabel={t("repoDetail.views")}
                  secondaryLabel={t("repoDetail.uniqueVisitors")}
                >
                  {referrers.map((ref) => (
                    <div key={ref.referrer} className="flex items-center justify-between rounded px-1 py-1.5 hover:bg-[var(--accent)]">
                      <span className="truncate text-sm" title={ref.referrer}>{ref.referrer}</span>
                      <span className="flex shrink-0 gap-2 text-sm tabular-nums text-[var(--muted-foreground)] sm:gap-6">
                        <span className="w-12 text-right sm:w-16">{(ref.count ?? 0).toLocaleString()}</span>
                        <span className="w-12 text-right sm:w-16">{(ref.uniques ?? 0).toLocaleString()}</span>
                      </span>
                    </div>
                  ))}
                </TrafficMetricList>
                {referrerHistoryChart && referrerHistoryChart.length >= 2 ? (
                  <div role="img" aria-label={t("repoDetail.referringSites")}>
                    <p className="mb-2 text-xs font-medium text-[var(--muted-foreground)]">{t("repoDetail.trend")}</p>
                    <div className={`flex flex-wrap gap-x-3 gap-y-0.5 mb-2 ${isMobile ? "text-[11px]" : "text-xs"}`}>
                      {referrers.slice(0, 10).map((ref, i) => (
                        <span key={ref.referrer} className="flex items-center gap-1">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: COLORS[i] }} />
                          <span className="truncate max-w-[120px] text-[var(--muted-foreground)]">{ref.referrer}</span>
                        </span>
                      ))}
                    </div>
                    <ResponsiveContainer width="100%" height={TALL_CHART_H}>
                      <LineChart data={referrerHistoryChart} margin={MARGIN}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickFormatter={(v) => v.slice(5)} />
                        <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} width={calcYAxisWidth(referrerHistoryChart, ...(referrers.slice(0, 10).map(r => r.referrer)))} />
                        <Tooltip contentStyle={CHART_TOOLTIP_CONTENT_STYLE} itemStyle={CHART_TOOLTIP_ITEM_STYLE} wrapperStyle={CHART_TOOLTIP_WRAPPER_STYLE} />
                        {referrers.slice(0, 10).map((ref, i) => (
                          <Line key={ref.referrer} type="monotone" dataKey={ref.referrer} stroke={COLORS[i]} strokeWidth={2} dot={false} />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-[var(--muted-foreground)] text-center py-12">{t("repoDetail.noReferrerData")}</p>
            )}
        </ChartCard>

        <ChartCard
          title={t("repoDetail.popularContent")}
          description={t("repoDetail.popularContentDesc")}
          icon={<FileText size={18} />}
        >
            {paths && paths.length > 0 ? (
              <div className="space-y-4">
                <TrafficMetricList
                  label={t("repoDetail.contentPath")}
                  primaryLabel={t("repoDetail.views")}
                  secondaryLabel={t("repoDetail.uniqueVisitors")}
                >
                  {paths.map((p) => (
                    <div key={p.path} className="flex items-center justify-between rounded px-1 py-1.5 hover:bg-[var(--accent)]">
                      <span className="truncate text-sm" title={p.title || p.path}>{p.path}</span>
                      <span className="flex shrink-0 gap-2 text-sm tabular-nums text-[var(--muted-foreground)] sm:gap-6">
                        <span className="w-12 text-right sm:w-16">{(p.count ?? 0).toLocaleString()}</span>
                        <span className="w-12 text-right sm:w-16">{(p.uniques ?? 0).toLocaleString()}</span>
                      </span>
                    </div>
                  ))}
                </TrafficMetricList>
                {pathHistoryChart && pathHistoryChart.length >= 2 ? (
                  <div role="img" aria-label={t("repoDetail.popularContent")}>
                    <p className="mb-2 text-xs font-medium text-[var(--muted-foreground)]">{t("repoDetail.trend")}</p>
                    <div className={`flex flex-wrap gap-x-3 gap-y-0.5 mb-2 ${isMobile ? "text-[11px]" : "text-xs"}`}>
                      {paths.slice(0, 10).map((p, i) => (
                        <span key={p.path} className="flex items-center gap-1">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: COLORS[i] }} />
                          <span className="truncate max-w-[120px] text-[var(--muted-foreground)]">{p.path}</span>
                        </span>
                      ))}
                    </div>
                    <ResponsiveContainer width="100%" height={TALL_CHART_H}>
                      <LineChart data={pathHistoryChart} margin={MARGIN}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickFormatter={(v) => v.slice(5)} />
                        <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} width={calcYAxisWidth(pathHistoryChart, ...(paths.slice(0, 10).map(p => p.path)))} />
                        <Tooltip contentStyle={CHART_TOOLTIP_CONTENT_STYLE} itemStyle={CHART_TOOLTIP_ITEM_STYLE} wrapperStyle={CHART_TOOLTIP_WRAPPER_STYLE} />
                        {paths.slice(0, 10).map((p, i) => (
                          <Line key={p.path} type="monotone" dataKey={p.path} stroke={COLORS[i]} strokeWidth={2} dot={false} />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-[var(--muted-foreground)] text-center py-12">{t("repoDetail.noPopularContent")}</p>
            )}
        </ChartCard>
      </div>

      <ChartCard
        title={t("repoDetail.releasesDownloads")}
        description={t("repoDetail.releasesDownloadsDesc")}
        icon={<Download size={18} />}
      >
          {releases && releases.length > 0 ? (
            <>
              <ReleaseChartControls
                releases={releases}
                topAssets={topAssets}
                hiddenAssets={hiddenAssets}
                hiddenReleases={effectiveHiddenReleases}
                onToggleAsset={toggleAsset}
                onToggleRelease={toggleRelease}
                onSelectAllAssets={() => setHiddenAssets(new Set())}
                onHideAllAssets={() => setHiddenAssets(new Set(topAssets))}
                onSelectAllReleases={() => setHiddenReleases(new Set())}
                onShowLatestReleases={() => setHiddenReleases(new Set((releases ?? []).slice(DEFAULT_VISIBLE).map((r) => r.id)))}
                onDeselectAllReleases={() => setHiddenReleases(new Set((releases ?? []).map((r) => r.id)))}
                isMobile={isMobile}
              />
              {visibleAssets.length === 0 || visibleReleases.length === 0 ? (
                <p className="text-xs text-[var(--muted-foreground)] text-center py-4">{t("repoDetail.noAssetsSelected")}</p>
              ) : (
                <>
                  <ReleaseDownloadsChart
                    releases={releases}
                    topAssets={topAssets}
                    visibleAssets={visibleAssets}
                    visibleReleases={visibleReleases}
                    isMobile={isMobile}
                  />
                  <div className="mt-6 border-t border-[var(--border)] pt-4">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{t("repoDetail.downloadGrowthRate")}</p>
                        <p className="text-xs text-[var(--muted-foreground)]">{t("repoDetail.downloadTimelineDesc")}</p>
                      </div>
                      <TimeRangeSelector value={growthDays} onChange={setGrowthDays} options={GROWTH_TIME_OPTIONS} />
                    </div>
                    <ReleaseGrowthChart
                      visibleReleases={visibleReleases}
                      growthData={growthData}
                      growthDays={growthDays}
                      isPending={growthPending}
                      isMobile={isMobile}
                    />
                  </div>
                </>
              )}
            </>
          ) : (
            <p className="text-sm text-[var(--muted-foreground)] text-center py-8">
              {t("repoDetail.noReleases")}
            </p>
          )}
      </ChartCard>
    </div>
  );
}
