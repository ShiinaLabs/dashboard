import type { Account } from "@/lib/api";
import type { OverviewPageData } from "@/lib/client/graphql/overview";

export function useOverviewData(page: OverviewPageData) {
  const allAccounts = page?.accounts ?? [];
  const xAccounts = allAccounts.filter((account: Account) => account.platform === "twitter");
  const ghAccounts = allAccounts.filter((account: Account) => account.platform === "github");
  const glAccounts = allAccounts.filter((account: Account) => account.platform === "gitlab");
  const redditAccounts = allAccounts.filter((account: Account) => account.platform === "reddit");
  const ghPinned = (page?.github.pinned ?? []).map((repo) => ({ ...repo, repo_id: repo.external_id, pinned: 1 }));
  const glPinned = (page?.gitlab.pinned ?? []).map((project) => ({ ...project, project_id: project.external_id, pinned: 1 }));
  const reddit = page?.reddit;

  return {
    stats: page?.stats,
    timeline: page?.timeline,
    topLiked: page?.topLiked,
    allAccounts,
    xAccounts,
    ghAccounts,
    glAccounts,
    redditAccounts,
    ghPinned,
    ghItemCount: page?.github.itemCount ?? 0,
    ghTotalStars: page?.github.stars ?? 0,
    ghTotalForks: page?.github.forks ?? 0,
    ghFollowers: page?.github.followers ?? 0,
    glPinned,
    glItemCount: page?.gitlab.itemCount ?? 0,
    glTotalStars: page?.gitlab.stars ?? 0,
    glTotalForks: page?.gitlab.forks ?? 0,
    glFollowers: page?.gitlab.followers ?? 0,
    redditPostKarma: reddit?.postKarma ?? 0,
    redditCommentKarma: reddit?.commentKarma ?? 0,
    redditTotalPosts: reddit?.totalPosts ?? 0,
    redditTotalComments: reddit?.totalComments ?? 0,
    redditKarmaTimeline: reddit?.karmaTimeline ?? [],
    redditDailyActivity: reddit?.dailyActivity ?? [],
    mergedSubreddits: reddit?.subreddits ?? [],
    pulse: page?.pulse,
    topContent: page?.topContent,
    fetchHealth: page?.fetchHealth,
    analyticsPortfolio: page?.analyticsPortfolio,
    isLoading: false,
    isError: false,
  };
}
