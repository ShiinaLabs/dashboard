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
  it("fetchOwnedRepos paginates via Link header", async () => {
    const client = new GithubClient(mockFetchWithLink() as any);
    const repos = await client.fetchOwnedRepos("tok");
    expect(repos.length).toBe(150);
  });

  it("fetchOwnedRepos asks only for the PAT's own repos, never collaborator or org-member ones", async () => {
    let requestedUrl = "";
    const capture = async (url: string, _init?: unknown) => {
      requestedUrl = url;
      return { ok: true, headers: { get: () => null }, json: async () => [] } as any;
    };
    const client = new GithubClient(capture as any);
    await client.fetchOwnedRepos("tok");
    expect(requestedUrl).toBe("https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner");
    // The whole point of the narrower scope: these must never appear.
    expect(requestedUrl).not.toContain("collaborator");
    expect(requestedUrl).not.toContain("organization_member");
  });

  it("fetchOrgRepos reads the organization endpoint", async () => {
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
    const repos = await client.fetchOrgRepos("ShiinaLabs", "tok");
    expect(repos).toHaveLength(1);
    expect(requestedUrl).toBe("https://api.github.com/orgs/ShiinaLabs/repos?per_page=100&sort=updated");
  });

  it("fetchAuthenticatedOrgs reads the org membership list", async () => {
    let requestedUrl = "";
    const orgFetch = async (url: string, _init?: unknown) => {
      requestedUrl = url;
      return { ok: true, headers: { get: () => null }, json: async () => [{ login: "ShiinaLabs", id: 1 }, { login: "libsese", id: 2 }] } as any;
    };
    const client = new GithubClient(orgFetch as any);
    const orgs = await client.fetchAuthenticatedOrgs("tok");
    expect(orgs).toHaveLength(2);
    expect(requestedUrl).toBe("https://api.github.com/user/orgs?per_page=100");
  });

  it("send an abort signal so a user-facing listing cannot hang forever", async () => {
    let seenSignal: unknown;
    const capture = async (_url: string, init?: unknown) => {
      seenSignal = (init as { signal?: unknown })?.signal;
      return { ok: true, headers: { get: () => null }, json: async () => [] } as any;
    };
    const client = new GithubClient(capture as any);
    await client.fetchOwnedRepos("tok");
    expect(seenSignal).toBeInstanceOf(AbortSignal);
  });

  it("stops following a runaway Link chain instead of looping forever", async () => {
    const alwaysNext = async () => ({
      ok: true,
      headers: { get: (k: string) => k.toLowerCase() === "link" ? `<https://api.github.com/user/repos?page=2>; rel="next"` : null },
      json: async () => [{ id: 1 }],
    } as any);
    const client = new GithubClient(alwaysNext as any);
    await expect(client.fetchOwnedRepos("tok")).rejects.toThrow("refusing to follow more than 20 pages");
  });

  it("rejects a non-array listing response instead of coercing it into data", async () => {
    const invalidFetch = async () => ({
      ok: true,
      headers: { get: () => null },
      json: async () => ({ message: "Bad credentials" }),
    } as any);
    const client = new GithubClient(invalidFetch as any);
    await expect(client.fetchOwnedRepos("tok")).rejects.toThrow("invalid list");
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
