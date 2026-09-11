/* eslint-disable @typescript-eslint/no-explicit-any */
import { streamText, isStepCount, type ModelMessage } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { aiConfig, isMockMode } from "../config";
import { getDb } from "../db/connection";
import { githubWatchedReposFilter } from "../repositories/github-watchlist";
import { github_repos, gitlab_stats, gitlab_projects } from "@/db/schema";
import { checkQuota, recordUsage, getTodayUsage } from "./ai-quota";
import { getSetting } from "../repositories/settings";
import { getOverviewStats, getTweets } from "../repositories/twitter";
import { getGithubOverview } from "../repositories/github";
import { getRedditOverview, getRedditPosts } from "../repositories/reddit";
import { getRecentRuns } from "../repositories/fetch-runs";
import { getTopContent } from "./top-content";
import { getPulse } from "./pulse";
import { getFetchHealth } from "./fetch-health";
import * as accountsService from "./accounts";

// ── System prompt ──────────────────────────────────────────────────

const SYSTEM_PROMPT = `你是一位多平台数据分析师，负责分析用户的跨平台社交媒体和代码托管数据。

## 你的能力
你可以通过工具获取以下数据：
- **账户概览**：所有已配置平台（X/Twitter、GitHub、GitLab、Reddit）的账户列表和状态
- **账户详情**：单个账户的详细统计数据（粉丝数、关注数、仓库数、karma 等）
- **推文数据**：最近的推文内容及互动数据（点赞、转发、回复、浏览量）
- **GitHub 仓库**：仓库详情（stars、forks、语言、描述）及趋势
- **Reddit 帖子**：Reddit 帖子详情（分数、评论数、子版块）
- **热门内容**：近期各平台表现最好的内容
- **业务脉搏**：跨平台活动趋势、粉丝/karma 增长、仓库星标变化
- **抓取健康**：数据抓取任务的成功率、失败原因、下次执行时间
- **抓取历史**：最近的抓取运行记录和状态

## 分析原则
1. **数据驱动**：先调用工具获取数据，再基于数据给出分析，不要凭空猜测
2. **actionable**：给出具体可执行的建议，而非泛泛而谈
3. **简洁中文**：用简洁的中文回答，使用 markdown 格式（标题、列表、加粗）组织信息
4. **对比分析**：尽可能做时间维度的对比（增长/下降趋势）
5. **异常提醒**：如果发现数据异常（如抓取失败、粉丝骤降），主动指出

## 输出格式
- 使用 markdown 格式
- 用 **加粗** 强调关键数据
- 用列表组织多个要点
- 如果数据不足，如实说明并建议用户先触发数据抓取`;

// ── Tool definitions ──────────────────────────────────────────────
// Tools are scoped to a specific userId for multi-user data isolation.
// Model-provided accountId values are validated against the user's accounts
// before any data access.

/** Validate that an accountId belongs to the given user's accounts. Returns the account if valid. */
async function validateAccountOwnership(userId: number, accountId: number) {
  const userAccounts = await accountsService.getAccounts(userId);
  return userAccounts.find((a) => a.id === accountId);
}

