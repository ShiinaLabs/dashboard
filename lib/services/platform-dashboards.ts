import type { AuthUser } from "@/lib/auth-helpers";
import { getVisibleAccountDetails } from "@/lib/services/accounts";
import { getGitlabOverview, getGitlabContributions, getGitlabProjectSnapshots, getGitlabReleases } from "@/lib/services/gitlab";
import { getRedditOverview, getRedditPosts, getRedditComments, getRedditTimeline, getRedditDailyActivity, getRedditDailyCommentActivity, getRedditSubredditDistribution } from "@/lib/services/reddit";

export class PlatformDashboardError extends Error {
  constructor(readonly code: "not_found" | "forbidden" | "wrong_platform") { super(code); }
}

async function visible(viewer: AuthUser, id: number, platform: "gitlab" | "reddit") {
  let account;
  try { account = await getVisibleAccountDetails(id, viewer); }
  catch (error) {
    if (error instanceof Error && error.name === "AccountForbiddenError") throw new PlatformDashboardError("forbidden");
    throw error;
  }
  if (!account) throw new PlatformDashboardError("not_found");
  if (account.platform !== platform) throw new PlatformDashboardError("wrong_platform");
  return account;
}

export async function getGitlabAccountPage(viewer: AuthUser, id: number) {
  const account = await visible(viewer, id, "gitlab");
  const [overview, contributions] = await Promise.all([
    getGitlabOverview(id), getGitlabContributions(id, new Date().getFullYear()),
  ]);
  return { account, overview: { ...overview, projects: overview.projects.slice(0, 500), allProjects: overview.allProjects.slice(0, 500), topProjects: overview.topProjects.slice(0, 10), languages: Object.entries(overview.languages).map(([language, count]) => ({ language, count })) }, contributions };
}

export async function getGitlabProjectPage(viewer: AuthUser, accountId: number, projectId: number, days: number) {
  const account = await visible(viewer, accountId, "gitlab");
  const [overview, snapshots, releases] = await Promise.all([
    getGitlabOverview(accountId), getGitlabProjectSnapshots(accountId, projectId, days), getGitlabReleases(accountId, projectId),
  ]);
  const project = overview.allProjects.find((row) => row.project_id === projectId);
  if (!project) throw new PlatformDashboardError("not_found");
  return { account, project, snapshots, releases };
}

export async function getRedditAccountPage(viewer: AuthUser, id: number, days: number) {
  const account = await visible(viewer, id, "reddit");
  const [overview, posts, comments, timeline, dailyPosts, dailyComments, subreddits] = await Promise.all([
    getRedditOverview(id), getRedditPosts(id, 1, 50, "score"), getRedditComments(id, 1, 50),
    getRedditTimeline(id, days), getRedditDailyActivity(id, days), getRedditDailyCommentActivity(id, days), getRedditSubredditDistribution(id),
  ]);
  return { account, overview, posts, comments, timeline, activity: { posts: dailyPosts, comments: dailyComments }, subreddits };
}
