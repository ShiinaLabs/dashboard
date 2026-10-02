import { z } from "zod";
import { AppStoreTokenProvider } from "./AppStoreTokenProvider";

const ORIGIN = "https://api.appstoreconnect.apple.com";
const appsResponse = z.object({
  data: z.array(z.object({
    id: z.string().min(1),
    type: z.literal("apps"),
    attributes: z.object({ name: z.string(), bundleId: z.string(), sku: z.string() }),
  })),
  links: z.object({ next: z.string().nullable().optional() }).optional(),
});

export interface DiscoveredApp { apple_id: string; name: string; bundle_id: string; sku: string }

export class AppStoreApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
    this.name = "AppStoreApiError";
  }
}

function safeAppleMessage(message: string): string {
  return message.replace(/-----BEGIN [\s\S]*?-----END [^-]+-----/g, "[redacted]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redacted]").slice(0, 1000);
}

export class AppStoreConnectClient {
  constructor(private readonly tokens: AppStoreTokenProvider, private readonly request: typeof fetch = fetch) {}

  async listApps(): Promise<DiscoveredApp[]> {
    let next: string | null = `${ORIGIN}/v1/apps?limit=200&fields%5Bapps%5D=name,bundleId,sku`;
    const seen = new Set<string>();
    const apps = new Map<string, DiscoveredApp>();
    while (next) {
      const url = new URL(next, ORIGIN);
      // Never send the bearer token to a server supplied through pagination.
      if (url.origin !== ORIGIN || url.pathname !== "/v1/apps" || url.username || url.password || seen.has(url.href) || seen.size >= 1000) {
        throw new AppStoreApiError(502, "invalid_pagination", "Apple returned an invalid apps pagination link");
      }
      seen.add(url.href);
      let response: Response;
      try {
        response = await this.request(url.href, {
          headers: { Authorization: `Bearer ${await this.tokens.getToken()}`, Accept: "application/json" },
          signal: AbortSignal.timeout(20_000), redirect: "error",
        });
      } catch {
        throw new AppStoreApiError(502, "request_failed", "App Store Connect request failed or timed out");
      }
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const parsed = z.object({ errors: z.array(z.object({ code: z.string(), title: z.string(), detail: z.string().optional() })) }).safeParse(body);
        const errors = parsed.success ? parsed.data.errors : [];
        const message = errors.map((error) => `${error.title}${error.detail ? `: ${error.detail}` : ""}`).join("; ");
        throw new AppStoreApiError(response.status, errors[0]?.code ?? "apple_error", `Apple API (${response.status}): ${safeAppleMessage(message || response.statusText)}`);
      }
      const parsed = appsResponse.safeParse(body);
      if (!parsed.success) throw new AppStoreApiError(502, "invalid_response", "Apple returned an invalid apps response");
      for (const app of parsed.data.data) {
        apps.set(app.id, { apple_id: app.id, name: app.attributes.name, bundle_id: app.attributes.bundleId, sku: app.attributes.sku });
      }
      next = parsed.data.links?.next ?? null;
    }
    return [...apps.values()];
  }
}
