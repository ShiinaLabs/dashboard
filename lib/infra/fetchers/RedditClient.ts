// Reddit REST client — pure fetch for OAuth and cookie-based (public) modes.
import { fetchWithConfig, withNetworkRetry } from "../../http";
import { getLogger } from "../../logger";

type Json = Record<string, unknown>;

export class RedditClient {
  constructor(private authType?: string | null) {}

  private get isPublic(): boolean {
    return this.authType === "reddit_public";
  }

  async getAccessToken(refreshToken: string): Promise<string> {
    const clientId = process.env.REDDIT_CLIENT_ID;
    const clientSecret = process.env.REDDIT_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new Error("REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET must be set in environment");
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    const res = await fetchWithConfig("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "dashboard/1.0" },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`,
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    if (!res.ok) {
      const body = await res.text().catch(() => "") ?? "";
      getLogger().error("Reddit", "OAuth token exchange failed: HTTP %d — %s", res.status, body.slice(0, 200));
      throw new Error(`Reddit OAuth error ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = await res.json() as Json;
    return data.access_token as string;
  }

  private async oauthFetch(path: string, token: string): Promise<Json> {
    const res = await withNetworkRetry(async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30_000);
      try {
        return await fetchWithConfig(`https://oauth.reddit.com${path}`, {
          headers: { Authorization: `Bearer ${token}`, "User-Agent": "dashboard/1.0" },
          signal: controller.signal,
        });
      } finally { clearTimeout(timer); }
    }, { label: "Reddit" });
    if (!res.ok) {
      const body = await res.text().catch(() => "") ?? "";
      throw new Error(`Reddit API ${res.status} for ${path}: ${body.slice(0, 200)}`);
    }
    return res.json() as Promise<Json>;
  }

  private async publicFetch(path: string, cookies: Record<string, string>): Promise<Json> {
    const cookieStr = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ");
    const res = await withNetworkRetry(async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30_000);
      try {
        return await fetchWithConfig(`https://www.reddit.com${path}`, {
          headers: {
            "User-Agent": "Safari/537.36",
            Accept: "application/json",
            Cookie: cookieStr,
          },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
    }, { label: "Reddit" });
    const body = await res.text();

    if (!res.ok) {
      if (res.status === 403) {
        throw new Error(`Reddit rejected request (HTTP 403) — cookies expired or IP blocked. Use OAuth instead. Body: ${body.slice(0, 200)}`);
      }
      throw new Error(`Reddit public API ${res.status} for ${path}: ${body.slice(0, 200)}`);
    }

    try {
      return JSON.parse(body) as Json;
    } catch (error) {
      throw new Error(`Reddit public API returned invalid JSON for ${path}: ${body.slice(0, 200)}`, { cause: error });
    }
  }

  private parseCookies(raw: string | null): Record<string, string> {
    try { return JSON.parse(raw ?? "") as Record<string, string>; } catch { return { loid: raw ?? "" }; }
  }

  async fetchUser(username: string, refreshToken: string | null): Promise<{ data: Json }> {
    if (this.isPublic) {
      return (await this.publicFetch(`/user/${username}/about.json`, this.parseCookies(refreshToken))) as { data: Json };
    }
    const token = await this.getAccessToken(refreshToken ?? "");
    return (await this.oauthFetch(`/user/${username}/about`, token)) as { data: Json };
  }

  async fetchPosts(username: string, refreshToken: string | null, after?: string): Promise<{ data: Json }> {
    const suffix = after ? `&after=${after}` : "";
    if (this.isPublic) {
      return (await this.publicFetch(`/user/${username}/submitted.json?limit=25&sort=new${suffix}`, this.parseCookies(refreshToken))) as { data: Json };
    }
    const token = await this.getAccessToken(refreshToken ?? "");
    return (await this.oauthFetch(`/user/${username}/submitted?limit=100&sort=new${suffix}`, token)) as { data: Json };
  }

  async fetchComments(username: string, refreshToken: string | null, after?: string): Promise<{ data: Json }> {
    const suffix = after ? `&after=${after}` : "";
    if (this.isPublic) {
      return (await this.publicFetch(`/user/${username}/comments.json?limit=25&sort=new${suffix}`, this.parseCookies(refreshToken))) as { data: Json };
    }
    const token = await this.getAccessToken(refreshToken ?? "");
    return (await this.oauthFetch(`/user/${username}/comments?limit=100&sort=new${suffix}`, token)) as { data: Json };
  }
}
