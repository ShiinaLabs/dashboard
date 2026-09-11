import { describe, it, expect } from "vitest";
import { toRepo } from "../lib/infra/fetchers/GithubMapper";

describe("GithubMapper stable repository identity", () => {
  it("keeps GitHub id/node id and current owner metadata separate from the account", () => {
    const repo = toRepo({
      id: 1241734389,
      node_id: "R_kgDOExample",
      name: "wifi-lens",
      full_name: "ShiinaLabs/wifi-lens",
      html_url: "https://github.com/ShiinaLabs/wifi-lens",
      owner: { id: 1234, node_id: "O_kgDOExample", login: "ShiinaLabs", type: "Organization" },
      stargazers_count: 1,
      forks_count: 0,
      fork: false,
      private: true,
      archived: false,
      default_branch: "main",
      topics: [],
    }, 7);

    expect(repo.accountId).toBe(7);
    expect(repo.repoId).toBe(1241734389);
    expect(repo.githubId).toBe(1241734389);
    expect(repo.nodeId).toBe("R_kgDOExample");
    expect(repo.ownerGithubId).toBe(1234);
    expect(repo.ownerLogin).toBe("ShiinaLabs");
    expect(repo.ownerType).toBe("Organization");
    expect(repo.isPrivate).toBe(1);
  });
});
