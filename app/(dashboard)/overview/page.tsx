import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { XIcon, GithubIcon, GitlabIcon, RedditIcon } from "@/components/BrandIcons";
import { ChartCardSkeleton, Skeleton } from "@/components/Skeleton";
import { MetricCardSkeleton } from "@/components/domain/shared/MetricCard";
import { MetricGrid } from "@/components/domain/shared/MetricGrid";
import { useOverviewData } from "./useOverviewData";
import { FetchHealthSection } from "./FetchHealthSection";
import { PulseSection } from "./PulseSection";
import { TopContentSection } from "./TopContentSection";
import { XSection } from "./XSection";
import { GitHubSection } from "./GitHubSection";
import { GitLabSection } from "./GitLabSection";
import { RedditSection } from "./RedditSection";
import { isSupportedPlatform } from "@/lib/platforms";

export default function Overview() {
  const { t } = useTranslation();
  const data = useOverviewData();
  const {
    stats, timeline, topLiked, allAccounts,
    xAccounts, ghAccounts, glAccounts, redditAccounts,
    ghOverviews, ghAllRepos, ghPinned, ghTotalStars, ghTotalForks,
    glOverviews, glAllProjects, glPinned, glTotalStars, glTotalForks,
    redditOverviews, redditKarmaTimeline, redditDailyActivity, mergedSubreddits,
    isLoading,
  } = data;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div><Skeleton className="h-6 w-32 mb-1" /></div>
        </div>
        <MetricGrid columns="five">
          {Array.from({ length: 5 }).map((_, i) => <MetricCardSkeleton key={i} />)}
        </MetricGrid>
        <MetricGrid>
          {Array.from({ length: 4 }).map((_, i) => <MetricCardSkeleton key={i} />)}
        </MetricGrid>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <ChartCardSkeleton /><ChartCardSkeleton />
        </div>
        <ChartCardSkeleton />
      </div>
    );
  }

  const ghFollowers = ghOverviews.reduce((s, o) => s + (o.data?.stats?.followers ?? 0), 0);
  const glFollowers = glOverviews.reduce((s, o) => s + (o.data?.stats?.followers ?? 0), 0);
  const redditPostKarma = redditOverviews.reduce((s, o) => s + (o.data?.stats?.post_karma ?? 0), 0);
  const redditCommentKarma = redditOverviews.reduce((s, o) => s + (o.data?.stats?.comment_karma ?? 0), 0);
  const redditTotalPosts = redditOverviews.reduce((s, o) => s + (o.data?.totalPosts ?? 0), 0);
  const redditTotalComments = redditOverviews.reduce((s, o) => s + (o.data?.totalComments ?? 0), 0);
  const monitoredAccounts = allAccounts.filter((acc) => isSupportedPlatform(acc.platform));

  const showSepX_GH = xAccounts.length > 0 && ghAccounts.length > 0;
  const showSepGH_GL = (xAccounts.length > 0 || ghAccounts.length > 0) && glAccounts.length > 0;
  const showSepGL_Reddit = (xAccounts.length > 0 || ghAccounts.length > 0 || glAccounts.length > 0) && redditAccounts.length > 0;

  return (
    <div className="overview-page space-y-7">
      <div className="overview-page-header">
        <div>
          <p className="overview-page-kicker">{t("common.dashboard")}</p>
          <h2 className="overview-page-title">{t("overview.heading")}</h2>
          {monitoredAccounts.length === 0 && (
            <p className="overview-page-description">{t("overview.description_addPrompt")}</p>
          )}
        </div>
        {monitoredAccounts.length > 0 && (
          <div className="overview-account-list">
            {monitoredAccounts.map((acc: { id: number; platform: string; screen_name: string; error_message?: string | null }) => (
              <Badge
                key={acc.id}
                className="overview-account-chip"
                leftSection={acc.platform === "twitter" ? <XIcon /> : acc.platform === "github" ? <GithubIcon /> : acc.platform === "gitlab" ? <GitlabIcon /> : <RedditIcon />}
                rightSection={acc.error_message ? <span className="overview-account-alert">!</span> : undefined}
              >
                {acc.platform === "twitter" ? `@${acc.screen_name}` : acc.screen_name}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <FetchHealthSection />
      <PulseSection />
      <TopContentSection />
      <XSection stats={stats} timeline={timeline} topLiked={topLiked} xAccounts={xAccounts} />

      {showSepX_GH && <Separator />}

      <GitHubSection
        ghAllRepos={ghAllRepos}
        ghPinned={ghPinned}
        ghTotalStars={ghTotalStars}
        ghTotalForks={ghTotalForks}
        ghFollowers={ghFollowers}
        ghAccounts={ghAccounts}
      />

      {showSepGH_GL && <Separator />}

      <GitLabSection
        glAllProjects={glAllProjects}
        glPinned={glPinned}
        glTotalStars={glTotalStars}
        glTotalForks={glTotalForks}
        glFollowers={glFollowers}
        glAccounts={glAccounts}
      />

      {showSepGL_Reddit && <Separator />}

      {redditAccounts.length > 0 && (
        <RedditSection
          postKarma={redditPostKarma}
          commentKarma={redditCommentKarma}
          totalPosts={redditTotalPosts}
          totalComments={redditTotalComments}
          karmaTimeline={redditKarmaTimeline}
          dailyActivity={redditDailyActivity}
          mergedSubreddits={mergedSubreddits}
        />
      )}

      {monitoredAccounts.length === 0 && (
        <p className="text-xs text-[var(--muted-foreground)] italic">{t("overview.noAccounts")}</p>
      )}
    </div>
  );
}
