// Mock Github client for pure-new-arch testing without real PAT
// Returns deterministic fake repos; stars can be controlled via global mock state
export type MockScenario = "initial" | "starIncrease" | "forkFix";

let scenario: MockScenario = "initial";

export function setMockScenario(s: MockScenario) { scenario = s; }
export function getMockScenario() { return scenario; }

export class MockGithubClient {
  async fetchAllRepos(username: string, _token?: string): Promise<unknown[]> {
    // Deterministic fixtures: 2 repos, one normal, one fork
    if (scenario === "initial") {
      return [
        { id: 1, name: "dashboard", full_name: `${username}/dashboard`, description: "Mock repo", language: "TypeScript", stargazers_count: 80, forks_count: 10, fork: false, topics: ["dashboard"], homepage: null, open_issues_count: 5, pushed_at: new Date().toISOString(), updated_at: new Date().toISOString(), created_at: new Date().toISOString() },
        { id: 2, name: "forked-lib", full_name: `${username}/forked-lib`, description: "Forked", language: null, stargazers_count: 5, forks_count: 1, fork: true, topics: [], homepage: null, open_issues_count: 0, pushed_at: new Date().toISOString(), updated_at: new Date().toISOString(), created_at: new Date().toISOString() },
      ];
    }
    if (scenario === "starIncrease") {
      return [
        { id: 1, name: "dashboard", full_name: `${username}/dashboard`, description: "Mock repo", language: "TypeScript", stargazers_count: 100, forks_count: 12, fork: false, topics: ["dashboard"], homepage: null, open_issues_count: 5, pushed_at: new Date().toISOString(), updated_at: new Date().toISOString(), created_at: new Date().toISOString() },
        { id: 2, name: "forked-lib", full_name: `${username}/forked-lib`, description: "Forked", language: null, stargazers_count: 5, forks_count: 1, fork: true, topics: [], homepage: null, open_issues_count: 0, pushed_at: new Date().toISOString(), updated_at: new Date().toISOString(), created_at: new Date().toISOString() },
      ];
    }
    if (scenario === "forkFix") {
      // Simulate repo 2 was detached (upstream deleted, is_fork 1 -> 0) and stars grew
      return [
        { id: 1, name: "dashboard", full_name: `${username}/dashboard`, description: "Mock repo", language: "TypeScript", stargazers_count: 100, forks_count: 12, fork: false, topics: ["dashboard"], homepage: null, open_issues_count: 5, pushed_at: new Date().toISOString(), updated_at: new Date().toISOString(), created_at: new Date().toISOString() },
        { id: 2, name: "forked-lib", full_name: `${username}/forked-lib`, description: "Now independent", language: "TypeScript", stargazers_count: 20, forks_count: 3, fork: false, topics: [], homepage: null, open_issues_count: 0, pushed_at: new Date().toISOString(), updated_at: new Date().toISOString(), created_at: new Date().toISOString() },
      ];
    }
    return [];
  }

  async fetchUserStats(_username: string, _token?: string): Promise<Record<string, unknown>> {
    return { public_repos: 2, public_gists: 0, followers: scenario === "initial" ? 10 : 15, following: 5 };
  }


  async fetchTraffic(_repoFullName: string): Promise<{ clones: { count: number; uniques: number }; views: { count: number; uniques: number } }> {
    // Deterministic L2 mock: clones/views grow with scenario
    const base = scenario === "initial" ? 10 : scenario === "starIncrease" ? 20 : 30;
    return { clones: { count: base * 5, uniques: base }, views: { count: base * 20, uniques: base * 3 } };
  }

  async fetchReferrers(_repoFullName: string): Promise<Array<{ referrer: string; count: number; uniques: number }>> {
    return [{ referrer: "google.com", count: 12, uniques: 8 }, { referrer: "github.com", count: 7, uniques: 5 }];
  }

  async fetchPaths(_repoFullName: string): Promise<Array<{ path: string; count: number; uniques: number }>> {
    return [{ path: "/README.md", count: 15, uniques: 10 }, { path: "/src", count: 8, uniques: 6 }];
  }

  async fetchContributions(_username: string, _token?: string, _year?: number): Promise<Array<{ date: string; count: number; level: number }>> {
    return [{ date: new Date().toISOString().slice(0,10), count: 5, level: 2 }];
  }

  async fetchIssueSplits(_repos: Array<{ id: number; full_name: string }>, _token?: string): Promise<Map<number, { issues: number; pullRequests: number }>> {
    return new Map();
  }

  async fetchRepoTraffic(_fullName: string, _token?: string): Promise<{
    clones: Array<{ date: string; count: number; uniques: number }>;
    views: Array<{ date: string; count: number; uniques: number }>;
    referrers: Array<{ referrer: string; count: number; uniques: number }>;
    paths: Array<{ path: string; title: string | null; count: number; uniques: number }>;
    errors: string[];
  }> {
    return { clones: [], views: [], referrers: [], paths: [], errors: [] };
  }

  async fetchRepoReleases(_fullName: string, _token?: string): Promise<Array<Record<string, unknown>>> {
    const count = scenario === "initial" ? 100 : scenario === "starIncrease" ? 140 : 190;
    return [{
      id: 10,
      tag_name: "v1.0.0",
      name: "v1.0.0",
      body: null,
      prerelease: false,
      published_at: new Date().toISOString(),
      html_url: `https://github.com/mock/releases/v1.0.0`,
      assets: [{ name: "app-v1.0.0.zip", download_count: count, size: 1024, content_type: "application/zip", browser_download_url: `https://github.com/mock/releases/download/v1.0.0/app-v1.0.0.zip` }],
    }];
  }
}
