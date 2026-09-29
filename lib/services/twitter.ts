import * as repository from "@/lib/repositories/twitter";

/** Application-level read use cases for Twitter data. HTTP parsing and ownership checks stay in route adapters. */
export const getOverviewStats = (...args: Parameters<typeof repository.getOverviewStats>) => repository.getOverviewStats(...args);
export const getTweets = (...args: Parameters<typeof repository.getTweets>) => repository.getTweets(...args);
export const getTweetById = (...args: Parameters<typeof repository.getTweetById>) => repository.getTweetById(...args);
export const getTimeline = (...args: Parameters<typeof repository.getTimeline>) => repository.getTimeline(...args);
export const getTopTweets = (...args: Parameters<typeof repository.getTopTweets>) => repository.getTopTweets(...args);
export const getCalendarData = (...args: Parameters<typeof repository.getCalendarData>) => repository.getCalendarData(...args);
export const getLatestUserStats = (...args: Parameters<typeof repository.getLatestUserStats>) => repository.getLatestUserStats(...args);
