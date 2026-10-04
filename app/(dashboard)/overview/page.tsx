import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Await, Link, redirect, useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { requireSession } from "@/lib/auth-helpers";
import { getRequestTimezone } from "@/lib/timezone.server";
import { getOverviewReadModel } from "@/lib/services/overview";
import { projectOverviewReadModel } from "@/lib/services/overview-projection";
import type { OverviewPageData } from "@/lib/client/graphql/overview";
import { useTranslation } from "react-i18next";
import { ArrowUpRight, Layers3, MessageSquareText, Star, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MetricCard, MetricCardSkeleton } from "@/components/domain/shared/MetricCard";
import { MetricGrid } from "@/components/domain/shared/MetricGrid";
import { ChartCardSkeleton, Skeleton } from "@/components/Skeleton";
import { GithubIcon, GitlabIcon, RedditIcon, XIcon } from "@/components/BrandIcons";
import { pageMeta, type PageTitleKey, type TitleHandle } from "@/lib/page-titles";
import { isSupportedPlatform } from "@/lib/platforms";
import { FetchHealthSection } from "./FetchHealthSection";
import { PulseSection } from "./PulseSection";
import { TopContentSection } from "./TopContentSection";
import { useOverviewData } from "./useOverviewData";
import { WebAnalyticsSection } from "./WebAnalyticsSection";

const XSection = lazy(() => import("./XSection").then((module) => ({ default: module.XSection })));
const GitHubSection = lazy(() => import("./GitHubSection").then((module) => ({ default: module.GitHubSection })));
const GitLabSection = lazy(() => import("./GitLabSection").then((module) => ({ default: module.GitLabSection })));
const RedditSection = lazy(() => import("./RedditSection").then((module) => ({ default: module.RedditSection })));

function PlatformSectionSkeleton() {
  return <div className="space-y-3" aria-label="Loading platform details"><Skeleton className="h-24 w-full" /><div className="grid gap-3 lg:grid-cols-2"><Skeleton className="h-48 w-full" /><Skeleton className="h-48 w-full" /></div></div>;
}

const titleKey = "nav.overview" satisfies PageTitleKey;
export const meta = pageMeta(titleKey);
export const handle = { titleKey } satisfies TitleHandle;

const initialParams = { pulseDays: 7, contentDays: 7, analyticsRange: "DAYS_7" as const };

export async function loader({ request }: LoaderFunctionArgs) {
  const authenticated = await requireSession(request);
  if (!authenticated) {
    const url = new URL(request.url);
    const from = `${url.pathname}${url.search}`;
    throw redirect(`/login?from=${encodeURIComponent(from)}`);
  }

  const overviewData = getOverviewReadModel(authenticated.user, {
    ...initialParams,
    timezone: getRequestTimezone(request),
  }).then((readModel) => projectOverviewReadModel(readModel) as unknown as OverviewPageData);
  void overviewData.catch(() => {});
  return { overviewData };
}

function OverviewSkeleton() {
  const { t } = useTranslation();
  return (
    <div className="space-y-8" aria-label={t("overview.heading")}>
      <div className="space-y-2"><Skeleton className="h-8 w-40" /><Skeleton className="h-4 w-72 max-w-full" /></div>
      <MetricGrid>{Array.from({ length: 4 }, (_, index) => <MetricCardSkeleton key={index} />)}</MetricGrid>
      <div className="grid gap-4 xl:grid-cols-2"><ChartCardSkeleton /><ChartCardSkeleton /></div>
      <ChartCardSkeleton />
    </div>
  );
}

export default function Overview() {
  const { overviewData } = useLoaderData<typeof loader>();
  return <Suspense fallback={<OverviewSkeleton />}><Await resolve={overviewData} errorElement={<OverviewLoadError />}>
    {(data) => <OverviewContent data={data as unknown as OverviewPageData} />}
  </Await></Suspense>;
}

