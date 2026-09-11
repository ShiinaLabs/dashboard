import { describe, it, expect } from "vitest";
import { GithubClient } from "../lib/infra/fetchers/GithubClient";

function mockFetchWithLink() {
  let call = 0;
  return async (_url: string, _init?: unknown) => {
    call++;
    if (call === 1) {
      return {
        ok: true,
        headers: { get: (k: string) => k.toLowerCase()==="link" ? `<https://api.github.com/users/alice/repos?page=2>; rel="next"` : null },
        json: async () => Array.from({length:100}, (_,i)=>({id:i+1, name:`r${i+1}`, stargazers_count:10})),
      } as any;
    } else {
      return {
        ok: true,
        headers: { get: () => null },
        json: async () => Array.from({length:50}, (_,i)=>({id:100+i+1, name:`r${100+i+1}`, stargazers_count:5})),
      } as any;
    }
  };
}

describe("GithubClient", () => {
  it("fetchAllRepos paginates via Link header", async () => {
    const client = new GithubClient(mockFetchWithLink() as any);
    const repos = await client.fetchAllRepos("alice", "tok");
    expect(repos.length).toBe(150);
  });
  it("fetchAllRepos single page without Link", async () => {
    const singleFetch = async () => ({
      ok: true,
      headers: { get: () => null },
      json: async () => [{id:1, name:"r1"}],
    } as any);
    const client = new GithubClient(singleFetch as any);
    const repos = await client.fetchAllRepos("bob", "tok");
    expect(repos.length).toBe(1);
  });

  it("discovers organization repositories from the organization endpoint", async () => {
    let requestedUrl = "";
    const orgFetch = async (url: string, _init?: unknown) => {
      requestedUrl = url;
      return {
        ok: true,
        headers: { get: () => null },
        json: async () => [{ id: 42, name: "dashboard", full_name: "ShiinaLabs/dashboard" }],
      } as any;
    };
    const client = new GithubClient(orgFetch as any);
    const repos = await client.fetchAllRepos({ kind: "organization", login: "ShiinaLabs" }, "tok");
    expect(repos).toHaveLength(1);
    expect(requestedUrl).toBe("https://api.github.com/orgs/ShiinaLabs/repos?per_page=100&sort=updated");
  });

  it("rejects a non-array repository discovery response instead of coercing it into data", async () => {
    const invalidFetch = async () => ({
      ok: true,
      headers: { get: () => null },
      json: async () => ({ message: "Bad credentials" }),
    } as any);
    const client = new GithubClient(invalidFetch as any);
    await expect(client.fetchAllRepos("alice", "tok")).rejects.toThrow("invalid repository list");
  });

  it("fetchRepoReleases throws on HTTP errors instead of returning []", async () => {
    const httpError = async () => ({
      ok: false,
      status: 403,
      text: async () => "rate limit exceeded",
    } as any);
    const client = new GithubClient(httpError as any);
    await expect(client.fetchRepoReleases("alice/r", "tok")).rejects.toThrow("GitHub releases 403");
  });
});
