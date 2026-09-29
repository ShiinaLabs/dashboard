import * as repository from "@/lib/repositories/reddit";

/** Application-level Reddit read use cases. Route adapters retain HTTP and ownership semantics. */
export const getRedditTimeline = (...args: Parameters<typeof repository.getRedditTimeline>) => repository.getRedditTimeline(...args);
export const getRedditPosts = (...args: Parameters<typeof repository.getRedditPosts>) => repository.getRedditPosts(...args);
export const getRedditComments = (...args: Parameters<typeof repository.getRedditComments>) => repository.getRedditComments(...args);
export const getRedditOverview = (...args: Parameters<typeof repository.getRedditOverview>) => repository.getRedditOverview(...args);
export const getRedditDailyActivity = (...args: Parameters<typeof repository.getRedditDailyActivity>) => repository.getRedditDailyActivity(...args);
export const getRedditDailyCommentActivity = (...args: Parameters<typeof repository.getRedditDailyCommentActivity>) => repository.getRedditDailyCommentActivity(...args);
export const getRedditSubredditDistribution = (...args: Parameters<typeof repository.getRedditSubredditDistribution>) => repository.getRedditSubredditDistribution(...args);
