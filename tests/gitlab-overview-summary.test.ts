import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { gitlab_projects } from "@/db/schema";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  isMockMode: vi.fn(),
}));

vi.mock("../lib/db/connection", () => ({ getDb: mocks.getDb }));
vi.mock("../lib/config", () => ({ isMockMode: mocks.isMockMode }));

import { getGitlabOverviewSummary } from "../lib/repositories/gitlab";

describe("getGitlabOverviewSummary", () => {
  beforeEach(() => {
    mocks.isMockMode.mockReturnValue(false);
  });

  it("queries only the requested accounts and aggregates the production project rows", async () => {
    const accountIds = [41, 73];
    const projectRows = [
      { account_id: 41, project_id: 101, id: 1, name: "alpha", language: "TypeScript", stars: 12, forks: 3, pinned: 1 },
      { account_id: 73, project_id: 202, id: 2, name: "beta", language: "Rust", stars: 6, forks: 2, pinned: 0 },
      { account_id: 73, project_id: 203, id: 3, name: "gamma", language: null, stars: 0, forks: 1, pinned: 1 },
    ];
    const orderBy = vi.fn().mockResolvedValue(projectRows);
    const where = vi.fn().mockReturnValue({ orderBy });
    const from = vi.fn().mockReturnValue({ where });
    const select = vi.fn().mockReturnValue({ from });
    const execute = vi.fn().mockResolvedValue({ rows: [{ followers: "17" }] });

    mocks.getDb.mockReturnValue({ execute, select });

    const summary = await getGitlabOverviewSummary(accountIds);

    expect(mocks.isMockMode).toHaveBeenCalledOnce();
    expect(summary).toEqual({
      followers: 17,
      projectCount: 3,
      stars: 18,
      forks: 6,
      pinnedProjects: [projectRows[0], projectRows[2]],
    });
    expect(from).toHaveBeenCalledWith(gitlab_projects);

    const filter = new PgDialect().sqlToQuery(where.mock.calls[0][0]);
    expect(filter.sql).toContain('"gitlab_projects"."account_id"');
    expect(filter.params).toEqual(accountIds);
  });
});
