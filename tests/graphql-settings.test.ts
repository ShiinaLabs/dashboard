import { beforeEach, describe, expect, it, vi } from "vitest";
import { action as graphqlAction } from "@/app/api/graphql/route";
import { getAiStatus } from "@/lib/services/ai-analysis";
import { getAiSettings } from "@/lib/services/settings";
import { getUsers } from "@/lib/services/users";

const mocks = vi.hoisted(() => ({ user: { id: 5, username: "member", role: "user" } }));
vi.mock("@/lib/auth-helpers", () => ({ requireSession: vi.fn(async () => ({ user: mocks.user, session: mocks.user })) }));
vi.mock("@/lib/services/ai-analysis", () => ({ getAiStatus: vi.fn() }));
vi.mock("@/lib/services/settings", () => ({ getAiSettings: vi.fn() }));
vi.mock("@/lib/services/users", () => ({ getUsers: vi.fn() }));

async function query(source: string) {
  return graphqlAction({
    request: new Request("http://localhost/api/graphql", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: source }) }),
    params: {}, context: {},
  } as never);
}

describe("settings, admin, and AI GraphQL reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.role = "user";
  });

  it("keeps settings masked and admin-only", async () => {
    vi.mocked(getAiSettings).mockResolvedValue({ ai: { baseUrl: "https://api.example", apiKey: "••••••••", model: "model" } });
    const forbidden = await query("{ settings { ai { baseUrl apiKey model } } }");
    expect((await forbidden.json()).errors[0].extensions.code).toBe("FORBIDDEN");
    expect(getAiSettings).not.toHaveBeenCalled();

    mocks.user.role = "admin";
    const allowed = await query("{ settings { ai { baseUrl apiKey model } } }");
    expect((await allowed.json()).data.settings.ai.apiKey).toBe("••••••••");
  });

  it("enforces admin visibility for user listing", async () => {
    vi.mocked(getUsers).mockResolvedValue([{ id: 9, username: "other", role: "user", created_at: "now" }] as never);
    const forbidden = await query("{ admin { users { id username role created_at } } }");
    expect((await forbidden.json()).errors[0].extensions.code).toBe("FORBIDDEN");
    expect(getUsers).not.toHaveBeenCalled();

    mocks.user.role = "admin";
    const allowed = await query("{ admin { users { id username role created_at } } }");
    expect((await allowed.json()).data.admin.users).toEqual([{ id: 9, username: "other", role: "user", created_at: "now" }]);
  });

  it("returns only the authenticated user's AI status", async () => {
    vi.mocked(getAiStatus).mockResolvedValue({ configured: true, quota: { used: 3, limit: 20 } });
    const response = await query("{ ai { status { configured quota { used limit } } } }");
    expect((await response.json()).data.ai.status).toEqual({ configured: true, quota: { used: 3, limit: 20 } });
    expect(getAiStatus).toHaveBeenCalledWith(5);
  });
});