function createTools(userId: number) {
  return {
    getAccountStats: {
      description: "获取当前用户所有已配置平台账户的概览信息，包括平台类型、账户名和激活状态。用于了解用户监控了哪些账户。",
      inputSchema: z.object({}),
      execute: async () => {
        const accounts = await accountsService.getAccounts(userId);
        return accounts.map((a: { id: number; platform: string; screen_name: string; is_active: number | boolean }) => ({
          id: a.id,
          platform: a.platform,
          screen_name: a.screen_name,
          is_active: Boolean(a.is_active),
        }));
      },
    },
    getAccountDetail: {
      description: "获取单个账户的详细统计数据。X 账户返回粉丝数、关注数、推文数；GitHub 返回公开仓库数、followers、following；GitLab 返回项目数、followers；Reddit 返回 post/comment karma。",
      inputSchema: z.object({
        accountId: z.number().describe("账户 ID，可从 getAccountStats 获取"),
      }),
      execute: async (args: { accountId: number }) => {
        const account = await validateAccountOwnership(userId, args.accountId);
        if (!account) return { error: "Account not found or access denied" };

        if (account.platform === "twitter") {
          const stats = await getOverviewStats([args.accountId]);
          return { platform: "twitter", screen_name: account.screen_name, ...stats };
        }
        if (account.platform === "github") {
          const overview = await getGithubOverview(args.accountId);
          return {
            platform: "github", screen_name: account.screen_name,
            stats: overview.stats, totalStars: overview.totalStars,
            totalForks: overview.totalForks, totalRepos: overview.totalRepos,
            languages: overview.languages,
          };
        }
        if (account.platform === "gitlab") {
          const db = getDb();
          const [stats] = await db.select().from(gitlab_stats).where(eq(gitlab_stats.account_id, args.accountId)).limit(1);
          const projects = await db.select().from(gitlab_projects).where(eq(gitlab_projects.account_id, args.accountId));
          return {
            platform: "gitlab", screen_name: account.screen_name,
            stats, totalProjects: projects.length,
            totalStars: projects.reduce((s: number, p: any) => s + (p.stars ?? 0), 0),
          };
        }
        if (account.platform === "reddit") {
          const overview = await getRedditOverview(args.accountId);
          return { platform: "reddit", screen_name: account.screen_name, ...overview };
        }
        return { platform: account.platform, screen_name: account.screen_name, note: "No detailed stats for this platform" };
      },
    },
    getTweets: {
      description: "获取当前用户最近的推文列表，包含内容、互动数据（点赞、转发、回复、浏览量）。用于分析推文表现。",
      inputSchema: z.object({
        limit: z.number().describe("返回条数，默认 10"),
        search: z.string().optional().describe("搜索关键词（可选）"),
      }),
      execute: async (args: { limit?: number; search?: string }) => {
        // Filter by user's twitter account IDs
        const accounts = await accountsService.getAccounts(userId);
        const twitterIds = accounts.filter((a) => a.platform === "twitter").map((a) => a.id);
        if (twitterIds.length === 0) return [];
        const result = await getTweets(1, args.limit || 10, "created_at", "desc", args.search, twitterIds);
        return result.data.map((t: any) => ({
          id: t.id, full_text: t.full_text?.slice(0, 200),
          favorite_count: t.favorite_count, retweet_count: t.retweet_count,
          reply_count: t.reply_count, view_count: t.view_count,
          created_at: t.created_at, is_retweet: t.is_retweet, is_reply: t.is_reply,
        }));
      },
    },
    getGithubRepos: {
      description: "获取 GitHub 账户的仓库列表，包含名称、描述、语言、stars、forks 等信息。用于分析仓库表现和技术栈。",
      inputSchema: z.object({
        accountId: z.number().describe("GitHub 账户 ID"),
        limit: z.number().describe("返回条数，默认 10"),
      }),
      execute: async (args: { accountId: number; limit?: number }) => {
        const account = await validateAccountOwnership(userId, args.accountId);
        if (!account || account.platform !== "github") return { error: "Account not found or access denied" };
        const repos = await getDb().select().from(github_repos)
          .where(await githubWatchedReposFilter([args.accountId]))
          .orderBy(desc(github_repos.stars))
          .limit(args.limit || 10);
        return repos.map((r: any) => ({
          name: r.name, full_name: r.full_name, description: r.description?.slice(0, 150),
          language: r.language, stars: r.stars, forks: r.forks,
          open_issues: r.open_issues, homepage: r.homepage,
        }));
      },
    },
    getRedditPosts: {
      description: "获取 Reddit 帖子列表，包含标题、内容、分数、评论数等。用于分析 Reddit 社区互动。",
      inputSchema: z.object({
        accountId: z.number().describe("Reddit 账户 ID"),
        limit: z.number().describe("返回条数，默认 10"),
        sort: z.string().describe("排序方式：score（分数）或 num_comments（评论数），默认 score"),
      }),
      execute: async (args: { accountId: number; limit?: number; sort?: string }) => {
        const account = await validateAccountOwnership(userId, args.accountId);
        if (!account || account.platform !== "reddit") return { error: "Account not found or access denied" };
        const result = await getRedditPosts(args.accountId, 1, args.limit || 10, args.sort || "score");
        return result.data.map((p: any) => ({
          title: p.title, subreddit: p.subreddit, score: p.score,
          num_comments: p.num_comments, upvote_ratio: p.upvote_ratio,
          selftext: p.selftext?.slice(0, 200), url: p.url,
        }));
      },
    },
    getFetchRuns: {
      description: "获取当前用户最近的数据抓取运行记录，包括状态（成功/失败/部分）、耗时、错误信息。用于诊断数据更新问题。",
      inputSchema: z.object({
        limit: z.number().describe("每个账户返回的记录数，默认 5"),
      }),
      execute: async (args: { limit?: number }) => {
        const accounts = await accountsService.getAccounts(userId);
        const accountIds = accounts.map((a: any) => a.id);
        const runsMap = await getRecentRuns(accountIds, args.limit || 5);
        const result: Record<string, any[]> = {};
        for (const [acctId, runs] of runsMap) {
          const acct = accounts.find((a: any) => a.id === acctId);
          result[`${acct?.platform}:${acct?.screen_name}`] = runs.map((r: any) => ({
            status: r.status, trigger: r.trigger, started_at: r.started_at,
            duration_ms: r.duration_ms, error_message: r.error_message,
          }));
        }
        return result;
      },
    },
    getTopContent: {
      description: "获取当前用户近期各平台表现最好的内容，包括热门推文（点赞/转发/回复数）、Reddit 高分帖子和评论、以及 GitHub/GitLab 的 Release 发布。用于分析哪些内容表现最好。",
      inputSchema: z.object({
        days: z.number().describe("回溯天数，可选 7、30 或 90，默认 7"),
      }),
      execute: async (args: { days?: number }) => {
        const accounts = await accountsService.getAccounts(userId);
        return await getTopContent(accounts, args.days || 7);
      },
    },
    getPulse: {
      description: "获取当前用户跨平台业务脉搏数据，包括每日活动趋势（推文数、Reddit 帖子/评论数）、粉丝/karma 增长、仓库星标变化等。用于分析整体增长趋势和活跃度。",
      inputSchema: z.object({
        days: z.number().describe("分析天数范围，默认 7"),
      }),
      execute: async (args: { days?: number }) => {
        const accounts = await accountsService.getAccounts(userId);
        return await getPulse(accounts, args.days || 7);
      },
    },
    getFetchHealth: {
      description: "获取当前用户所有数据抓取任务的健康状态，包括成功率、最近的失败原因、连续失败次数和下次执行时间。用于诊断数据更新问题。",
      inputSchema: z.object({}),
      execute: async () => {
        return await getFetchHealth(userId);
      },
    },
  };
}