function OverviewLoadError() {
  const { t } = useTranslation();
  return <p role="alert" className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">{t("overview.health.unavailable")}</p>;
}

function OverviewContent({ data: pageData }: { data: OverviewPageData }) {
  const { t } = useTranslation();
  const data = useOverviewData(pageData);
  const platformSectionRef = useRef<HTMLDivElement>(null);
  const [platformsNearViewport, setPlatformsNearViewport] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState("");

  useEffect(() => {
    const element = platformSectionRef.current;
    if (!element || platformsNearViewport) return;
    if (typeof IntersectionObserver === "undefined") {
      const timeout = window.setTimeout(() => setPlatformsNearViewport(true), 0);
      return () => window.clearTimeout(timeout);
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setPlatformsNearViewport(true);
        observer.disconnect();
      }
    }, { rootMargin: "600px 0px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [platformsNearViewport]);
  const {
    stats, timeline, topLiked, allAccounts,
    xAccounts, ghAccounts, glAccounts, redditAccounts,
    ghItemCount, ghPinned, ghTotalStars, ghTotalForks, ghFollowers,
    glItemCount, glPinned, glTotalStars, glTotalForks, glFollowers,
    redditPostKarma, redditCommentKarma, redditTotalPosts, redditTotalComments,
    redditKarmaTimeline, redditDailyActivity, mergedSubreddits,
    pulse, topContent, fetchHealth, analyticsPortfolio, isError,
  } = data;
  const monitoredAccounts = allAccounts.filter((account) => isSupportedPlatform(account.platform));

  if (isError || !pulse || !topContent || !fetchHealth || !analyticsPortfolio) {
    return <p role="alert" className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">{t("overview.health.unavailable")}</p>;
  }

  const platformTabs = [
    { value: "x", label: t("nav.x"), icon: <XIcon />, enabled: xAccounts.length > 0 },
    { value: "github", label: t("nav.github"), icon: <GithubIcon />, enabled: ghAccounts.length > 0 },
    { value: "gitlab", label: t("nav.gitlab"), icon: <GitlabIcon />, enabled: glAccounts.length > 0 },
    { value: "reddit", label: t("nav.reddit"), icon: <RedditIcon />, enabled: redditAccounts.length > 0 },
  ].filter((platform) => platform.enabled);
  const activePlatform = platformTabs.some((platform) => platform.value === selectedPlatform)
    ? selectedPlatform
    : platformTabs[0]?.value ?? "";
  const followers = (stats?.followersCount ?? 0) + ghFollowers + glFollowers;
  const codeStars = ghTotalStars + glTotalStars;
  const redditKarma = redditPostKarma + redditCommentKarma;

  return (
    <div className="space-y-8" data-overview-ready="true">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">{t("overview.heading")}</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {monitoredAccounts.length === 0 ? t("overview.description_addPrompt") : t("login.tagline")}
          </p>
        </div>
        <Button asChild variant="outline" className="w-full shrink-0 sm:w-auto">
          <Link to="/accounts">{t("nav.accounts")}<ArrowUpRight aria-hidden="true" /></Link>
        </Button>
      </div>

      <section aria-label={t("overview.heading")} className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">{t("common.dashboard")}</h2>
          <span className="text-xs text-muted-foreground">{t("overview.stats.trackedAccounts")}: {monitoredAccounts.length}</span>
        </div>
        <MetricGrid>
          <MetricCard icon={<Layers3 />} label={t("overview.stats.trackedAccounts")} value={monitoredAccounts.length} />
          <MetricCard icon={<Users />} label={t("overview.stats.followers")} value={followers} />
          <MetricCard icon={<Star />} label={t("overview.stats.totalStars")} value={codeStars} />
          <MetricCard icon={<MessageSquareText />} label={t("overview.stats.totalKarma")} value={redditKarma} hint={`${redditTotalPosts.toLocaleString()} ${t("overview.stats.redditPosts")} · ${redditTotalComments.toLocaleString()} ${t("overview.stats.redditComments")}`} />
        </MetricGrid>
      </section>

      <WebAnalyticsSection initialData={analyticsPortfolio} />

      <section aria-label={t("overview.pulse.heading")} className="grid min-w-0 gap-4 xl:grid-cols-2 [&>*]:min-w-0">
        <PulseSection initialData={pulse} />
        <FetchHealthSection data={fetchHealth} />
      </section>

      <section aria-label={t("overview.topContent.heading")}>
        <TopContentSection initialData={topContent} />
      </section>

      {platformTabs.length > 0 && (
        <div ref={platformSectionRef}>
          <section className="space-y-4" aria-label={t("common.platforms")}>
            <div className="space-y-1">
              <h2 className="text-lg font-semibold tracking-tight">{t("common.platforms")}</h2>
              <p className="text-sm text-muted-foreground">{t("overview.platformsDescription")}</p>
            </div>
            <Tabs value={activePlatform} onValueChange={setSelectedPlatform}>
              <div className="w-full overflow-x-auto pb-1">
                <TabsList className="w-max min-w-full justify-start sm:min-w-0">
                  {platformTabs.map((platform) => (
                    <TabsTrigger key={platform.value} value={platform.value} className="gap-2 px-3">
                      {platform.icon}<span>{platform.label}</span>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
              {xAccounts.length > 0 && <TabsContent value="x" className="mt-4">{activePlatform === "x" && platformsNearViewport ? <Suspense fallback={<PlatformSectionSkeleton />}><XSection stats={stats} timeline={timeline} topLiked={topLiked} xAccounts={xAccounts} /></Suspense> : activePlatform === "x" ? <PlatformSectionSkeleton /> : null}</TabsContent>}
              {ghAccounts.length > 0 && <TabsContent value="github" className="mt-4">{activePlatform === "github" && platformsNearViewport ? <Suspense fallback={<PlatformSectionSkeleton />}><GitHubSection ghRepoCount={ghItemCount} ghPinned={ghPinned} ghTotalStars={ghTotalStars} ghTotalForks={ghTotalForks} ghFollowers={ghFollowers} ghAccounts={ghAccounts} /></Suspense> : activePlatform === "github" ? <PlatformSectionSkeleton /> : null}</TabsContent>}
              {glAccounts.length > 0 && <TabsContent value="gitlab" className="mt-4">{activePlatform === "gitlab" && platformsNearViewport ? <Suspense fallback={<PlatformSectionSkeleton />}><GitLabSection glProjectCount={glItemCount} glPinned={glPinned} glTotalStars={glTotalStars} glTotalForks={glTotalForks} glFollowers={glFollowers} glAccounts={glAccounts} /></Suspense> : activePlatform === "gitlab" ? <PlatformSectionSkeleton /> : null}</TabsContent>}
              {redditAccounts.length > 0 && <TabsContent value="reddit" className="mt-4">{activePlatform === "reddit" && platformsNearViewport ? <Suspense fallback={<PlatformSectionSkeleton />}><RedditSection postKarma={redditPostKarma} commentKarma={redditCommentKarma} totalPosts={redditTotalPosts} totalComments={redditTotalComments} karmaTimeline={redditKarmaTimeline} dailyActivity={redditDailyActivity} mergedSubreddits={mergedSubreddits} /></Suspense> : activePlatform === "reddit" ? <PlatformSectionSkeleton /> : null}</TabsContent>}
            </Tabs>
          </section>
        </div>
      )}

      {monitoredAccounts.length === 0 && (
        <div className="rounded-lg border border-dashed p-6 text-center sm:p-10">
          <p className="font-medium">{t("overview.noAccounts")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("overview.description_addPrompt")}</p>
          <Button asChild className="mt-4"><Link to="/accounts">{t("nav.accounts")}</Link></Button>
        </div>
      )}
    </div>
  );
}
