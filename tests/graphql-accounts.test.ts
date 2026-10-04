import { beforeEach, describe, expect, it, vi } from "vitest";
import { action as graphqlAction } from "@/app/api/graphql/route";
import { getAccounts, getVisibleAccountDetails } from "@/lib/services/accounts";

const mocks = vi.hoisted(() => ({ user: { id: 5, username: "member", role: "user" } }));
vi.mock("@/lib/auth-helpers", () => ({
  getOwnerId: (user: { id: number; role: string }) => user.role === "admin" ? undefined : user.id,
  requireSession: vi.fn(async () => ({ user: mocks.user, session: mocks.user })),
}));
vi.mock("@/lib/services/accounts", () => ({ getAccounts: vi.fn(), getVisibleAccountDetails: vi.fn() }));

async function query(source: string) {
  return graphqlAction({
    request: new Request("http://localhost/api/graphql", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: source }) }),
    params: {}, context: {},
  } as never);
}

describe("account GraphQL reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.role = "user";
  });

  it("filters account lists by viewer and platform without credential fields", async () => {
    vi.mocked(getAccounts).mockResolvedValue([
      { id: 1, owner_id: 5, platform: "github", screen_name: "dev", auth_token: "must-not-leak" },
      { id: 2, owner_id: 5, platform: "reddit", screen_name: "reader", auth_token: "must-not-leak" },
    ] as never);
    const response = await query("{ accounts { list(platform: GITHUB) { id platform screen_name } } }");
    expect(getAccounts).toHaveBeenCalledWith(5);
    expect((await response.json()).data.accounts.list).toEqual([{ id: 1, platform: "github", screen_name: "dev" }]);
  });

  it("keeps detail reads owner scoped and rejects a foreign account", async () => {
    vi.mocked(getVisibleAccountDetails).mockRejectedValue(Object.assign(new Error("Forbidden"), { name: "AccountForbiddenError" }));
    const response = await query("{ accounts { detail(id: 12) { id screen_name } } }");
    expect(getVisibleAccountDetails).toHaveBeenCalledWith(12, mocks.user);
    expect((await response.json()).errors[0].extensions.code).toBe("FORBIDDEN");
  });
});