// ── Streaming agent ───────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function runAgentStream(
  userId: number,
  messages: ChatMessage[],
): Promise<{ stream: ReadableStream<string>; usage: Promise<{ promptTokens: number; completionTokens: number }> }> {
  if (isMockMode()) {
    const mockResponse = `根据数据分析，以下是关键洞察：

- **跨平台活跃度**：整体表现健康
- **GitHub 仓库**：星标稳步增长
- **Reddit 互动**：社区参与度稳定

> 💡 建议：继续保持当前的内容发布频率，可以尝试在 Reddit 上增加互动。`;

    const stream = new ReadableStream({
      start(controller) {
        const chunks = mockResponse.split("");
        let i = 0;
        const interval = setInterval(() => {
          if (i < chunks.length) {
            controller.enqueue(chunks[i]);
            i++;
          } else {
            clearInterval(interval);
            controller.close();
          }
        }, 10);
      },
    });

    const usage = Promise.resolve({ promptTokens: 100, completionTokens: 150 });
    await recordUsage(userId, 250);
    return { stream, usage };
  }

  const config = aiConfig();
  const baseUrl = (await getSetting("ai_base_url")) || config.baseUrl;
  const apiKey = (await getSetting("ai_base_key")) || config.apiKey;
  const model = (await getSetting("ai_model")) || config.model;

  if (!baseUrl || !apiKey) {
    throw new Error("AI not configured");
  }

  // Pre-flight quota check
  const underQuota = await checkQuota(userId);
  if (!underQuota) {
    throw new Error("Daily token limit exceeded");
  }

  const openai = createOpenAI({ baseURL: baseUrl, apiKey });

  // Convert chat messages to ModelMessage format
  const coreMessages: ModelMessage[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const userTools = createTools(userId);

  // Upstream request timeout: abort if AI doesn't respond within 120 seconds
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), 120_000);

  try {
    const result = streamText({
      model: openai.chat(model),
      system: SYSTEM_PROMPT,
      messages: coreMessages,
      tools: userTools,
      abortSignal: abortController.signal,
      stopWhen: [isStepCount(8)],
      onFinish: async ({ usage }) => {
        clearTimeout(timeout);
        const totalTokens = (usage.inputTokens || 0) + (usage.outputTokens || 0);
        if (totalTokens > 0) {
          await recordUsage(userId, totalTokens);
        }
      },
    });

    const stream = result.textStream;
    const usage = Promise.resolve(result.usage).then((u) => {
      clearTimeout(timeout);
      return {
        promptTokens: u.inputTokens || 0,
        completionTokens: u.outputTokens || 0,
      };
    });

    return { stream, usage };
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

// ── Non-streaming fallback (for backwards compatibility) ───────────

export async function runAgent(userId: number, message: string): Promise<{ content: string; tokensUsed: number }> {
  const { stream, usage } = await runAgentStream(userId, [{ role: "user", content: message }]);
  const reader = stream.getReader();
  let content = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    content += value;
  }

  const { promptTokens, completionTokens } = await usage;
  return { content, tokensUsed: promptTokens + completionTokens };
}

// ── Status check ──────────────────────────────────────────────────

export async function getAiStatus(userId: number): Promise<{ configured: boolean; quota: { used: number; limit: number } }> {
  const config = aiConfig();
  const usage = isMockMode() ? 0 : await getTodayUsage(userId);
  if (isMockMode()) {
    return { configured: true, quota: { used: 0, limit: config.dailyTokenLimit } };
  }
  const baseUrl = (await getSetting("ai_base_url")) || config.baseUrl;
  const apiKey = (await getSetting("ai_base_key")) || config.apiKey;
  return {
    configured: Boolean(baseUrl && apiKey),
    quota: { used: usage, limit: config.dailyTokenLimit },
  };
}
